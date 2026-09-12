import { describe, expect, it } from 'vitest'
import {
  STAGE_HEIGHT, STAGE_PERSPECTIVE, STAGE_WIDTH,
  cameraToCSS, easeOutCubic, inOutCubic, projectToScreen, smoothstep,
} from './projection'

// ============================================================
// 透视投影一致性：CSS 平面变换与 projectToScreen 必须逐像素一致，
// 否则 HUD（路线/pin/标签）与底图错位。锚点不变量是核心防线。
// ============================================================

describe('cameraToCSS ↔ projectToScreen 一致性', () => {
  const cases = [
    { name: '广角全图', cam: { cx: 480, cy: 300, zoom: 1, tilt: 48, ax: 480, ay: 300 } },
    { name: '跟拍 63° 贴地（生产最大倾角）', cam: { cx: 700, cy: 420, zoom: 2.35, tilt: 63, ax: 480, ay: 360 } },
    { name: '跟拍左上', cam: { cx: 200, cy: 180, zoom: 1.6, tilt: 63, ax: 480, ay: 360 } },
    { name: '低角', cam: { cx: 640, cy: 420, zoom: 1.3, tilt: 54, ax: 480, ay: 360 } },
    { name: '过渡中', cam: { cx: 380, cy: 260, zoom: 1.05, tilt: 52, ax: 480, ay: 330 } },
  ]

  it('锚点不变量：projectToScreen(cam, cx, cy) === (ax, ay)', () => {
    for (const { name, cam } of cases) {
      const plane = cameraToCSS(cam)
      const p = projectToScreen(plane, cam.cx, cam.cy)
      expect(Math.abs(p.x - cam.ax)).toBeLessThan(0.01)
      expect(Math.abs(p.y - cam.ay)).toBeLessThan(0.01)
    }
  })

  it('焦点水平缩放恰为 zoom：焦点右侧邻点 Δscreen ≈ zoom·Δcanvas（±ε）', () => {
    for (const { cam } of cases) {
      const plane = cameraToCSS(cam)
      const a = projectToScreen(plane, cam.cx, cam.cy)
      const b = projectToScreen(plane, cam.cx + 10, cam.cy)
      expect(Math.abs((b.x - a.x) / 10 - cam.zoom)).toBeLessThan(0.01)
    }
  })

  it('倾角透视：画布上缘（远处）水平收缩、下缘（近处）放大', () => {
    const cam = { cx: 480, cy: 300, zoom: 1, tilt: 55, ax: 480, ay: 300 }
    const plane = cameraToCSS(cam)
    const near = projectToScreen(plane, 580, 400)
    const far = projectToScreen(plane, 580, 200)
    expect(near.x - 480).toBeGreaterThan(100)   // 近处放大
    expect(far.x - 480).toBeLessThan(100)       // 远处收缩
    expect(near.y).toBeGreaterThan(300)
    expect(far.y).toBeLessThan(300)
  })

  it('平面变换字符串包含 rotateX(tilt) 与 scale3d', () => {
    const plane = cameraToCSS({ cx: 480, cy: 300, zoom: 1.5, tilt: 55, ax: 480, ay: 348 })
    expect(plane.planeTransform).toContain('rotateX(55.00deg)')
    expect(plane.planeTransform).toContain('scale3d(')
    expect(plane.planeTransform).toContain('translate3d(')
  })
})

describe('缓动函数', () => {
  it('smoothstep / easeOutCubic / inOutCubic 端点与单调', () => {
    for (const ease of [smoothstep, easeOutCubic, inOutCubic]) {
      expect(ease(0)).toBe(0)
      expect(ease(1)).toBe(1)
      const values = [0.2, 0.4, 0.6, 0.8].map(u => ease(u))
      expect(values).toEqual([...values].sort((a, b) => a - b))
    }
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5) // 先快后慢
    expect(inOutCubic(0.5)).toBe(0.5)              // 对称
  })
})

describe('舞台常量', () => {
  it('与合成画布一致（960×600 / perspective 1400）', () => {
    expect(STAGE_WIDTH).toBe(960)
    expect(STAGE_HEIGHT).toBe(600)
    expect(STAGE_PERSPECTIVE).toBe(1400)
  })
})
