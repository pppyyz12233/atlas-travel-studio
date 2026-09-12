import { spring, useCurrentFrame, interpolate } from 'remotion'
import { REPLAY_CANVAS_WIDTH, REPLAY_CANVAS_HEIGHT } from './basemap'
import type { ReplayChoreography, ReplaySegment, ReplayStop } from './choreography'
import { cameraAt, pointAtProgress } from './choreography'

// ============================================================
// 路线动画合成组件（唯一 import 'remotion' 的文件，页面级懒加载）。
// 纯渲染：所有几何/时间线都在 choreography 里预先算好，
// 这里只按 useCurrentFrame() 查表绘制——任意帧可确定性复现。
// ============================================================

export interface TripReplayProps {
  choreo: ReplayChoreography
  title: string
  subtitle: string
  /** 底图 objectURL；null = 后端未配置/失败 → 渐变示意底图 */
  basemapUrl: string | null
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function pathD(points: Array<{ x: number; y: number }>): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
}

function RouteLayer({ segment, frame, dimmed }: { segment: ReplaySegment; frame: number; dimmed: boolean }) {
  if (frame < segment.startFrame || segment.tipPoints.length < 2 || segment.pathPx <= 0) return null
  const t = clamp01((frame - segment.startFrame) / segment.drawFrames)
  const drawing = frame < segment.startFrame + segment.drawFrames
  const d = pathD(segment.tipPoints)
  const geometry = {
    points: segment.tipPoints,
    cumulative: segment.cumulativePx,
    totalPx: segment.pathPx,
  }
  const tip = drawing ? pointAtProgress(geometry, t) : null
  return (
    <g opacity={dimmed ? 0.55 : 1}>
      <path d={d} fill="none" stroke={segment.polyline?.color ?? '#746d5f'} strokeOpacity={0.22} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
      <path
        d={d} fill="none"
        stroke={segment.polyline?.color ?? '#746d5f'}
        strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={segment.pathPx}
        strokeDashoffset={segment.pathPx * (1 - t)}
      />
      {tip && (
        <g>
          <circle cx={tip.x} cy={tip.y} r={9} fill={segment.polyline?.color ?? '#746d5f'} fillOpacity={0.3} />
          <circle cx={tip.x} cy={tip.y} r={4.5} fill="#ffffff" stroke={segment.polyline?.color ?? '#746d5f'} strokeWidth={2} />
        </g>
      )}
    </g>
  )
}

