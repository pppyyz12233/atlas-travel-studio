import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AppShell from './AppShell'
import Composer from './Composer'
import ItineraryWorkspace from './ItineraryWorkspace'
import JourneyCommandStrip from './JourneyCommandStrip'
import JourneyContextPanel from './JourneyContextPanel'
import MissionBrief from './MissionBrief'
import OrchestrationTimeline from './OrchestrationTimeline'
import SessionRail from './SessionRail'
import TripTimeline from '../../components/TripTimeline'
import { createJourneySession } from './model'
import { buildItineraryViewModel } from './viewModel'

const tripForm = {
  origin: { label: '上海', latitude: null, longitude: null, source: 'manual' as const },
  destination: '东京',
  date: '2026-09-08',
  days: 5,
  people: 2,
  budget: 8000,
}

describe('Atlas journey interface', () => {
  it('labels and closes both mobile drawers', async () => {
    const user = userEvent.setup()
    const closeRail = vi.fn()
    const closeContext = vi.fn()

    render(
      <AppShell
        rail={<div>会话</div>}
        workspace={<main>工作区</main>}
        context={<div>地图</div>}
        railOpen
        contextOpen
        onCloseRail={closeRail}
        onCloseContext={closeContext}
      />,
    )

    await user.click(screen.getByRole('button', { name: '关闭旅程列表' }))
    await user.click(screen.getByRole('button', { name: '关闭地图面板' }))
    expect(closeRail).toHaveBeenCalledOnce()
    expect(closeContext).toHaveBeenCalledOnce()
  })

  it('keeps the rail as a drawer and collapses the context panel until opened (desktop)', async () => {
    const user = userEvent.setup()
    const openContext = vi.fn()

    render(
      <AppShell
        rail={<div>会话</div>}
        workspace={<main>工作区</main>}
        context={<div>地图</div>}
        railOpen={false}
        contextOpen={false}
        onCloseRail={() => undefined}
        onCloseContext={() => undefined}
        onOpenContext={openContext}
      />,
    )

    // 桌面端会话栏也默认收起为抽屉
    expect(screen.getByLabelText('旅程列表')).toHaveAttribute('aria-hidden', 'true')
    // 右栏 idle 收起，提供边缘展开按钮
    expect(screen.getByLabelText('地图与执行详情')).toHaveClass('is-collapsed')
    await user.click(screen.getByRole('button', { name: '展开地图与执行详情' }))
    expect(openContext).toHaveBeenCalledOnce()
  })

  it('submits a normalized travel brief from the mission form', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <MissionBrief
        form={tripForm}
        onChange={() => undefined}
        onSubmit={onSubmit}
        onUseSuggestion={() => undefined}
        disabled={false}
      />,
    )

    // R7：表单区引导文案中文化
    expect(screen.getByText('智能旅行规划')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '开始规划旅程' }))
    expect(onSubmit).toHaveBeenCalledWith('从上海去东京，2026-09-08出发，5天，2人，人均预算8000元。请给出兼顾体验、节奏和预算的完整方案。')
  })

  it('prefers the free-text brief over the form fields when provided', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <MissionBrief
        form={tripForm}
        onChange={() => undefined}
        onSubmit={onSubmit}
        onUseSuggestion={() => undefined}
        disabled={false}
      />,
    )

    await user.type(screen.getByRole('textbox', { name: '一句话旅行想法' }), '十一月去京都看红叶，两个人')
    await user.click(screen.getByRole('button', { name: '开始规划旅程' }))

    expect(onSubmit).toHaveBeenCalledWith('十一月去京都看红叶，两个人')
  })

  it('keeps detailed form fields collapsed until asked for', async () => {
    const user = userEvent.setup()
    render(
      <MissionBrief
        form={tripForm}
        onChange={() => undefined}
        onSubmit={() => undefined}
        onUseSuggestion={() => undefined}
        disabled={false}
      />,
    )

    expect(screen.queryByLabelText('出发地')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /详细条件/ }))
    expect(screen.getByLabelText('出发地')).toBeVisible()
  })

  it('does not repeat the journey summary before the mission is submitted', () => {
    render(
      <JourneyCommandStrip
        form={tripForm}
        phase="idle"
        progress={0}
      />,
    )

    expect(screen.queryByLabelText('当前旅程任务')).not.toBeInTheDocument()
  })

  it('shows a compact Chinese journey summary with real planning progress', () => {
    render(
      <JourneyCommandStrip
        form={tripForm}
        phase="planning"
        progress={40}
        graphNode="executor"
      />,
    )

    expect(screen.getByText('正在规划')).toBeInTheDocument()
    expect(screen.getByText('并行执行 · 40%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40')
    expect(screen.getByText('上海')).toBeInTheDocument()
    expect(screen.getByText('东京')).toBeInTheDocument()
    expect(screen.getByText('9月8日')).toBeInTheDocument()
    expect(screen.getByText('¥8,000/人')).toBeInTheDocument()
    expect(screen.queryByText('Origin')).not.toBeInTheDocument()
    expect(screen.queryByText('Destination')).not.toBeInTheDocument()
  })

  it('keeps journey navigation actions explicit', async () => {
    const user = userEvent.setup()
    const onNewJourney = vi.fn()
    const onActivateSession = vi.fn()
    const session = createJourneySession({ id: 'journey-nav', title: '东京建筑路线' })

    render(
      <SessionRail
        sessions={[session]}
        activeId={session.id}
        conversations={[]}
        historyLoading={false}
        isLoggedIn={false}
        userName="访客"
        isDark={false}
        onNewJourney={onNewJourney}
        onActivateSession={onActivateSession}
        onRemoveSession={() => undefined}
        onLoadConversation={() => undefined}
        onLogin={() => undefined}
        onLogout={() => undefined}
        onToggleTheme={() => undefined}
      />,
    )

    await user.click(screen.getByRole('button', { name: '新建旅程' }))
    await user.click(screen.getByRole('button', { name: /东京建筑路线/ }))
    expect(onNewJourney).toHaveBeenCalledOnce()
    expect(onActivateSession).toHaveBeenCalledWith('journey-nav')
    expect(screen.getByRole('button', { name: '登录以保存旅程' })).toBeInTheDocument()
  })

  it('shows only execution metrics supplied by the backend', () => {
    render(
      <OrchestrationTimeline
        steps={[{
          name: '推荐景点',
          worker: 'attraction',
          status: 'done',
          summary: '返回 3 个地点',
          locations: [],
          iterations: 2,
          toolCalls: 1,
        }]}
        graphNode=""
        phase="ready"
        statusMessage=""
        onRetry={() => undefined}
        onEditBrief={() => undefined}
      />,
    )

    expect(screen.getByText('2 轮分析')).toBeInTheDocument()
    expect(screen.getByText('1 次工具')).toBeInTheDocument()
    expect(screen.queryByText(/token/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/¥0\./)).not.toBeInTheDocument()
  })

  it('submits composer text on Enter and exposes a stop action while streaming', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const { rerender } = render(
      <Composer
        value="缩短第二天行程"
        onChange={() => undefined}
        onSubmit={onSubmit}
        onStop={() => undefined}
        isStreaming={false}
        suggestions={[]}
      />,
    )

    await user.type(screen.getByRole('textbox', { name: '补充或修改旅行需求' }), '{Enter}')
    expect(onSubmit).toHaveBeenCalledOnce()

    rerender(
      <Composer
        value=""
        onChange={() => undefined}
        onSubmit={() => undefined}
        onStop={() => undefined}
        isStreaming
        suggestions={[]}
      />,
    )
    expect(screen.getByRole('button', { name: '停止生成' })).toBeInTheDocument()
  })

  it('keeps completed steps visible in recovery state', () => {
    render(
      <OrchestrationTimeline
        steps={[{
          name: '推荐酒店', worker: 'hotel', status: 'done', summary: '完成',
          locations: [], iterations: 1, toolCalls: 1,
        }]}
        graphNode=""
        phase="error"
        statusMessage="连接提前结束，请重试"
        onRetry={() => undefined}
        onEditBrief={() => undefined}
      />,
    )

    expect(screen.getByText('推荐酒店')).toBeInTheDocument()
    expect(screen.getByText(/连接提前结束，请重试/)).toBeInTheDocument()
    expect(screen.getByText(/已保留 1 个完成的步骤/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新生成' })).toBeInTheDocument()
  })

  it('renders daily content inline and forwards export actions', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    const viewModel = buildItineraryViewModel(`## 日程
### Day 1 抵达东京
- 15:00：入住银座酒店`)

    render(
      <ItineraryWorkspace
        viewModel={viewModel}
        city="东京"
        steps={[]}
        locations={[]}
        onSearchMap={() => undefined}
        onExport={onExport}
      />,
    )

    // 阅读态：日程与全文都在同一条线性主线里，无需切换
    expect(screen.getByRole('list', { name: '逐日行程时间轴' })).toHaveTextContent('入住银座酒店')
    expect(screen.getByText('抵达东京')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /导出/ }))
    await user.click(screen.getByRole('menuitem', { name: '导出 PDF' }))
    expect(onExport).toHaveBeenCalledWith('pdf')
  })

  it('falls back to a narrative note when no structured data exists', async () => {
    const user = userEvent.setup()
    render(
      <ItineraryWorkspace
        viewModel={buildItineraryViewModel('只有一段普通旅行建议')}
        city="东京"
        steps={[]}
        locations={[]}
        onSearchMap={() => undefined}
      />,
    )

    expect(screen.getByText(/自由叙述/)).toBeInTheDocument()
    // 全文收在折叠里，展开后可见（R2）
    await user.click(screen.getByRole('button', { name: /完整方案/ }))
    expect(screen.getByText('只有一段普通旅行建议')).toBeInTheDocument()
  })

  it('keeps route and execution context together with Chinese labels', () => {
    render(
      <JourneyContextPanel
        form={tripForm}
        locations={[]}
        steps={[]}
        phase="idle"
        progress={0}
      />,
    )

    expect(screen.getByRole('heading', { name: '东京行动地图' })).toBeInTheDocument()
    expect(screen.getByText('上海')).toBeInTheDocument()
    expect(screen.getByText('东京')).toBeInTheDocument()
    expect(screen.getByText('等待任务')).toBeInTheDocument()
    // R7：面向用户的文案不再中英混排
    expect(screen.getByText('实时执行地图')).toBeInTheDocument()
    expect(screen.getByText('路线概览')).toBeInTheDocument()
    expect(screen.getByText('智能体执行')).toBeInTheDocument()
  })

  it('prefers map focus for a timeline item and falls back to POI search', async () => {
    const user = userEvent.setup()
    const focus = vi.fn().mockReturnValue(true)
    const fallback = vi.fn()
    const days = buildItineraryViewModel('## 日程\n### 第 1 天\n- 09:00：浅草寺').days

    const { rerender } = render(
      <TripTimeline days={days} city="东京" onSearchMap={fallback} onFocusLocation={focus} />,
    )
    await user.click(screen.getByRole('button', { name: /在地图查看 浅草寺/ }))
    expect(focus).toHaveBeenCalledWith(expect.stringContaining('浅草寺'))
    expect(fallback).not.toHaveBeenCalled()

    // focus 未命中（返回 false）→ 回落 POI 搜索
    const miss = vi.fn().mockReturnValue(false)
    rerender(<TripTimeline days={days} city="东京" onSearchMap={fallback} onFocusLocation={miss} />)
    await user.click(screen.getByRole('button', { name: /在地图查看 浅草寺/ }))
    expect(fallback).toHaveBeenCalledWith(expect.stringContaining('浅草寺'), '东京')
  })
})

