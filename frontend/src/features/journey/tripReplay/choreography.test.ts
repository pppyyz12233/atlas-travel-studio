import { describe, expect, it } from 'vitest'
import type { Location } from '../../../types'
import type { DayPlan } from '../viewModel'
import { buildRoutedLocations } from '../mapRouting'
import { buildMapCanvasSpec } from './basemap'
import {
  DAY_DWELL, DRAW_MAX, DRAW_MIN, INTRO_FRAMES, MAX_TOTAL_FRAMES, OUTRO_FRAMES,
  SINGLE_STOP_DRAW, STOP_SETTLE,
  buildChoreography, cameraAt, dayAtFrame, frameForDay, frameForLocation,
} from './choreography'

function loc(name: string, lng: number, lat: number): Location {
  return { name, lng, lat, address: '', type: 'attraction' }
}

// 三天两城内行程：D1 三点折线、D2 两点折线、D3 单点（无折线）、外加一个未排期点
const LOCATIONS: Location[] = [
  loc('沙面', 113.2400, 23.1070),
  loc('广州塔', 113.3246, 23.1064),
  loc('白云山', 113.2990, 23.1860),
  loc('陈家祠', 113.2458, 23.1252),
  loc('越秀公园', 113.2620, 23.1440),
  loc('珠江新城', 113.3220, 23.1190),
  loc('未排期码头', 113.3100, 23.0950),
]

const DAYS: DayPlan[] = [
  {
    day: '2026-10-01', title: '老城',
    items: [
      { time: '09:00', description: '上午逛沙面' },
      { time: '14:00', description: '下午登广州塔' },
      { time: '17:00', description: '傍晚白云山' },
    ],
  },
  {
    day: '2026-10-02', title: '市区',
    items: [
      { time: '09:00', description: '陈家祠看岭南建筑' },
      { time: '14:00', description: '越秀公园五羊' },
    ],
  },
  {
    day: '2026-10-03', title: '单点',
    items: [{ time: '10:00', description: '珠江新城逛街' }],
  },
]

function makeChoreo() {
  const { plan } = buildRoutedLocations(LOCATIONS, DAYS)
  const spec = buildMapCanvasSpec(plan)!
  return { plan, spec, choreo: buildChoreography(plan, spec) }
}

describe('buildChoreography 时间线不变量', () => {
  const { choreo } = makeChoreo()

  it('段布局：首段 = INTRO；段段相接；endFrame 恒等式', () => {
    expect(choreo.segments[0].startFrame).toBe(INTRO_FRAMES)
    for (let i = 0; i < choreo.segments.length; i += 1) {
      const segment = choreo.segments[i]
      expect(segment.endFrame).toBe(segment.startFrame + segment.drawFrames + segment.dwellFrames)
      if (i > 0) expect(segment.startFrame).toBe(choreo.segments[i - 1].endFrame)
    }
    expect(choreo.segments.map(segment => segment.day)).toEqual([0, 1, 2, null])
  })

  it('drawFrames 值域：有折线 ∈ [DRAW_MIN, DRAW_MAX]；单点天 = SINGLE_STOP_DRAW', () => {
    const [d1, d2, d3, tail] = choreo.segments
    expect(d1.tipPoints.length).toBeGreaterThanOrEqual(2)
    expect(d1.drawFrames).toBeGreaterThanOrEqual(DRAW_MIN)
    expect(d1.drawFrames).toBeLessThanOrEqual(DRAW_MAX)
    expect(d2.drawFrames).toBeGreaterThanOrEqual(DRAW_MIN)
    expect(d2.tipPoints.length).toBeGreaterThanOrEqual(2)
    // D3 只有一个地点 → 无折线 → SINGLE_STOP_DRAW
    expect(d3.tipPoints).toHaveLength(0)
    expect(d3.drawFrames).toBe(SINGLE_STOP_DRAW)
    expect(d3.dwellFrames).toBe(DAY_DWELL)
    expect(tail.day).toBeNull()
  })

  it('outro/total 恒等式与上限', () => {
    const last = choreo.segments[choreo.segments.length - 1]
    expect(choreo.outroStartFrame).toBe(last.endFrame)
    expect(choreo.totalFrames).toBe(choreo.outroStartFrame + OUTRO_FRAMES)
    expect(choreo.totalFrames).toBeLessThanOrEqual(MAX_TOTAL_FRAMES)
  })

  it('停靠点：按 popFrame/progress 升序、落在段内、首停 = startFrame', () => {
    for (const segment of choreo.segments) {
      const pops = segment.stops.map(stop => stop.popFrame)
      const sorted = [...pops].sort((a, b) => a - b)
      expect(pops).toEqual(sorted)
      for (const pop of pops) {
        expect(pop).toBeGreaterThanOrEqual(segment.startFrame)
        expect(pop).toBeLessThan(segment.endFrame)
      }
      if (segment.stops.length > 0 && segment.tipPoints.length >= 2) {
        expect(segment.stops[0].popFrame).toBe(segment.startFrame)
      }
    }
  })

  it('seek 往返：frameForDay↔dayAtFrame；frameForLocation = popFrame + STOP_SETTLE；未知 → null/0', () => {
    for (const day of [0, 1, 2]) {
      expect(dayAtFrame(choreo, frameForDay(choreo, day))).toBe(day)
    }
    expect(frameForDay(choreo, null)).toBe(choreo.outroStartFrame)
    expect(frameForDay(choreo, 99)).toBe(0)
    expect(dayAtFrame(choreo, 0)).toBeNull()
    expect(dayAtFrame(choreo, choreo.totalFrames - 1)).toBeNull()

    for (const segment of choreo.segments) {
      for (const stop of segment.stops) {
        expect(frameForLocation(choreo, stop.key)).toBe(stop.popFrame + STOP_SETTLE)
      }
    }
    expect(frameForLocation(choreo, '沙面:9999:9999')).toBeNull()
  })

  it('相机关键帧：帧严格递增、首尾 = 全图、zoomScale ∈ [1,3]', () => {
    const frames = choreo.cameraKeyframes.map(keyframe => keyframe.frame)
    for (let i = 1; i < frames.length; i += 1) {
      expect(frames[i]).toBeGreaterThan(frames[i - 1])
    }
    expect(frames[0]).toBe(0)
    expect(frames[frames.length - 1]).toBe(choreo.totalFrames - 1)
    expect(choreo.cameraKeyframes[0]).toEqual({ frame: 0, cx: 480, cy: 300, zoomScale: 1 })
    expect(choreo.cameraKeyframes[frames.length - 1])
      .toEqual({ frame: choreo.totalFrames - 1, cx: 480, cy: 300, zoomScale: 1 })
    for (const keyframe of choreo.cameraKeyframes) {
      expect(keyframe.zoomScale).toBeGreaterThanOrEqual(1)
      expect(keyframe.zoomScale).toBeLessThanOrEqual(3)
    }
  })
})

