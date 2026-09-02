import { describe, expect, it } from 'vitest'
import { eventToJourneyActions, normalizeSSEEvent, parseSSEDataLine } from './sseContract'

describe('journey SSE contract', () => {
  it('normalizes the current step_done event without inventing metrics', () => {
    const event = normalizeSSEEvent({
      event: 'step_done',
      name: '推荐酒店',
      worker: 'hotel',
      tool_calls: 2,
      locations: [],
    })

    expect(event?.event).toBe('step_done')
    expect(event?.toolCalls).toBe(2)
    expect(event?.latencyMs).toBeUndefined()
    expect(event?.estimatedCostCny).toBeUndefined()
  })

  it('accepts additive metrics and structured trip state', () => {
    const step = normalizeSSEEvent({
      event: 'step_done',
      name: '推荐景点',
      latency_ms: 1840,
      prompt_tokens: 630,
      completion_tokens: 412,
      estimated_cost_cny: 0.012,
    })
    const done = normalizeSSEEvent({
      event: 'done',
      reply: '# 行程',
      trip_state: { itinerary: [], locations: [] },
    })

    expect(step?.latencyMs).toBe(1840)
    expect(step?.estimatedCostCny).toBe(0.012)
    expect(done?.tripState?.itinerary).toEqual([])
  })

  it('rejects malformed and unknown events', () => {
    expect(normalizeSSEEvent(null)).toBeNull()
    expect(normalizeSSEEvent([])).toBeNull()
    expect(normalizeSSEEvent({ event: 'made_up' })).toBeNull()
    expect(normalizeSSEEvent({ event: 'step_done', latency_ms: 'fast' })?.latencyMs).toBeUndefined()
  })

  it('parses only valid SSE data lines', () => {
    expect(parseSSEDataLine('data: {"event":"graph_state","node":"planner"}')).toMatchObject({
      event: 'graph_state',
      node: 'planner',
    })
    expect(parseSSEDataLine('event: graph_state')).toBeNull()
    expect(parseSSEDataLine('data: not-json')).toBeNull()
  })

  it('maps a completed worker event to real reducer actions', () => {
    const event = normalizeSSEEvent({
      event: 'step_done',
      name: '推荐景点',
      worker: 'attraction',
      summary: '返回 3 个真实地点',
      iterations: 2,
      tool_calls: 1,
      locations: [{
        name: '浅草寺',
        address: '东京都台东区',
        lng: 139.7967,
        lat: 35.7148,
        type: 'attraction',
      }],
    })

    expect(eventToJourneyActions(event!, 'journey-1')).toEqual([
      {
        type: 'stepDone',
        id: 'journey-1',
        name: '推荐景点',
        patch: {
          worker: 'attraction',
          status: 'done',
          summary: '返回 3 个真实地点',
          locations: [{
            name: '浅草寺',
            address: '东京都台东区',
            lng: 139.7967,
            lat: 35.7148,
            type: 'attraction',
          }],
          iterations: 2,
          toolCalls: 1,
        },
      },
      {
        type: 'addLocations',
        id: 'journey-1',
        locations: [{
          name: '浅草寺',
          address: '东京都台东区',
          lng: 139.7967,
          lat: 35.7148,
          type: 'attraction',
        }],
      },
    ])
  })

  it('maps graph, plan and done events without replacing the markdown fallback', () => {
    const graph = normalizeSSEEvent({ event: 'graph_state', node: 'planner' })
    const plan = normalizeSSEEvent({ event: 'plan', steps: ['推荐航班', '推荐酒店'] })
    const done = normalizeSSEEvent({ event: 'done', reply: '# 东京方案', conversation_id: 9 })

    expect(eventToJourneyActions(graph!, 'journey-2')).toEqual([
      { type: 'graphNode', id: 'journey-2', node: 'planner' },
    ])
    expect(eventToJourneyActions(plan!, 'journey-2')).toEqual([
      { type: 'setPlan', id: 'journey-2', names: ['推荐航班', '推荐酒店'] },
    ])
    expect(eventToJourneyActions(done!, 'journey-2')).toEqual([
      { type: 'complete', id: 'journey-2', reply: '# 东京方案', conversationId: 9 },
    ])
  })

  it('keeps structured trip state on the completion action', () => {
    const done = normalizeSSEEvent({
      event: 'done',
      reply: '# 东京方案',
      conversation_id: null,
      trip_state: {
        itinerary: [{ day: 1, title: '浅草与上野' }],
        budget_items: [{ category: '交通', amount: 500 }],
        locations: [{ name: '浅草寺', lng: 139.7967, lat: 35.7148, type: 'attraction' }],
      },
    })

    expect(eventToJourneyActions(done!, 'journey-structured')).toEqual([
      {
        type: 'complete',
        id: 'journey-structured',
        reply: '# 东京方案',
        conversationId: null,
        tripState: {
          itinerary: [{ day: 1, title: '浅草与上野' }],
          budget_items: [{ category: '交通', amount: 500 }],
          locations: [{
            name: '浅草寺',
            address: '',
            lng: 139.7967,
            lat: 35.7148,
            type: 'attraction',
          }],
        },
      },
    ])
  })
})
