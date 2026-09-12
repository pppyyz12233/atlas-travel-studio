import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef, useImperativeHandle } from 'react'
import type { PlayerRef } from '@remotion/player'
import type * as PlayerModule from '@remotion/player'
import type { Location } from '../../../types'
import type { DayPlan } from '../viewModel'
import { buildRoutedLocations } from '../mapRouting'
import { buildMapCanvasSpec } from './basemap'
import { buildChoreography, frameForDay, frameForLocation } from './choreography'

// ── @remotion/player 模块级 mock：可合成 frameupdate/play/ended 事件的假 PlayerRef ──
const state = vi.hoisted(() => ({
  seekTo: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  isPlaying: vi.fn(() => false),
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
      isPlaying: state.isPlaying,
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

function emit(name: string, event: { detail: { frame: number } }) {
  for (const callback of state.listeners.get(name) ?? []) callback(event)
}

const fetchMock = vi.fn()

beforeEach(() => {
  state.seekTo.mockClear()
  state.play.mockClear()
  state.pause.mockClear()
  state.isPlaying.mockClear()
  state.isPlaying.mockReturnValue(false)
  state.listeners.clear()
  state.lastProps = null
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })) })
  vi.stubGlobal('fetch', fetchMock)
  URL.createObjectURL = vi.fn(() => 'blob:mock-map-url')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TripReplayCard v2', () => {
  it('就绪后：Player 无原生控件、poster 初始帧 = outro 静帧、inputProps 带底图', async () => {
    const { plan, choreo } = makeFixture()
    render(<TripReplayCard plan={plan} title="广州 · 2天" subtitle="2 天 · 3 个地点" />)
    await waitFor(() => expect(screen.getByTestId('replay-player')).toBeTruthy())
    const props = state.lastProps
    expect(props).not.toBeNull()
    expect(props!.durationInFrames).toBe(choreo.totalFrames)
    expect(props!.fps).toBe(30)
    expect(props!.compositionWidth).toBe(960)
    expect(props!.compositionHeight).toBe(600)
    expect(props!.controls).toBe(false)
    expect(props!.clickToPlay).toBe(false)
    expect(props!.acknowledgeRemotionLicense).toBe(true)
    const inputProps = props!.inputProps as Record<string, unknown>
    expect(inputProps.title).toBe('广州 · 2天')
    expect(inputProps.basemapUrl).toMatch(/^blob:/)
    expect(inputProps.basemapHiUrl).toBeNull()
    expect(inputProps.hiSinceFrame).toBeNull()
    // poster 初始：seek 到 outro 静帧并暂停，不自动播放（jsdom 无 IntersectionObserver）
    await waitFor(() => expect(state.seekTo).toHaveBeenCalledWith(choreo.totalFrames - 1))
    expect(state.pause).toHaveBeenCalled()
    expect(state.play).not.toHaveBeenCalled()
    // poster 播放钮出现（底图就绪后）
    expect(await screen.findByRole('button', { name: '播放行程动画' })).toBeInTheDocument()
  })

  it('poster 播放钮 → 从头播放', async () => {
    const user = userEvent.setup()
    const { plan, choreo } = makeFixture()
    render(<TripReplayCard plan={plan} title="t" subtitle="s" />)
    const button = await screen.findByRole('button', { name: '播放行程动画' })
    state.seekTo.mockClear()
    state.play.mockClear()
    await user.click(button)
    expect(state.seekTo).toHaveBeenCalledWith(0)
    expect(state.play).toHaveBeenCalled()
    expect(choreo.totalFrames).toBeGreaterThan(0)
  })

  it('frameupdate → onFrameChange(frame, day)；play/pause/ended 驱动 UI 状态', async () => {
    const { plan, choreo } = makeFixture()
    const onFrameChange = vi.fn()
    render(<TripReplayCard plan={plan} title="t" subtitle="s" onFrameChange={onFrameChange} />)
    await waitFor(() => expect(screen.getByTestId('replay-player')).toBeTruthy())
    const day1Frame = frameForDay(choreo, 0)
    emit('frameupdate', { detail: { frame: day1Frame + 3 } })
    expect(onFrameChange).toHaveBeenCalledWith(day1Frame + 3, 0)
    emit('seeked', { detail: { frame: choreo.outroStartFrame + 5 } })
    expect(onFrameChange).toHaveBeenCalledWith(choreo.outroStartFrame + 5, null)
    // play 事件 → scrubber 出现（poster 覆盖层让位）
    emit('play', undefined as unknown as { detail: { frame: number } })
    await waitFor(() => expect(screen.getByRole('slider', { name: '动画进度' })).toBeInTheDocument())
  })

  it('onReady API：seekToDay / seekToLocation 走对帧与动作', async () => {
    const { routed, plan, choreo } = makeFixture()
    let api: TripReplayApi | null = null
    render(<TripReplayCard plan={plan} title="t" subtitle="s" onReady={instance => { api = instance }} />)
    await waitFor(() => expect(api).not.toBeNull())
    state.seekTo.mockClear()
    state.play.mockClear()
    state.pause.mockClear()

    api!.seekToDay(1)
    expect(state.seekTo).toHaveBeenCalledWith(frameForDay(choreo, 1))
    expect(state.play).toHaveBeenCalled()

    state.play.mockClear()
    api!.seekToDay(null)
    expect(state.seekTo).toHaveBeenCalledWith(choreo.totalFrames - 1)
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

    expect(api!.seekToLocation('不存在:0:0')).toBe(false)
    expect(state.seekTo).toHaveBeenCalledTimes(1)
  })

  it('底图请求失败 → basemapUrl=null 降级，Player 仍渲染且 poster 可用', async () => {
    const { plan } = makeFixture()
    fetchMock.mockResolvedValue({ ok: false, blob: () => Promise.reject(new Error('no')) })
    render(<TripReplayCard plan={plan} title="t" subtitle="s" />)
    await waitFor(() => expect(screen.getByTestId('replay-player')).toBeTruthy())
    const inputProps = state.lastProps!.inputProps as Record<string, unknown>
    expect(inputProps.basemapUrl).toBeNull()
    expect(await screen.findByRole('button', { name: '播放行程动画' })).toBeInTheDocument()
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

  it('剧场按钮：点击后 shell 进入 is-theater 并出现关闭钮', async () => {
    const user = userEvent.setup()
    const { plan } = makeFixture()
    const { container } = render(<TripReplayCard plan={plan} title="t" subtitle="s" />)
    await waitFor(() => expect(screen.getByTestId('replay-player')).toBeTruthy())
    const openButton = screen.getByRole('button', { name: '全屏播放' })
    await user.click(openButton)
    expect(container.querySelector('.trip-replay-card')!.classList.contains('is-theater')).toBe(true)
    const closeButton = screen.getByRole('button', { name: '关闭全屏' })
    await user.click(closeButton)
    expect(container.querySelector('.trip-replay-card')!.classList.contains('is-theater')).toBe(false)
  })
})