describe('cameraAt 逐段行为', () => {
  const { choreo } = makeChoreo()

  it('开场静止与收尾拉远都是全图', () => {
    expect(cameraAt(choreo, 0)).toEqual({ cx: 480, cy: 300, zoomScale: 1 })
    expect(cameraAt(choreo, 10)).toEqual({ cx: 480, cy: 300, zoomScale: 1 })
    const end = cameraAt(choreo, choreo.totalFrames - 1)
    expect(end.zoomScale).toBe(1)
    expect(end.cx).toBeCloseTo(480, 3)
    expect(end.cy).toBeCloseTo(300, 3)
  })

  it('段内跟拍：段首帧镜头中心贴住首停位置（差不超过半屏）', () => {
    const first = choreo.segments[0]
    const camera = cameraAt(choreo, first.startFrame)
    expect(camera.zoomScale).toBeGreaterThan(1)
    const stop = first.stops[0]
    expect(Math.hypot(camera.cx - stop.x, camera.cy - stop.y)).toBeLessThan(480 / camera.zoomScale)
  })

  it('钳制：镜头可视矩形始终在画布内', () => {
    for (let frame = 0; frame < choreo.totalFrames; frame += 3) {
      const camera = cameraAt(choreo, frame)
      const halfW = 480 / camera.zoomScale
      const halfH = 300 / camera.zoomScale
      expect(camera.cx - halfW).toBeGreaterThanOrEqual(-0.001)
      expect(camera.cx + halfW).toBeLessThanOrEqual(960.001)
      expect(camera.cy - halfH).toBeGreaterThanOrEqual(-0.001)
      expect(camera.cy + halfH).toBeLessThanOrEqual(600.001)
    }
  })
})

describe('退化输入', () => {
  it('纯未排期：单一 day=null 段，无折线', () => {
    const { plan } = buildRoutedLocations(LOCATIONS, [])
    const spec = buildMapCanvasSpec(plan)!
    const choreo = buildChoreography(plan, spec)
    expect(choreo.segments).toHaveLength(1)
    expect(choreo.segments[0].day).toBeNull()
    expect(choreo.segments[0].tipPoints).toHaveLength(0)
    expect(choreo.totalFrames).toBe(INTRO_FRAMES + choreo.segments[0].drawFrames + DAY_DWELL + OUTRO_FRAMES)
  })

  it('排期单点天：无折线段 drawFrames = SINGLE_STOP_DRAW', () => {
    const { plan } = buildRoutedLocations(
      [loc('陈家祠', 113.2458, 23.1252)],
      [{ day: '2026-10-01', title: '单日', items: [{ time: '09:00', description: '陈家祠' }] }],
    )
    const spec = buildMapCanvasSpec(plan)!
    const choreo = buildChoreography(plan, spec)
    expect(choreo.segments).toHaveLength(1)
    expect(choreo.segments[0].day).toBe(0)
    expect(choreo.segments[0].drawFrames).toBe(SINGLE_STOP_DRAW)
  })
})
