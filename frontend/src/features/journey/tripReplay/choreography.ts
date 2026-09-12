import type { MapMarkerSpec, MapPolylineSpec, MapRenderPlan } from '../mapRouting'
import { clamp } from './mercator'
import type { MapCanvasSpec } from './basemap'
import { REPLAY_CANVAS_WIDTH, REPLAY_CANVAS_HEIGHT, projectToCanvas } from './basemap'
import type { CameraState } from './projection'
import { easeOutCubic, inOutCubic, lerp, smoothstep } from './projection'

// ============================================================
// 路线动画编舞 v2（纯逻辑，零 Remotion 依赖）
// 分镜（30fps，对照设计终稿 3.1）：
//   S0 开场俯冲 [0,66)：hold 18（全图+标题卡）→ dive 42（先微拉后扎）
//   S1 每日跟拍：tilt 55°，焦点=笔尖，锚点 (480,348)
//   S2 日间转场：段首 18 帧 hop（位置 smoothstep + zoom 中段回拉 + tilt 抬升）
//   S3 收尾拉升：hold 15 → pull 45（inOutCubic 回全图）→ rest 18
// 所有几何预计算进 segments，相机由 cameraAt 按帧解析。
// ============================================================

export const REPLAY_FPS = 30
export const INTRO_FRAMES = 66
export const INTRO_HOLD = 18
export const INTRO_DIVE = 42
export const DAY_DWELL = 24
export const DRAW_MIN = 36
export const DRAW_MAX = 150
export const DRAW_PX_PER_FRAME = 0.12
export const SINGLE_STOP_DRAW = 24
export const SEGMENT_TRANSITION = 18
export const OUTRO_FRAMES = 78
export const OUTRO_HOLD = 15
export const OUTRO_EASE = 45
export const STOP_SETTLE = 4
export const MAX_TOTAL_FRAMES = 2700
export const FOLLOW_ZOOM_MIN = 1.15
export const FOLLOW_ZOOM_MAX = 2.2

/** 相机锚点/倾角（与 projection.ts 的 CameraState 配合）——贴地低机位：tilt 陡、锚点偏下 */
export const ANCHOR_WIDE = { ax: REPLAY_CANVAS_WIDTH / 2, ay: REPLAY_CANVAS_HEIGHT / 2 }
export const ANCHOR_FOLLOW = { ax: REPLAY_CANVAS_WIDTH / 2, ay: 360 }
export const TILT_WIDE = 48
export const TILT_FOLLOW = 63

export interface ReplayStop {
  key: string
  name: string
  number: number
  color: string
  day: number | null
  orderInDay: number | null
  /** 沿折线弧长参数 0..1；无折线段为 0 */
  progress: number
  popFrame: number
  x: number
  y: number
}

export interface ReplaySegment {
  /** 0 基天序号；null = 未排期尾段 */
  day: number | null
  startFrame: number
  drawFrames: number
  dwellFrames: number
  endFrame: number
  /** 折线弧长（画布像素）；无折线为 0 */
  pathPx: number
  stops: ReplayStop[]
  polyline: MapPolylineSpec | null
  /** 折线投影点（画布像素）与 0 起前缀弧长；无折线均为空 */
  tipPoints: Array<{ x: number; y: number }>
  cumulativePx: number[]
  followZoom: number
  /** 段尾镜头位置 */
  lastTip: { x: number; y: number }
}

export interface ReplayChoreography {
  fps: number
  totalFrames: number
  introEndFrame: number
  outroStartFrame: number
  segments: ReplaySegment[]
}

export interface PolylineGeometry {
  points: Array<{ x: number; y: number }>
  cumulative: number[]
  totalPx: number
}

/** 折线投影 + 前缀弧长（描画子折线与相机贴笔尖共用的几何源） */
export function polylineGeometry(spec: MapCanvasSpec, polyline: MapPolylineSpec): PolylineGeometry {
  const points = polyline.path.map(point => projectToCanvas(spec, point.lng, point.lat))
  const cumulative = [0]
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    cumulative.push(cumulative[i - 1] + Math.hypot(dx, dy))
  }
  return { points, cumulative, totalPx: cumulative[cumulative.length - 1] ?? 0 }
}

/** 弧长参数 t∈[0,1] 处的折线坐标（画布坐标系） */
export function pointAtProgress(geometry: PolylineGeometry, t: number): { x: number; y: number } {
  const points = geometry.points
  if (points.length === 0) return { x: REPLAY_CANVAS_WIDTH / 2, y: REPLAY_CANVAS_HEIGHT / 2 }
  if (points.length === 1 || geometry.totalPx === 0) return points[0]
  const target = clamp(t, 0, 1) * geometry.totalPx
  for (let i = 1; i < geometry.cumulative.length; i += 1) {
    if (geometry.cumulative[i] >= target) {
      const span = geometry.cumulative[i] - geometry.cumulative[i - 1]
      const u = span > 0 ? (target - geometry.cumulative[i - 1]) / span : 0
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * u,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * u,
      }
    }
  }
  return points[points.length - 1]
}

