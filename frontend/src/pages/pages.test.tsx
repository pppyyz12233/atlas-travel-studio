import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouterProvider, parseHash } from '../app/router'
import { JourneyProvider } from '../app/JourneyProvider'
import { ToastProvider } from '../app/Toast'
import type { useAuth } from '../hooks/useAuth'
import { api } from '../hooks/useApi'
import { createJourneySession } from '../features/journey'
import HomePage from './HomePage'
import ExplorePage from './ExplorePage'
import TripsPage from './TripsPage'
import TripDetailPage from './TripDetailPage'

vi.mock('../hooks/useApi', () => ({
  api: { get: vi.fn() },
}))

const apiGet = vi.mocked(api.get)

function renderApp(ui: React.ReactElement) {
  return render(
    <RouterProvider>
      <JourneyProvider>
        <ToastProvider>
          {ui}
        </ToastProvider>
      </JourneyProvider>
    </RouterProvider>,
  )
}

const guestAuth = () => ({
  user: null, token: null, isLoggedIn: false, isValidating: false,
  login: vi.fn(), loginByPhone: vi.fn(), register: vi.fn(), logout: vi.fn(),
  showAuthModal: false, setShowAuthModal: vi.fn(),
}) as ReturnType<typeof useAuth>

describe('hash router', () => {
  it('parses the supported routes', () => {
    expect(parseHash('#/')).toMatchObject({ name: 'home', sessionId: null })
    expect(parseHash('#/plan')).toMatchObject({ name: 'plan' })
    expect(parseHash('#/explore')).toMatchObject({ name: 'explore' })
    expect(parseHash('#/trips')).toMatchObject({ name: 'trips' })
    expect(parseHash('#/trip/abc-123')).toMatchObject({ name: 'trip', sessionId: 'abc-123' })
    expect(parseHash('')).toMatchObject({ name: 'home' })
    expect(parseHash('#/unknown')).toMatchObject({ name: 'home' })
  })
})

describe('home page', () => {
  beforeEach(() => {
    sessionStorage.clear()
    location.hash = ''
    apiGet.mockReset()
    apiGet.mockResolvedValue([])
  })
  afterEach(() => {
    sessionStorage.clear()
    location.hash = ''
  })

  it('renders the editorial hero with a single primary input action', () => {
    renderApp(<HomePage />)

    expect(screen.getByRole('heading', { name: /让下一段旅程/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '输入你的旅行想法' })).toBeInTheDocument()
    expect(within(screen.getByRole('textbox', { name: '输入你的旅行想法' }).closest('.mag-hero-input') as HTMLElement).getByRole('button', { name: /开始规划/ })).toBeInTheDocument()
    // 主输入是唯一的表单级行动；探索降为次级链接
    expect(screen.queryByRole('heading', { name: /工作方式/ })).not.toBeInTheDocument()
  })

  it('starts planning directly from a one-line brief', async () => {
    const user = userEvent.setup()
    renderApp(<HomePage />)

    await user.type(
      screen.getByRole('textbox', { name: '输入你的旅行想法' }),
      '十一月去京都看红叶，两个人，预算一万',
    )
    await user.click(within(screen.getByRole('textbox', { name: '输入你的旅行想法' }).closest('.mag-hero-input') as HTMLElement).getByRole('button', { name: /开始规划/ }))

    expect(window.location.hash).toBe('#/plan')
    expect(sessionStorage.getItem('atlas_pending_brief')).toBe('十一月去京都看红叶，两个人，预算一万')
  })

  it('does not navigate or store anything for an empty brief', async () => {
    const user = userEvent.setup()
    renderApp(<HomePage />)

    const submit = within(screen.getByRole('textbox', { name: '输入你的旅行想法' }).closest('.mag-hero-input') as HTMLElement).getByRole('button', { name: /开始规划/ })
    expect(submit).toBeDisabled()

    await user.type(
      screen.getByRole('textbox', { name: '输入你的旅行想法' }),
      '   ',
    )
    expect(submit).toBeDisabled()
    expect(window.location.hash).not.toBe('#/plan')
    expect(sessionStorage.getItem('atlas_pending_brief')).toBeNull()
  })

  it('starts a planning journey from a featured destination', async () => {
    const user = userEvent.setup()
    renderApp(<HomePage />)

    const tokyoCard = screen.getByRole('button', { name: '规划前往 东京 的旅行' })
      .closest('.mag-destination-card') as HTMLElement
    await user.click(within(tokyoCard).getByRole('button', { name: '开始规划' }))

    expect(window.location.hash).toBe('#/plan')
  })
})

