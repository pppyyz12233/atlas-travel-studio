import { describe, expect, it } from 'vitest'
import { buildItineraryViewModel, parseDays } from './viewModel'

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

  it('parses bold-markdown day headers that the backend commonly emits', () => {
    const md = [
      '## 上海4天3晚旅行方案',
      '',
      '### 日程',
      '',
      '**Day1 经典地标日**',
      '| 时段 | 地点 | 交通 | 备注 |',
      '|------|------|------|------|',
      '| 上午 | 豫园 | 地铁10号线 | 9:00开园 |',
      '| 晚上 | 外滩夜景 | 步行 | 免费 |',
      '',
      '- **Day2 文化日**',
      '| 上午 | 上海博物馆 | 地铁1号线 | 需预约 |',
    ].join('\n')

    const days = parseDays(md)
    expect(days.map(day => day.day)).toEqual(['Day 1', 'Day 2'])
    expect(days[0].items).toEqual([
      { time: '上午', description: '豫园' },
      { time: '晚上', description: '外滩夜景' },
    ])
    expect(days[1].items).toEqual([{ time: '上午', description: '上海博物馆' }])
  })

  it('keeps free-form replies without day markers unstructured (no fabricated days)', () => {
    const days = parseDays('## 交通\n- 建议地铁出行\n- 机场进城坐2号线')
    expect(days).toEqual([])
  })
})
