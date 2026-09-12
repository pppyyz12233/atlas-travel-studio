import { spring, useCurrentFrame, interpolate } from 'remotion'
import { REPLAY_CANVAS_WIDTH, REPLAY_CANVAS_HEIGHT } from './basemap'
import type { ReplayChoreography, ReplaySegment, ReplayStop } from './choreography'
import { cameraAt, partialPolyline, pointAtProgress, OUTRO_HOLD, OUTRO_EASE } from './choreography'
import { cameraToCSS, projectToScreen } from './projection'

// ============================================================
// 路线动画合成 v2（唯一 import 'remotion' 的文件，页面级懒加载）。
// 舞台 = CSS 3D（perspective+rotateX 倾斜平面只承载底图），
// 路线/pin/标签全部经 projectToScreen 画在屏幕空间 HUD——
// 描边宽度均匀、pin 恒正圆，且与平面变换逐像素一致（锚点不变量）。
// 纯渲染：所有时间线在 choreography，所有几何在 projection。
// ============================================================

export interface TripReplayProps {
  choreo: ReplayChoreography
  title: string
  subtitle: string
  /** L1 底图 objectURL；null = 无（L0 示意地面） */
  basemapUrl: string | null
  /** L2 拼接高清 objectURL（1920×1200 内容按 960×600 显示）；null = 未就绪 */
  basemapHiUrl: string | null
  /** L2 就绪时的帧号（交叉淡入锚点）；null = 未就绪 */
  hiSinceFrame: number | null
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/** 彗尾分段数 */
const TAIL_STEPS = 6

function pathD(points: Array<{ x: number; y: number }>): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
}

/** 屏幕空间折线的末段（弧长 lengthPx 内）切成 TAIL_STEPS 段，供彗尾渐隐 */
function cometTail(points: Array<{ x: number; y: number }>, lengthPx: number): Array<Array<{ x: number; y: number }>> {
  if (points.length < 2) return []
  const tail: Array<{ x: number; y: number }> = [points[points.length - 1]]
  let remaining = lengthPx
  for (let i = points.length - 1; i > 0 && remaining > 0; i -= 1) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    const seg = Math.hypot(dx, dy)
    if (seg <= remaining) {
      tail.unshift(points[i - 1])
      remaining -= seg
    } else {
      const u = remaining / seg
      tail.unshift({ x: points[i].x - dx * u, y: points[i].y - dy * u })
      remaining = 0
    }
  }
  const segments: Array<Array<{ x: number; y: number }>> = []
  for (let s = 0; s < TAIL_STEPS && s < tail.length - 1; s += 1) {
    segments.push([tail[s], tail[s + 1]])
  }
  return segments
}

