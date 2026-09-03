import type { Location } from '../../types'
import type { DayPlan } from './viewModel'

// ============================================================
// 地图路线派生层（纯前端，零后端依赖）
// Location 本身不含 day/order：由「地点名 ↔ 逐日行程条目文本」确定性匹配派生。
// 匹配不上的地点进入「未排期」组——不猜日期，只显示 marker，不连线。
// ============================================================

/** 每日路线色板：固定顺序循环，保证同一天颜色跨会话稳定 */
export const DAY_COLOR_PALETTE = [
  '#56633f', '#b04a2f', '#2f4a6b', '#a8742a',
  '#4c7a3f', '#8a4a6e', '#3a6ea5', '#6b5a3c',
] as const

/** 未排期地点的中性色 */
export const UNSCHEDULED_COLOR = '#746d5f'

const TYPE_LABELS: Record<Location['type'], string> = {
  airport: '机场',
  hotel: '酒店',
  attraction: '景点',
  station: '车站',
  other: '地点',
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[char] || char))
}

/** 有效坐标：有限数字且在全球范围内 */
export function isValidCoordinate(lng: unknown, lat: unknown): boolean {
  return typeof lng === 'number' && Number.isFinite(lng)
    && typeof lat === 'number' && Number.isFinite(lat)
    && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90
}

/** 稳定地点键：与 reducer 去重键同源（名称 + 4 位小数坐标），非随机 */
export function locationKey(location: Location): string {
  return `${location.name}:${location.lng.toFixed(4)}:${location.lat.toFixed(4)}`
}

export function dayColor(day: number | null): string {
  return day === null ? UNSCHEDULED_COLOR : DAY_COLOR_PALETTE[day % DAY_COLOR_PALETTE.length]
}

export interface RoutedLocation extends Location {
  key: string
  /** 匹配到的天序号（0 基）；未排期为 null */
  day: number | null
  orderInDay: number | null
  displayIndex: number
}

export interface MapMarkerSpec {
  key: string
  location: RoutedLocation
  number: number
  color: string
}

export interface MapPolylineSpec {
  day: number
  color: string
  path: Array<{ lng: number; lat: number; key: string }>
}

export interface MapRenderPlan {
  markers: MapMarkerSpec[]
  polylines: MapPolylineSpec[]
  legendDays: Array<{ day: number; color: string; count: number }>
  validCount: number
  skippedCount: number
}

const MIN_MATCHABLE_NAME_LENGTH = 2

/**
 * 从地点列表 + 逐日行程派生渲染计划。
 * 匹配规则（确定性）：地点名（≥2 字符，长名优先）为行程条目文本的子串。
 */