describe('explore page', () => {
  beforeEach(() => {
    location.hash = '#/explore'
    apiGet.mockReset()
    apiGet.mockResolvedValue({ total: 0, items: [] })
  })
  afterEach(() => {
    location.hash = ''
  })

  it('filters destinations by travel style and keyword', async () => {
    const user = userEvent.setup()
    renderApp(<ExplorePage />)

    expect(screen.getAllByRole('button', { name: /规划前往/ }).length).toBeGreaterThan(8)

    await user.click(screen.getByRole('button', { name: '亲子旅行' }))
    expect(screen.getAllByRole('button', { name: /规划前往/ }).length).toBe(2)

    await user.click(screen.getByRole('button', { name: '亲子旅行' }))
    await user.type(screen.getByRole('searchbox', { name: '搜索目的地' }), '京都')
    expect(screen.getAllByRole('button', { name: /规划前往/ }).length).toBe(1)
  })

  it('shows a clear empty state when nothing matches', async () => {
    const user = userEvent.setup()
    renderApp(<ExplorePage />)

    await user.type(screen.getByRole('searchbox', { name: '搜索目的地' }), '不存在的城市')
    expect(screen.getByText('没有匹配的目的地')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清除筛选' })).toBeInTheDocument()
  })
})

describe('trips page', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.removeItem('atlas_favorite_destinations')
    location.hash = '#/trips'
    apiGet.mockReset()
    apiGet.mockResolvedValue([])
  })
  afterEach(() => {
    sessionStorage.clear()
    localStorage.removeItem('atlas_favorite_destinations')
    location.hash = ''
  })

  it('invites guests to log in for cloud trips and shows draft empty state', () => {
    renderApp(<TripsPage auth={guestAuth()} />)

    expect(screen.getByText('登录后同步云端行程')).toBeInTheDocument()
    expect(screen.getByText('还没有下一段旅程')).toBeInTheDocument()
    expect(screen.getByText('还没有收藏')).toBeInTheDocument()
  })

  it('lists local drafts and opens a finished one on the detail route', async () => {
    const user = userEvent.setup()
    const session = createJourneySession({
      id: 'draft-ready',
      title: '京都红叶季',
      phase: 'ready',
      finalReply: '# 京都方案\n## 日程\n### Day 1 抵达\n- 15:00：入住酒店',
      messages: [
        { role: 'user', content: '十一月去京都' },
        { role: 'assistant', content: '# 京都方案\n## 日程\n### Day 1 抵达\n- 15:00：入住酒店' },
      ],
    })
    sessionStorage.setItem('atlas_journey_state', JSON.stringify({ sessions: [session], activeId: session.id }))

    renderApp(<TripsPage auth={guestAuth()} />)

    // 卡片主按钮与「删除」按钮都可匹配标题，主按钮排在前面
    const draftCard = screen.getAllByRole('button', { name: /京都红叶季/ })[0]
    await user.click(draftCard)

    expect(window.location.hash).toBe('#/trip/draft-ready')
  })

  it('keeps favorites collapsed by default and expands on demand', async () => {
    const user = userEvent.setup()
    localStorage.setItem('atlas_favorite_destinations', JSON.stringify(['tokyo', 'kyoto']))

    renderApp(<TripsPage auth={guestAuth()} />)

    expect(screen.queryByRole('button', { name: '规划前往 东京 的旅行' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /展开 \(/ }))
    expect(screen.getByRole('button', { name: '规划前往 东京 的旅行' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '规划前往 京都 的旅行' })).toBeInTheDocument()
  })
})

describe('trip detail page', () => {
  beforeEach(() => {
    location.hash = ''
    apiGet.mockReset()
  })
  afterEach(() => {
    sessionStorage.clear()
    location.hash = ''
  })

  it('renders a generated trip as an editorial timeline', () => {
    const session = createJourneySession({
      id: 'detail-1',
      title: '东京五日',
      phase: 'ready',
      conversationId: 7,
      finalReply: '# 东京方案\n## 预算\n| 机票 | ¥2,600 |\n| 酒店 | ¥1,900 |\n## 日程\n### Day 1 抵达东京\n- 15:00：入住银座酒店\n- 18:30：晚饭',
      messages: [
        { role: 'user', content: '东京五天' },
        { role: 'assistant', content: '# 东京方案' },
      ],
    })
    sessionStorage.setItem('atlas_journey_state', JSON.stringify({ sessions: [session], activeId: session.id }))

    renderApp(<TripDetailPage sessionId="detail-1" />)

    expect(screen.getByRole('heading', { name: /东京 · 5 天行程/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /继续调整/ })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: '逐日行程时间轴' })).toBeInTheDocument()
    expect(screen.getAllByText('入住银座酒店').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('预算结构')).toBeInTheDocument()
    expect(screen.getByText('方案全文')).toBeInTheDocument()
  })

  it('filters the visible itinerary by the selected day', async () => {
    const user = userEvent.setup()
    const session = createJourneySession({
      id: 'detail-days',
      title: '杭州两日',
      phase: 'ready',
      finalReply: '# 杭州方案\n## 日程\n### Day 1 西湖\n- 09:00：灵隐寺\n- 11:00：断桥\n### Day 2 龙井\n- 10:00：龙井村',
      messages: [{ role: 'assistant', content: '杭州两日' }],
    })
    sessionStorage.setItem('atlas_journey_state', JSON.stringify({ sessions: [session], activeId: session.id }))

    renderApp(<TripDetailPage sessionId="detail-days" />)

    const timeline = screen.getByRole('region', { name: '逐日行程' })
    expect(within(timeline).getByText('灵隐寺')).toBeInTheDocument()
    expect(within(timeline).queryByText('龙井村')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /第2天/ }))
    expect(within(timeline).getByText('龙井村')).toBeInTheDocument()
    expect(within(timeline).queryByText('灵隐寺')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '每日安排' })).toBeInTheDocument()
  })

  it('handles a missing session gracefully', () => {
    renderApp(<TripDetailPage sessionId="ghost" />)
    expect(screen.getByText('找不到这份行程')).toBeInTheDocument()
  })

  it('handles a session without a generated reply', () => {
    const session = createJourneySession({ id: 'idle-1', title: '空行程' })
    sessionStorage.setItem('atlas_journey_state', JSON.stringify({ sessions: [session], activeId: session.id }))

    renderApp(<TripDetailPage sessionId="idle-1" />)
    expect(screen.getByText('这份行程还没有生成结果')).toBeInTheDocument()
  })
})
