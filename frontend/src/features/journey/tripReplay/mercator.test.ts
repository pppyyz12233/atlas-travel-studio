import { describe, expect, it } from 'vitest'
import { MAX_LATITUDE, mercatorProject, mercatorUnproject } from './mercator'

describe('mercatorProject 金标值', () => {
  it('原点 = 世界像素中心（任意级）', () => {
    for (const zoom of [0, 3, 10, 17]) {
      const { x, y } = mercatorProject(0, 0, zoom)
      const world = 256 * 2 ** zoom
      expect(x).toBeCloseTo(world / 2, 6)
      expect(y).toBeCloseTo(world / 2, 6)
    }
  })

  it('北京 (116.40, 39.90) @ z10 标准公式钉死', () => {
    const { x, y } = mercatorProject(116.40, 39.90, 10)
    // x = (lng/360 + 0.5)·256·2^z；y = (0.5 - atanh(sin(lat))/π)/...·256·2^z
    expect(x).toBeCloseTo(215831.8933, 3)
    expect(y).toBeCloseTo(99337.2421, 3)
  })

  it('经度镜像对称', () => {
    const world = 256 * 2 ** 12
    const east = mercatorProject(113.28, 23.13, 12)
    const west = mercatorProject(-113.28, 23.13, 12)
    expect(east.x + west.x).toBeCloseTo(world, 3)
    expect(east.y).toBeCloseTo(west.y, 9)
  })

  it('纬度钳制在 Web Mercator 极限内且有限', () => {
    const { x, y } = mercatorProject(0, 89.9, 5)
    expect(Number.isFinite(x)).toBe(true)
    // 钳制到 ±85.051129 后 y 应为 0 或世界边缘（容许浮点 ε）
    expect(y).toBeGreaterThanOrEqual(-0.001)
    expect(y).toBeLessThanOrEqual(256 * 2 ** 5 + 0.001)
    expect(MAX_LATITUDE).toBeCloseTo(85.051129, 6)
  })
})

describe('mercatorUnproject 逆投影', () => {
  it('project∘unproject 往返误差 < 1e-6 度', () => {
    for (const [lng, lat] of [[113.28, 23.13], [121.47, 31.23], [0, 0], [-139.69, 35.69]]) {
      const point = mercatorProject(lng, lat, 12)
      const back = mercatorUnproject(point.x, point.y, 12)
      expect(Math.abs(back.lng - lng)).toBeLessThan(1e-6)
      expect(Math.abs(back.lat - lat)).toBeLessThan(1e-6)
    }
  })
})
