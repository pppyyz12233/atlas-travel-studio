import type { Location } from '../../types'

export type JourneyPhase = 'idle' | 'planning' | 'ready' | 'error' | 'cancelled'
export type JourneyStepStatus = 'pending' | 'running' | 'done' | 'failed'

export interface TripForm {
  origin: string
  destination: string
  date: string
  days: number
  people: number
  budget: number
}

export interface JourneyMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface TripState {
  flights?: Record<string, unknown>[]
  hotels?: Record<string, unknown>[]
  attractions?: Record<string, unknown>[]
  itinerary?: Record<string, unknown>[]
  budget_items?: Record<string, unknown>[]
  locations?: Location[]
}

export interface JourneyStep {
  name: string
  worker: string
  status: JourneyStepStatus
  summary: string
  locations: Location[]
  iterations: number
  toolCalls: number
  latencyMs?: number
  promptTokens?: number
  completionTokens?: number
  estimatedCostCny?: number
}

export interface JourneySession {
  id: string
  title: string
  conversationId: number | null
  messages: JourneyMessage[]
  steps: JourneyStep[]
  finalReply: string
  locations: Location[]
  phase: JourneyPhase
  graphNode: string
  statusMessage: string
  form: TripForm
  tripState?: TripState
}

export interface JourneyState {
  sessions: JourneySession[]
  activeId: string
}

export type JourneyAction =
  | { type: 'add'; session?: JourneySession }
  | { type: 'remove'; id: string }
  | { type: 'activate'; id: string }
  | { type: 'patch'; id: string; patch: Partial<JourneySession> }
  | { type: 'patchForm'; id: string; patch: Partial<TripForm> }
  | { type: 'appendMessage'; id: string; message: JourneyMessage }
  | { type: 'submit'; id: string; message: string }
  | { type: 'graphNode'; id: string; node: string }
  | { type: 'setPlan'; id: string; names: string[] }
  | { type: 'stepStart'; id: string; name: string; worker: string }
  | { type: 'updateStep'; id: string; name: string; patch: Partial<Omit<JourneyStep, 'name'>> }
  | { type: 'stepDone'; id: string; name: string; patch: Partial<Omit<JourneyStep, 'name'>> }
  | { type: 'addLocations'; id: string; locations: Location[] }
  | { type: 'complete'; id: string; reply: string; conversationId: number | null; tripState?: TripState }
  | { type: 'hydrate'; id: string; messages: JourneyMessage[]; finalReply: string }
  | { type: 'error'; id: string; reason: string }
  | { type: 'cancel'; id: string; reason: string }

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function defaultDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + 14)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function createJourneySession(overrides: Partial<JourneySession> = {}): JourneySession {
  return {
    id: createId(),
    title: '未命名旅程',
    conversationId: null,
    messages: [],
    steps: [],
    finalReply: '',
    locations: [],
    phase: 'idle',
    graphNode: '',
    statusMessage: '',
    form: {
      origin: '上海',
      destination: '东京',
      date: defaultDate(),
      days: 5,
      people: 2,
      budget: 8000,
    },
    ...overrides,
  }
}

// ---------- 会话持久化：刷新恢复 + URL 锚点 ----------

export const JOURNEY_STORAGE_KEY = 'atlas_journey_state'

