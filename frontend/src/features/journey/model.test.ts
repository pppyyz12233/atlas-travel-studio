import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  JOURNEY_STORAGE_KEY,
  manualOrigin,
  activeJourneySession,
  createJourneySession,
  defaultDate,
  deriveDestinationFromReply,
  inferDaysFromBrief,
  inferDestinationFromBrief,
  inferOriginFromBrief,
  journeyProgress,
  journeyReducer,
  loadInitialJourneyState,
  restoreJourneyState,
  routeLabel,
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

  it('defaults the departure date to today in Asia/Shanghai (no offset, no fixture date)', () => {
    vi.useFakeTimers()
    // UTC 2026-08-24 20:00 = 北京时间 2026-08-25 04:00 → 默认日期必须是 2026-08-25
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 24, 20, 0, 0)))

    expect(createJourneySession().form.date).toBe('2026-08-25')
    // 与设备本地时区无关：再取一次仍然等于"上海今天"
    expect(createJourneySession().form.date).toBe(defaultDate())
    // 不是任何固定测试日期
    expect(['2026-09-18', '2026-09-08']).not.toContain(createJourneySession().form.date)
  })

  it('infers an explicit destination from a home-page brief', () => {
    expect(inferDestinationFromBrief('想去广州旅游，三天两个人')).toBe('广州')
    expect(inferDestinationFromBrief('十一月去京都看红叶')).toBe('京都')
    expect(inferDestinationFromBrief('想吃火锅，预算五千')).toBeNull()
  })

  it('keeps duration words out of the destination ("去广州一天" → 广州)', () => {
    expect(inferDestinationFromBrief('去广州一天')).toBe('广州')
    expect(inferDestinationFromBrief('去巴黎 4 天，两个人')).toBe('巴黎')
    expect(inferDestinationFromBrief('想带爸妈去西安5天')).toBe('西安')
  })

  it('infers explicit day counts and rejects dates/common words', () => {
    expect(inferDaysFromBrief('去广州一天')).toBe(1)
    expect(inferDaysFromBrief('周末两天')).toBe(2)
    expect(inferDaysFromBrief('5天4晚')).toBe(5)
    expect(inferDaysFromBrief('十一天的行程')).toBe(11)
    expect(inferDaysFromBrief('十月一日出发')).toBeNull()   // 日期不是天数
    expect(inferDaysFromBrief('9月18日出发')).toBeNull()   // "18日" 是日期
    expect(inferDaysFromBrief('当天返回')).toBeNull()
    expect(inferDaysFromBrief('每天步行两万步')).toBeNull()
    expect(inferDaysFromBrief('预算五千元')).toBeNull()
    expect(inferDaysFromBrief('想去广州')).toBeNull()
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
    ])).toBe(71)
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
    expect(journeyProgress([step('推荐航班', 'done'), step('推荐酒店', 'running')], 'executor')).toBe(71)
    // 生产实测形态：4 个并行 worker 全部 running 时进度必须离开 16%（首轮 LLM 思考 10s+）
    const fiveRunning = ['查询航班', '查询酒店', '查询景点', '制定行程', '预算规划'].map(name => step(name, 'running'))
    expect(journeyProgress(fiveRunning, 'executor')).toBe(47)
    const fourDone = fiveRunning.map((s, i) => (i < 4 ? step(s.name, 'done') : step(s.name, 'running')))
    expect(journeyProgress(fourDone, 'executor')).toBe(85)
    expect(journeyProgress(
      [step('推荐航班', 'done'), step('推荐酒店', 'done')],
      'aggregator',
    )).toBe(95)
    expect(journeyProgress([step('推荐航班', 'done')], 'memory_writer')).toBe(98)
  })

  it('adds, activates and removes local journeys with a fallback session', () => {
    // 带用户内容的会话：add 不会清理它们（新建规划不吞掉已有行程）
    const first = createJourneySession({ id: 'first', messages: [{ role: 'user', content: '去北京' }] })
    const second = createJourneySession({ id: 'second', title: '杭州周末', messages: [{ role: 'user', content: '去杭州' }] })
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

  it('prunes untouched empty drafts when creating a new journey', () => {
    // 新建规划时清理旧的未完成草稿（无消息、无步骤、无结果、未落库），
    // 但保留有内容/已保存的会话——恢复历史与继续调整不受影响
    const emptyDraft = createJourneySession({ id: 'draft-1' })
    const savedCloud = createJourneySession({ id: 'cloud-1', conversationId: 42 })
    const withContent = createJourneySession({
      id: 'content-1',
      messages: [{ role: 'user', content: '想去广州' }],
    })
    let state = { sessions: [emptyDraft, savedCloud, withContent], activeId: emptyDraft.id }

    state = journeyReducer(state, { type: 'add', session: createJourneySession({ id: 'new' }) })
    expect(state.sessions.map(session => session.id)).toEqual(['cloud-1', 'content-1', 'new'])
    expect(state.activeId).toBe('new')
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

describe('destination inference（首页串线修复）', () => {
  it('infers explicit destinations from briefs', () => {
    expect(inferDestinationFromBrief('想去广州')).toBe('广州')
    expect(inferDestinationFromBrief('十一月去广州玩，两个人')).toBe('广州')
    expect(inferDestinationFromBrief('计划去京都看红叶')).toBe('京都')
    expect(inferDestinationFromBrief('随便走走')).toBeNull()
  })

  it('infers explicit origins and leaves them null when absent', () => {
    expect(inferOriginFromBrief('从上海去广州玩')).toBe('上海')
    expect(inferOriginFromBrief('由北京出发去成都')).toBe('北京')
    expect(inferOriginFromBrief('想去广州')).toBeNull()
  })

  it('strips Chinese-numeral day blocks from reply titles (广州一日游方案)', () => {
    expect(deriveDestinationFromReply('## 广州一日游方案')).toBe('广州')
    expect(deriveDestinationFromReply('## 东京四日游行程')).toBe('东京')
  })

  it('derives the destination from the reply title', () => {
    // 真实 aggregator 输出形态
    expect(deriveDestinationFromReply('## 广州4天3晚旅行方案（2人）\n\n### 航班\n…')).toBe('广州')
    expect(deriveDestinationFromReply('# 最终东京方案\n旅行建议已生成。')).toBe('东京')
    expect(deriveDestinationFromReply('# 东京 · 5天行程')).toBe('东京')
    expect(deriveDestinationFromReply('# 从上海出发去广州5天行程总览')).toBe('广州')
    expect(deriveDestinationFromReply('## 交通\n- 地铁')).toBeNull()
    expect(deriveDestinationFromReply('')).toBeNull()
  })

  it('never renders factory defaults silently in route labels', () => {
    expect(routeLabel(createJourneySession().form)).toBe('上海 → 东京') // 工厂默认仅在可编辑表单里出现
    const cleared = { ...createJourneySession().form, origin: manualOrigin(''), destination: '广州' }
    expect(routeLabel(cleared)).toBe('出发地待定 → 广州')
    expect(routeLabel({ ...cleared, destination: '' })).toBe('出发地待定 → 目的地待定')
  })
})

describe('departure date rules（默认日期修复）', () => {
  afterEach(() => {
    vi.useRealTimers()
    sessionStorage.clear()
  })

  it('keeps an explicitly set date through submit and complete (never reset to today)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 4, 2, 0, 0))) // 上海 2026-09-04
    const session = createJourneySession({ id: 'dated' })
    let state = { sessions: [session], activeId: session.id }

    state = journeyReducer(state, { type: 'patchForm', id: 'dated', patch: { date: '2026-10-01' } })
    state = journeyReducer(state, { type: 'submit', id: 'dated', message: '去上海' })
    expect(activeJourneySession(state).form.date).toBe('2026-10-01')

    state = journeyReducer(state, {
      type: 'complete', id: 'dated', reply: '## 上海行程方案', conversationId: null,
    })
    expect(activeJourneySession(state).form.date).toBe('2026-10-01')
  })

  it('restores a historical session with its original date instead of today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 4, 2, 0, 0))) // 今天=2026-09-04
    const trip = createJourneySession({
      id: 'history-date',
      phase: 'ready',
      form: { ...createJourneySession().form, date: '2026-05-20' },
      finalReply: '# 五月行程',
      messages: [{ role: 'user', content: '五月出行' }, { role: 'assistant', content: '# 五月行程' }],
    })
    sessionStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify({ sessions: [trip], activeId: trip.id }))

    const restored = loadInitialJourneyState()
    const restoredSession = restored.sessions.find(s => s.id === 'history-date')
    expect(restoredSession?.form.date).toBe('2026-05-20')
  })

  it('upgrades legacy string origins from old persisted sessions', () => {
    const legacy = createJourneySession({ id: 'legacy-origin', phase: 'ready' })
    const raw = JSON.stringify({ sessions: [legacy], activeId: legacy.id })
    // 模拟旧版本（origin 是字符串）的持久化数据
    const oldShape = JSON.parse(raw)
    oldShape.sessions[0].form.origin = '杭州'
    sessionStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(oldShape))

    const restored = loadInitialJourneyState()
    const origin = restored.sessions[0].form.origin
    expect(origin).toEqual({ label: '杭州', latitude: null, longitude: null, source: 'manual' })
  })
})
