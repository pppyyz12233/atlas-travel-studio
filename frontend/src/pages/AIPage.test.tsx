import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JOURNEY_STORAGE_KEY, createJourneySession } from '../features/journey'
import type { NormalizedSSEEvent } from '../features/journey/sseContract'
import type { useAuth } from '../hooks/useAuth'
import type { StreamError } from '../hooks/useSSE'
import type { useTheme } from '../hooks/useTheme'
import AIPage from './AIPage'
import HomePage from './HomePage'
import { JourneyProvider } from '../app/JourneyProvider'
import { RouterProvider } from '../app/router'
import { ToastProvider } from '../app/Toast'

interface StreamOptions {
  onEvent: (event: NormalizedSSEEvent) => void
  onError?: (error: StreamError) => void
}

const streamHarness = vi.hoisted(() => ({
  options: null as StreamOptions | null,
  startStream: vi.fn(),
  stopStream: vi.fn(),
}))

const apiHarness = vi.hoisted(() => ({
  get: vi.fn(),
}))

vi.mock('../hooks/useSSE', () => ({
  useSSE: () => ({
    isStreaming: false,
    startStream: streamHarness.startStream,
    stopStream: streamHarness.stopStream,
  }),
}))

vi.mock('../hooks/useApi', () => ({
  api: {
    get: apiHarness.get,
  },
}))

