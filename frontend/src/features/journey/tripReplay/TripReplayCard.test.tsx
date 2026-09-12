import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { forwardRef, useImperativeHandle } from 'react'
import type { PlayerRef } from '@remotion/player'
import type * as PlayerModule from '@remotion/player'
import type { Location } from '../../../types'
import type { DayPlan } from '../viewModel'
import { buildRoutedLocations } from '../mapRouting'
import { buildMapCanvasSpec } from './basemap'
import { buildChoreography, frameForDay, frameForLocation, STOP_SETTLE } from './choreography'

// ── @remotion/player 模块级 mock：可合成 frameupdate 事件的假 PlayerRef ──
type FrameListener = (event: { frame: number }) => void
const state = vi.hoisted(() => ({
  seekTo: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  listeners: new Map<string, Array<(event: { detail: { frame: number } }) => void>>(),
  lastProps: null as Record<string, unknown> | null,
}))

vi.mock('@remotion/player', async () => {
  const react = await import('react')
  const MockPlayer = react.forwardRef<PlayerRef, Record<string, unknown>>((props, ref) => {
    state.lastProps = props
    useImperativeHandle(ref, () => ({
      seekTo: state.seekTo,
      play: state.play,
      pause: state.pause,
      toggle: () => undefined,
      getCurrentFrame: () => 0,
      requestFullscreen: () => undefined,
      exitFullscreen: () => undefined,
      isFullscreen: () => false,
      setVolume: () => undefined,
      getVolume: () => 1,
      isMuted: () => false,
      isPlaying: () => false,
      mute: () => undefined,
      unmute: () => undefined,
      pauseAndReturnToPlayStart: () => undefined,
      getContainerNode: () => null,
      getScale: () => 1,
      addEventListener: (name: string, callback: (event: { detail: { frame: number } }) => void) => {
        const list = state.listeners.get(name) ?? []
        list.push(callback)
        state.listeners.set(name, list)
      },
      removeEventListener: (name: string, callback: (event: { detail: { frame: number } }) => void) => {
        const list = (state.listeners.get(name) ?? []).filter(item => item !== callback)
        state.listeners.set(name, list)
      },
      dispatchFrameUpdate: () => undefined,
    } as unknown as PlayerRef))
    return react.createElement('div', { 'data-testid': 'replay-player' })
  })
  MockPlayer.displayName = 'MockPlayer'
  return { Player: MockPlayer } as unknown as typeof PlayerModule
})

import TripReplayCard, { type TripReplayApi } from './TripReplayCard'

function loc(name: string, lng: number, lat: number): Location {
  return { name, lng, lat, address: '', type: 'attraction' }
}

const LOCATIONS: Location[] = [
  loc('沙面', 113.2400, 23.1070),
  loc('广州塔', 113.3246, 23.1064),
  loc('陈家祠', 113.2458, 23.1252),
]

const DAYS: DayPlan[] = [
  {
    day: '2026-10-01', title: '老城',
    items: [{ time: '09:00', description: '上午逛沙面' }, { time: '14:00', description: '下午登广州塔' }],
  },
  {
    day: '2026-10-02', title: '市区',
    items: [{ time: '09:00', description: '陈家祠' }],
  },
]

function makeFixture() {
  const { routed, plan } = buildRoutedLocations(LOCATIONS, DAYS)
  const spec = buildMapCanvasSpec(plan)!
  const choreo = buildChoreography(plan, spec)
  return { routed, plan, choreo }
}

function emitFrame(name: string, frame: number) {
  for (const callback of state.listeners.get(name) ?? []) callback({ detail: { frame } })
}

const fetchMock = vi.fn()