function StopMarker({ stop, frame, showLabel }: { stop: ReplayStop; frame: number; showLabel: boolean }) {
  if (frame < stop.popFrame) return null
  const pop = spring({ frame: frame - stop.popFrame, fps: 30, config: { damping: 12, stiffness: 160 } })
  const labelOpacity = interpolate(frame - stop.popFrame, [4, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const dayLabel = stop.day !== null ? `第 ${stop.day + 1} 天` : '未排期'
  const orderLabel = stop.orderInDay !== null ? `当天第 ${stop.orderInDay + 1} 站` : '未参与逐日路线'
  return (
    <g>
      <g transform={`translate(${stop.x} ${stop.y}) scale(${Math.max(pop, 0.001)})`}>
        <title>{`${stop.name} · ${dayLabel}${stop.orderInDay !== null ? ` · ${orderLabel}` : ''}`}</title>
        <circle r={11} fill={stop.color} stroke="#ffffff" strokeWidth={2.5} />
        <text textAnchor="middle" dy="0.35em" fontSize={11} fontWeight={700} fill="#ffffff">{stop.number}</text>
      </g>
      {showLabel && (
        <text
          x={stop.x + 15} y={stop.y + 4}
          fontSize={12} fontWeight={600} fill="#2b2a26"
          stroke="#faf7f2" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round"
          opacity={labelOpacity}
        >
          {stop.name}
        </text>
      )}
    </g>
  )
}

export default function TripReplay({ choreo, title, subtitle, basemapUrl }: TripReplayProps) {
  const frame = useCurrentFrame()
  const camera = cameraAt(choreo, frame)
  const inOutro = frame >= choreo.outroStartFrame
  const activeIndex = choreo.segments.findIndex(
    segment => frame >= segment.startFrame && frame < segment.endFrame)
  const activeSegment = activeIndex >= 0 ? choreo.segments[activeIndex] : null

  const titleOpacity = interpolate(frame, [0, 10, 33, 45], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const summaryOpacity = inOutro
    ? interpolate(frame - choreo.outroStartFrame, [25, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0
  const badgeOpacity = activeSegment && activeSegment.day !== null
    ? interpolate(
      frame - activeSegment.startFrame,
      [0, 4, activeSegment.drawFrames + activeSegment.dwellFrames - 4, activeSegment.drawFrames + activeSegment.dwellFrames],
      [0, 1, 1, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
    )
    : 0

  // 标签防重叠：同段内离上一个已标注点 <48px 的不显示名称
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
    <div className="trip-replay-stage" style={{ width: REPLAY_CANVAS_WIDTH, height: REPLAY_CANVAS_HEIGHT }}>
      <div
        className="trip-replay-camera"
        style={{
          width: REPLAY_CANVAS_WIDTH,
          height: REPLAY_CANVAS_HEIGHT,
          transformOrigin: '0 0',
          transform: `translate(${REPLAY_CANVAS_WIDTH / 2 - camera.cx * camera.zoomScale}px, ${REPLAY_CANVAS_HEIGHT / 2 - camera.cy * camera.zoomScale}px) scale(${camera.zoomScale})`,
        }}
      >
        {basemapUrl
          ? <img className="trip-replay-basemap" src={basemapUrl} alt="" draggable={false} style={{ width: REPLAY_CANVAS_WIDTH, height: REPLAY_CANVAS_HEIGHT }} />
          : <div className="trip-replay-fallback" style={{ width: REPLAY_CANVAS_WIDTH, height: REPLAY_CANVAS_HEIGHT }} />}
        <svg
          className="trip-replay-routes"
          viewBox={`0 0 ${REPLAY_CANVAS_WIDTH} ${REPLAY_CANVAS_HEIGHT}`}
          width={REPLAY_CANVAS_WIDTH}
          height={REPLAY_CANVAS_HEIGHT}
        >
          {choreo.segments.map((segment, index) => (
            <RouteLayer
              key={segment.day === null ? 'unscheduled' : `day-${segment.day}`}
              segment={segment}
              frame={frame}
              dimmed={inOutro ? false : activeIndex > index}
            />
          ))}
          {choreo.segments.map(segment =>
            segment.stops.map(stop => (
              <StopMarker key={stop.key} stop={stop} frame={frame} showLabel={labelVisible.get(stop.key) ?? true} />
            )))}
        </svg>
      </div>

      <div className="trip-replay-title" style={{ opacity: titleOpacity }}>
        <span className="trip-replay-kicker">ATLAS · 行程回放</span>
        <strong>{title}</strong>
        <span className="trip-replay-sub">{subtitle}</span>
      </div>

      {activeSegment && activeSegment.day !== null && (
        <div
          className="trip-replay-badge"
          style={{ opacity: badgeOpacity, backgroundColor: activeSegment.polyline?.color ?? activeSegment.stops[0]?.color }}
        >
          第 {activeSegment.day + 1} 天 · {activeSegment.stops.length} 站
        </div>
      )}

      {inOutro && (
        <div className="trip-replay-title trip-replay-title--outro" style={{ opacity: summaryOpacity }}>
          <span className="trip-replay-kicker">行程完成</span>
          <strong>{title}</strong>
          <span className="trip-replay-sub">{subtitle} · 可拖动进度条回看</span>
        </div>
      )}

      {basemapUrl === null && <div className="trip-replay-note">底图暂不可用 · 示意背景</div>}
    </div>
  )
}
