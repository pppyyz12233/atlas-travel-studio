import { describe, expect, it } from 'vitest'
import type { Location } from '../../../types'
import type { DayPlan } from '../viewModel'
import { buildRoutedLocations } from '../mapRouting'
import { buildMapCanvasSpec } from './basemap'
import {
  ANCHOR_FOLLOW, ANCHOR_WIDE, DAY_DWELL, DRAW_MAX, DRAW_MIN, INTRO_FRAMES, MAX_TOTAL_FRAMES,
  OUTRO_FRAMES, SEGMENT_TRANSITION, SINGLE_STOP_DRAW, STOP_SETTLE, TILT_FOLLOW, TILT_WIDE,
  buildChoreography, cameraAt, dayAtFrame, frameForDay, frameForLocation,
} from './choreography'

function loc(name: string, lng: number, lat: number): Location {
  return { name, lng, lat, address: '', type: 'attraction' }
}

// 三天行程：D1 三点折线、D2 两点折线、D3 单点（无折线）、外加一个未排期点
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

  it('seek 往返：frameForDay = 段首+转场+3；frameForLocation = popFrame + STOP_SETTLE；未知 → null/0', () => {
    for (const day of [0, 1, 2]) {
      const target = frameForDay(choreo, day)
      const segment = choreo.segments.find(item => item.day === day)!
      expect(target).toBe(segment.startFrame + SEGMENT_TRANSITION + 3)
      expect(dayAtFrame(choreo, target)).toBe(day)
    }
    // 「全部」= outro 静帧（rest 期内，倒数第一帧）
    expect(frameForDay(choreo, null)).toBe(choreo.totalFrames - 1)
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
})

describe('cameraAt v2 分镜', () => {
  const { choreo } = makeChoreo()
  const first = choreo.segments[0]

  it('开场静止与收尾都是全图广角（tilt 42 / zoom 1 / 锚点居中）', () => {
    expect(cameraAt(choreo, 0)).toEqual({ cx: 480, cy: 300, zoom: 1, tilt: TILT_WIDE, ax: 480, ay: 300 })
    const end = cameraAt(choreo, choreo.totalFrames - 1)
    expect(end).toEqual({ cx: 480, cy: 300, zoom: 1, tilt: TILT_WIDE, ax: 480, ay: 300 })
  })

  it('俯冲：tilt 单调 42→55；zoom 先微拉（<1）再扎向 followZoom；锚点 ay → 348', () => {
    const mid = cameraAt(choreo, 18 + 10)
    expect(mid.tilt).toBeGreaterThan(TILT_WIDE)
    expect(mid.tilt).toBeLessThan(TILT_FOLLOW)
    expect(mid.zoom).toBeLessThan(1) // 微拉段
    expect(mid.ay).toBeGreaterThan(300)
    const settled = cameraAt(choreo, choreo.introEndFrame)
    expect(settled.tilt).toBeCloseTo(TILT_FOLLOW, 5)
    expect(settled.ay).toBe(ANCHOR_FOLLOW.ay)
  })

  it('跟拍：段中 tilt=55、锚点 (480,348)、镜头在首停附近；跳变帧无 hop', () => {
    const camera = cameraAt(choreo, first.startFrame + SEGMENT_TRANSITION + 10)
    expect(camera.tilt).toBeCloseTo(TILT_FOLLOW, 6)
    expect(camera.ax).toBe(ANCHOR_FOLLOW.ax)
    expect(camera.ay).toBe(ANCHOR_FOLLOW.ay)
    expect(camera.zoom).toBeGreaterThan(1)
    const stop = first.stops[0]
    expect(Math.hypot(camera.cx - stop.x, camera.cy - stop.y)).toBeLessThan(480 / camera.zoom)
  })

  it('hop 转场：段首 tilt 短暂 <55、zoom 有回拉谷值', () => {
    const second = choreo.segments[1]
    const hopMid = cameraAt(choreo, second.startFrame + 9)
    expect(hopMid.tilt).toBeLessThan(TILT_FOLLOW)
    expect(hopMid.zoom).toBeLessThan(second.followZoom)
  })

  it('dwell Ken Burns：段尾 zoom 比段中 +6% 以内递增', () => {
    const before = cameraAt(choreo, first.startFrame + first.drawFrames - 1)
    const after = cameraAt(choreo, first.endFrame - 1)
    expect(after.zoom).toBeGreaterThan(before.zoom)
    expect(after.zoom / before.zoom).toBeLessThan(1.07)
  })

  it('tilt/zoom/anchor 全程有界', () => {
    for (let frame = 0; frame < choreo.totalFrames; frame += 3) {
      const camera = cameraAt(choreo, frame)
      expect(camera.tilt).toBeGreaterThanOrEqual(TILT_WIDE)
      expect(camera.tilt).toBeLessThanOrEqual(TILT_FOLLOW)
      expect(camera.zoom).toBeGreaterThan(0.9)
      expect(camera.zoom).toBeLessThan(3)
      expect(camera.ax).toBe(ANCHOR_WIDE.ax)
      expect(camera.ay).toBeGreaterThanOrEqual(300)
      expect(camera.ay).toBeLessThanOrEqual(ANCHOR_FOLLOW.ay)
    }
  })

  it('相机全程逐帧连续：相邻帧 zoom 变化 < 5.5%（段界/outro 不连续回归锁；hop 正弦端点自然变化率 ~5%）', () => {
    let maxJump = 0
    for (let frame = 1; frame < choreo.totalFrames; frame += 1) {
      const a = cameraAt(choreo, frame - 1)
      const b = cameraAt(choreo, frame)
      maxJump = Math.max(maxJump, Math.abs(b.zoom - a.zoom) / a.zoom)
    }
    expect(maxJump).toBeLessThan(0.055)
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
