// ============================================================
// 透视投影（纯逻辑）：相机状态 → CSS 3D 平面变换 与
// 画布坐标 → 屏幕坐标 的解析解。两者必须逐像素一致，
// 否则 HUD（路线/pin/标签）会对不上底图——一致性由
// projection.test.ts 的「锚点不变量」钉死。
//
// 相机六自由度：cx/cy 画布焦点、zoom 焦点水平缩放、
// tilt 平面倾角（0=正对，90=完全侧放）、ax/ay 屏幕锚点。
// ============================================================

export interface CameraState {
  /** 画布坐标焦点 X（0..960 之外也允许——跟随画布平移） */
  cx: number
  cy: number
  /** 焦点处的水平屏幕缩放 */
  zoom: number
  /** 平面倾角（度） */
  tilt: number
  /** 焦点的屏幕投影锚点 X */
  ax: number
  ay: number
}

/** 舞台视距（px）——与 .tr-stage 的 perspective 保持一致 */
export const STAGE_PERSPECTIVE = 1400
/** 合成画布尺寸（与 basemap.ts 的 REPLAY_CANVAS_* 同源，避免循环依赖在此重声明） */
export const STAGE_WIDTH = 960
export const STAGE_HEIGHT = 600

export interface PlaneTransform {
  /** 直接写进 .tr-plane 的 transform 字符串 */
  planeTransform: string
  /** 投影所需的中间量（projectToScreen 复用，避免重复计算） */
  s: number
  dx: number
  dy: number
  tilt: number
}

/** 缓动：smoothstep（段间位置/锚点过渡） */
export function smoothstep(u: number): number {
  const c = Math.min(1, Math.max(0, u))
  return c * c * (3 - 2 * c)
}

/** 缓动：easeOutCubic（开场俯冲 tilt） */
export function easeOutCubic(u: number): number {
  const c = Math.min(1, Math.max(0, u))
  return 1 - (1 - c) ** 3
}

/** 缓动：inOutCubic（俯冲/拉升的 zoom） */
export function inOutCubic(u: number): number {
  const c = Math.min(1, Math.max(0, u))
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2
}

/**
 * 相机 → CSS 平面变换。
 * 关键性质：焦点 (cx,cy) 精确投影到 (ax,ay)，且该点水平缩放恰为 zoom。
 * 数学：平面点先绕 X 轴倾斜（y→y·cosθ, z→y·sinθ），再 scale3d(s)，
 * 再平移 (dx,dy)，最后经舞台 perspective 透视除法 k=P/(P−z)。
 */
export function cameraToCSS(cam: CameraState): PlaneTransform {
  const rad = (cam.tilt * Math.PI) / 180
  const xf = cam.cx - STAGE_WIDTH / 2
  const yf = (cam.cy - STAGE_HEIGHT / 2) * Math.cos(rad)
  const zf = (cam.cy - STAGE_HEIGHT / 2) * Math.sin(rad)
  const s = (cam.zoom * STAGE_PERSPECTIVE) / (STAGE_PERSPECTIVE + cam.zoom * zf)
  const k = STAGE_PERSPECTIVE / (STAGE_PERSPECTIVE - zf * s)
  const dx = (cam.ax - STAGE_WIDTH / 2) / k - xf * s
  const dy = (cam.ay - STAGE_HEIGHT / 2) / k - yf * s
  return {
    planeTransform: `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) scale3d(${s.toFixed(4)}, ${s.toFixed(4)}, ${s.toFixed(4)}) rotateX(${cam.tilt.toFixed(2)}deg)`,
    s,
    dx,
    dy,
    tilt: cam.tilt,
  }
}

/** 画布坐标 → 屏幕坐标（HUD 路线/pin/标签共用；z 用于遮挡排序） */
export function projectToScreen(
  plane: PlaneTransform,
  x: number,
  y: number,
): { x: number; y: number; z: number } {
  const rad = (plane.tilt * Math.PI) / 180
  const x1 = (x - STAGE_WIDTH / 2) * plane.s + plane.dx
  const y1 = (y - STAGE_HEIGHT / 2) * Math.cos(rad) * plane.s + plane.dy
  const z1 = (y - STAGE_HEIGHT / 2) * Math.sin(rad) * plane.s
  const k = STAGE_PERSPECTIVE / (STAGE_PERSPECTIVE - z1)
  return { x: STAGE_WIDTH / 2 + x1 * k, y: STAGE_HEIGHT / 2 + y1 * k, z: z1 }
}

export function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u
}