beforeEach(() => {
  state.seekTo.mockClear()
  state.play.mockClear()
  state.pause.mockClear()
  state.listeners.clear()
  state.lastProps = null
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })) })
  vi.stubGlobal('fetch', fetchMock)
  // jsdom 未实现 objectURL：以稳定桩代替
  URL.createObjectURL = vi.fn(() => 'blob:mock-map-url')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TripReplayCard', () => {
  it('底图就绪后装配 Player：时长/帧率/画布/许可确认/inputProps 正确', async () => {
    const { plan, choreo } = makeFixture()
    render(
      <TripReplayCard plan={plan} title="广州 · 2天" subtitle="2 天 · 3 个地点" />,
    )
    await waitFor(() => expect(screen.getByTestId('replay-player')).toBeTruthy())
    const props = state.lastProps
    expect(props).not.toBeNull()
    expect(props!.durationInFrames).toBe(choreo.totalFrames)
    expect(props!.fps).toBe(30)
    expect(props!.compositionWidth).toBe(960)
    expect(props!.compositionHeight).toBe(600)
    expect(props!.acknowledgeRemotionLicense).toBe(true)
    expect(props!.loop).toBe(false)
    const inputProps = props!.inputProps as Record<string, unknown>
    expect(inputProps.title).toBe('广州 · 2天')
    expect(inputProps.subtitle).toBe('2 天 · 3 个地点')
    expect(typeof inputProps.basemapUrl).toBe('string')
    expect(inputProps.basemapUrl).toMatch(/^blob:/)
    // 就绪后自动播放一次（用户选择「默认就带动画」；测试环境 matchMedia 不偏好减少动效）
    await waitFor(() => expect(state.play).toHaveBeenCalled())
  })

  it('frameupdate → onFrameChange(frame, day)', async () => {
    const { plan, choreo } = makeFixture()
    const onFrameChange = vi.fn()
    render(<TripReplayCard plan={plan} title="t" subtitle="s" onFrameChange={onFrameChange} />)
    await waitFor(() => expect(screen.getByTestId('replay-player')).toBeTruthy())
    const day1Frame = frameForDay(choreo, 0)
    emitFrame('frameupdate', day1Frame + 3)
    expect(onFrameChange).toHaveBeenCalledWith(day1Frame + 3, 0)
    emitFrame('seeked', choreo.outroStartFrame + 5)
    expect(onFrameChange).toHaveBeenCalledWith(choreo.outroStartFrame + 5, null)
  })

  it('onReady API：seekToDay / seekToLocation 走对帧与动作', async () => {
    const { routed, plan, choreo } = makeFixture()
    let api: TripReplayApi | null = null
    render(<TripReplayCard plan={plan} title="t" subtitle="s" onReady={instance => { api = instance }} />)
    await waitFor(() => expect(api).not.toBeNull())
    state.play.mockClear()

    api!.seekToDay(1)
    expect(state.seekTo).toHaveBeenCalledWith(frameForDay(choreo, 1))
    expect(state.play).toHaveBeenCalled()

    state.play.mockClear()
    state.pause.mockClear()
    api!.seekToDay(null)
    expect(state.seekTo).toHaveBeenCalledWith(choreo.outroStartFrame)
    expect(state.pause).toHaveBeenCalled()
    expect(state.play).not.toHaveBeenCalled()

    const firstStop = choreo.segments[0].stops[0]
    expect(routed.some(item => item.key === firstStop.key)).toBe(true)
    state.seekTo.mockClear()
    state.pause.mockClear()
    expect(api!.seekToLocation(firstStop.key)).toBe(true)
    expect(state.seekTo).toHaveBeenCalledTimes(1)
    expect(state.seekTo).toHaveBeenCalledWith(frameForLocation(choreo, firstStop.key))
    expect(state.pause).toHaveBeenCalled()

    // 未知 key：返回 false 且不产生新的 seek
    expect(api!.seekToLocation('不存在:0:0')).toBe(false)
    expect(state.seekTo).toHaveBeenCalledTimes(1)
  })

  it('底图请求失败 → basemapUrl=null 降级，Player 仍渲染', async () => {
    const { plan } = makeFixture()
    fetchMock.mockResolvedValue({ ok: false, blob: () => Promise.reject(new Error('no')) })
    render(<TripReplayCard plan={plan} title="t" subtitle="s" />)
    await waitFor(() => expect(screen.getByTestId('replay-player')).toBeTruthy())
    const inputProps = state.lastProps!.inputProps as Record<string, unknown>
    expect(inputProps.basemapUrl).toBeNull()
  })

  it('无可定位地点 → 只渲染空态，不装配 Player', () => {
    const { plan } = buildRoutedLocations(
      [{ name: '坏坐标', lng: Number.NaN, lat: 23, address: '', type: 'other' }],
      DAYS,
    )
    render(<TripReplayCard plan={plan} title="t" subtitle="s" />)
    expect(screen.getByText('当前行程暂无可定位地点')).toBeTruthy()
    expect(screen.queryByTestId('replay-player')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
