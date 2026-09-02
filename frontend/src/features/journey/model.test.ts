import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  JOURNEY_STORAGE_KEY,
  activeJourneySession,
  createJourneySession,
  journeyProgress,
  journeyReducer,
  loadInitialJourneyState,
  restoreJourneyState,
  serializeJourneyState,
} from './model'

const step = (name: string, status: 'pending' | 'running' | 'done' | 'failed') => ({
  name,
  worker: 'flight',
  status,
  summary: '',
  locations: [],
  iterations: 0,
  toolCalls: 0,
})

describe('journey session model', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('builds the default date from local calendar fields', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 25, 0, 30, 0))

    expect(createJourneySession().form.date).toBe('2026-09-08')
  })

  it('moves idle to planning to ready without inventing metrics', () => {
    const session = createJourneySession({ id: 'journey-1' })
    let state = { sessions: [session], activeId: session.id }

    state = journeyReducer(state, {
      type: 'submit',
      id: session.id,
      message: '上海到东京五天',
    })
    expect(activeJourneySession(state).phase).toBe('planning')

    state = journeyReducer(state, {
      type: 'setPlan',
      id: session.id,
      names: ['推荐航班'],
    })
    state = journeyReducer(state, {
      type: 'stepDone',
      id: session.id,
      name: '推荐航班',
      patch: { worker: 'flight', summary: '已完成' },
    })

    expect(activeJourneySession(state).steps[0].latencyMs).toBeUndefined()

    state = journeyReducer(state, {
      type: 'complete',
      id: session.id,
      reply: '# 东京方案',
      conversationId: 8,
    })
    expect(activeJourneySession(state).phase).toBe('ready')
    expect(activeJourneySession(state).conversationId).toBe(8)
  })

  it('preserves completed work when a run is cancelled', () => {
    const session = createJourneySession({
      id: 'journey-2',
      phase: 'planning',
      steps: [{
        name: '推荐酒店',
        worker: 'hotel',
        status: 'done',
        summary: '酒店候选已返回',
        locations: [],
        iterations: 1,
        toolCalls: 1,
      }],
    })

    const state = journeyReducer(
      { sessions: [session], activeId: session.id },
      { type: 'cancel', id: session.id, reason: '用户已停止生成' },
    )

    expect(activeJourneySession(state).phase).toBe('cancelled')
    expect(activeJourneySession(state).statusMessage).toBe('用户已停止生成')
    expect(activeJourneySession(state).steps[0].status).toBe('done')
  })

  it('deduplicates locations and computes completed progress', () => {
    const session = createJourneySession({ id: 'journey-3' })
    let state = { sessions: [session], activeId: session.id }
    const location = {
      name: '东京站',
      address: '东京都千代田区',
      lng: 139.7671,
      lat: 35.6812,
      type: 'station' as const,
    }

    state = journeyReducer(state, { type: 'addLocations', id: session.id, locations: [location, location] })
    expect(activeJourneySession(state).locations).toHaveLength(1)
    expect(journeyProgress([
      { name: 'A', worker: 'flight', status: 'done', summary: '', locations: [], iterations: 0, toolCalls: 0 },
      { name: 'B', worker: 'hotel', status: 'running', summary: '', locations: [], iterations: 0, toolCalls: 0 },
    ])).toBe(55)
  })

  it('weights progress across graph stages so early nodes never sit at 0%', () => {
    expect(journeyProgress([], 'guard')).toBe(4)
    expect(journeyProgress([], 'memory_reader')).toBe(8)
    expect(journeyProgress([], 'intent_router')).toBe(12)
    expect(journeyProgress([], 'planner')).toBe(16)
    expect(journeyProgress([], 'unknown-node')).toBe(8)
    expect(journeyProgress([], '')).toBe(0)

    const planned = [step('推荐航班', 'pending'), step('推荐酒店', 'pending')]
    expect(journeyProgress(planned, 'executor')).toBe(16)
    expect(journeyProgress([step('推荐航班', 'done'), step('推荐酒店', 'running')], 'executor')).toBe(55)
    expect(journeyProgress(
      [step('推荐航班', 'done'), step('推荐酒店', 'done')],
      'aggregator',
    )).toBe(95)
    expect(journeyProgress([step('推荐航班', 'done')], 'memory_writer')).toBe(98)
  })

  it('adds, activates and removes local journeys with a fallback session', () => {
    const first = createJourneySession({ id: 'first' })
    const second = createJourneySession({ id: 'second', title: '杭州周末' })
    let state = { sessions: [first], activeId: first.id }

    state = journeyReducer(state, { type: 'add', session: second })
    expect(state.activeId).toBe('second')
    state = journeyReducer(state, { type: 'activate', id: 'first' })
    expect(activeJourneySession(state).id).toBe('first')
    state = journeyReducer(state, { type: 'remove', id: 'first' })
    state = journeyReducer(state, { type: 'remove', id: 'second' })
    expect(state.sessions).toHaveLength(1)
    expect(activeJourneySession(state).phase).toBe('idle')
  })

  it('hydrates history and updates form and worker detail immutably', () => {
    const session = createJourneySession({
      id: 'history',
      steps: [{
        name: '推荐酒店', worker: 'hotel', status: 'running', summary: '',
        locations: [], iterations: 0, toolCalls: 0,
      }],
    })
    let state = { sessions: [session], activeId: session.id }

    state = journeyReducer(state, { type: 'patchForm', id: session.id, patch: { destination: '京都' } })
    state = journeyReducer(state, { type: 'updateStep', id: session.id, name: '推荐酒店', patch: { summary: '已调用酒店检索' } })
    state = journeyReducer(state, {
      type: 'hydrate',
      id: session.id,
      messages: [
        { role: 'user', content: '京都三天' },
        { role: 'assistant', content: '# 京都方案' },
      ],
      finalReply: '# 京都方案',
    })

    expect(activeJourneySession(state).form.destination).toBe('京都')
    expect(activeJourneySession(state).steps[0].summary).toBe('已调用酒店检索')
    expect(activeJourneySession(state).phase).toBe('ready')
  })
})