describe('MissionBrief 使用我的当前位置（手动定位）', () => {
  type GeoSuccess = (pos: { coords: { latitude: number; longitude: number } }) => void
  type GeoError = (err: { code: number; message: string }) => void

  function installGeolocation() {
    const handlers = { success: null as GeoSuccess | null, error: null as GeoError | null }
    const getCurrentPosition = vi.fn((_success: GeoSuccess, _error: GeoError) => {
      handlers.success = _success
      handlers.error = _error
    })
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    })
    return { handlers, getCurrentPosition }
  }

  const openDetails = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /详细条件（可选）/ }))
  }

  it('saves a structured browser origin on success and shows the success state', async () => {
    const user = userEvent.setup()
    const { handlers } = installGeolocation()
    const onChange = vi.fn()
    render(
      <MissionBrief form={tripForm} onChange={onChange} onSubmit={() => undefined} onUseSuggestion={() => undefined} disabled={false} />,
    )
    await openDetails(user)

    await user.click(screen.getByRole('button', { name: '使用我的当前位置' }))
    expect(screen.getByText('定位中…')).toBeInTheDocument()

    await act(async () => { handlers.success?.({ coords: { latitude: 31.2304, longitude: 121.4737 } }) })
    expect(onChange).toHaveBeenCalledWith({
      origin: { label: '31.230, 121.474', latitude: 31.2304, longitude: 121.4737, source: 'browser' },
    })
    expect(screen.getByText(/已定位当前位置（31.230, 121.474）/)).toBeInTheDocument()
  })

  it('shows a clear denied message without touching the form', async () => {
    const user = userEvent.setup()
    const { handlers } = installGeolocation()
    const onChange = vi.fn()
    render(
      <MissionBrief form={tripForm} onChange={onChange} onSubmit={() => undefined} onUseSuggestion={() => undefined} disabled={false} />,
    )
    await openDetails(user)

    await user.click(screen.getByRole('button', { name: '使用我的当前位置' }))
    await act(async () => { handlers.error?.({ code: 1, message: 'User denied Geolocation' }) })

    expect(screen.getByRole('alert')).toHaveTextContent('已拒绝定位授权')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('reports other failures with the error message', async () => {
    const user = userEvent.setup()
    const { handlers } = installGeolocation()
    render(
      <MissionBrief form={tripForm} onChange={() => undefined} onSubmit={() => undefined} onUseSuggestion={() => undefined} disabled={false} />,
    )
    await openDetails(user)

    await user.click(screen.getByRole('button', { name: '使用我的当前位置' }))
    await act(async () => { handlers.error?.({ code: 3, message: 'Timeout expired' }) })

    expect(screen.getByRole('alert')).toHaveTextContent('定位失败')
    expect(screen.getByRole('alert')).toHaveTextContent('Timeout expired')
  })

  it('degrades gracefully when geolocation is unsupported', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
    render(
      <MissionBrief form={tripForm} onChange={() => undefined} onSubmit={() => undefined} onUseSuggestion={() => undefined} disabled={false} />,
    )
    await openDetails(user)

    await user.click(screen.getByRole('button', { name: '使用我的当前位置' }))
    expect(screen.getByText('当前浏览器不支持定位')).toBeInTheDocument()
  })
})

