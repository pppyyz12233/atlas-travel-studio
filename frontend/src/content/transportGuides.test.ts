import { describe, expect, it } from 'vitest'
import { TRANSPORT_DISCLAIMER, getTransportGuide, hasTripTransport } from './transportGuides'

describe('Atlas 编辑部交通指南', () => {
  const requiredCities = ['上海', '广州', '巴黎', '东京', '新加坡', '北京', '杭州', '京都', '大阪', '香港']

  it('curates guides for the required cities (国内 + 国外)', () => {
    for (const city of requiredCities) {
      const guide = getTransportGuide(city)
      expect(guide.summary.length).toBeGreaterThanOrEqual(10)
      expect(guide.tips.length).toBeGreaterThanOrEqual(4)
      expect(guide.disclaimer).toBe(TRANSPORT_DISCLAIMER)
    }
  })

  it('covers any other destination with a generic guide (国内外兜底)', () => {
    for (const city of ['巴厘岛', '乌鲁木齐', '某未知小城']) {
      const guide = getTransportGuide(city)
      expect(guide.tips.length).toBeGreaterThanOrEqual(4)
      expect(guide.disclaimer).toBe(TRANSPORT_DISCLAIMER)
      expect(guide.summary).toContain(city)
    }
  })

  it('never fabricates flight numbers, live prices or exact durations', () => {
    const all = [...requiredCities, '京都', '大理']
      .map(city => getTransportGuide(city))
      .flatMap(guide => [guide.summary, ...guide.tips])
    for (const text of all) {
      // 不出现具体航班号（如 MU539 / CA123）
      expect(/\b[A-Z]{2}\d{3,4}\b/.test(text)).toBe(false)
      // 不出现具体金额（¥300 / €30 / 300元）
      expect(/[¥€]\s*\d|\d+\s*元/.test(text)).toBe(false)
      // 不出现精确耗时（30分钟 / 1.5小时）
      expect(/\d+\s*(分钟|小时|min|hour)/i.test(text)).toBe(false)
    }
  })

  it('detects whether the trip itself has transport content', () => {
    expect(hasTripTransport('### 交通\n- RER B 进城')).toBe(true)
    expect(hasTripTransport('   \n  ')).toBe(false)
    expect(hasTripTransport('')).toBe(false)
  })
})