const phases: ReadonlySet<JourneyPhase> = new Set(['idle', 'planning', 'ready', 'error', 'cancelled'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 恢复前逐会话校验结构：sessionStorage 里的脏数据宁可丢弃也不能让渲染崩溃
function isValidSession(value: unknown): value is JourneySession {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || !value.id) return false
  if (typeof value.title !== 'string') return false
  if (typeof value.phase !== 'string' || !phases.has(value.phase as JourneyPhase)) return false
  if (!Array.isArray(value.messages) || !Array.isArray(value.steps)) return false
  if (typeof value.finalReply !== 'string') return false
  if (!Array.isArray(value.locations)) return false
  if (typeof value.graphNode !== 'string' || typeof value.statusMessage !== 'string') return false
  const form = value.form
  if (!isRecord(form)) return false
  return typeof form.origin === 'string' && typeof form.destination === 'string'
    && typeof form.date === 'string' && typeof form.days === 'number'
    && typeof form.people === 'number' && typeof form.budget === 'number'
}

export function serializeJourneyState(state: JourneyState): string | null {
  try {
    return JSON.stringify({ sessions: state.sessions, activeId: state.activeId })
  } catch {
    return null
  }
}

export function restoreJourneyState(raw: string | null): JourneyState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { sessions?: unknown; activeId?: unknown }
    if (!Array.isArray(parsed.sessions) || parsed.sessions.length === 0) return null
    if (!parsed.sessions.every(isValidSession)) return null
    // 刷新时仍在生成的会话标记为已取消，避免恢复后永远卡在"规划中"
    const sessions = (parsed.sessions as JourneySession[]).map(session => (
      session.phase === 'planning'
        ? { ...session, phase: 'cancelled' as const, graphNode: '', statusMessage: '页面刷新，生成已中断；已完成的步骤仍然保留。' }
        : session
    ))
    const activeId = typeof parsed.activeId === 'string' && sessions.some(session => session.id === parsed.activeId)
      ? parsed.activeId
      : sessions[0].id
    return { sessions, activeId }
  } catch {
    return null
  }
}

function readSessionIdFromHash(hash: string): string | null {
  const match = /^#s=([A-Za-z0-9-]+)$/.exec(hash.trim())
  return match ? match[1] : null
}

export function loadInitialJourneyState(): JourneyState {
  const persisted = restoreJourneyState(
    typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(JOURNEY_STORAGE_KEY),
  )
  if (persisted) {
    const hashId = typeof location === 'undefined' ? null : readSessionIdFromHash(location.hash)
    if (hashId && persisted.sessions.some(session => session.id === hashId)) {
      return { ...persisted, activeId: hashId }
    }
    return persisted
  }
  const session = createJourneySession()
  return { sessions: [session], activeId: session.id }
}

export function saveJourneyState(state: JourneyState): void {
  try {
    const serialized = serializeJourneyState(state)
    if (serialized) sessionStorage.setItem(JOURNEY_STORAGE_KEY, serialized)
  } catch {
    // 隐私模式 / 存储配额满：放弃持久化，不影响当前会话
  }
}

export function writeSessionIdToHash(sessionId: string): void {
  try {
    history.replaceState(null, '', `#s=${sessionId}`)
  } catch {
    // history 不可用（如沙箱 iframe）时忽略
  }
}

function uniqueLocations(current: Location[], incoming: Location[]): Location[] {
  const locations = new Map<string, Location>()
  for (const location of [...current, ...incoming]) {
    locations.set(
      `${location.name}:${location.lng.toFixed(4)}:${location.lat.toFixed(4)}`,
      location,
    )
  }
  return Array.from(locations.values())
}

// 阶段加权进度：主图前段（guard→planner）固定小步进，executor 按 step 比例，
// 尾段（aggregator/memory_writer）接近收口 —— 保证等待期任何时刻都有可读进度。
const stageProgress: Record<string, number> = {
  guard: 4,
  memory_reader: 8,
  intent_router: 12,
  planner: 16,
  executor: 16,
}

export function journeyProgress(steps: JourneyStep[], graphNode = ''): number {
  if (graphNode === 'aggregator') return 95
  if (graphNode === 'memory_writer') return 98
  if (steps.length === 0) {
    if (!graphNode) return 0
    return stageProgress[graphNode] ?? 8
  }
  const finished = steps.filter(step => step.status === 'done' || step.status === 'failed').length
  return Math.min(94, Math.round(16 + finished / steps.length * 78))
}

export function activeJourneySession(state: JourneyState): JourneySession {
  return state.sessions.find(session => session.id === state.activeId) ?? state.sessions[0]
}

