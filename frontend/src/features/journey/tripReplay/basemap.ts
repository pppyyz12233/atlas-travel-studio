import type { MapRenderPlan } from '../mapRouting'
import { mercatorProject, mercatorUnproject, clamp } from './mercator'

// ============================================================
// 底图画布规格（纯逻辑）：由渲染计划推「一张静态图覆盖全程」的
// center/zoom/尺寸，以及任意经纬度 → 画布像素的投影。
//
// 底图来自后端代理 /api/map/static → 高德静态地图 v3
// （https://restapi.amap.com/v3/staticmap?location&zoom&size&scale）。
// 高德文档对 scale=2 的地理覆盖语义含糊（“像素与 zoom 都翻倍”），
// 实际覆盖差一倍只影响一个常数 —— 隔离在 SCALE2_WORLD_SPAN，
// 一次性对齐校准后钉死（见 basemap.test.ts 的钉死断言）。
// ============================================================

/**
 * scale=2 语义校准常量：画布 1 逻辑像素对应的世界像素数。
 * 1 = 请求尺寸即覆盖尺寸（Google 式 scale 语义）；2 = 覆盖翻倍。
 * 校准记录：2026-09-12 首版按 1 实现，待真实底图对齐校准后定值。
 */
export const SCALE2_WORLD_SPAN = 1

/** 合成画布固定 960×600（16:10），Player 负责缩放适配容器 */
export const REPLAY_CANVAS_WIDTH = 960
export const REPLAY_CANVAS_HEIGHT = 600

const BASEMAP_MARGIN_PX = 72
const MIN_ZOOM = 3
const MAX_ZOOM = 17
const SINGLE_POINT_ZOOM = 13

export interface MapCanvasSpec {
  centerLng: number
  centerLat: number
  /** 整数缩放级 3..17 */
  zoom: number
  /** 请求给静态地图的尺寸（逻辑像素，与画布一致） */
  requestWidth: number
  requestHeight: number
  proxyUrl: string
}

/** 任意经纬度 → 画布像素坐标（与底图对齐的唯一入口） */
export function projectToCanvas(spec: MapCanvasSpec, lng: number, lat: number): { x: number; y: number } {
  const center = mercatorProject(spec.centerLng, spec.centerLat, spec.zoom)
  const point = mercatorProject(lng, lat, spec.zoom)
  return {
    x: (point.x - center.x) / SCALE2_WORLD_SPAN + spec.requestWidth / 2,
    y: (point.y - center.y) / SCALE2_WORLD_SPAN + spec.requestHeight / 2,
  }
}

/** L2 高清拼接：单块瓦片在拼接位图（1920×1200）内的位置与请求 URL */
export interface StitchTile {
  x: number
  y: number
  url: string
}

/**
 * L2 同覆盖翻密度拼接：zoom+1 下同一地理范围 = 1920×1200 世界像素，
 * 拆 4 张 960×600 请求（每张 scale=2 返回 1920×1200 物理像素），
 * 离屏 canvas 拼合后按 960×600 显示 = 2× 密度，跟拍 zoom≤2.2 仍锐。
 * zoom 已达 17（静态图上限）时返回空数组（无升级空间）。
 */
export function buildStitchTiles(spec: MapCanvasSpec): StitchTile[] {
  if (spec.zoom >= MAX_ZOOM) return []
  const hiZoom = spec.zoom + 1
  const center = mercatorProject(spec.centerLng, spec.centerLat, hiZoom)
  const tiles: StitchTile[] = []
  for (const ox of [-REPLAY_CANVAS_WIDTH / 2, REPLAY_CANVAS_WIDTH / 2]) {
    for (const oy of [-REPLAY_CANVAS_HEIGHT / 2, REPLAY_CANVAS_HEIGHT / 2]) {
      const tileCenter = mercatorUnproject(center.x + ox, center.y + oy, hiZoom)
      const params = new URLSearchParams({
        lng: tileCenter.lng.toFixed(6),
        lat: tileCenter.lat.toFixed(6),
        zoom: String(hiZoom),
        w: String(REPLAY_CANVAS_WIDTH),
        h: String(REPLAY_CANVAS_HEIGHT),
        scale: '2',
      })
      tiles.push({ x: ox < 0 ? 0 : REPLAY_CANVAS_WIDTH, y: oy < 0 ? 0 : REPLAY_CANVAS_HEIGHT, url: `/api/map/static?${params.toString()}` })
    }
  }
  return tiles
}

/**
 * 从渲染计划推底图规格：覆盖全部有效 marker 的外接框 + 边距，
 * 从 z=17 降到 z=3 取第一个放得下的级别；单点固定 z=13。
 * 无有效坐标返回 null（调用方渲染空态）。
 */
export function buildMapCanvasSpec(plan: MapRenderPlan): MapCanvasSpec | null {
  if (plan.validCount === 0 || plan.markers.length === 0) return null

  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const marker of plan.markers) {
    const { lng, lat } = marker.location
    minLng = Math.min(minLng, lng)
    maxLng = Math.max(maxLng, lng)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }

  const singlePoint = minLng === maxLng && minLat === maxLat
  let zoom = singlePoint ? SINGLE_POINT_ZOOM : MIN_ZOOM
  if (!singlePoint) {
    for (let z = MAX_ZOOM; z >= MIN_ZOOM; z -= 1) {
      const a = mercatorProject(minLng, minLat, z)
      const b = mercatorProject(maxLng, maxLat, z)
      const w = Math.abs(b.x - a.x) * SCALE2_WORLD_SPAN + 2 * BASEMAP_MARGIN_PX
      const h = Math.abs(b.y - a.y) * SCALE2_WORLD_SPAN + 2 * BASEMAP_MARGIN_PX
      if (w <= REPLAY_CANVAS_WIDTH && h <= REPLAY_CANVAS_HEIGHT) {
        zoom = z
        break
      }
    }
  }

  // 中心取 bbox 中点（世界像素中点再反投影，避免经度跨 180° 的口径问题不在此处理——行程数据均在国内）
  const a = mercatorProject(minLng, minLat, zoom)
  const b = mercatorProject(maxLng, maxLat, zoom)
  const center = mercatorUnproject((a.x + b.x) / 2, (a.y + b.y) / 2, zoom)
  const centerLng = Number(center.lng.toFixed(6))
  const centerLat = Number(center.lat.toFixed(6))

  const params = new URLSearchParams({
    lng: centerLng.toFixed(6),
    lat: centerLat.toFixed(6),
    zoom: String(zoom),
    w: String(REPLAY_CANVAS_WIDTH),
    h: String(REPLAY_CANVAS_HEIGHT),
    scale: '2',
  })
  return {
    centerLng,
    centerLat,
    zoom,
    requestWidth: REPLAY_CANVAS_WIDTH,
    requestHeight: REPLAY_CANVAS_HEIGHT,
    proxyUrl: `/api/map/static?${params.toString()}`,
  }
}
