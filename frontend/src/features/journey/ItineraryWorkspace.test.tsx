import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ItineraryWorkspace from './ItineraryWorkspace'
import { buildItineraryViewModel } from './viewModel'

const baseProps = {
  city: '东京',
  steps: [],
  locations: [],
  onSearchMap: vi.fn(),
  route: '上海 → 东京',
  date: '2026-09-16',
  people: 2,
}

const structured = `## 预算\n| 类别 | 金额 |\n| --- | --- |\n| 交通 | ¥500 |\n| 住宿 | ¥760 |\n\n## 日程\n### 第 1 天 城市散步\n- 09:00: 浅草寺\n\n### 第 2 天 近郊\n- 10:00: 镰仓`

describe('ItineraryWorkspace reading mode (R1 结构)', () => {
  it('renders a linear reading layout instead of tab groups', () => {
    render(<ItineraryWorkspace {...baseProps} viewModel={buildItineraryViewModel(structured)} />)

    expect(screen.getByRole('heading', { name: /行程方案/ })).toBeInTheDocument()
    expect(screen.getByText(/上海 → 东京/)).toBeInTheDocument()
    expect(screen.getByText(/预算合计/)).toBeInTheDocument()
    // 5 个 Tab 已移除：不应再有 tablist
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('keeps day 1 open and collapses later days until toggled', async () => {
    const user = userEvent.setup()
    render(<ItineraryWorkspace {...baseProps} viewModel={buildItineraryViewModel(structured)} />)

    const timeline = screen.getByRole('list', { name: '逐日行程时间轴' })
    expect(timeline.textContent).toContain('浅草寺')
    expect(timeline.textContent).not.toContain('镰仓')

    const day2 = screen.getByRole('button', { name: /第 2 天/ })
    await user.click(day2)
    expect(screen.getByText('镰仓')).toBeInTheDocument()

    await user.click(day2)
    expect(day2).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('镰仓')).not.toBeInTheDocument()
  })

  it('supports keyboard toggling of day folds with aria wiring', async () => {
    const user = userEvent.setup()
    render(<ItineraryWorkspace {...baseProps} viewModel={buildItineraryViewModel(structured)} />)

    const day2 = screen.getByRole('button', { name: /第 2 天/ })
    expect(day2).toHaveAttribute('aria-expanded', 'false')
    const panelId = day2.getAttribute('aria-controls')
    expect(panelId).toBeTruthy()

    day2.focus()
    await user.keyboard('{Enter}')
    expect(day2).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(panelId ?? '')).not.toBeNull()

    await user.keyboard(' ')
    expect(day2).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById(panelId ?? '')).toBeNull()
  })

  it('keeps budget, execution and full document behind closed folds by default', async () => {
    const user = userEvent.setup()
    const steps = [{
      name: '推荐航班', worker: 'flight', status: 'done' as const, summary: 'MU539 往返',
      locations: [], iterations: 1, toolCalls: 2,
    }]
    render(
      <ItineraryWorkspace
        {...baseProps}
        steps={steps}
        viewModel={buildItineraryViewModel(structured)}
      />,
    )

    const budget = screen.getByRole('button', { name: /预算明细/ })
    const execution = screen.getByRole('button', { name: /执行明细/ })
    const documentFold = screen.getByRole('button', { name: /完整方案/ })
    for (const fold of [budget, execution, documentFold]) {
      expect(fold).toHaveAttribute('aria-expanded', 'false')
    }

    await user.click(budget)
    expect(screen.getByText('交通')).toBeVisible()
    expect(screen.getByText('¥500')).toBeVisible()

    await user.click(execution)
    expect(screen.getByText('推荐航班')).toBeInTheDocument()
    // 工具/轮次等指标保持为次级小字信息
    expect(screen.getByText(/1 轮分析/)).toBeInTheDocument()

    await user.click(documentFold)
    const panelId = documentFold.getAttribute('aria-controls')
    expect(window.document.getElementById(panelId ?? '')?.textContent).toContain('交通')
  })

  it('shows honest empty states for folds without data', async () => {
    const user = userEvent.setup()
    render(<ItineraryWorkspace {...baseProps} viewModel={buildItineraryViewModel('# 纯文档方案')} />)

    // 无预算数据：不出现预算折叠入口
    expect(screen.queryByRole('button', { name: /预算明细/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /执行明细/ }))
    expect(screen.getByText(/没有记录执行明细/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /完整方案/ }))
    expect(screen.getByText('纯文档方案')).toBeInTheDocument()
  })

  it('shows a recoverable message when clipboard copy fails', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    render(<ItineraryWorkspace {...baseProps} viewModel={buildItineraryViewModel('# 东京方案')} />)

    // 导出动作收进菜单：先打开菜单再复制
    await user.click(screen.getByRole('button', { name: /导出/ }))
    await user.click(screen.getByRole('menuitem', { name: '复制方案' }))

    expect(screen.getByRole('alert')).toHaveTextContent('复制失败')
  })

  it('forwards markdown and pdf exports from the export menu', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    render(
      <ItineraryWorkspace
        {...baseProps}
        onExport={onExport}
        viewModel={buildItineraryViewModel(structured)}
      />,
    )

    // 菜单收起时不显示具体导出动作
    expect(screen.queryByRole('menuitem', { name: '导出 Markdown' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /导出/ }))
    await user.click(screen.getByRole('menuitem', { name: '导出 Markdown' }))
    await user.click(screen.getByRole('button', { name: /导出/ }))
    await user.click(screen.getByRole('menuitem', { name: '导出 PDF' }))
    expect(onExport).toHaveBeenCalledWith('md')
    expect(onExport).toHaveBeenCalledWith('pdf')
  })

  it('closes the export menu with Escape and reports aria state', async () => {
    const user = userEvent.setup()
    render(<ItineraryWorkspace {...baseProps} onExport={() => undefined} viewModel={buildItineraryViewModel(structured)} />)

    const trigger = screen.getByRole('button', { name: /导出/ })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger.getAttribute('aria-controls')).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '导出 PDF' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menuitem', { name: '导出 PDF' })).not.toBeInTheDocument()
  })

  it('renders a narrative fallback when no structured days exist', () => {
    render(<ItineraryWorkspace {...baseProps} viewModel={buildItineraryViewModel('# 纯文档方案')} />)

    expect(screen.getByText(/自由叙述/)).toBeInTheDocument()
    // 全文收在折叠里（R2），此处不再直接可见
    expect(screen.queryByText('纯文档方案')).not.toBeInTheDocument()
  })

  it('surfaces a single primary action to open the full trip with cloud save state', async () => {
    const user = userEvent.setup()
    const onOpenTrip = vi.fn()
    render(
      <ItineraryWorkspace
        {...baseProps}
        onOpenTrip={onOpenTrip}
        saveState="cloud"
        viewModel={buildItineraryViewModel(structured)}
      />,
    )

    expect(screen.getByText('已保存到云端')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /查看完整行程/ }))
    expect(onOpenTrip).toHaveBeenCalledOnce()
  })

  it('shows draft save state and a login prompt for guests', async () => {
    const user = userEvent.setup()
    const onLogin = vi.fn()
    render(
      <ItineraryWorkspace
        {...baseProps}
        saveState="local"
        onLogin={onLogin}
        viewModel={buildItineraryViewModel(structured)}
      />,
    )

    await user.click(screen.getByRole('button', { name: /已存为本地草稿/ }))
    expect(onLogin).toHaveBeenCalledOnce()
  })

  it('offers a map entry action for the reading state', async () => {
    const user = userEvent.setup()
    const onOpenMap = vi.fn()
    render(
      <ItineraryWorkspace
        {...baseProps}
        onOpenMap={onOpenMap}
        viewModel={buildItineraryViewModel(structured)}
      />,
    )

    await user.click(screen.getByRole('button', { name: /查看地图/ }))
    expect(onOpenMap).toHaveBeenCalledOnce()
  })
})
