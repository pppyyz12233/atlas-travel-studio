import type { MapMarkerSpec, MapPolylineSpec, MapRenderPlan } from '../mapRouting'
import { clamp } from './mercator'
import type { MapCanvasSpec } from './basemap'
import { REPLAY_CANVAS_WIDTH, REPLAY_CANVAS_HEIGHT, projectToCanvas } from './basemap'

// ============================================================
// 路线动画编舞（纯逻辑，零 Remotion 依赖）：
// 把 MapRenderPlan + 画布规格编成逐帧时间线——
// 段（天）的起止帧、画线时长、停靠点弹出帧、相机关键帧。
// 合成组件只按帧查表渲染，所有不变量由 choreography.test.ts 钉死。
// ============================================================

export const REPLAY_FPS = 30
/** 开场 1.5s：0-15 全览静止（标题卡），15-45 缓动到第 1 天跟拍位 */
export const INTRO_FRAMES = 45
export const INTRO_HOLD_FRAMES = 15
/** 每段画完后的停留 */
export const DAY_DWELL = 18
/** 单段画线时长下限/上限（帧） */
export const DRAW_MIN = 36
export const DRAW_MAX = 150
/** 画线速度（帧/像素）：drawFrames = clamp(round(pathPx·0.12), 36, 150) */
export const DRAW_PX_PER_FRAME = 0.12
/** 无折线的段（单点天）的展示时长 */
export const SINGLE_STOP_DRAW = 24
/** 收尾 2.5s：0.5s 保持 → 2s 缓动 zoom-to-fit → 末 20 帧静止 */
export const OUTRO_FRAMES = 75
export const OUTRO_EASE_FRAMES = 45
/** 「查看地图」seek 的落定帧偏移（弹出动画之后） */
export const STOP_SETTLE = 4
/** 总时长上限；超出则等比压缩各段 drawFrames */
export const MAX_TOTAL_FRAMES = 2700
/** 段间相机过渡帧数（衔接上一段结尾与下一段画线开头） */
export const SEGMENT_TRANSITION = 12
export const FOLLOW_ZOOM_MIN = 1.15
export const FOLLOW_ZOOM_MAX = 2.2

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

export interface CameraKeyframe {
  frame: number
  cx: number
  cy: number
  zoomScale: number
}

export interface CameraState {
  cx: number
  cy: number
  zoomScale: number
}

export interface ReplayChoreography {
  fps: number
  totalFrames: number
  introEndFrame: number
  outroStartFrame: number
  segments: ReplaySegment[]
  cameraKeyframes: CameraKeyframe[]
}

export interface PolylineGeometry {
  points: Array<{ x: number; y: number }>
  cumulative: number[]
  totalPx: number
}

/** 折线投影 + 前缀弧长（strokeDash 与相机共用的几何源） */
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

/** 弧长参数 t∈[0,1] 处的折线坐标（相机贴笔尖的唯一来源） */
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

/** 平滑缓动（0→1 的 smoothstep；纯模块不引 Remotion Easing） */
function smoothstep(u: number): number {
  const c = clamp(u, 0, 1)
  return c * c * (3 - 2 * c)
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

  const outroStartFrame = cursor
  const totalFrames = outroStartFrame + OUTRO_FRAMES
  const introEndFrame = INTRO_FRAMES

  // 相机关键帧（边界采样，供测试/调试；运行时用 cameraAt）
  const cameraKeyframes: CameraKeyframe[] = [{
    frame: 0, cx: REPLAY_CANVAS_WIDTH / 2, cy: REPLAY_CANVAS_HEIGHT / 2, zoomScale: 1,
  }]
  for (const segment of segments) {
    const first = segment.stops[0]
    const startCam: CameraKeyframe = first
      ? { frame: segment.startFrame, cx: first.x, cy: first.y, zoomScale: segment.followZoom }
      : { frame: segment.startFrame, cx: REPLAY_CANVAS_WIDTH / 2, cy: REPLAY_CANVAS_HEIGHT / 2, zoomScale: 1 }
    if (startCam.frame > cameraKeyframes[cameraKeyframes.length - 1].frame) cameraKeyframes.push(startCam)
    cameraKeyframes.push({
      frame: segment.endFrame,
      cx: segment.lastTip.x,
      cy: segment.lastTip.y,
      zoomScale: segment.followZoom,
    })
  }
  cameraKeyframes.push({
    frame: Math.min(outroStartFrame + OUTRO_EASE_FRAMES, totalFrames - 1),
    cx: REPLAY_CANVAS_WIDTH / 2, cy: REPLAY_CANVAS_HEIGHT / 2, zoomScale: 1,
  })
  cameraKeyframes.push({
    frame: totalFrames - 1,
    cx: REPLAY_CANVAS_WIDTH / 2, cy: REPLAY_CANVAS_HEIGHT / 2, zoomScale: 1,
  })

  return { fps: REPLAY_FPS, totalFrames, introEndFrame, outroStartFrame, segments, cameraKeyframes }
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u
}

