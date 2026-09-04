import { describe, expect, it } from 'vitest'
import {
  DAY_COLOR_PALETTE,
  buildMarkerInfo,
  buildRoutedLocations,
  findLocationKeyByText,
  isValidCoordinate,
  locationKey,
} from './mapRouting'
import type { Location } from '../../types'
import type { DayPlan } from './viewModel'

const loc = (name: string, lng: number, lat: number, type: Location['type'] = 'attraction', address = ''): Location =>
  ({ name, lng, lat, address, type })

const day = (title: string, items: string[]): DayPlan => ({
  day: title,
  title,
  items: items.map((description, index) => ({ time: '', description: `${index + 1}. ${description}` })),
})

const days: DayPlan[] = [
  { day: 'Day 1', title: 'Day 1 抵达东京', items: [
    { time: '15:00', description: '15:00：抵达羽田机场，取交通卡' },
    { time: '17:00', description: '17:00：入住新宿酒店' },
  ] },
  { day: 'Day 2', title: 'Day 2 传统东京', items: [
    { time: '09:00', description: '09:00：浅草寺与仲见世街' },
    { time: '13:00', description: '13:00：明治神宫' },
  ] },
]

describe('map routing coordinates and keys', () => {
  it('validates coordinates as finite numbers within global bounds', () => {
    expect(isValidCoordinate(139.79, 35.71)).toBe(true)
    expect(isValidCoordinate(0, 0)).toBe(true)
    expect(isValidCoordinate(NaN, 35)).toBe(false)
    expect(isValidCoordinate(139, Infinity)).toBe(false)
    expect(isValidCoordinate(200, 35)).toBe(false)
    expect(isValidCoordinate(139, -95)).toBe(false)
  })

  it('derives a stable deterministic key from name and rounded coordinates', () => {
    const a = loc('浅草寺', 139.791234, 35.712345)
    const b = loc('浅草寺', 139.791211, 35.712339) // 第 4 位小数内视为同点
    const c = loc('浅草寺', 139.80, 35.71)
    expect(locationKey(a)).toBe(locationKey(b))
    expect(locationKey(a)).not.toBe(locationKey(c))
    expect(locationKey(a)).toBe('浅草寺:139.7912:35.7123')
  })
})

describe('map routing grouping', () => {
  it('assigns locations to days by deterministic name matching in itinerary order', () => {
    const locations = [loc('浅草寺', 139.79, 35.71), loc('羽田机场', 139.78, 35.55, 'airport'), loc('明治神宫', 139.70, 35.68), loc('新宿酒店', 139.70, 35.69, 'hotel')]
    const { routed, plan } = buildRoutedLocations(locations, days)

    const byName = Object.fromEntries(routed.map(item => [item.name, item]))
    expect(byName['羽田机场'].day).toBe(0)
    expect(byName['羽田机场'].orderInDay).toBe(0)
    expect(byName['新宿酒店'].day).toBe(0)
    expect(byName['新宿酒店'].orderInDay).toBe(1)
    expect(byName['浅草寺'].day).toBe(1)
    expect(byName['浅草寺'].orderInDay).toBe(0)
    expect(byName['明治神宫'].day).toBe(1)
    expect(byName['明治神宫'].orderInDay).toBe(1)

    // 编号 = 行程顺序（天序、天内序）
    expect(plan.markers.map(m => m.location.name)).toEqual(['羽田机场', '新宿酒店', '浅草寺', '明治神宫'])
    expect(plan.markers.map(m => m.number)).toEqual([1, 2, 3, 4])
  })

  it('never connects locations across days and only draws per-day polylines', () => {
    const locations = [loc('羽田机场', 139.78, 35.55, 'airport'), loc('新宿酒店', 139.70, 35.69, 'hotel'), loc('浅草寺', 139.79, 35.71), loc('明治神宫', 139.70, 35.68)]
    const { plan } = buildRoutedLocations(locations, days)

    expect(plan.polylines).toHaveLength(2)
    const day1 = plan.polylines.find(p => p.day === 0)
    const day2 = plan.polylines.find(p => p.day === 1)
    expect(day1?.path.map(p => p.key)).toEqual([locationKey(locations[0]), locationKey(locations[1])])
    expect(day2?.path.map(p => p.key)).toEqual([locationKey(locations[2]), locationKey(locations[3])])
  })

  it('skips polylines with fewer than two valid points', () => {
    const locations = [loc('羽田机场', 139.78, 35.55, 'airport'), loc('浅草寺', 139.79, 35.71), loc('明治神宫', 139.70, 35.68)]
    const { plan } = buildRoutedLocations(locations, days)
    // Day 1 只匹配到 1 个点（机场）→ 不画线；Day 2 两点 → 画线
    expect(plan.polylines.map(p => p.day)).toEqual([1])
  })

  it('drops invalid coordinates without breaking the whole map and reports counts', () => {
    const locations = [
      loc('浅草寺', 139.79, 35.71),
      loc('幽灵地点', NaN, 35.2),
      loc('另一个坏点', 139.1, Infinity),
      loc('明治神宫', 139.70, 35.68),
    ]
    const { plan } = buildRoutedLocations(locations, days)

    expect(plan.validCount).toBe(2)
    expect(plan.skippedCount).toBe(2)
    expect(plan.markers).toHaveLength(2)
    expect(plan.markers.every(m => isValidCoordinate(m.location.lng, m.location.lat))).toBe(true)
  })

  it('keeps unmatched locations visible as unscheduled without guessing a day', () => {
    const locations = [loc('镰仓大佛', 139.54, 35.31), loc('浅草寺', 139.79, 35.71), loc('明治神宫', 139.70, 35.68)]
    const { routed, plan } = buildRoutedLocations(locations, days)

    const kamakura = routed.find(item => item.name === '镰仓大佛')
    expect(kamakura?.day).toBeNull()
    expect(kamakura?.orderInDay).toBeNull()
    // 未排期地点不进入任何折线
    expect(plan.polylines.every(p => !p.path.some(point => point.key === kamakura?.key))).toBe(true)
    // 未排期按稳定数组顺序排在已排期之后
    const numbers = Object.fromEntries(plan.markers.map(m => [m.location.name, m.number]))
    expect(numbers['浅草寺']).toBeLessThan(numbers['镰仓大佛'])
  })

  it('produces stable day colors from the fixed palette', () => {
    const locations = [loc('浅草寺', 139.79, 35.71), loc('明治神宫', 139.70, 35.68)]
    const { plan } = buildRoutedLocations(locations, days)
    expect(plan.polylines[0].color).toBe(DAY_COLOR_PALETTE[1])
    expect(plan.legendDays).toEqual([{ day: 2, color: DAY_COLOR_PALETTE[1], count: 2 }])
  })

  it('deduplicates locations sharing the same key', () => {
    const a = loc('浅草寺', 139.7912, 35.7123)
    const b = loc('浅草寺', 139.79119, 35.71231)
    const { routed } = buildRoutedLocations([a, b], days)
    expect(routed).toHaveLength(1)
  })

  it('is deterministic across repeated calls', () => {
    const locations = [loc('浅草寺', 139.79, 35.71), loc('明治神宫', 139.70, 35.68)]
    const first = buildRoutedLocations(locations, days)
    const second = buildRoutedLocations(locations, days)
    expect(first).toEqual(second)
  })

  it('shows an honest empty plan when no valid coordinates exist', () => {
    const { plan } = buildRoutedLocations([loc('坏', NaN, NaN)], days)
    expect(plan.validCount).toBe(0)
    expect(plan.markers).toHaveLength(0)
    expect(plan.polylines).toHaveLength(0)
    expect(plan.legendDays).toHaveLength(0)
  })
})