describe('Atlas page integration', () => {
  beforeEach(() => {
    streamHarness.options = null
    streamHarness.startStream.mockReset()
    streamHarness.stopStream.mockReset()
    streamHarness.startStream.mockImplementation((
      _message: string,
      _conversationId: number | null,
      _token: string | null,
      options: StreamOptions,
    ) => {
      streamHarness.options = options
      return Promise.resolve()
    })
    apiHarness.get.mockReset()
    apiHarness.get.mockResolvedValue([])
    sessionStorage.clear()
    location.hash = ''
  })

  // 会话状态已提升到 JourneyProvider；R2 起页面还用到路由与 Toast，统一包全
  const AllProviders = ({ children }: { children: React.ReactNode }) => (
    <RouterProvider>
      <JourneyProvider>
        <ToastProvider>{children}</ToastProvider>
      </JourneyProvider>
    </RouterProvider>
  )
  const renderPage = (ui: React.ReactElement) => render(ui, { wrapper: AllProviders })

  const guestAuth = () => ({
    user: null, token: null, isLoggedIn: false, isValidating: false,
    login: vi.fn(), loginByPhone: vi.fn(), register: vi.fn(), logout: vi.fn(),
    showAuthModal: false, setShowAuthModal: vi.fn(),
  }) as ReturnType<typeof useAuth>
  const lightTheme = () => ({ isDark: false, toggle: vi.fn() }) as ReturnType<typeof useTheme>

  it('restores persisted journey sessions after a page refresh', async () => {
    const user = userEvent.setup()
    const session = createJourneySession({
      id: 'restored-session',
      title: '京都红叶季',
      phase: 'ready',
      finalReply: '# 京都方案\n完整内容',
      messages: [
        { role: 'user', content: '十一月去京都看红叶' },
        { role: 'assistant', content: '# 京都方案\n完整内容' },
      ],
    })
    sessionStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify({
      sessions: [session],
      activeId: session.id,
    }))

    renderPage(<AIPage auth={guestAuth()} theme={lightTheme()} />)

    expect(screen.getByRole('heading', { name: /行程方案/ })).toBeInTheDocument()

    // R5：完成态对话轨迹默认折叠，展开后可见历史消息
    await user.click(screen.getByRole('button', { name: /对话过程 \(2\)/ }))
    expect(within(screen.getByLabelText('对话记录')).getByText('十一月去京都看红叶')).toBeInTheDocument()

    // R7：阅读态隐藏工作区顶栏（会话切换交给「我的行程」页与全局顶栏）
    expect(screen.queryByRole('button', { name: '打开旅程列表' })).not.toBeInTheDocument()

    // R6：输入框收起为单行
    expect(screen.getByRole('button', { name: /继续调整这份方案/ })).toBeInTheDocument()
  })

  it('marks a session interrupted by refresh as cancelled instead of stuck streaming', () => {
    const session = createJourneySession({ id: 'interrupted', title: '冲绳潜水', phase: 'planning' })
    sessionStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify({
      sessions: [session],
      activeId: session.id,
    }))

    renderPage(<AIPage auth={guestAuth()} theme={lightTheme()} />)

    expect(screen.getAllByText('已停止').length).toBeGreaterThan(0)
    expect(screen.getByText(/页面刷新，生成已中断/)).toBeInTheDocument()
  })

  it('collapses the conversation trail in reading mode and expands on demand', async () => {
    const user = userEvent.setup()
    const session = createJourneySession({
      id: 'feed-trip',
      title: '京都红叶季',
      phase: 'ready',
      finalReply: '# 京都方案',
      messages: [
        { role: 'user', content: '十一月去京都看红叶' },
        { role: 'assistant', content: '# 京都方案' },
      ],
    })
    sessionStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify({ sessions: [session], activeId: session.id }))

    renderPage(<AIPage auth={guestAuth()} theme={lightTheme()} />)

    // R5：完成态对话轨迹默认折叠为单行入口，带消息计数
    expect(screen.queryByLabelText('对话记录')).not.toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: /对话过程 \(2\)/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    expect(screen.getByLabelText('对话记录')).toBeInTheDocument()
    expect(within(screen.getByLabelText('对话记录')).getByText('十一月去京都看红叶')).toBeInTheDocument()
  })

  it('collapses the composer to a one-line teaser in reading mode', async () => {
    const user = userEvent.setup()
    const session = createJourneySession({
      id: 'teaser-trip',
      title: '东京五日',
      phase: 'ready',
      finalReply: '# 东京方案',
      messages: [
        { role: 'user', content: '东京五天' },
        { role: 'assistant', content: '# 东京方案' },
      ],
    })
    sessionStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify({ sessions: [session], activeId: session.id }))

    renderPage(<AIPage auth={guestAuth()} theme={lightTheme()} />)

    // R6：完成态输入框收起为单行，textarea 不占屏
    expect(screen.queryByLabelText('补充或修改旅行需求')).not.toBeInTheDocument()
    const teaser = screen.getByRole('button', { name: /继续调整这份方案/ })
    expect(teaser).toBeInTheDocument()

    await user.click(teaser)
    const textarea = screen.getByLabelText('补充或修改旅行需求')
    await user.type(textarea, '第二天少一个景点')
    await user.type(textarea, '{Enter}')

    // 游客继续调整：后端没有云端上下文，请求需附带上一版方案（对话航迹仍显示原话）
    expect(streamHarness.startStream).toHaveBeenCalledTimes(1)
    const [sentMessage] = streamHarness.startStream.mock.calls[0]
    expect(sentMessage).toContain('第二天少一个景点')
    expect(sentMessage).toContain('【上一版方案参考，请在此基础上修改】')
    expect(sentMessage).toContain('# 东京方案')
    // 首句之后才是上下文块：用户原话不被改写
    expect(sentMessage.startsWith('第二天少一个景点')).toBe(true)
    // UI 对话航迹保持用户原话
    expect(within(screen.getByLabelText('对话记录')).getByText('第二天少一个景点')).toBeInTheDocument()
  })

  it('auto-starts planning from a home page brief exactly once', async () => {
    sessionStorage.setItem('atlas_pending_brief', '十一月去京都看红叶，两个人')

    const { rerender } = renderPage(<AIPage auth={guestAuth()} theme={lightTheme()} />)

    await waitFor(() => {
      expect(streamHarness.startStream).toHaveBeenCalledWith(
        '十一月去京都看红叶，两个人',
        null,
        null,
        expect.any(Object),
      )
    })
    expect(within(screen.getByLabelText('对话记录')).getByText('十一月去京都看红叶，两个人')).toBeInTheDocument()

    // 重渲染（StrictMode 二次挂载同理）不会重复发送：handoff 已被消费
    rerender(<AIPage auth={guestAuth()} theme={lightTheme()} />)
    expect(streamHarness.startStream).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('atlas_pending_brief')).toBeNull()
  })

  it('marks an in-flight session as cancelled when the planner unmounts', async () => {
    const user = userEvent.setup()
    // 还原真实挂载关系：Provider 常驻，只有规划页卸载（路由切换）
    const Probe = ({ show }: { show: boolean }) => (
      show ? <AIPage auth={guestAuth()} theme={lightTheme()} /> : null
    )
    const { rerender } = render(<AllProviders><Probe show /></AllProviders>)

    await user.click(screen.getByRole('button', { name: '开始规划旅程' }))
    rerender(<AllProviders><Probe show={false} /></AllProviders>)

    await waitFor(() => {
      const persisted = JSON.parse(sessionStorage.getItem('atlas_journey_state') ?? '{}')
      const sessions = (persisted.sessions ?? []) as Array<{ phase?: string; statusMessage?: string }>
      expect(sessions.some(session =>
        session.phase === 'cancelled' && session.statusMessage?.includes('已离开规划页'),
      )).toBe(true)
    })
  })

  it('lets a guest plan and renders a completed stream in the journey workspace', async () => {
    const user = userEvent.setup()
    const setShowAuthModal = vi.fn()
    const auth = {
      user: null,
      token: null,
      isLoggedIn: false,
      isValidating: false,
      login: vi.fn(),
      loginByPhone: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      showAuthModal: false,
      setShowAuthModal,
    } as ReturnType<typeof useAuth>
    const theme = { isDark: false, toggle: vi.fn() } as ReturnType<typeof useTheme>

    renderPage(<AIPage auth={auth} theme={theme} />)

    // idle 不被三栏压迫：右栏收起
    expect(screen.getByLabelText('地图与执行详情')).toHaveClass('is-collapsed')

    await user.click(screen.getByRole('button', { name: '开始规划旅程' }))

    expect(within(screen.getByLabelText('对话记录')).getByText(/从上海去东京/)).toBeInTheDocument()

    expect(setShowAuthModal).not.toHaveBeenCalled()
    expect(streamHarness.startStream).toHaveBeenCalledWith(
      expect.stringContaining('从上海去东京'),
      null,
      null,
      expect.any(Object),
    )

    // 进入规划后自动展开右栏（地图 + 执行链）
    await waitFor(() => {
      expect(screen.getByLabelText('地图与执行详情')).not.toHaveClass('is-collapsed')
    })
    act(() => {
      streamHarness.options?.onEvent({ event: 'plan', steps: ['推荐航班'] })
    })
    expect(within(screen.getByRole('main')).getByText('推荐航班')).toBeInTheDocument()

    act(() => {
      streamHarness.options?.onEvent({ event: 'done', reply: '# 东京方案\n旅行建议已生成。', conversationId: null })
    })
    expect(screen.getByRole('heading', { name: '东京 · 行程方案' })).toBeInTheDocument()

    // R4：完成后右栏自动收起（阅读态唯一中心）；与恢复会话路径状态一致
    await waitFor(() => {
      expect(screen.getByLabelText('地图与执行详情')).toHaveClass('is-collapsed')
    })
  })

  it('applies a structured example to the command strip before planning', async () => {
    const user = userEvent.setup()
    const auth = {
      user: null,
      token: null,
      isLoggedIn: false,
      isValidating: false,
      login: vi.fn(),
      loginByPhone: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      showAuthModal: false,
      setShowAuthModal: vi.fn(),
    } as ReturnType<typeof useAuth>
    const theme = { isDark: false, toggle: vi.fn() } as ReturnType<typeof useTheme>

    renderPage(<AIPage auth={auth} theme={theme} />)
    await user.click(screen.getByRole('button', { name: /周末松弛之旅/ }))

    expect(streamHarness.startStream).toHaveBeenCalledWith(
      expect.stringContaining('杭州周末两天一夜'),
      null,
      null,
      expect.any(Object),
    )
    expect(within(screen.getByLabelText('当前旅程任务')).getByText('杭州')).toBeInTheDocument()
  })

  it('renders earlier authenticated history messages in the conversation feed', async () => {
    const user = userEvent.setup()
    apiHarness.get.mockImplementation((path: string) => {
      if (path === '/chat/conversations') {
        return Promise.resolve([{ id: 21, title: '东京旧行程', created_at: '2026-08-20' }])
      }
      if (path === '/chat/history?conversation_id=21') {
        return Promise.resolve([
          { role: 'user', content: '第一版想住在银座' },
          { role: 'assistant', content: '第一版建议住银座东侧。' },
          { role: 'user', content: '后来改成上野附近' },
          { role: 'assistant', content: '# 最终东京方案' },
        ])
      }
      return Promise.resolve([])
    })
    const auth = {
      user: { user_id: 1, username: 'Atlas User', email: null, phone: null, role: 'user' },
      token: 'valid-token',
      isLoggedIn: true,
      isValidating: false,
      login: vi.fn(),
      loginByPhone: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      showAuthModal: false,
      setShowAuthModal: vi.fn(),
    } as ReturnType<typeof useAuth>
    const theme = { isDark: false, toggle: vi.fn() } as ReturnType<typeof useTheme>

    renderPage(<AIPage auth={auth} theme={theme} />)
    await user.click(screen.getByRole('button', { name: '打开旅程列表' }))
    await user.click(await screen.findByRole('button', { name: /东京旧行程/ }))

    // R5：历史会话进入阅读态，对话轨迹默认折叠，展开后可见
    const toggle = await screen.findByRole('button', { name: /对话过程 \(4\)/ })
    await user.click(toggle)
    const feed = await screen.findByLabelText('对话记录')
    expect(within(feed).getByText('第一版想住在银座')).toBeInTheDocument()
    expect(within(feed).getByText('第一版建议住银座东侧。')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '东京 · 行程方案' })).toBeInTheDocument()
  })

  it('ignores a stale conversation response after logout', async () => {
    let resolveConversations!: (value: unknown[]) => void
    apiHarness.get.mockReturnValue(new Promise(resolve => { resolveConversations = resolve }))
    const loggedInAuth = {
      user: { user_id: 1, username: 'Atlas User', email: null, phone: null, role: 'user' },
      token: 'valid-token',
      isLoggedIn: true,
      isValidating: false,
      login: vi.fn(), loginByPhone: vi.fn(), register: vi.fn(), logout: vi.fn(),
      showAuthModal: false, setShowAuthModal: vi.fn(),
    } as ReturnType<typeof useAuth>
    const loggedOutAuth = {
      ...loggedInAuth,
      user: null,
      token: null,
      isLoggedIn: false,
    } as ReturnType<typeof useAuth>
    const theme = { isDark: false, toggle: vi.fn() } as ReturnType<typeof useTheme>

    const { rerender } = renderPage(<AIPage auth={loggedInAuth} theme={theme} />)
    await waitFor(() => expect(apiHarness.get).toHaveBeenCalledWith('/chat/conversations'))
    rerender(<AIPage auth={loggedOutAuth} theme={theme} />)

    await act(async () => {
      resolveConversations([{ id: 99, title: '不应出现的旧账号行程', created_at: '2026-08-01' }])
      await Promise.resolve()
    })

    expect(screen.queryByText('不应出现的旧账号行程')).not.toBeInTheDocument()
  })

  it('downloads a guest result as Markdown without forcing login', async () => {
    const user = userEvent.setup()
    const createObjectURL = vi.fn().mockReturnValue('blob:atlas-plan')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const setShowAuthModal = vi.fn()
    const auth = {
      user: null, token: null, isLoggedIn: false, isValidating: false,
      login: vi.fn(), loginByPhone: vi.fn(), register: vi.fn(), logout: vi.fn(),
      showAuthModal: false, setShowAuthModal,
    } as ReturnType<typeof useAuth>
    const theme = { isDark: false, toggle: vi.fn() } as ReturnType<typeof useTheme>

    renderPage(<AIPage auth={auth} theme={theme} />)
    await user.click(screen.getByRole('button', { name: '开始规划旅程' }))
    act(() => {
      streamHarness.options?.onEvent({ event: 'done', reply: '# 东京方案\n真实结果', conversationId: null })
    })
    await user.click(screen.getByRole('button', { name: /导出/ }))
    await user.click(screen.getByRole('menuitem', { name: '导出 Markdown' }))

    expect(setShowAuthModal).not.toHaveBeenCalled()
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:atlas-plan')
    click.mockRestore()
  })

  it('keeps a usable itinerary visible when server export fails', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })))
    const auth = {
      user: { user_id: 1, username: 'Atlas User', email: null, phone: null, role: 'user' },
      token: 'valid-token', isLoggedIn: true, isValidating: false,
      login: vi.fn(), loginByPhone: vi.fn(), register: vi.fn(), logout: vi.fn(),
      showAuthModal: false, setShowAuthModal: vi.fn(),
    } as ReturnType<typeof useAuth>
    const theme = { isDark: false, toggle: vi.fn() } as ReturnType<typeof useTheme>

    renderPage(<AIPage auth={auth} theme={theme} />)
    await user.click(screen.getByRole('button', { name: '开始规划旅程' }))
    act(() => {
      streamHarness.options?.onEvent({ event: 'done', reply: '# 东京方案\n真实结果', conversationId: 55 })
    })
    await user.click(screen.getByRole('button', { name: /导出/ }))
    await user.click(screen.getByRole('menuitem', { name: '导出 PDF' }))

    expect(screen.getByRole('heading', { name: '东京 · 行程方案' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('导出失败')
  })

  it('routes a completed trip to the detail view and shows cloud save state', async () => {
    const user = userEvent.setup()
    renderPage(<AIPage auth={guestAuth()} theme={lightTheme()} />)
    await user.click(screen.getByRole('button', { name: '开始规划旅程' }))
    act(() => {
      streamHarness.options?.onEvent({ event: 'done', reply: '# 东京方案\n真实结果', conversationId: 55 })
    })

    expect(screen.getByText('已保存到云端')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /查看完整行程/ }))
    expect(window.location.hash).toMatch(/^#\/trip\//)
  })

  it('tells guests their trip is kept as a local draft', async () => {
    const user = userEvent.setup()
    renderPage(<AIPage auth={guestAuth()} theme={lightTheme()} />)
    await user.click(screen.getByRole('button', { name: '开始规划旅程' }))
    act(() => {
      streamHarness.options?.onEvent({ event: 'done', reply: '# 东京方案\n真实结果', conversationId: null })
    })

    expect(screen.getByRole('button', { name: /已存为本地草稿/ })).toBeInTheDocument()
  })

  it('opens the map panel from the reading state map entry', async () => {
    const user = userEvent.setup()
    renderPage(<AIPage auth={guestAuth()} theme={lightTheme()} />)
    await user.click(screen.getByRole('button', { name: '开始规划旅程' }))
    act(() => {
      streamHarness.options?.onEvent({ event: 'done', reply: '# 东京方案\n真实结果', conversationId: null })
    })

    // 完成态右栏默认收起，「查看地图」入口可重新打开
    await waitFor(() => {
      expect(screen.getByLabelText('地图与执行详情')).toHaveClass('is-collapsed')
    })
    await user.click(screen.getByRole('button', { name: /查看地图/ }))
    await waitFor(() => {
      expect(screen.getByLabelText('地图与执行详情')).not.toHaveClass('is-collapsed')
    })
  })

  it('opens login and keeps the current draft when an SSE token expires', async () => {
    const user = userEvent.setup()
    const logout = vi.fn()
    const setShowAuthModal = vi.fn()
    const auth = {
      user: { user_id: 1, username: 'Atlas User', email: null, phone: null, role: 'user' },
      token: 'expired-token', isLoggedIn: true, isValidating: false,
      login: vi.fn(), loginByPhone: vi.fn(), register: vi.fn(), logout,
      showAuthModal: false, setShowAuthModal,
    } as ReturnType<typeof useAuth>
    const theme = { isDark: false, toggle: vi.fn() } as ReturnType<typeof useTheme>

    renderPage(<AIPage auth={auth} theme={theme} />)
    await user.click(screen.getByRole('button', { name: '开始规划旅程' }))
    act(() => {
      streamHarness.options?.onError?.({ message: '登录已过期', status: 401 })
    })

    expect(logout).toHaveBeenCalledOnce()
    expect(setShowAuthModal).toHaveBeenCalledWith(true)
    expect(within(screen.getByLabelText('对话记录')).getByText(/从上海去东京/)).toBeInTheDocument()
  })

  it('opens login when conversation history returns 401', async () => {
    const logout = vi.fn()
    const setShowAuthModal = vi.fn()
    apiHarness.get.mockRejectedValue({ status: 401, message: '登录已过期' })
    const auth = {
      user: { user_id: 1, username: 'Atlas User', email: null, phone: null, role: 'user' },
      token: 'expired-token', isLoggedIn: true, isValidating: false,
      login: vi.fn(), loginByPhone: vi.fn(), register: vi.fn(), logout,
      showAuthModal: false, setShowAuthModal,
    } as ReturnType<typeof useAuth>
    const theme = { isDark: false, toggle: vi.fn() } as ReturnType<typeof useTheme>

    renderPage(<AIPage auth={auth} theme={theme} />)

    await waitFor(() => expect(setShowAuthModal).toHaveBeenCalledWith(true))
    expect(logout).toHaveBeenCalledOnce()
  })

  it('keeps title, route and guest export payload on the destination the user asked for (想去广州)', async () => {
    const user = userEvent.setup()
    // 首页一句话 handoff：pendingBrief 由规划页 mount 时消费
    sessionStorage.setItem('atlas_pending_brief', '想去广州')
    const createObjectURL = vi.fn().mockReturnValue('blob:atlas-plan')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const pdfBody = new Blob(['%PDF-1.4 test'], { type: 'application/pdf' })
    const fetchMock = vi.fn().mockResolvedValue(new Response(pdfBody, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    renderPage(<AIPage auth={guestAuth()} theme={lightTheme()} />)

    // 自动发送的就是用户的一句话，不带任何旧 conversationId
    await waitFor(() => {
      expect(streamHarness.startStream).toHaveBeenCalledWith('想去广州', null, null, expect.any(Object))
    })

    act(() => {
      streamHarness.options?.onEvent({
        event: 'done',
        reply: '## 广州4天3晚旅行方案（2人）\\n\\n### 日程\\n| 时段 | 地点 |\\n|---|---|\\n| 下午 | 陈家祠 |',
        conversationId: null,
      })
    })

    // 标题 / 摘要 / 任务全部来自同一份 canonical 方案——都是广州，且不再显示默认"上海"
    expect(screen.getByRole('heading', { name: '广州 · 行程方案' })).toBeInTheDocument()
    expect(screen.getByText(/出发地待定 → 广州/)).toBeInTheDocument()
    // 阅读态对话轨迹默认折叠：展开后可见任务原文
    await user.click(screen.getByRole('button', { name: /对话过程 \(\d+\)/ }))
    expect(within(screen.getByLabelText('对话记录')).getByText('想去广州')).toBeInTheDocument()

    // 游客 PDF 导出的 payload 也来自同一会话
    await user.click(screen.getByRole('button', { name: /导出/ }))
    await user.click(screen.getByRole('menuitem', { name: '导出 PDF' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/export/guest', expect.objectContaining({ method: 'POST' })))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.destination).toBe('广州')
    expect(body.content).toContain('广州4天3晚旅行方案')
    expect(screen.getByText(/PDF 已下载到本地/)).toBeInTheDocument()

    click.mockRestore()
    vi.unstubAllGlobals()
  })

  it('warns instead of silently switching when the reply destination conflicts with the brief', async () => {
    const user = userEvent.setup()
    renderPage(<AIPage auth={guestAuth()} theme={lightTheme()} />)

    // 默认会话（表单未被手动改过）在 composer 里输入"想去广州"
    await user.type(screen.getByLabelText('补充或修改旅行需求'), '想去广州')
    await user.click(screen.getByRole('button', { name: '发送旅行要求' }))
    expect(streamHarness.startStream).toHaveBeenCalledWith('想去广州', null, null, expect.any(Object))

    // 模型却生成了东京方案：显示层保持用户输入的广州，并明确提示冲突（不静默覆盖）
    act(() => {
      streamHarness.options?.onEvent({ event: 'done', reply: '# 最终东京方案\\n行程内容。', conversationId: null })
    })

    expect(screen.getByRole('heading', { name: '广州 · 行程方案' })).toBeInTheDocument()
    expect(screen.getByText(/目的地是「东京」/)).toBeInTheDocument()
  })

  it('does not leak a previous Tokyo trip into a second Guangzhou plan', async () => {
    const user = userEvent.setup()
    // Provider 常驻，页面在首页/规划页之间真实切换（HomePage 负责新建会话 + pendingBrief handoff）
    const Probe = ({ page }: { page: 'home' | 'plan' }) => (
      page === 'plan' ? <AIPage auth={guestAuth()} theme={lightTheme()} /> : <HomePage />
    )
    const { rerender } = render(<AllProviders><Probe page="plan" /></AllProviders>)
    await user.click(screen.getByRole('button', { name: '开始规划旅程' }))
    act(() => {
      streamHarness.options?.onEvent({ event: 'done', reply: '# 东京方案\\n内容', conversationId: null })
    })
    expect(screen.getByRole('heading', { name: '东京 · 行程方案' })).toBeInTheDocument()

    // 第二次：回首页输入"想去广州"开始新规划
    rerender(<AllProviders><Probe page="home" /></AllProviders>)
    const briefBox = screen.getByRole('textbox', { name: '输入你的旅行想法' })
    await user.type(briefBox, '想去广州')
    await user.click(within(briefBox.closest('.mag-hero-input') as HTMLElement).getByRole('button', { name: /开始规划/ }))
    rerender(<AllProviders><Probe page="plan" /></AllProviders>)

    await waitFor(() => {
      expect(streamHarness.startStream).toHaveBeenLastCalledWith('想去广州', null, null, expect.any(Object))
    })
    act(() => {
      streamHarness.options?.onEvent({
        event: 'done',
        reply: '## 广州4天3晚旅行方案\\n\\n| 时段 | 地点 |\\n|---|---|\\n| 下午 | 陈家祠 |',
        conversationId: null,
      })
    })

    expect(screen.getByRole('heading', { name: '广州 · 行程方案' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '东京 · 行程方案' })).not.toBeInTheDocument()
    expect(screen.getByText(/出发地待定 → 广州/)).toBeInTheDocument()
    // 旧的东京会话仍然保留（可回看），只是不再是被展示的那个
    const persisted = JSON.parse(sessionStorage.getItem(JOURNEY_STORAGE_KEY) ?? '{}')
    const destinations = (persisted.sessions ?? []).map((session: { form?: { destination?: string } }) => session.form?.destination)
    expect(destinations).toContain('东京')
    expect(persisted.activeId).not.toBeNull()
  })

  it('keeps page summary, map context and PDF payload on the same date', async () => {
    const user = userEvent.setup()
    const session = createJourneySession({
      id: 'dated-trip',
      title: '十月上海行程',
      phase: 'ready',
      form: { ...createJourneySession().form, destination: '上海', date: '2026-10-01' },
      finalReply: '# 上海行程方案\n内容',
      messages: [
        { role: 'user', content: '去上海' },
        { role: 'assistant', content: '# 上海行程方案\n内容' },
      ],
    })
    sessionStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify({ sessions: [session], activeId: session.id }))
    const createObjectURL = vi.fn().mockReturnValue('blob:atlas-plan')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    renderPage(<AIPage auth={guestAuth()} theme={lightTheme()} />)

    // 1) 页面摘要日期（命令条 + 阅读态摘要都会显示）
    expect(screen.getAllByText('2026-10-01').length).toBeGreaterThan(0)

    // 2) 地图上下文面板（右栏）显示同一日期
    act(() => {
      document.querySelector('.atlas-context-tab')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const manifest = document.querySelector('.atlas-manifest-metrics')
    expect(manifest?.textContent).toContain('2026-10-01')

    // 3) PDF payload 日期一致
    await user.click(screen.getByRole('button', { name: /导出/ }))
    await user.click(screen.getByRole('menuitem', { name: '导出 PDF' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/export/guest', expect.objectContaining({ method: 'POST' })))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.dates).toBe('2026-10-01')
    expect(body.destination).toBe('上海')

    click.mockRestore()
    vi.unstubAllGlobals()
  })
})
