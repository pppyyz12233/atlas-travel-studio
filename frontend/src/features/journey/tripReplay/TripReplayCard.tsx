import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Player, type PlayerRef } from '@remotion/player'
import { Maximize2, Minimize2, Pause, Play, X } from 'lucide-react'
import MapOverlays from '../../../components/MapOverlays'
import type { MapRenderPlan } from '../mapRouting'
import { REPLAY_CANVAS_WIDTH, REPLAY_CANVAS_HEIGHT, buildMapCanvasSpec, buildStitchTiles } from './basemap'
import type { ReplayChoreography } from './choreography'
import {
  REPLAY_FPS, buildChoreography, frameForDay, frameForLocation, dayAtFrame,
} from './choreography'
import TripReplay from './TripReplay'

// ============================================================
// 路线动画卡片 v2：页面级 React.lazy 入口（remotion 独立 chunk）。
// 形态：poster（outro 静帧+播放钮）→ playing ⇄ paused → ended；
// IntersectionObserver 进入视口自动播放一次、离开暂停。
// 剧场模式：同一个 Player 不卸载，shell 加 is-theater 定 fullscreen。
// 底图三级：L0 示意 → L1 单图 → L2 四图拼接翻密度（条件后台升级）。
// ============================================================

export interface TripReplayApi {
  /** n → seek 该天段（转场后）并播放；null → 「全部」= outro 全图静帧 */
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
type UiState = 'poster' | 'playing' | 'paused' | 'ended'

function prefersReducedMotion(): boolean {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
}

/** blob → 已解码的 HTMLImageElement（L2 拼接用） */
function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image decode failed')) }
    img.src = url
  })
}

