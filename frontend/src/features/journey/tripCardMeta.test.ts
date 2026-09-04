import { describe, expect, it } from 'vitest'
import { cloudTripTitle, normalizeCloudTrips } from './tripCardMeta'
import { detectFlightQuery } from './flightIntent'
import { parseFlightsFromReply } from './FlightCards'
import type { Conversation } from '../../types'

const conv = (overrides: Partial<Conversation>): Conversation => ({
  id: 1,
  title: '去广州一天',
  created_at: '2026-09-04T10:00:00',
  ...overrides,
})

describe('云端行程卡片元数据（重复/0天/原始标题修复）', () => {
  it('dedupes by conversationId — one card per conversation', () => {
    const trips = normalizeCloudTrips([
      conv({ id: 7, updated_at: '2026-09-04T12:00:00' }),
      conv({ id: 7, updated_at: '2026-09-04T13:00:00' }), // 重复返回
      conv({ id: 8, destination: '上海', days: 4, updated_at: '2026-09-03T09:00:00' }),
    ])
    expect(trips).toHaveLength(2)
    expect(trips.map(trip => trip.conversationId)).toEqual([7, 8])
  })

  it('normalizes titles to 目的地 · N 天行程 and never shows raw prompts', () => {
    const trips = normalizeCloudTrips([
      conv({ id: 1, destination: '广州', days: 1, title: '去广州一天' }),
      conv({ id: 2, destination: '上海', days: 4, title: '从上海去东京，5天' }),
      conv({ id: 3, destination: null, days: null, title: '继续' }),
    ])
    expect(trips[0].title).toBe('广州 · 1 天行程')
    expect(trips[1].title).toBe('上海 · 4 天行程')
    expect(trips[2].title).toBe('未命名行程')
    for (const trip of trips) {
      expect(trip.title).not.toMatch(/继续|从上海去东京/)
    }
  })

  it('days unknown → null (卡片显示天数待定，绝不显示 0 天)', () => {
    const trips = normalizeCloudTrips([conv({ id: 1, days: null })])
    expect(trips[0].days).toBeNull()
    expect(cloudTripTitle(trips[0].destination, trips[0].days)).toBe('未命名行程')
  })

  it('shows the trip start date, falling back to updated time; sorts by updatedAt desc', () => {
    const trips = normalizeCloudTrips([
      conv({ id: 1, start_date: '2026-10-01', updated_at: '2026-09-01T08:00:00' }),
      conv({ id: 2, updated_at: '2026-09-04T09:00:00' }),
    ])
    expect(trips[0].conversationId).toBe(2) // updatedAt 更新的在前
    expect(trips.find(trip => trip.conversationId === 1)?.date).toBe('2026-10-01')
    expect(trips.find(trip => trip.conversationId === 2)?.date).toBe('2026-09-04')
  })
})

describe('航班查询意图识别', () => {
  it('detects flight queries with full route and date', () => {
    const intent = detectFlightQuery('查询上海到东京 2026-09-10 的机票')
    expect(intent).not.toBeNull()
    expect(intent?.conditions.origin).toBe('上海')
    expect(intent?.conditions.destination).toBe('东京')
    expect(intent?.conditions.date).toBe('2026-09-10')
    expect(intent?.missing).toEqual([])
  })

  it('reports missing conditions without inventing them', () => {
    const intent = detectFlightQuery('列出机票')
    expect(intent?.missing).toContain('origin')
    expect(intent?.missing).toContain('destination')
    expect(intent?.missing).toContain('date')

    const noDate = detectFlightQuery('查询广州到巴黎的航班')
    expect(noDate?.missing).toEqual(['date'])
  })

  it('does not treat planning requests as flight queries', () => {
    expect(detectFlightQuery('去广州一天的行程规划，帮我查机票和酒店一起安排好')).toBeNull()
    expect(detectFlightQuery('帮我规划东京 4 天行程')).toBeNull()
  })

  it('parses flight tables from the reply markdown (模型建议 fallback)', () => {
    const reply = [
      '## 航班',
      '| 航班号 | 航司 | 出发-到达 | 单程价 |',
      '|--------|------|-----------|--------|',
      '| MU523 | 东航 | 08:30-12:30 | ¥2,800 |',
      '| CA123 | 国航 | 15:00-19:00 | ¥3,100 |',
      '',
      '## 日程',
      '#### Day 1',
    ].join('\n')
    const rows = parseFlightsFromReply(reply)
    expect(rows).toHaveLength(2)
    expect(rows[0].name).toContain('MU523')
    expect(rows[0].price).toContain('2,800')
  })
})