describe('交通与住宿双来源（A 本次行程 / B 编辑部指南）', () => {
  it('falls back to the editorial guide with disclaimer when the reply has no transport section', () => {
    render(
      <ItineraryWorkspace
        viewModel={buildItineraryViewModel('## 住宿\n- 建议住 1-7 区')}
        city="巴黎"
        steps={[]}
        locations={[]}
        onSearchMap={() => undefined}
      />,
    )
    // 编辑部指南接管，不再是大面积空白/只有提示语
    expect(screen.getByText('Atlas 编辑部指南')).toBeInTheDocument()
    expect(screen.getByText('以下为目的地通用建议，不代表实时航班、票价或路线。')).toBeInTheDocument()
    expect(screen.getAllByText(/戴高乐/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Navigo Easy 卡或 Bonjour RATP/)).toBeInTheDocument()
  })

  it('prefers the trip transport content and labels both sources', () => {
    render(
      <ItineraryWorkspace
        viewModel={buildItineraryViewModel('## 交通\n- RER B 进城\n\n## 住宿\n- 河左岸')}
        city="巴黎"
        steps={[]}
        locations={[]}
        onSearchMap={() => undefined}
      />,
    )
    expect(screen.getAllByText('本次行程生成内容').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('RER B 进城')).toBeInTheDocument()
    // 编辑部内容收进补充折叠
    expect(screen.getByText('目的地通用交通建议（编辑部）')).toBeInTheDocument()
  })
})
