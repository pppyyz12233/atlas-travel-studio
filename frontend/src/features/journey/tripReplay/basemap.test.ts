import { describe, expect, it } from 'vitest'
import type { Location } from '../../../types'
import type { DayPlan } from '../viewModel'
import { buildRoutedLocations } from '../mapRouting'
import { SCALE2_WORLD_SPAN, buildMapCanvasSpec, projectToCanvas } from './basemap'

// 校准记录：2026-09-12 首版按 1 实现（请求尺寸即覆盖尺寸）。
// 待真实底图对齐校准（详见 README/计划）后如需翻转，必须同步改这里与常量注释。
it('SCALE2_WORLD_SPAN 校准常量钉死', () => {
  expect(SCALE2_WORLD_SPAN).toBe(1)
})

function loc(name: string, lng: number, lat: number): Location {
  return { name, lng, lat, address: `${name}地址`, type: 'attraction' }
}

function planOf(locations: Location[], days: DayPlan[]) {
  return buildRoutedLocations(locations, days).plan
}

const GUANGZHOU_DAYS: DayPlan[] = [
  {
    day: '2026-10-01', title: '老城',
    items: [{ time: '09:00', description: '上午逛沙面' }, { time: '14:00', description: '下午登广州塔' }],
  },
  {
    day: '2026-10-02', title: '登高',
    items: [{ time: '09:00', description: '白云山徒步' }],
  },
]

const GUANGZHOU_LOCATIONS = [
  loc('沙面', 113.2400, 23.1070),
  loc('广州塔', 113.3246, 23.1064),
  loc('白云山', 113.2990, 23.1860),
]

describe('buildMapCanvasSpec', () => {
  it('广州三景点 bbox：z=12 刚好放下（含 72px 边距）', () => {
    const spec = buildMapCanvasSpec(planOf(GUANGZHOU_LOCATIONS, GUANGZHOU_DAYS))
    expect(spec).not.toBeNull()
    expect(spec!.zoom).toBe(12)
  })

  it('中心 = bbox 中点（经度线性中点，纬度墨卡托中点），6 位小数进 URL', () => {
    const spec = buildMapCanvasSpec(planOf(GUANGZHOU_LOCATIONS, GUANGZHOU_DAYS))
    expect(spec!.centerLng).toBeCloseTo(113.2823, 4)
    expect(spec!.centerLat).toBeCloseTo(23.1462, 2)
    expect(spec!.proxyUrl).toContain('lng=113.2823')
    expect(spec!.proxyUrl).toContain('zoom=12')
    expect(spec!.proxyUrl).toContain('w=960')
    expect(spec!.proxyUrl).toContain('h=600')
    expect(spec!.proxyUrl).toContain('scale=2')
    expect(spec!.proxyUrl.startsWith('/api/map/static?')).toBe(true)
  })

  it('单点 → z=13', () => {
    const spec = buildMapCanvasSpec(planOf([loc('陈家祠', 113.2458, 23.1252)], []))
    expect(spec!.zoom).toBe(13)
  })

  it('全国跨度（含漠河）→ 放不下 z=4 → 触底 z=3', () => {
    const wide = planOf(
      [loc('喀什', 75.99, 39.47), loc('抚远', 134.30, 48.36), loc('三亚', 109.51, 18.25), loc('漠河', 122.54, 53.48)],
      [],
    )
    expect(buildMapCanvasSpec(wide)!.zoom).toBe(3)
  })

  it('无有效坐标 → null', () => {
    expect(buildMapCanvasSpec(planOf([], GUANGZHOU_DAYS))).toBeNull()
  })
})

describe('projectToCanvas', () => {
  it('中心点 = 画布中心；偏移随缩放级翻倍', () => {
    const spec = buildMapCanvasSpec(planOf(GUANGZHOU_LOCATIONS, GUANGZHOU_DAYS))!
    const center = projectToCanvas(spec, spec.centerLng, spec.centerLat)
    expect(center.x).toBeCloseTo(480, 3)
    expect(center.y).toBeCloseTo(300, 3)

    const east = projectToCanvas(spec, spec.centerLng + 0.01, spec.centerLat)
    expect(east.x - center.x).toBeGreaterThan(8)
  })

  it('全部 marker 落在画布内（含边距）', () => {
    const spec = buildMapCanvasSpec(planOf(GUANGZHOU_LOCATIONS, GUANGZHOU_DAYS))!
    for (const location of GUANGZHOU_LOCATIONS) {
      const point = projectToCanvas(spec, location.lng, location.lat)
      expect(point.x).toBeGreaterThan(72)
      expect(point.x).toBeLessThan(960 - 72)
      expect(point.y).toBeGreaterThan(72)
      expect(point.y).toBeLessThan(600 - 72)
    }
  })
})