describe('journey state persistence', () => {
  afterEach(() => {
    sessionStorage.clear()
    location.hash = ''
  })

  it('sanitizes a session that was streaming when the page refreshed', () => {
    const interrupted = createJourneySession({ id: 'interrupted', phase: 'planning', graphNode: 'executor' })
    const settled = createJourneySession({ id: 'settled', phase: 'ready', finalReply: '# 方案' })

    const restored = restoreJourneyState(serializeJourneyState({
      sessions: [interrupted, settled],
      activeId: 'interrupted',
    }))

    expect(restored?.sessions[0].phase).toBe('cancelled')
    expect(restored?.sessions[0].graphNode).toBe('')
    expect(restored?.sessions[0].statusMessage).toContain('页面刷新')
    expect(restored?.sessions[1].phase).toBe('ready')
  })

  it('returns null for corrupted or empty payloads', () => {
    expect(restoreJourneyState(null)).toBeNull()
    expect(restoreJourneyState('not-json')).toBeNull()
    expect(restoreJourneyState('{"sessions":[],"activeId":"x"}')).toBeNull()
    expect(restoreJourneyState('{"sessions":[{"id":"a"}],"activeId":"missing"}')).toBeNull()
  })

  it('falls back to a fresh idle session when nothing was persisted', () => {
    const state = loadInitialJourneyState()
    expect(state.sessions).toHaveLength(1)
    expect(state.sessions[0].phase).toBe('idle')
    expect(state.activeId).toBe(state.sessions[0].id)
  })

  it('falls back to the first session when the stored activeId is missing', () => {
    const first = createJourneySession({ id: 'stored-first' })
    const second = createJourneySession({ id: 'stored-second' })
    sessionStorage.setItem(
      JOURNEY_STORAGE_KEY,
      JSON.stringify({ sessions: [first, second], activeId: 'gone' }),
    )

    expect(loadInitialJourneyState().activeId).toBe('stored-first')
  })
})