describe('map marker info content', () => {
  it('escapes unsafe text in marker info HTML', () => {
    const routed = {
      ...loc('<img src=x onerror=alert(1)>浅草寺', 139.79, 35.71),
      key: 'k', day: 1, orderInDay: 0, displayIndex: 3,
    }
    const html = buildMarkerInfo(routed)
    // 危险标签必须被转义为纯文本（onerror 字样作为文本存在不可执行）
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<script')
  })

  it('includes day, in-day order and type label', () => {
    const routed = { ...loc('浅草寺', 139.79, 35.71, 'attraction', '台东区'), key: 'k', day: 1, orderInDay: 0, displayIndex: 3 }
    const html = buildMarkerInfo(routed)
    expect(html).toContain('第 2 天')
    expect(html).toContain('当天第 1 站')
    expect(html).toContain('景点')
    expect(html).toContain('浅草寺')
    expect(html).toContain('台东区')
  })

  it('labels unscheduled locations without inventing a day', () => {
    const routed = { ...loc('镰仓大佛', 139.54, 35.31), key: 'k', day: null, orderInDay: null, displayIndex: 9 }
    expect(buildMarkerInfo(routed)).toContain('未排期')
  })
})

describe('timeline focus resolution', () => {
  it('resolves a timeline item text to a routed location key when matched', () => {
    const locations = [loc('浅草寺', 139.79, 35.71), loc('明治神宫', 139.70, 35.68)]
    const { routed } = buildRoutedLocations(locations, days)
    expect(findLocationKeyByText(routed, '09:00：浅草寺与仲见世街')).toBe(locationKey(locations[0]))
    expect(findLocationKeyByText(routed, '晚上自由活动')).toBeNull()
  })
})

describe('map routing with a day-filtered subset (detail page)', () => {
  // 详情页按天切换地图：locations 是按天过滤后的子集，days 必须仍传完整列表。
  // 若误传过滤后的 days，重新派生会把"第2天"压缩成 day=0（标签 D1·x、颜色错位）。
  it('keeps true day numbers when re-deriving with a location subset over full days', () => {
    const locations = [
      loc('羽田机场', 139.78, 35.55, 'airport'),
      loc('新宿酒店', 139.70, 35.69, 'hotel'),
      loc('浅草寺', 139.79, 35.71),
      loc('明治神宫', 139.70, 35.68),
    ]
    const full = buildRoutedLocations(locations, days)
    const day2Subset = full.routed.filter(item => item.day === 1)

    const reDerived = buildRoutedLocations(day2Subset, days)
    expect(reDerived.routed.map(item => item.name)).toEqual(['浅草寺', '明治神宫'])
    expect(reDerived.routed.map(item => item.day)).toEqual([1, 1])
    expect(reDerived.routed.map(item => item.orderInDay)).toEqual([0, 1])
    expect(reDerived.plan.polylines.map(p => p.day)).toEqual([1])
    expect(reDerived.plan.polylines[0].color).toBe(DAY_COLOR_PALETTE[1])
  })
})
