import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import MapOverlays from './MapOverlays'
import { buildRoutedLocations } from '../features/journey/mapRouting'
import type { Location } from '../types'
import type { DayPlan } from '../features/journey/viewModel'

const loc = (name: string, lng: number, lat: number): Location => ({ name, lng, lat, address: '', type: 'attraction' })
const days: DayPlan[] = [
  { day: 'Day 1', title: 'Day 1', items: [{ time: '', description: '参观浅草寺' }, { time: '', description: '去明治神宫' }] },
  { day: 'Day 2', title: 'Day 2', items: [{ time: '', description: '逛东京迪士尼' }] },
]

function planOf(locations: Location[]) {
  return buildRoutedLocations(locations, days).plan
}

describe('map overlays', () => {
  it('shows the empty state when no valid coordinates exist', () => {
    render(<MapOverlays plan={planOf([loc('坏点', NaN, NaN)])} />)
    expect(screen.getByText('当前行程暂无可定位地点')).toBeInTheDocument()
    expect(screen.getByText(/另有 1 个地点缺少有效坐标/)).toBeInTheDocument()
  })

  it('renders nothing without a plan', () => {
    const { container } = render(<MapOverlays plan={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists day legend chips with stable colors and counts', () => {
    render(<MapOverlays plan={planOf([loc('浅草寺', 139.79, 35.71), loc('明治神宫', 139.70, 35.68), loc('东京迪士尼', 139.88, 35.63)])} />)
    expect(screen.getByText('第 1 天 · 2 处')).toBeInTheDocument()
    expect(screen.getByText('第 2 天 · 1 处')).toBeInTheDocument()
    expect(screen.getByText('marker 数字 = 当天到访顺序')).toBeInTheDocument()
  })

  it('reports partially invalid coordinates honestly', () => {
    render(<MapOverlays plan={planOf([loc('浅草寺', 139.79, 35.71), loc('幽灵', NaN, 35)])} />)
    expect(screen.getByText('已显示 1 个地点，另有 1 个地点缺少有效坐标')).toBeInTheDocument()
  })

  it('keeps the legend collapsed behind a summary on narrow screens', async () => {
    const user = userEvent.setup()
    render(<MapOverlays plan={planOf([loc('浅草寺', 139.79, 35.71)])} />)
    const legend = screen.getByRole('group') as HTMLDetailsElement
    expect(legend.open).toBe(true)
    await user.click(screen.getByText('图例'))
    expect(legend.open).toBe(false)
  })

  it('labels unscheduled locations in the legend', () => {
    render(<MapOverlays plan={planOf([loc('镰仓大佛', 139.54, 35.31), loc('浅草寺', 139.79, 35.71)])} />)
    expect(screen.getByText('未排期 · 1 处')).toBeInTheDocument()
  })
})