function clampCamera(state: CameraState): CameraState {
  if (state.zoomScale <= 1) {
    return { cx: REPLAY_CANVAS_WIDTH / 2, cy: REPLAY_CANVAS_HEIGHT / 2, zoomScale: state.zoomScale }
  }
  const halfW = REPLAY_CANVAS_WIDTH / 2 / state.zoomScale
  const halfH = REPLAY_CANVAS_HEIGHT / 2 / state.zoomScale
  return {
    zoomScale: state.zoomScale,
    cx: clamp(state.cx, halfW, REPLAY_CANVAS_WIDTH - halfW),
    cy: clamp(state.cy, halfH, REPLAY_CANVAS_HEIGHT - halfH),
  }
}

/** 帧号 → 相机状态（intro 全览 → 贴笔尖跟拍 → 段间过渡 → outro 拉远） */
export function cameraAt(choreo: ReplayChoreography, frame: number): CameraState {
  const full: CameraState = { cx: REPLAY_CANVAS_WIDTH / 2, cy: REPLAY_CANVAS_HEIGHT / 2, zoomScale: 1 }
  const segments = choreo.segments
  if (segments.length === 0 || frame <= INTRO_HOLD_FRAMES) return full

  const first = segments[0]
  if (frame < choreo.introEndFrame) {
    const u = smoothstep((frame - INTRO_HOLD_FRAMES) / (choreo.introEndFrame - INTRO_HOLD_FRAMES))
    const target = first.stops[0]
      ? { cx: first.stops[0].x, cy: first.stops[0].y, zoomScale: first.followZoom }
      : full
    return clampCamera({
      cx: lerp(full.cx, target.cx, u),
      cy: lerp(full.cy, target.cy, u),
      zoomScale: lerp(full.zoomScale, target.zoomScale, u),
    })
  }

  if (frame >= choreo.outroStartFrame) {
    const last = segments[segments.length - 1]
    const u = smoothstep((frame - choreo.outroStartFrame) / OUTRO_EASE_FRAMES)
    return clampCamera({
      cx: lerp(last.lastTip.x, full.cx, u),
      cy: lerp(last.lastTip.y, full.cy, u),
      zoomScale: lerp(last.followZoom, full.zoomScale, u),
    })
  }

  const index = segments.findIndex(
    segment => frame >= segment.startFrame && frame < segment.endFrame)
  const segment = segments[index === -1 ? segments.length - 1 : index]

  // 段内镜头位：有折线贴笔尖，无折线按进度跳停靠点
  let cx: number
  let cy: number
  if (segment.tipPoints.length > 0) {
    const t = clamp((frame - segment.startFrame) / segment.drawFrames, 0, 1)
    const point = pointAtProgress(
      { points: segment.tipPoints, cumulative: segment.cumulativePx, totalPx: segment.pathPx }, t)
    cx = point.x
    cy = point.y
  } else if (segment.stops.length > 0) {
    const t = clamp((frame - segment.startFrame) / segment.drawFrames, 0, 1)
    const stopIndex = clamp(Math.round(t * (segment.stops.length - 1)), 0, segment.stops.length - 1)
    cx = segment.stops[stopIndex].x
    cy = segment.stops[stopIndex].y
  } else {
    return full
  }

  // 段首过渡：从上一段尾位置平滑接到本段笔尖
  if (index > 0 && frame < segment.startFrame + SEGMENT_TRANSITION) {
    const prev = segments[index - 1]
    const u = smoothstep((frame - segment.startFrame) / SEGMENT_TRANSITION)
    cx = lerp(prev.lastTip.x, cx, u)
    cy = lerp(prev.lastTip.y, cy, u)
  }
  return clampCamera({ cx, cy, zoomScale: segment.followZoom })
}

/** 天序号 → 段起始帧（null = 未排期/「全部」语义 → outro 全图帧；未知 → 0） */
export function frameForDay(choreo: ReplayChoreography, day: number | null): number {
  if (day === null) return choreo.outroStartFrame
  const segment = choreo.segments.find(item => item.day === day)
  return segment ? segment.startFrame : 0
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
