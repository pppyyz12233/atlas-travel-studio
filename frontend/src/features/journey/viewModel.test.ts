import { describe, expect, it } from 'vitest'
import { buildItineraryViewModel } from './viewModel'

describe('itinerary markdown view model', () => {
  it('parses Chinese budget tables and daily schedules', () => {
    const view = buildItineraryViewModel(`## 预算
| 类别 | 金额 |
| --- | --- |
| 航班 | ¥2,400 |
| 酒店 | ¥1,800 |
| **总计** | ¥4,200 |

## 日程
### 第 1 天 抵达东京
| 时间 | 安排 |
| --- | --- |
| 15:00 | 入住银座酒店 |`)

    expect(view.budgetTotal).toBe(4200)
    expect(view.budgetItems).toEqual([
      { category: '航班', amount: 2400 },
      { category: '酒店', amount: 1800 },
    ])
    expect(view.days[0].items[0]).toEqual({ time: '15:00', description: '入住银座酒店' })
    expect(view.hasStructuredOverview).toBe(true)
  })

  it('parses English day headings and colon schedule lines', () => {
    const view = buildItineraryViewModel(`## Daily itinerary
### Day 2 — Old town route
- Morning: Walk from the hotel to the riverside market
- 14:00: Visit the design museum`)

    expect(view.days).toHaveLength(1)
    expect(view.days[0].day).toBe('Day 2')
    expect(view.days[0].items).toEqual([
      { time: 'Morning', description: 'Walk from the hotel to the riverside market' },
      { time: '14:00', description: 'Visit the design museum' },
    ])
  })

  it('falls back to the document view for unstructured markdown', () => {
    const view = buildItineraryViewModel('这是一段没有结构标题的旅行建议')

    expect(view.hasStructuredOverview).toBe(false)
    expect(view.budgetItems).toEqual([])
    expect(view.days).toEqual([])
    expect(view.markdown).toContain('旅行建议')
  })

  it('does not treat markdown table separators as itinerary items', () => {
    const view = buildItineraryViewModel(`## 日程
### 第一天 城市散步
| 时间 | 安排 |
| --- | --- |
| 09:00 | 外滩散步 |`)

    expect(view.days[0].items).toEqual([{ time: '09:00', description: '外滩散步' }])
  })

  it('passes through backend structured trip state without inventing fields', () => {
    const tripState = {
      itinerary: [{ day: 1, title: '真实结构化日程' }],
      locations: [],
    }

    const view = buildItineraryViewModel('# 方案', tripState)

    expect(view.tripState).toBe(tripState)
    expect(view.tripState?.hotels).toBeUndefined()
  })
})
