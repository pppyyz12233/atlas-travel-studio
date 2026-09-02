import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JOURNEY_STORAGE_KEY, createJourneySession } from '../features/journey'
import type { NormalizedSSEEvent } from '../features/journey/sseContract'
import type { useAuth } from '../hooks/useAuth'
import type { StreamError } from '../hooks/useSSE'
import type { useTheme } from '../hooks/useTheme'
import AIPage from './AIPage'
import { JourneyProvider } from '../app/JourneyProvider'

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

  // 会话状态已提升到 JourneyProvider，测试中包一层
  const renderPage = (ui: React.ReactElement) => render(ui, { wrapper: JourneyProvider })

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

    expect(screen.getByRole('heading', { name: /旅程工作区/ })).toBeInTheDocument()
    expect(within(screen.getByLabelText('对话记录')).getByText('十一月去京都看红叶')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /京都红叶季/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '新建旅程' }))
    expect(screen.getByLabelText('补充或修改旅行需求')).toBeInTheDocument()
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
    const { rerender } = render(<JourneyProvider><Probe show /></JourneyProvider>)

    await user.click(screen.getByRole('button', { name: '开始规划旅程' }))
    rerender(<JourneyProvider><Probe show={false} /></JourneyProvider>)

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
    await user.click(screen.getByRole('button', { name: '开始规划旅程' }))

    expect(within(screen.getByLabelText('对话记录')).getByText(/从上海去东京/)).toBeInTheDocument()

    expect(setShowAuthModal).not.toHaveBeenCalled()
    expect(streamHarness.startStream).toHaveBeenCalledWith(
      expect.stringContaining('从上海去东京'),
      null,
      null,
      expect.any(Object),
    )

    act(() => {
      streamHarness.options?.onEvent({ event: 'plan', steps: ['推荐航班'] })
    })
    expect(within(screen.getByRole('main')).getByText('推荐航班')).toBeInTheDocument()

    act(() => {
      streamHarness.options?.onEvent({ event: 'done', reply: '# 东京方案\n旅行建议已生成。', conversationId: null })
    })
    expect(screen.getByRole('heading', { name: '东京旅程工作区' })).toBeInTheDocument()
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
    await user.click(await screen.findByRole('button', { name: /东京旧行程/ }))

    const feed = await screen.findByLabelText('对话记录')
    expect(within(feed).getByText('第一版想住在银座')).toBeInTheDocument()
    expect(within(feed).getByText('第一版建议住银座东侧。')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '东京旅程工作区' })).toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: '导出 Markdown' }))

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
    await user.click(screen.getByRole('button', { name: '导出 PDF' }))

    expect(screen.getByRole('heading', { name: '东京旅程工作区' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('导出失败')
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
})