/** 弧长参数 t 处的「描画子折线」（在 t 处插入插值顶点；HUD 屏幕空间描线用） */
export function partialPolyline(geometry: PolylineGeometry, t: number): Array<{ x: number; y: number }> {
  const points = geometry.points
  if (points.length === 0 || geometry.totalPx === 0) return points.length ? [points[0]] : []
  const target = clamp(t, 0, 1) * geometry.totalPx
  const result: Array<{ x: number; y: number }> = [points[0]]
  for (let i = 1; i < points.length; i += 1) {
    if (geometry.cumulative[i] < target) {
      result.push(points[i])
      continue
    }
    const span = geometry.cumulative[i] - geometry.cumulative[i - 1]
    const u = span > 0 ? (target - geometry.cumulative[i - 1]) / span : 0
    if (u >= 1) {
      result.push(points[i])
    } else if (u > 0) {
      result.push({
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * u,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * u,
      })
    }
    return result
  }
  return points
}

function drawFramesFor(pathPx: number): number {
  if (pathPx <= 0) return SINGLE_STOP_DRAW
  return clamp(Math.round(pathPx * DRAW_PX_PER_FRAME), DRAW_MIN, DRAW_MAX)
}

function followZoomFor(points: Array<{ x: number; y: number }>): number {
  if (points.length === 0) return FOLLOW_ZOOM_MIN
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y)
  }
  const w = Math.max(maxX - minX, 1)
  const h = Math.max(maxY - minY, 1)
  return clamp(
    Math.min(REPLAY_CANVAS_WIDTH / (w + 96), REPLAY_CANVAS_HEIGHT / (h + 96)),
    FOLLOW_ZOOM_MIN,
    FOLLOW_ZOOM_MAX,
  )
}

/**
 * 编舞主入口：段序 = 有停靠点的排期天（按天序）+ 可选未排期尾段。
 * 停靠点在画线笔尖经过时弹出（popFrame = start + progress·drawFrames）。
 */