export function buildRoutedLocations(
  locations: Location[],
  days: DayPlan[],
): { routed: RoutedLocation[]; plan: MapRenderPlan } {
  // 1. 坐标校验 + 键去重（保序保留首个）
  const seen = new Set<string>()
  const valid: Location[] = []
  let skipped = 0
  for (const location of locations) {
    if (!isValidCoordinate(location.lng, location.lat)) {
      skipped += 1
      continue
    }
    const key = locationKey(location)
    if (seen.has(key)) continue
    seen.add(key)
    valid.push(location)
  }

  // 2. 名称匹配：长名优先的候选池，按（天序，条目序）消费
  const pool = valid
    .map((location, index) => ({ location, index }))
    .sort((a, b) => b.location.name.length - a.location.name.length)
  const assigned = new Map<string, { day: number; orderInDay: number }>()
  for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
    for (let itemIndex = 0; itemIndex < days[dayIndex].items.length; itemIndex += 1) {
      const text = days[dayIndex].items[itemIndex].description
      const hit = pool.find(entry =>
        !assigned.has(locationKey(entry.location))
        && entry.location.name.length >= MIN_MATCHABLE_NAME_LENGTH
        && text.includes(entry.location.name))
      if (hit) assigned.set(locationKey(hit.location), { day: dayIndex, orderInDay: itemIndex })
    }
  }

  // 3. 编号：已排期按（天序，天内序），未排期按稳定数组顺序垫底
  const scheduled = valid
    .map((location, index) => ({ location, index, match: assigned.get(locationKey(location)) }))
    .filter((entry): entry is { location: Location; index: number; match: { day: number; orderInDay: number } } => Boolean(entry.match))
    .sort((a, b) => a.match.day - b.match.day || a.match.orderInDay - b.match.orderInDay)
  const unscheduled = valid
    .map((location, index) => ({ location, index }))
    .filter(entry => !assigned.has(locationKey(entry.location)))
    .sort((a, b) => a.index - b.index)

  const ordered: Array<{ location: Location; match: { day: number; orderInDay: number } | null }> = [
    ...scheduled.map(entry => ({ location: entry.location, match: entry.match })),
    ...unscheduled.map(entry => ({ location: entry.location, match: null })),
  ]
  const routed: RoutedLocation[] = ordered.map((entry, position) => ({
    ...entry.location,
    key: locationKey(entry.location),
    day: entry.match ? entry.match.day : null,
    orderInDay: entry.match ? entry.match.orderInDay : null,
    displayIndex: position + 1,
  }))

  // 4. 折线：仅同一天、按天内序、≥2 个点
  const polylines: MapPolylineSpec[] = []
  for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
    const path = scheduled
      .filter(entry => entry.match.day === dayIndex)
      .sort((a, b) => a.match.orderInDay - b.match.orderInDay)
      .map(entry => ({
        lng: entry.location.lng,
        lat: entry.location.lat,
        key: locationKey(entry.location),
      }))
    if (path.length >= 2) {
      polylines.push({ day: dayIndex, color: dayColor(dayIndex), path })
    }
  }

  // 5. 图例：只列出有地点的天
  const legendDays = polylinesAndDayCounts(days, scheduled, assigned)

  const markers: MapMarkerSpec[] = routed.map((location, position) => ({
    key: location.key,
    location,
    number: position + 1,
    color: dayColor(location.day),
  }))

  return {
    routed,
    plan: {
      markers,
      polylines,
      legendDays,
      validCount: valid.length,
      skippedCount: skipped,
    },
  }
}

function polylinesAndDayCounts(
  days: DayPlan[],
  scheduled: Array<{ location: Location; match: { day: number; orderInDay: number } }>,
  assigned: Map<string, { day: number; orderInDay: number }>,
): Array<{ day: number; color: string; count: number }> {
  void scheduled
  const result: Array<{ day: number; color: string; count: number }> = []
  for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
    const count = [...assigned.values()].filter(match => match.day === dayIndex).length
    if (count > 0) result.push({ day: dayIndex + 1, color: dayColor(dayIndex), count })
  }
  return result
}

/** marker 信息窗 HTML：所有文本经 escapeHtml，禁止注入 */
export function buildMarkerInfo(location: RoutedLocation): string {
  const dayLabel = location.day !== null ? `第 ${location.day + 1} 天` : '未排期'
  const orderLabel = location.day !== null && location.orderInDay !== null
    ? `当天第 ${location.orderInDay + 1} 站`
    : '未参与逐日路线'
  const tagColor = dayColor(location.day)
  const plain = location.day === null ? ' iw-tag-plain' : ''
  return `<div class="amap-info-content">`
    + `<span class="iw-tag${plain}"${location.day === null ? '' : ` style="background:${tagColor}"`}>${escapeHtml(dayLabel)}</span>`
    + `<h4>${escapeHtml(location.name)}</h4>`
    + `<p>${escapeHtml(location.address || '暂无地址')}</p>`
    + `<p class="iw-meta">${escapeHtml(orderLabel)} · ${escapeHtml(TYPE_LABELS[location.type] ?? '地点')}</p>`
    + `</div>`
}

/** 时间轴条目文本 → 已派生地点键（无匹配返回 null，交给 POI 搜索兜底） */
export function findLocationKeyByText(routed: RoutedLocation[], text: string): string | null {
  const candidates = routed
    .filter(location => location.name.length >= MIN_MATCHABLE_NAME_LENGTH && text.includes(location.name))
    .sort((a, b) => b.name.length - a.name.length)
  return candidates[0]?.key ?? null
}
