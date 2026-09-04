import type { Location } from '../../types'

export type JourneyPhase = 'idle' | 'planning' | 'ready' | 'error' | 'cancelled'
export type JourneyStepStatus = 'pending' | 'running' | 'done' | 'failed'

/** 出发地：结构化对象。source 标记来源——
 *  - 'manual'  用户手填或一句话推断（只有文字）
 *  - 'browser' 「使用我的当前位置」按钮经 Geolocation API 取得（带坐标） */
export interface OriginPlace {
  label: string | null
  latitude: number | null
  longitude: number | null
  source: 'manual' | 'browser'
}

export interface TripForm {
  origin: OriginPlace
  destination: string
  date: string
  days: number
  people: number
  budget: number
}

export function manualOrigin(label: string): OriginPlace {
  return { label: label.trim() || null, latitude: null, longitude: null, source: 'manual' }
}

/** 出发地显示文本：没有 label 时为空串（UI 层显示"出发地待定"，不编造城市） */
export function originLabel(form: Pick<TripForm, 'origin'>): string {
  return form.origin.label?.trim() ?? ''
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
  /** 用户是否在 MissionBrief 里手动改过表单：未改过时允许从任务文本回填目的地 */
  formTouched?: boolean
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

/** 出发日期默认值：Asia/Shanghai 的"今天"（UTC+8，与设备本地时区无关）。
 *  不再使用"今天+14"或任何固定测试日期——用户没填日期时就是今天，
 *  LLM 侧由后端注入同样的日期上下文（app/routers/chat_router.py）。 */
export function defaultDate(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

/** 工厂默认表单值：仅作为 MissionBrief 的可编辑初始建议。
 *  用户用一句话开始规划时绝不能静默沿用（行程串线源头），见 AIPage#send。 */
export const FACTORY_FORM_DEFAULTS = {
  origin: '上海',
  destination: '东京',
} as const

function factoryOrigin(): OriginPlace {
  return { label: FACTORY_FORM_DEFAULTS.origin, latitude: null, longitude: null, source: 'manual' }
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
      origin: factoryOrigin(),
      destination: FACTORY_FORM_DEFAULTS.destination,
      date: defaultDate(),
      days: 5,
      people: 2,
      budget: 8000,
    },
    ...overrides,
  }
}

/** 从一句话中提取显式目的地，避免沿用默认/旧值造成行程串线。
 *  lookahead 同时接受“一天/3天/两天”等时长词——否则“去广州一天”会把
 *  “广州一天”整体当成目的地（串线截图里的真实案例）。 */
export function inferDestinationFromBrief(brief: string): string | null {
  const match = brief.match(/(?:想去|要去|去|到|前往|目的地(?:是|为)?)\s*([一-鿿A-Za-z][一-鿿A-Za-z·-]{1,19}?)(?=[0-9０-９一二两三四五六七八九十半]+\s*[天日]|旅游|旅行|玩|看看|看|，|,|。|！|!|\s|$)/)
  const destination = match?.[1]?.trim()
  return destination && destination.length >= 2 ? destination : null
}

const CN_DIGITS: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

function parseCnNumber(text: string): number | null {
  if (/^\d+$/.test(text)) return Number(text)
  const m = text.match(/^(?:(十)|([一二两三四五六七八九])?十([一二两三四五六七八九])?|([一二两三四五六七八九])半?)$/)
  if (!m) return null
  if (m[1]) return 10
  if (m[2] !== undefined || m[3] !== undefined) {
    const tens = m[2] !== undefined ? CN_DIGITS[m[2]] : 1
    const ones = m[3] !== undefined ? CN_DIGITS[m[3]] : 0
    return tens * 10 + ones
  }
  if (m[4] !== undefined) return CN_DIGITS[m[4]]
  return null
}

/** 从一句话中提取显式天数（“去广州一天”→1、“5天4晚”→5、“周末两天”→2）。
 *  排除日期（“9月18日”的“18日”）与“当天/每天/明天”类词；超出 1-30 视为误匹配。 */
export function inferDaysFromBrief(brief: string): number | null {
  // 调整类措辞（多加/减少/延长…）表达的是相对变化，不是绝对天数，不覆盖
  if (/(多加|再加|增加|减少|延长|缩短|多一天|少一天)/.test(brief)) return null
  const match = brief.match(/(?<![0-9月第当每明后次改])([0-9０-９]+|[一二两三四五六七八九十]+半?)\s*[天日]/)
  if (!match) return null
  const raw = match[1].replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/半$/, '')
  const value = parseCnNumber(raw)
  if (value === null || value < 1 || value > 30) return null
  return value
}


/** 从一句话中提取显式出发地（"从上海去广州"→上海）；没有则返回 null，避免静默显示默认上海。 */
export function inferOriginFromBrief(brief: string): string | null {
  const match = brief.match(/(?:从|由)\s*([一-鿿A-Za-z][一-鿿A-Za-z·-]{1,11}?)(?=出发|去|到|飞|坐|乘|，|,|。|\s|$)/)
  const origin = match?.[1]?.trim()
  return origin && origin.length >= 2 && !/出发|如何|这里/.test(origin) ? origin : null
}