export function buildChoreography(plan: MapRenderPlan, spec: MapCanvasSpec): ReplayChoreography {
  const scheduledDays = [...new Set(
    plan.markers.map(marker => marker.location.day).filter((day): day is number => day !== null),
  )].sort((a, b) => a - b)
  const unscheduled = plan.markers
    .filter(marker => marker.location.day === null)
    .map(marker => marker.location)

  type Draft = {
    day: number | null
    polyline: MapPolylineSpec | null
    geometry: PolylineGeometry | null
    stops: MapMarkerSpec[]
  }
  const drafts: Draft[] = scheduledDays.map(day => {
    const stops = plan.markers
      .filter(marker => marker.location.day === day)
      .sort((a, b) => (a.location.orderInDay ?? 0) - (b.location.orderInDay ?? 0))
    const polyline = plan.polylines.find(item => item.day === day) ?? null
    return { day, polyline, geometry: polyline ? polylineGeometry(spec, polyline) : null, stops }
  })
  if (unscheduled.length > 0) {
    drafts.push({
      day: null,
      polyline: null,
      geometry: null,
      stops: unscheduled.map(location => plan.markers.find(marker => marker.key === location.key)!),
    })
  }

  // 时长预算：超上限先等比压缩（保底时长）
  let drawFramesList = drafts.map(draft => draft.geometry
    ? drawFramesFor(draft.geometry.totalPx)
    : draft.day === null ? clamp(12 + 3 * draft.stops.length, 12, 45) : SINGLE_STOP_DRAW)
  const baseTotal = INTRO_FRAMES
    + drawFramesList.reduce((sum, value) => sum + value, 0)
    + drafts.length * DAY_DWELL
    + OUTRO_FRAMES
  if (baseTotal > MAX_TOTAL_FRAMES) {
    const floorFor = (draft: Draft) => (draft.day === null ? 12 : draft.geometry ? DRAW_MIN : SINGLE_STOP_DRAW)
    const budget = MAX_TOTAL_FRAMES - INTRO_FRAMES - OUTRO_FRAMES - drafts.length * DAY_DWELL
    const current = drawFramesList.reduce((sum, value) => sum + value, 0)
    const factor = current > 0 ? budget / current : 1
    drawFramesList = drafts.map((draft, index) =>
      Math.max(Math.round(drawFramesList[index] * factor), floorFor(draft)))
  }

  const segments: ReplaySegment[] = []
  let cursor = INTRO_FRAMES
  drafts.forEach((draft, index) => {
    const drawFrames = drawFramesList[index]
    const stops: ReplayStop[] = draft.stops.map(marker => {
      const position = projectToCanvas(spec, marker.location.lng, marker.location.lat)
      let progress = 0
      if (draft.geometry && draft.polyline) {
        const pathIndex = draft.polyline.path.findIndex(point => point.key === marker.key)
        if (pathIndex >= 0 && draft.geometry.totalPx > 0) {
          progress = draft.geometry.cumulative[pathIndex] / draft.geometry.totalPx
        }
      }
      const popFrame = draft.geometry
        ? cursor + clamp(Math.round(progress * drawFrames), 0, drawFrames)
        : cursor + clamp(marker.location.day === null
          ? (draft.stops.findIndex(item => item.key === marker.key) * 3)
          : 0, 0, drawFrames)
      return {
        key: marker.key,
        name: marker.location.name,
        number: marker.number,
        color: marker.color,
        day: marker.location.day,
        orderInDay: marker.location.orderInDay,
        progress,
        popFrame,
        x: position.x,
        y: position.y,
      }
    })
    const geometryPoints = draft.geometry?.points ?? []
    segments.push({
      day: draft.day,
      startFrame: cursor,
      drawFrames,
      dwellFrames: DAY_DWELL,
      endFrame: cursor + drawFrames + DAY_DWELL,
      pathPx: draft.geometry?.totalPx ?? 0,
      stops,
      polyline: draft.polyline,
      tipPoints: geometryPoints,
      cumulativePx: draft.geometry?.cumulative ?? [],
      followZoom: followZoomFor([...geometryPoints, ...stops.map(stop => ({ x: stop.x, y: stop.y }))]),
      lastTip: geometryPoints.length > 0
        ? geometryPoints[geometryPoints.length - 1]
        : (stops[0] ? { x: stops[0].x, y: stops[0].y } : { x: REPLAY_CANVAS_WIDTH / 2, y: REPLAY_CANVAS_HEIGHT / 2 }),
    })
    cursor += drawFrames + DAY_DWELL
  })

  return {
    fps: REPLAY_FPS,
    totalFrames: cursor + OUTRO_FRAMES,
    introEndFrame: INTRO_FRAMES,
    outroStartFrame: cursor,
    segments,
  }
}

function segmentGeometry(segment: ReplaySegment): PolylineGeometry {
  return { points: segment.tipPoints, cumulative: segment.cumulativePx, totalPx: segment.pathPx }
}

function wideCamera(): CameraState {
  return { cx: ANCHOR_WIDE.ax, cy: ANCHOR_WIDE.ay, zoom: 1, tilt: TILT_WIDE, ...ANCHOR_WIDE }
}