export default function TripReplayCard({ plan, title, subtitle, onFrameChange, onReady }: TripReplayCardProps) {
  const spec = useMemo(() => buildMapCanvasSpec(plan), [plan])
  const choreo = useMemo<ReplayChoreography | null>(
    () => (spec ? buildChoreography(plan, spec) : null),
    [spec, plan],
  )

  const playerRef = useRef<PlayerRef | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const [playerReady, setPlayerReady] = useState(false)
  const [basemapUrl, setBasemapUrl] = useState<string | null>(null)
  const [basemapState, setBasemapState] = useState<'loading' | 'ready' | 'fallback'>('loading')
  const [basemapHiUrl, setBasemapHiUrl] = useState<string | null>(null)
  const [hiSinceFrame, setHiSinceFrame] = useState<number | null>(null)
  const [hiArmed, setHiArmed] = useState(false)
  const [uiState, setUiState] = useState<UiState>('poster')
  const [frame, setFrame] = useState(0)
  const [theater, setTheater] = useState(false)
  const [rate, setRate] = useState<1 | 1.5>(1)
  const pendingRef = useRef<PendingAction | null>(null)
  const autoplayedRef = useRef(false)
  const hasPlayedRef = useRef(false)
  const hiStartedRef = useRef(false)
  const scrubWasPlayingRef = useRef(false)

  const frameChangeRef = useRef(onFrameChange)
  const readyRef = useRef(onReady)
  const choreoRef = useRef(choreo)
  frameChangeRef.current = onFrameChange
  readyRef.current = onReady
  choreoRef.current = choreo

  const setPlaying = useCallback(() => {
    hasPlayedRef.current = true
    setUiState('playing')
  }, [])

  // ── L1 底图：单图 960×600@scale2（失败 → L0 示意地面，动画照常） ──
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

  // ── L2 拼接：先「武装」再加载。武装条件（播放过/开剧场）经 uiState/theater 变化驱动重查；
  //    加载 effect 只依赖 [spec, 就绪, 武装]——暂停/拖动/剧场开关不会取消在途拼接 ──
  useEffect(() => {
    if (hiArmed || basemapState !== 'ready') return
    if (hasPlayedRef.current || theater) setHiArmed(true)
  }, [hiArmed, basemapState, theater, uiState])

  // spec 变更（会话切换未 remount 的场景）：重置 L2，防止上一个城市的高清底图残留
  useEffect(() => {
    setBasemapHiUrl(null)
    setHiSinceFrame(null)
    hiStartedRef.current = false
    setHiArmed(false)
  }, [spec])

  useEffect(() => {
    if (!spec || basemapState !== 'ready' || !hiArmed || hiStartedRef.current) return undefined
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    if (connection && (connection.saveData || /(^|\b)2g/.test(connection.effectiveType ?? ''))) return undefined
    hiStartedRef.current = true
    let objectUrl: string | null = null
    let cancelled = false
    let idleHandle: number | null = null
    const idle = (callback: () => void) => {
      if (typeof window.requestIdleCallback === 'function') idleHandle = window.requestIdleCallback(callback, { timeout: 4000 })
      else idleHandle = window.setTimeout(callback, 1500)
    }
    idle(() => {
      if (cancelled) return
      const tiles = buildStitchTiles(spec)
      if (tiles.length === 0) return
      Promise.all(tiles.map(tile =>
        fetch(tile.url).then(response => {
          if (!response.ok) throw new Error(`tile ${response.status}`)
          return response.blob()
        }).then(loadImage)))
        .then(images => {
          if (cancelled) return
          const canvas = document.createElement('canvas')
          canvas.width = REPLAY_CANVAS_WIDTH * 2
          canvas.height = REPLAY_CANVAS_HEIGHT * 2
          const ctx = canvas.getContext('2d')
          if (!ctx) return
          for (const tile of tiles) {
            const image = images[tiles.indexOf(tile)]
            ctx.drawImage(image, tile.x, tile.y, REPLAY_CANVAS_WIDTH, REPLAY_CANVAS_HEIGHT)
          }
          canvas.toBlob(blob => {
            if (cancelled || !blob) return
            objectUrl = URL.createObjectURL(blob)
            setBasemapHiUrl(objectUrl)
            setHiSinceFrame(playerRef.current?.getCurrentFrame() ?? 0)
          }, 'image/png')
        })
        .catch(() => { /* L2 失败整级放弃，保持 L1 */ })
    })
    return () => {
      cancelled = true
      if (idleHandle !== null) {
        if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleHandle)
        else window.clearTimeout(idleHandle)
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [spec, basemapState, hiArmed])

  // ── Player 事件 → 帧回流 / ended ──
  useEffect(() => {
    const player = playerRef.current
    if (!playerReady || !player || !choreo) return undefined
    const emit = (f: number) => {
      setFrame(f)
      frameChangeRef.current?.(f, dayAtFrame(choreoRef.current!, f))
    }
    const onFrameUpdate = (event: { detail: { frame: number } }) => emit(event.detail.frame)
    const onSeeked = (event: { detail: { frame: number } }) => emit(event.detail.frame)
    const onPlay = () => setPlaying()
    const onPause = () => setUiState(current => (current === 'ended' ? current : 'paused'))
    const onEnded = () => setUiState('ended')
    player.addEventListener('frameupdate', onFrameUpdate)
    player.addEventListener('seeked', onSeeked)
    player.addEventListener('play', onPlay)
    player.addEventListener('pause', onPause)
    player.addEventListener('ended', onEnded)
    return () => {
      player.removeEventListener('frameupdate', onFrameUpdate)
      player.removeEventListener('seeked', onSeeked)
      player.removeEventListener('play', onPlay)
      player.removeEventListener('pause', onPause)
      player.removeEventListener('ended', onEnded)
    }
  }, [playerReady, choreo, setPlaying])

  // ── 就绪：poster 初始帧 + 补发 pending + 发布 API ──
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
      const f = frameForLocation(choreo, pending.key)
      if (f !== null) {
        player.seekTo(f)
        player.pause()
      }
    } else {
      player.seekTo(frameForDay(choreo, null))
      player.pause()
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
        const f = frameForLocation(current, key)
        if (f === null) return false
        if (!target) {
          pendingRef.current = { type: 'location', key }
          return false
        }
        target.seekTo(f)
        target.pause()
        return true
      },
      seekToFrame: (f: number) => playerRef.current?.seekTo(f),
      play: () => playerRef.current?.play(),
      pause: () => playerRef.current?.pause(),
    })
  }, [playerReady, choreo])

  // ── 进入视口自动播放一次 / 离开暂停 / 页面隐藏暂停 ──
  useEffect(() => {
    const shell = shellRef.current
    if (!shell || !choreo || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.intersectionRatio >= 0.5) {
          if (!autoplayedRef.current && !prefersReducedMotion() && basemapState !== 'loading') {
            autoplayedRef.current = true
            const player = playerRef.current
            if (player) {
              player.seekTo(0)
              player.play()
            }
          }
        } else if (entry.intersectionRatio < 0.25) {
          const player = playerRef.current
          if (player?.isPlaying()) player.pause()
        }
      }
    }, { threshold: [0, 0.25, 0.5] })
    observer.observe(shell)
    const onVisibility = () => {
      if (document.hidden) {
        const player = playerRef.current
        if (player?.isPlaying()) player.pause()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [choreo, basemapState])

  // ── 剧场：Esc 关闭 + body 滚动锁定 ──
  useEffect(() => {
    if (!theater) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTheater(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [theater])

  const restart = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    player.seekTo(0)
    player.play()
  }, [])

  const togglePlay = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    if (player.isPlaying()) player.pause()
    else if (player.getCurrentFrame() >= (choreoRef.current?.totalFrames ?? Infinity) - 1) restart()
    else player.play()
  }, [restart])

  const handlePlayerRef = useCallback((node: PlayerRef | null) => {
    playerRef.current = node
    setPlayerReady(Boolean(node))
  }, [])

  // scrubber 拖动：起手暂停，松手恢复
  const scrubStart = useCallback(() => {
    const player = playerRef.current
    scrubWasPlayingRef.current = Boolean(player?.isPlaying())
    if (scrubWasPlayingRef.current) player?.pause()
  }, [])
  const scrubEnd = useCallback(() => {
    if (scrubWasPlayingRef.current) playerRef.current?.play()
    scrubWasPlayingRef.current = false
  }, [])
  const scrubSeek = useCallback((target: number) => {
    const current = choreoRef.current
    if (!current) return
    const clamped = Math.max(0, Math.min(current.totalFrames - 1, Math.round(target)))
    playerRef.current?.seekTo(clamped)
  }, [])

  // 合成 inputProps 必须稳定：30fps 帧回流每帧重渲染卡片，对象字面量会让合成跟着无谓重渲染
  //（hook 位于早退 return 之前，choreo 在此仍可空——Player 只在非空时渲染）
  const inputProps = useMemo(
    () => ({ choreo: choreo as ReplayChoreography, title, subtitle, basemapUrl, basemapHiUrl, hiSinceFrame }),
    [choreo, title, subtitle, basemapUrl, basemapHiUrl, hiSinceFrame],
  )

  if (!choreo || !spec) {
    return (
      <div className="map-view-stack">
        <div className="map-surface"><MapOverlays plan={plan} /></div>
      </div>
    )
  }

  const showPoster = uiState === 'poster' || uiState === 'ended'
  const showScrubber = basemapState !== 'loading' && !showPoster

  return (
    <div className={`trip-replay-card${theater ? ' is-theater' : ''}`}>
      <div className="map-view-stack">
        <div className="map-surface tr-shell" ref={shellRef} role="region" aria-label="路线动画回放">
          <Player
            ref={handlePlayerRef}
            component={TripReplay}
            durationInFrames={choreo.totalFrames}
            fps={REPLAY_FPS}
            compositionWidth={REPLAY_CANVAS_WIDTH}
            compositionHeight={REPLAY_CANVAS_HEIGHT}
            controls={false}
            clickToPlay={false}
            doubleClickToFullscreen={false}
            spaceKeyToPlayOrPause={false}
            loop={false}
            playbackRate={rate}
            acknowledgeRemotionLicense
            style={{ width: '100%', height: '100%' }}
            inputProps={inputProps}
          />

          {basemapState === 'loading' && (
            <div className="tr-loading" role="status"><span className="map-loader" />正在展开路线动画…</div>
          )}

          {showPoster && basemapState !== 'loading' && (
            <button type="button" className="tr-poster" onClick={restart} aria-label="播放行程动画">
              <span className="tr-poster-btn"><Play size={26} aria-hidden="true" /></span>
              <span className="tr-poster-hint">{uiState === 'ended' ? '重播行程动画' : '播放行程动画'}</span>
            </button>
          )}

          {showScrubber && (
            <ReplayScrubber
              choreo={choreo}
              frame={frame}
              expanded={theater}
              playing={uiState === 'playing'}
              onTogglePlay={togglePlay}
              onSeek={scrubSeek}
              onScrubStart={scrubStart}
              onScrubEnd={scrubEnd}
            />
          )}

          <div className="tr-topbar">
            <button
              type="button"
              className="tr-theater-btn"
              onClick={() => { hasPlayedRef.current = true; setTheater(current => !current) }}
              aria-label={theater ? '退出全屏' : '全屏播放'}
              title={theater ? '退出全屏' : '全屏播放'}
            >
              {theater ? <Minimize2 size={15} aria-hidden="true" /> : <Maximize2 size={15} aria-hidden="true" />}
            </button>
            {theater && (
              <button type="button" className="tr-theater-btn" onClick={() => setTheater(false)} aria-label="关闭全屏" title="关闭 (Esc)">
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          {theater && (
            <button type="button" className="tr-rate-btn" onClick={() => setRate(current => (current === 1 ? 1.5 : 1))}>
              {rate}×
            </button>
          )}
        </div>
        {!theater && <MapOverlays plan={plan} />}
      </div>
    </div>
  )
}

function ReplayScrubber({ choreo, frame, expanded, playing, onTogglePlay, onSeek, onScrubStart, onScrubEnd }: {
  choreo: ReplayChoreography
  frame: number
  expanded: boolean
  playing: boolean
  onTogglePlay: () => void
  onSeek: (frame: number) => void
  onScrubStart: () => void
  onScrubEnd: () => void
}) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const total = Math.max(choreo.totalFrames - 1, 1)
  const progress = Math.min(100, Math.max(0, (frame / total) * 100))
  const chapters = choreo.segments.filter(segment => segment.day !== null)

  const seekFromPointer = useCallback((clientX: number) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    onSeek(ratio * total)
  }, [onSeek, total])

  return (
    <div className={`tr-scrubber${expanded ? ' is-expanded' : ''}`} onClick={event => event.stopPropagation()}>
      {expanded && (
        <button type="button" className="tr-play-btn" onClick={onTogglePlay} aria-label={playing ? '暂停' : '播放'}>
          {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        </button>
      )}
      <div className="tr-track-wrap">
        <div
          ref={trackRef}
          className="tr-track"
          role="slider"
          tabIndex={0}
          aria-label="动画进度"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={frame}
          onPointerDown={event => {
            event.currentTarget.setPointerCapture(event.pointerId)
            onScrubStart()
            seekFromPointer(event.clientX)
          }}
          onPointerMove={event => {
            if (event.buttons > 0) seekFromPointer(event.clientX)
          }}
          onPointerUp={event => {
            event.currentTarget.releasePointerCapture(event.pointerId)
            onScrubEnd()
          }}
          onPointerCancel={() => onScrubEnd()}
          onKeyDown={event => {
            if (event.key === 'ArrowLeft') { onScrubStart(); onSeek(frame - REPLAY_FPS); onScrubEnd() }
            if (event.key === 'ArrowRight') { onScrubStart(); onSeek(frame + REPLAY_FPS); onScrubEnd() }
          }}
        >
          <div className="tr-fill" style={{ width: `${progress}%` }} />
          {chapters.map(segment => (
            <button
              key={`tick-${segment.day}`}
              type="button"
              className="tr-tick"
              style={{ left: `${(segment.startFrame / total) * 100}%` }}
              title={`第 ${(segment.day ?? 0) + 1} 天`}
              aria-label={`跳到第 ${(segment.day ?? 0) + 1} 天`}
              onClick={event => {
                event.stopPropagation()
                onSeek(segment.startFrame + 21)
                onScrubEnd()
              }}
            />
          ))}
          <div className="tr-playhead" style={{ left: `${progress}%` }} />
        </div>
        {expanded && chapters.length > 0 && (
          <div className="tr-chapter-labels">
            {chapters.map(segment => (
              <span key={`label-${segment.day}`} style={{ left: `${(segment.startFrame / total) * 100}%` }}>
                D{(segment.day ?? 0) + 1}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