function projectPath(
  project: (x: number, y: number) => { x: number; y: number },
  points: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> {
  return points.map(point => project(point.x, point.y))
}

/** 段的描画进度（0..1；段外为 0/1） */
function drawProgress(segment: ReplaySegment, frame: number): number {
  return clamp01((frame - segment.startFrame) / segment.drawFrames)
}

export default function TripReplay({ choreo, title, subtitle, basemapUrl, basemapHiUrl, hiSinceFrame }: TripReplayProps) {
  const frame = useCurrentFrame()
  const camera = cameraAt(choreo, frame)
  const plane = cameraToCSS(camera)
  const project = (x: number, y: number) => {
    const p = projectToScreen(plane, x, y)
    return { x: p.x, y: p.y }
  }
  const inOutro = frame >= choreo.outroStartFrame
  const outroU = inOutro ? clamp01((frame - choreo.outroStartFrame - OUTRO_HOLD) / OUTRO_EASE) : 0
  const activeIndex = choreo.segments.findIndex(
    segment => frame >= segment.startFrame && frame < segment.endFrame)
  const activeSegment = activeIndex >= 0 ? choreo.segments[activeIndex] : null
  const dayCount = choreo.segments.filter(segment => segment.day !== null).length

  const hiOpacity = hiSinceFrame !== null && basemapHiUrl
    ? clamp01((frame - hiSinceFrame) / 12)
    : 0
  const titleOpacity = interpolate(frame, [0, 12, 54, 66], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * 0.9
  const summaryOpacity = inOutro
    ? interpolate(frame - choreo.outroStartFrame, [30, 44], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0
  const badgeOpacity = activeSegment && activeSegment.day !== null && !inOutro
    ? interpolate(
      frame - activeSegment.startFrame,
      [0, 6, activeSegment.drawFrames + activeSegment.dwellFrames - 6, activeSegment.drawFrames + activeSegment.dwellFrames],
      [0, 1, 1, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
    )
    : 0
  const ghostOpacity = inOutro ? 0.16 * (1 - outroU) + 0.04 : 0.16
  const pastOpacity = inOutro ? 0.35 + 0.65 * outroU : 0.35

  // 笔尖（正在描画段的弧长 t 处）
  let tip: { x: number; y: number } | null = null
  if (activeSegment && frame < activeSegment.startFrame + activeSegment.drawFrames) {
    const t = drawProgress(activeSegment, frame)
    if (activeSegment.tipPoints.length > 0) {
      tip = project(...((): [number, number] => {
        const p = pointAtProgress(
          { points: activeSegment.tipPoints, cumulative: activeSegment.cumulativePx, totalPx: activeSegment.pathPx }, t)
        return [p.x, p.y]
      })())
    } else if (activeSegment.stops.length > 0) {
      const stop = activeSegment.stops[Math.min(Math.round(t * (activeSegment.stops.length - 1)), activeSegment.stops.length - 1)]
      tip = project(stop.x, stop.y)
    }
  }

  // 标签防挤压：按画布坐标（静态）做 48px 规则，避免逐帧抖动
  const labelVisible = new Map<string, boolean>()
  for (const segment of choreo.segments) {
    let last: { x: number; y: number } | null = null
    for (const stop of segment.stops) {
      const visible = !last || Math.hypot(stop.x - last.x, stop.y - last.y) >= 48
      labelVisible.set(stop.key, visible)
      if (visible) last = stop
    }
  }

  return (
    <div className="tr-stage" style={{ width: REPLAY_CANVAS_WIDTH, height: REPLAY_CANVAS_HEIGHT }}>
      <div className="tr-sky" />
      <div className="tr-world">
        <div className="tr-plane" style={{ transform: plane.planeTransform }}>
          {basemapHiUrl && (
            <img className="tr-basemap tr-basemap--hi" src={basemapHiUrl} alt="" draggable={false}
              style={{ width: REPLAY_CANVAS_WIDTH, height: REPLAY_CANVAS_HEIGHT, opacity: hiOpacity }} />
          )}
          {basemapUrl && (
            <img className="tr-basemap" src={basemapUrl} alt="" draggable={false}
              style={{ width: REPLAY_CANVAS_WIDTH, height: REPLAY_CANVAS_HEIGHT, opacity: 1 - hiOpacity }} />
          )}
          {!basemapUrl && !basemapHiUrl && (
            <div className="tr-fallback" style={{ width: REPLAY_CANVAS_WIDTH, height: REPLAY_CANVAS_HEIGHT }} />
          )}
          <div className="tr-tint" style={{ width: REPLAY_CANVAS_WIDTH, height: REPLAY_CANVAS_HEIGHT }} />
        </div>
      </div>

      <svg
        className="tr-hud-routes"
        viewBox={`0 0 ${REPLAY_CANVAS_WIDTH} ${REPLAY_CANVAS_HEIGHT}`}
        width={REPLAY_CANVAS_WIDTH}
        height={REPLAY_CANVAS_HEIGHT}
      >
        {/* ghost 全路线（未走的隐约预览） */}
        {choreo.segments.map(segment =>
          segment.tipPoints.length >= 2 ? (
            <path
              key={`ghost-${segment.day ?? 'x'}`}
              className="tr-route tr-route--ghost"
              d={pathD(projectPath(project, segment.tipPoints))}
              strokeDasharray="3 7"
              opacity={ghostOpacity}
            />
          ) : null)}

        {/* 已走完的往日路线 */}
        {choreo.segments.map((segment, index) =>
          segment.tipPoints.length >= 2 && (inOutro || (activeIndex > index)) ? (
            <path
              key={`past-${segment.day ?? 'x'}`}
              className="tr-route tr-route--past"
              d={pathD(projectPath(project, segment.tipPoints))}
              opacity={pastOpacity}
            />
          ) : null)}

        {/* 正在描画的段：夜航光轨三层（宽泛光 + 中层辉光 + 白热芯） */}
        {activeSegment && activeSegment.tipPoints.length >= 2 && (() => {
          const geometry = { points: activeSegment.tipPoints, cumulative: activeSegment.cumulativePx, totalPx: activeSegment.pathPx }
          const partial = projectPath(project, partialPolyline(geometry, drawProgress(activeSegment, frame)))
          const d = pathD(partial)
          // 彗尾：沿已画路线最后 ~70px 渐隐白热光带（分段衰减近似）
          const tail = cometTail(partial, 70)
          return (
            <g>
              <path className="tr-route tr-route--halo" d={d} />
              <path className="tr-route tr-route--mid" d={d} />
              <path className="tr-route tr-route--core" d={d} />
              {tail.map((segment, index) => (
                <path
                  key={`tail-${index}`}
                  className="tr-route tr-route--tail"
                  d={pathD(segment)}
                  opacity={0.85 * ((index + 1) / TAIL_STEPS)}
                  strokeWidth={3.5 * ((index + 1) / TAIL_STEPS) + 1}
                />
              ))}
            </g>
          )
        })()}

        {/* 笔尖「彗头」：bloom 大柔光 + 亮核 + 脉冲环 */}
        {tip && (() => {
          const phase = ((frame - (activeSegment?.startFrame ?? 0)) % 24 + 24) % 24 / 24
          return (
            <g>
              <circle cx={tip.x} cy={tip.y} r={7 + 17 * phase} className="tr-tip-pulse" opacity={(1 - phase) * 0.45} />
              <circle cx={tip.x} cy={tip.y} r={16} className="tr-tip-bloom" />
              <circle cx={tip.x} cy={tip.y} r={6.5} className="tr-tip-core" />
            </g>
          )
        })()}
      </svg>

      <div className="tr-hud-pins">
        {tip && <div className="tr-tip-light" style={{ left: tip.x, top: tip.y }} />}
        {choreo.segments.map(segment => segment.stops.map(stop => (
          <StopPin
            key={stop.key}
            stop={stop}
            frame={frame}
            project={project}
            projectZ={(x: number, y: number) => projectToScreen(plane, x, y).z}
            showLabel={labelVisible.get(stop.key) ?? true}
            passed={inOutro || (activeSegment ? segment.startFrame + segment.drawFrames < frame : false)}
          />
        )))}
      </div>

      <div className="tr-vignette" />

      <div className="tr-title" style={{ opacity: titleOpacity }}>
        <span className="tr-kicker">ATLAS · 行程回放</span>
        <strong>{title}</strong>
        <span className="tr-sub">{subtitle}</span>
      </div>

      {activeSegment && activeSegment.day !== null && (
        <div className="tr-day-badge" style={{ opacity: badgeOpacity }}>
          DAY {activeSegment.day + 1} <em>/ {dayCount}</em>
        </div>
      )}

      {inOutro && (
        <div className="tr-title tr-title--outro" style={{ opacity: summaryOpacity }}>
          <span className="tr-kicker">行程完成</span>
          <strong>{title}</strong>
          <span className="tr-sub">{subtitle}</span>
        </div>
      )}

      {!basemapUrl && !basemapHiUrl && <div className="tr-note">示意底图 · 配置 AMAP_WEBSERVICE_KEY 后显示真实地图</div>}
    </div>
  )
}

function StopPin({ stop, frame, project, projectZ, showLabel, passed }: {
  stop: ReplayStop
  frame: number
  project: (x: number, y: number) => { x: number; y: number }
  projectZ: (x: number, y: number) => number
  showLabel: boolean
  passed: boolean
}) {
  if (frame < stop.popFrame) return null
  const screen = project(stop.x, stop.y)
  const z = projectZ(stop.x, stop.y)
  const pop = spring({ frame: frame - stop.popFrame, fps: 30, config: { damping: 10, stiffness: 200 } })
  const labelIn = interpolate(frame - stop.popFrame, [4, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const haloPhase = clamp01((frame - stop.popFrame) / 24)
  const dayLabel = stop.day !== null ? `第 ${stop.day + 1} 天` : '未排期'
  const orderLabel = stop.orderInDay !== null ? `第 ${stop.orderInDay + 1} 站` : '未排期'
  return (
    <div
      className={`tr-pin-anchor${passed ? ' is-passed' : ''}`}
      style={{ left: screen.x, top: screen.y, zIndex: 1000 + Math.round(z) }}
    >
      {haloPhase < 1 && (
        <span className="tr-pin-halo" style={{
          width: (28 + 16 * haloPhase), height: (28 + 16 * haloPhase),
          opacity: (1 - haloPhase) * 0.35,
        }} />
      )}
      <span className="tr-pin" style={{ transform: `scale(${Math.max(pop, 0.001)})`, backgroundColor: stop.color }}>
        {stop.number}
      </span>
      {showLabel && (
        <span className="tr-label" style={{ opacity: labelIn, transform: `translateY(${(1 - labelIn) * -6}px)` }}>
          <b>{stop.name}</b>
          <small>{dayLabel} · {orderLabel}</small>
        </span>
      )}
    </div>
  )
}