/** 帧 → 相机（v2 分镜：俯冲 / 跟拍 / hop 转场 / Ken Burns / 拉升） */
export function cameraAt(choreo: ReplayChoreography, frame: number): CameraState {
  const segments = choreo.segments
  if (segments.length === 0 || frame <= INTRO_HOLD) return wideCamera()

  const first = segments[0]
  const firstStop = first.stops[0]
  const followTarget: CameraState = firstStop
    ? { cx: firstStop.x, cy: firstStop.y, zoom: first.followZoom, tilt: TILT_FOLLOW, ...ANCHOR_FOLLOW }
    : { ...wideCamera(), tilt: TILT_FOLLOW, ...ANCHOR_FOLLOW }

  // S0 开场俯冲：[INTRO_HOLD, INTRO_HOLD+INTRO_DIVE) 内插，之后 6 帧 settle（即跟拍首帧）
  if (frame < choreo.introEndFrame) {
    const u = (frame - INTRO_HOLD) / INTRO_DIVE
    const zoom = u < 0.18
      ? lerp(1, 0.94, smoothstep(u / 0.18))
      : lerp(0.94, followTarget.zoom, inOutCubic((u - 0.18) / 0.82))
    const w = smoothstep(u)
    return {
      cx: lerp(ANCHOR_WIDE.ax, followTarget.cx, w),
      cy: lerp(ANCHOR_WIDE.ay, followTarget.cy, w),
      zoom,
      tilt: lerp(TILT_WIDE, TILT_FOLLOW, easeOutCubic(u)),
      ax: ANCHOR_FOLLOW.ax,
      ay: lerp(ANCHOR_WIDE.ay, ANCHOR_FOLLOW.ay, w),
    }
  }

  // S3 收尾拉升（hold 从 dwell 尾的 Ken Burns 终值起步，避免段尾→outro 的 zoom 跳变）
  if (frame >= choreo.outroStartFrame) {
    const inOutro = frame - choreo.outroStartFrame
    if (inOutro < OUTRO_HOLD) {
      const last = segments[segments.length - 1]
      return { cx: last.lastTip.x, cy: last.lastTip.y, zoom: last.followZoom * 1.06, tilt: TILT_FOLLOW, ...ANCHOR_FOLLOW }
    }
    const u = clamp((inOutro - OUTRO_HOLD) / OUTRO_EASE, 0, 1)
    const last = segments[segments.length - 1]
    const e = inOutCubic(u)
    return {
      cx: lerp(last.lastTip.x, ANCHOR_WIDE.ax, e),
      cy: lerp(last.lastTip.y, ANCHOR_WIDE.ay, e),
      zoom: lerp(last.followZoom * 1.06, 1, e),
      tilt: lerp(TILT_FOLLOW, TILT_WIDE, e),
      ax: ANCHOR_FOLLOW.ax,
      ay: lerp(ANCHOR_FOLLOW.ay, ANCHOR_WIDE.ay, e),
    }
  }

  // S1/S2 段内跟拍与段首 hop 转场
  const index = segments.findIndex(
    segment => frame >= segment.startFrame && frame < segment.endFrame)
  const segment = segments[index === -1 ? segments.length - 1 : index]
  const geometry = segmentGeometry(segment)
  const drawT = clamp((frame - segment.startFrame) / segment.drawFrames, 0, 1)

  let cx: number
  let cy: number
  if (segment.tipPoints.length > 0) {
    const tip = pointAtProgress(geometry, drawT)
    cx = tip.x
    cy = tip.y
  } else if (segment.stops.length > 0) {
    const stopIndex = clamp(Math.round(drawT * (segment.stops.length - 1)), 0, segment.stops.length - 1)
    cx = segment.stops[stopIndex].x
    cy = segment.stops[stopIndex].y
  } else {
    return wideCamera()
  }

  let zoom = segment.followZoom
  let tilt = TILT_FOLLOW

  if (index > 0 && frame < segment.startFrame + SEGMENT_TRANSITION) {
    const prev = segments[index - 1]
    const u = (frame - segment.startFrame) / SEGMENT_TRANSITION
    const w = smoothstep(u)
    cx = lerp(prev.lastTip.x, cx, w)
    cy = lerp(prev.lastTip.y, cy, w)
    // zoom 从上一段 dwell 终值（Ken Burns 后）连续过渡到本段 followZoom，再叠 hop 回拉谷
    zoom = lerp(prev.followZoom * 1.06, segment.followZoom, w) * (1 - 0.2 * Math.sin(Math.PI * u))
    tilt = TILT_FOLLOW - 9 * Math.sin(Math.PI * u)
  }

  // dwell 期 Ken Burns：zoom 缓推 +6%
  if (frame >= segment.startFrame + segment.drawFrames) {
    const dwellU = clamp((frame - segment.startFrame - segment.drawFrames) / Math.max(segment.dwellFrames, 1), 0, 1)
    zoom = zoom * (1 + 0.06 * dwellU)
  }

  return { cx, cy, zoom, tilt, ...ANCHOR_FOLLOW }
}

/** 天序号 → 交互 seek 落点（转场结束后 3 帧；null = 「全部」= outro rest 静帧；未知 → 0） */
export function frameForDay(choreo: ReplayChoreography, day: number | null): number {
  if (day === null) return Math.min(choreo.outroStartFrame + OUTRO_HOLD + OUTRO_EASE + 17, choreo.totalFrames - 1)
  const segment = choreo.segments.find(item => item.day === day)
  return segment ? segment.startFrame + SEGMENT_TRANSITION + 3 : 0
}

/** 地点键 → 「查看地图」seek 帧（弹出动画落定后）；未知 → null */
export function frameForLocation(choreo: ReplayChoreography, key: string): number | null {
  for (const segment of choreo.segments) {
    const stop = segment.stops.find(item => item.key === key)
    if (stop) return stop.popFrame + STOP_SETTLE
  }
  return null
}

/** 帧 → 当前天（intro/outro/未排期段 → null，对齐「全部」语义） */
export function dayAtFrame(choreo: ReplayChoreography, frame: number): number | null {
  if (frame < choreo.introEndFrame || frame >= choreo.outroStartFrame) return null
  const segment = choreo.segments.find(
    item => frame >= item.startFrame && frame < item.endFrame)
  return segment ? segment.day : null
}