/**
 * 从最终方案的 Markdown 里派生目的地（标题行优先）。
 * 用户没写目的地时回填；与用户显式输入冲突时用于提示确认，不静默覆盖。
 * 算法：找第一个含行程词（行程/方案/之旅/…）的标题行，取行程词前的片段，
 * 依次剥掉"4天3晚"类数字块、常见旅行后缀词、分隔符、出发地前缀（从/由/去/到）、
 * 常见修饰前缀（最终/完整/…），剩下 2-10 字视为目的地。
 */
const TRIP_WORD = /行程|方案|之旅|旅游|旅行|自由行/
const DERIVE_PREFIX_WORDS = /^(?:最终|最新|完整|详细|新版|旧版|定制|专属|我的|一份|这份|超值|精品|第[一二三四五六七八九十\d]+版?)+/

export function deriveDestinationFromReply(reply: string): string | null {
  if (!reply) return null
  const lines = reply
    .split('\n')
    .map(line => line.replace(/^#{1,6}\s*/, '').replace(/\*+/g, '').trim())
    .filter(Boolean)
  const titleLine = lines.slice(0, 5).find(line => TRIP_WORD.test(line))
  if (!titleLine) return null
  const wordIndex = titleLine.search(TRIP_WORD)
  let name = titleLine.slice(0, wordIndex)
    .replace(/(?:[\d０-９一二两三四五六七八九十]+)\s*(?:天|日|晚)\S*/g, '')
    .replace(/(?:天|日|晚|人|往返|游|美食|深度|休闲|亲子|蜜月|度假)+$/g, '')
    .replace(/[\s·•，,、()（）\-—:：/]+/g, '')
  const cut = Math.max(
    name.lastIndexOf('从'), name.lastIndexOf('由'), name.lastIndexOf('去'),
    name.lastIndexOf('到'),
  )
  if (cut >= 0) name = name.slice(cut + 1)
  name = name.replace(DERIVE_PREFIX_WORDS, '')
  return name.length >= 2 && name.length <= 10 ? name : null
}

/** 路线展示：出发地/目的地缺失时用待定占位，绝不静默显示默认"上海 → 东京"。 */
export function routeLabel(form: TripForm): string {
  return `${originLabel(form) || '出发地待定'} → ${form.destination.trim() || '目的地待定'}`
}

// ---------- 会话持久化：刷新恢复 + URL 锚点 ----------

export const JOURNEY_STORAGE_KEY = 'atlas_journey_state'

const phases: ReadonlySet<JourneyPhase> = new Set(['idle', 'planning', 'ready', 'error', 'cancelled'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidOrigin(value: unknown): boolean {
  // 兼容旧版字符串 origin（升级前的 sessionStorage 残留）
  if (typeof value === 'string') return true
  return isRecord(value) && (value.label === null || typeof value.label === 'string')
    && (value.latitude === null || typeof value.latitude === 'number')
    && (value.longitude === null || typeof value.longitude === 'number')
    && (value.source === 'manual' || value.source === 'browser')
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
  return isValidOrigin(form.origin) && typeof form.destination === 'string'
    && typeof form.date === 'string' && typeof form.days === 'number'
    && typeof form.people === 'number' && typeof form.budget === 'number'
}

/** 旧版（字符串 origin）会话升级为结构化 OriginPlace；已是对象则原样返回 */
function normalizeOrigin(session: JourneySession): JourneySession {
  const origin = session.form.origin as unknown
  if (typeof origin === 'string') {
    return { ...session, form: { ...session.form, origin: manualOrigin(origin) } }
  }
  return session
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
    // 刷新时仍在生成的会话标记为已取消，避免恢复后永远卡在"规划中"；
    // 历史行程的日期等字段原样保留（不被今天的默认值覆盖）
    const sessions = (parsed.sessions as JourneySession[]).map(session => (
      session.phase === 'planning'
        ? { ...session, phase: 'cancelled' as const, graphNode: '', statusMessage: '页面刷新，生成已中断；已完成的步骤仍然保留。' }
        : session
    )).map(normalizeOrigin)
    const activeId = typeof parsed.activeId === 'string' && sessions.some(session => session.id === parsed.activeId)
      ? parsed.activeId
      : sessions[0].id
    return { sessions, activeId }
  } catch {
    return null
  }
}

export function loadInitialJourneyState(): JourneyState {
  const persisted = restoreJourneyState(
    typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(JOURNEY_STORAGE_KEY),
  )
  if (persisted) return persisted
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

// 一次性空草稿：没有任何用户内容也没落库的会话。
// 新建规划时清掉它们，避免"未命名旅程 · 上海 → 东京"僵尸草稿越积越多。
function isDisposableDraft(session: JourneySession): boolean {
  return session.conversationId === null
    && session.messages.length === 0
    && session.steps.length === 0
    && !session.finalReply
}

export function journeyReducer(state: JourneyState, action: JourneyAction): JourneyState {
  const updateSession = (id: string, update: (session: JourneySession) => JourneySession): JourneyState => ({
    ...state,
    sessions: state.sessions.map(session => session.id === id ? update(session) : session),
  })

  switch (action.type) {
    case 'add': {
      const session = action.session ?? createJourneySession()
      const kept = state.sessions.filter(existing => !isDisposableDraft(existing))
      return { sessions: [...kept, session], activeId: session.id }
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
        formTouched: true,
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
