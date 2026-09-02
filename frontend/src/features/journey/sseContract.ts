import type { Location, SSEEventType } from '../../types'
import type { JourneyAction, JourneyStepStatus, TripState } from './model'

export interface NormalizedSSEEvent {
  event: SSEEventType
  node?: string
  type?: string
  round?: number
  nextTools?: string[]
  tools?: string[]
  ok?: boolean
  blocked?: boolean
  reason?: string
  message?: string
  steps?: string[]
  count?: number
  name?: string
  worker?: string
  layer?: number
  parallel?: boolean
  status?: string
  resultSnippet?: string
  summary?: string
  locations?: Location[]
  iterations?: number
  toolCalls?: number
  latencyMs?: number
  promptTokens?: number
  completionTokens?: number
  estimatedCostCny?: number
  reply?: string
  conversationId?: number | null
  tripState?: TripState
}

const eventTypes = new Set<SSEEventType>([
  'graph_state', 'guard', 'error', 'plan', 'step_start', 'step_done', 'aggregating',
  'worker_think', 'worker_tools', 'done',
])

const locationTypes = new Set<Location['type']>([
  'airport', 'hotel', 'attraction', 'station', 'other',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === 'string')
}

function locationArray(value: unknown): Location[] | undefined {
  if (!Array.isArray(value)) return undefined
  const locations = value.flatMap(item => {
    if (!isRecord(item)) return []
    const lng = optionalNumber(item.lng)
    const lat = optionalNumber(item.lat)
    const name = optionalString(item.name)
    if (lng === undefined || lat === undefined || !name) return []
    const rawType = optionalString(item.type)
    const type = rawType && locationTypes.has(rawType as Location['type'])
      ? rawType as Location['type']
      : 'other'
    return [{
      lng,
      lat,
      name,
      address: optionalString(item.address) ?? '',
      type,
    }]
  })
  return locations
}

function recordArray(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter(isRecord)
}

function normalizeTripState(value: unknown): TripState | undefined {
  if (!isRecord(value)) return undefined
  return {
    flights: recordArray(value.flights),
    hotels: recordArray(value.hotels),
    attractions: recordArray(value.attractions),
    itinerary: recordArray(value.itinerary),
    budget_items: recordArray(value.budget_items),
    locations: locationArray(value.locations),
  }
}

export function normalizeSSEEvent(value: unknown): NormalizedSSEEvent | null {
  if (!isRecord(value) || typeof value.event !== 'string' || !eventTypes.has(value.event as SSEEventType)) {
    return null
  }

  return {
    event: value.event as SSEEventType,
    node: optionalString(value.node),
    type: optionalString(value.type),
    round: optionalNumber(value.round),
    nextTools: stringArray(value.next_tools),
    tools: stringArray(value.tools),
    ok: optionalBoolean(value.ok),
    blocked: optionalBoolean(value.blocked),
    reason: optionalString(value.reason),
    message: optionalString(value.message),
    steps: stringArray(value.steps),
    count: optionalNumber(value.count),
    name: optionalString(value.name),
    worker: optionalString(value.worker),
    layer: optionalNumber(value.layer),
    parallel: optionalBoolean(value.parallel),
    status: optionalString(value.status),
    resultSnippet: optionalString(value.result_snippet),
    summary: optionalString(value.summary),
    locations: locationArray(value.locations),
    iterations: optionalNumber(value.iterations),
    toolCalls: optionalNumber(value.tool_calls),
    latencyMs: optionalNumber(value.latency_ms),
    promptTokens: optionalNumber(value.prompt_tokens),
    completionTokens: optionalNumber(value.completion_tokens),
    estimatedCostCny: optionalNumber(value.estimated_cost_cny),
    reply: optionalString(value.reply),
    conversationId: value.conversation_id === null
      ? null
      : optionalNumber(value.conversation_id),
    tripState: normalizeTripState(value.trip_state),
  }
}

export function parseSSEDataLine(line: string): NormalizedSSEEvent | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return null
  try {
    return normalizeSSEEvent(JSON.parse(trimmed.slice(5).trim()))
  } catch {
    return null
  }
}

export function eventToJourneyActions(
  event: NormalizedSSEEvent,
  sessionId: string,
): JourneyAction[] {
  switch (event.event) {
    case 'graph_state':
      return event.node ? [{ type: 'graphNode', id: sessionId, node: event.node }] : []
    case 'guard':
      return event.blocked
        ? [{ type: 'error', id: sessionId, reason: event.reason ?? '请求未通过安全检查' }]
        : []
    case 'error':
      return [{ type: 'error', id: sessionId, reason: event.message ?? '生成失败，请重试' }]
    case 'plan':
      return event.steps ? [{ type: 'setPlan', id: sessionId, names: event.steps }] : []
    case 'step_start':
      return event.name
        ? [{ type: 'stepStart', id: sessionId, name: event.name, worker: event.worker ?? '' }]
        : []
    case 'step_done': {
      if (!event.name) return []
      const status: JourneyStepStatus = event.status === 'failed' ? 'failed' : 'done'
      const locations = event.locations ?? []
      const patch = {
        worker: event.worker ?? '',
        status,
        summary: event.summary ?? event.resultSnippet ?? '',
        locations,
        iterations: event.iterations ?? 0,
        toolCalls: event.toolCalls ?? 0,
        ...(event.latencyMs === undefined ? {} : { latencyMs: event.latencyMs }),
        ...(event.promptTokens === undefined ? {} : { promptTokens: event.promptTokens }),
        ...(event.completionTokens === undefined ? {} : { completionTokens: event.completionTokens }),
        ...(event.estimatedCostCny === undefined ? {} : { estimatedCostCny: event.estimatedCostCny }),
      }
      const actions: JourneyAction[] = [{
        type: 'stepDone',
        id: sessionId,
        name: event.name,
        patch,
      }]
      if (locations.length > 0) {
        actions.push({ type: 'addLocations', id: sessionId, locations })
      }
      return actions
    }
    case 'done':
      return event.reply === undefined
        ? []
        : [{
          type: 'complete',
          id: sessionId,
          reply: event.reply,
          conversationId: event.conversationId ?? null,
          ...(event.tripState === undefined ? {} : { tripState: event.tripState }),
        }]
    default:
      return []
  }
}