export function journeyReducer(state: JourneyState, action: JourneyAction): JourneyState {
  const updateSession = (id: string, update: (session: JourneySession) => JourneySession): JourneyState => ({
    ...state,
    sessions: state.sessions.map(session => session.id === id ? update(session) : session),
  })

  switch (action.type) {
    case 'add': {
      const session = action.session ?? createJourneySession()
      return { sessions: [...state.sessions, session], activeId: session.id }
    }
    case 'remove': {
      const remaining = state.sessions.filter(session => session.id !== action.id)
      if (remaining.length === 0) {
        const fallback = createJourneySession()
        return { sessions: [fallback], activeId: fallback.id }
      }
      return {
        sessions: remaining,
        activeId: state.activeId === action.id ? remaining[0].id : state.activeId,
      }
    }
    case 'activate':
      return state.sessions.some(session => session.id === action.id)
        ? { ...state, activeId: action.id }
        : state
    case 'patch':
      return updateSession(action.id, session => ({ ...session, ...action.patch }))
    case 'patchForm':
      return updateSession(action.id, session => ({
        ...session,
        form: { ...session.form, ...action.patch },
      }))
    case 'appendMessage':
      return updateSession(action.id, session => ({
        ...session,
        messages: [...session.messages, action.message],
      }))
    case 'submit':
      return updateSession(action.id, session => ({
        ...session,
        phase: 'planning',
        statusMessage: '',
        finalReply: '',
        tripState: undefined,
        steps: [],
        locations: [],
        graphNode: 'guard',
        messages: [...session.messages, { role: 'user', content: action.message }],
      }))
    case 'graphNode':
      return updateSession(action.id, session => ({ ...session, graphNode: action.node }))
    case 'setPlan':
      return updateSession(action.id, session => ({
        ...session,
        steps: action.names.map(name => ({
          name,
          worker: '',
          status: 'pending',
          summary: '',
          locations: [],
          iterations: 0,
          toolCalls: 0,
        })),
      }))
    case 'stepStart':
      return updateSession(action.id, session => ({
        ...session,
        steps: session.steps.map(step => step.name === action.name
          ? { ...step, worker: action.worker, status: 'running' }
          : step),
      }))
    case 'updateStep':
      return updateSession(action.id, session => ({
        ...session,
        steps: session.steps.map(step => step.name === action.name
          ? { ...step, ...action.patch }
          : step),
      }))
    case 'stepDone':
      return updateSession(action.id, session => ({
        ...session,
        steps: session.steps.map(step => step.name === action.name
          ? { ...step, ...action.patch, status: action.patch.status ?? 'done' }
          : step),
      }))
    case 'addLocations':
      return updateSession(action.id, session => ({
        ...session,
        locations: uniqueLocations(session.locations, action.locations),
      }))
    case 'complete':
      return updateSession(action.id, session => ({
        ...session,
        phase: 'ready',
        finalReply: action.reply,
        conversationId: action.conversationId ?? session.conversationId,
        tripState: action.tripState ?? session.tripState,
        locations: uniqueLocations(session.locations, action.tripState?.locations ?? []),
        graphNode: '',
        statusMessage: '',
        messages: [...session.messages, { role: 'assistant', content: action.reply }],
      }))
    case 'hydrate':
      return updateSession(action.id, session => ({
        ...session,
        messages: action.messages,
        finalReply: action.finalReply,
        phase: action.finalReply ? 'ready' : 'idle',
        graphNode: '',
        statusMessage: '',
      }))
    case 'error':
      return updateSession(action.id, session => ({
        ...session,
        phase: 'error',
        graphNode: '',
        statusMessage: action.reason,
      }))
    case 'cancel':
      return updateSession(action.id, session => ({
        ...session,
        phase: 'cancelled',
        graphNode: '',
        statusMessage: action.reason,
      }))
  }
}
