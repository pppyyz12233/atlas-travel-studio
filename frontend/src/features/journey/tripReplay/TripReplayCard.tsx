import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Player, type PlayerRef } from '@remotion/player'
import MapOverlays from '../../../components/MapOverlays'
import type { MapRenderPlan } from '../mapRouting'
import { REPLAY_CANVAS_WIDTH, REPLAY_CANVAS_HEIGHT, buildMapCanvasSpec } from './basemap'
import type { ReplayChoreography } from './choreography'
import { REPLAY_FPS, buildChoreography, frameForDay, frameForLocation, dayAtFrame } from './choreography'
import TripReplay from './TripReplay'

// ============================================================
// 路线动画卡片：页面级 React.lazy 的入口（remotion + player 全在本 chunk）。
// 职责 = 底图代理拉取（失败降级示意底图）+ Player 装配 +
// 对外暴露 TripReplayApi（日/地点 seek），事件回流 onFrameChange。
// 规划页右栏地图不受影响（那里仍用 MapView）。
// ============================================================

export interface TripReplayApi {
  /** n → seek 到该天段首帧并播放；null → 「全部」= outro 全图并暂停 */
  seekToDay: (day: number | null) => void
  /** seek 到停靠点弹出落定帧并暂停；未知 key 或未就绪返回 false */
  seekToLocation: (key: string) => boolean
  seekToFrame: (frame: number) => void
  play: () => void
  pause: () => void
}

interface TripReplayCardProps {
  plan: MapRenderPlan
  title: string
  subtitle: string
  onFrameChange?: (frame: number, day: number | null) => void
  onReady?: (api: TripReplayApi) => void
}

type PendingAction = { type: 'day'; day: number | null } | { type: 'location'; key: string }

export default function TripReplayCard({ plan, title, subtitle, onFrameChange, onReady }: TripReplayCardProps) {
  const spec = useMemo(() => buildMapCanvasSpec(plan), [plan])
  const choreo = useMemo<ReplayChoreography | null>(
    () => (spec ? buildChoreography(plan, spec) : null),
    [spec, plan],
  )

  const playerRef = useRef<PlayerRef | null>(null)
  const [playerReady, setPlayerReady] = useState(false)
  const [basemapUrl, setBasemapUrl] = useState<string | null>(null)
  const [basemapState, setBasemapState] = useState<'loading' | 'ready' | 'fallback'>('loading')
  const pendingRef = useRef<PendingAction | null>(null)
  const autoplayedRef = useRef(false)

  const frameChangeRef = useRef(onFrameChange)
  const readyRef = useRef(onReady)
  const choreoRef = useRef(choreo)
  frameChangeRef.current = onFrameChange
  readyRef.current = onReady
  choreoRef.current = choreo

  // 底图：原生 fetch 走后端代理（返回图片字节，不是 useApi 的 JSON 信封），
  // blob → objectURL；失败/中断 → 渐变示意底图，动画照常
  useEffect(() => {
    if (!spec) return undefined
    const controller = new AbortController()
    let objectUrl: string | null = null
    let cancelled = false
    setBasemapState('loading')
    fetch(spec.proxyUrl, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`map proxy ${response.status}`)
        return response.blob()
      })
      .then(blob => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setBasemapUrl(objectUrl)
        setBasemapState('ready')
      })
      .catch(() => {
        if (cancelled) return
        setBasemapUrl(null)
        setBasemapState('fallback')
      })
    return () => {
      cancelled = true
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [spec])

  // Player 事件 → onFrameChange（ref 存回调避免每帧重订阅）
  useEffect(() => {
    const player = playerRef.current
    if (!playerReady || !player || !choreo) return undefined
    const emit = (frame: number) => frameChangeRef.current?.(frame, dayAtFrame(choreoRef.current!, frame))
    const onFrameUpdate = (event: { detail: { frame: number } }) => emit(event.detail.frame)
    const onSeeked = (event: { detail: { frame: number } }) => emit(event.detail.frame)
    player.addEventListener('frameupdate', onFrameUpdate)
    player.addEventListener('seeked', onSeeked)
    return () => {
      player.removeEventListener('frameupdate', onFrameUpdate)
      player.removeEventListener('seeked', onSeeked)
    }
  }, [playerReady, choreo])

  // ref 挂上后补发被挡下的 seek，并对外发布 API
  useEffect(() => {
    if (!playerReady || !choreo) return
    const player = playerRef.current
    if (!player) return
    const pending = pendingRef.current
    pendingRef.current = null
    if (pending?.type === 'day') {
      player.seekTo(frameForDay(choreo, pending.day))
      if (pending.day === null) player.pause()
      else player.play()
    } else if (pending?.type === 'location') {
      const frame = frameForLocation(choreo, pending.key)
      if (frame !== null) {
        player.seekTo(frame)
        player.pause()
      }
    }
    readyRef.current?.({
      seekToDay: (day: number | null) => {
        const current = choreoRef.current
        const target = playerRef.current
        if (!current || !target) {
          pendingRef.current = { type: 'day', day }
          return
        }
        target.seekTo(frameForDay(current, day))
        if (day === null) target.pause()
        else target.play()
      },
      seekToLocation: (key: string) => {
        const current = choreoRef.current
        const target = playerRef.current
        if (!current) return false
        const frame = frameForLocation(current, key)
        if (frame === null) return false
        if (!target) {
          pendingRef.current = { type: 'location', key }
          return false
        }
        target.seekTo(frame)
        target.pause()
        return true
      },
      seekToFrame: (frame: number) => playerRef.current?.seekTo(frame),
      play: () => playerRef.current?.play(),
      pause: () => playerRef.current?.pause(),
    })
  }, [playerReady, choreo])

  // 底图就绪/降级后自动播放一次（用户选择了「默认就带动画」）；
  // prefers-reduced-motion 用户不播，直接停在全图
  useEffect(() => {
    if (!playerReady || !choreo || basemapState === 'loading' || autoplayedRef.current) return
    autoplayedRef.current = true
    const player = playerRef.current
    if (!player) return
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      player.seekTo(choreo.outroStartFrame)
    } else {
      player.play()
    }
  }, [playerReady, choreo, basemapState])

  const handlePlayerRef = useCallback((node: PlayerRef | null) => {
    playerRef.current = node
    setPlayerReady(Boolean(node))
  }, [])

  if (!choreo || !spec) {
    return (
      <div className="map-view-stack">
        <div className="map-surface"><MapOverlays plan={plan} /></div>
      </div>
    )
  }

  return (
    <div className="map-view-stack">
      <div className="map-surface trip-replay-surface" aria-label="路线动画回放">
        {basemapState === 'loading' ? (
          <div className="map-state" role="status">正在展开路线动画…</div>
        ) : (
          <Player
            ref={handlePlayerRef}
            component={TripReplay}
            durationInFrames={choreo.totalFrames}
            fps={REPLAY_FPS}
            compositionWidth={REPLAY_CANVAS_WIDTH}
            compositionHeight={REPLAY_CANVAS_HEIGHT}
            controls
            loop={false}
            acknowledgeRemotionLicense
            style={{ width: '100%', height: '100%' }}
            inputProps={{ choreo, title, subtitle, basemapUrl }}
          />
        )}
      </div>
      <MapOverlays plan={plan} />
    </div>
  )
}
