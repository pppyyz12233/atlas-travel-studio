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

  it('shows every day as a linear timeline section', () => {
    render(<ItineraryWorkspace {...baseProps} viewModel={buildItineraryViewModel(structured)} />)

    const timeline = screen.getByRole('list', { name: '逐日行程时间轴' })
    expect(timeline.textContent).toContain('浅草寺')
    expect(timeline.textContent).toContain('镰仓')
  })

  it('shows a recoverable message when clipboard copy fails', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    render(<ItineraryWorkspace {...baseProps} viewModel={buildItineraryViewModel('# 东京方案')} />)

    await user.click(screen.getByRole('button', { name: '复制方案' }))

    expect(screen.getByRole('alert')).toHaveTextContent('复制失败')
  })

  it('forwards markdown and pdf exports', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    render(
      <ItineraryWorkspace
        {...baseProps}
        onExport={onExport}
        viewModel={buildItineraryViewModel(structured)}
      />,
    )

    await user.click(screen.getByRole('button', { name: '导出 Markdown' }))
    await user.click(screen.getByRole('button', { name: '导出 PDF' }))
    expect(onExport).toHaveBeenCalledWith('md')
    expect(onExport).toHaveBeenCalledWith('pdf')
  })

  it('renders the full document as a plain section for narrative plans', () => {
    render(<ItineraryWorkspace {...baseProps} viewModel={buildItineraryViewModel('# 纯文档方案')} />)

    expect(screen.getByText(/自由叙述/)).toBeInTheDocument()
    expect(screen.getByText('纯文档方案')).toBeInTheDocument()
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
})
