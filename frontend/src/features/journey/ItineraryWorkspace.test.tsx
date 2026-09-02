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
}

describe('ItineraryWorkspace state and accessibility', () => {
  it('moves to an available tab when refreshed data disables the current tab', async () => {
    const user = userEvent.setup()
    const structured = buildItineraryViewModel(`## 预算\n| 类别 | 金额 |\n| --- | --- |\n| 交通 | ¥500 |\n\n## 日程\n### 第 1 天 城市散步\n- 09:00: 浅草寺`)
    const { rerender } = render(<ItineraryWorkspace {...baseProps} viewModel={structured} />)
    await user.click(screen.getByRole('tab', { name: '预算' }))
    expect(screen.getByRole('tab', { name: '预算' })).toHaveAttribute('aria-selected', 'true')

    rerender(<ItineraryWorkspace {...baseProps} viewModel={buildItineraryViewModel('# 纯文档方案')} />)

    expect(screen.getByRole('tab', { name: '完整方案' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('纯文档方案')).toBeInTheDocument()
  })

  it('renders only statistics backed by available result data', () => {
    render(<ItineraryWorkspace {...baseProps} viewModel={buildItineraryViewModel(`## 日程\n### 第 1 天 城市散步\n- 09:00: 浅草寺`)} />)

    expect(screen.getByText('日程密度')).toBeInTheDocument()
    expect(screen.queryByText('预算合计')).not.toBeInTheDocument()
    expect(screen.queryByText(/0 个地图地点/)).not.toBeInTheDocument()
  })

  it('supports Arrow, Home and End navigation with roving tab focus', async () => {
    const user = userEvent.setup()
    render(<ItineraryWorkspace {...baseProps} viewModel={buildItineraryViewModel(`## 预算\n| 类别 | 金额 |\n| --- | --- |\n| 交通 | ¥500 |\n\n## 日程\n### 第 1 天 城市散步\n- 09:00: 浅草寺`)} />)
    const overview = screen.getByRole('tab', { name: '概览' })
    overview.focus()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: '逐日行程' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: '完整方案' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(overview).toHaveFocus()
    expect(overview).toHaveAttribute('tabindex', '0')
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

  it('opens the complete document view before starting PDF export', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    render(
      <ItineraryWorkspace
        {...baseProps}
        onExport={onExport}
        viewModel={buildItineraryViewModel(`## 预算\n| 类别 | 金额 |\n| --- | --- |\n| 交通 | ¥500 |\n\n# 完整方案`)}
      />,
    )

    await user.click(screen.getByRole('button', { name: '导出 PDF' }))

    expect(screen.getByRole('tab', { name: '完整方案' })).toHaveAttribute('aria-selected', 'true')
    expect(onExport).toHaveBeenCalledWith('pdf')
  })

  it('surfaces a single primary action to open the full trip with cloud save state', async () => {
    const user = userEvent.setup()
    const onOpenTrip = vi.fn()
    render(
      <ItineraryWorkspace
        {...baseProps}
        onOpenTrip={onOpenTrip}
        saveState="cloud"
        viewModel={buildItineraryViewModel('# 东京方案\n内容')}
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
        viewModel={buildItineraryViewModel('# 东京方案\n内容')}
      />,
    )

    await user.click(screen.getByRole('button', { name: /已存为本地草稿/ }))
    expect(onLogin).toHaveBeenCalledOnce()
  })
})
