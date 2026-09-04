import type { Conversation } from '../../types'

// ────────────────────────────────────────────────────────────
// 云端行程卡片元数据规范化（与后端 app/utils/trip_meta.ts 派生字段配合）：
// - 同一 conversationId 只出一张卡（后端已去重，前端再兜底）；
// - 标题规范化为「目的地 · N 天行程」；目的地与天数都未知 → 未命名行程；
// - 原始长 prompt /「继续」等消息文本绝不当标题展示；
// - days 未知 → null（卡片显示"天数待定"，绝不显示 0 天）；
// - 日期显示行程出发日期（start_date），没有才回落到更新时间；
// - 排序按 updatedAt 倒序。
// ────────────────────────────────────────────────────────────

export interface NormalizedCloudTrip {
  key: string
  conversationId: number
  title: string
  destination: string | null
  origin: string | null
  route: string
  date: string
  days: number | null
  updatedAt: string
}

/** 规范化展示标题 */
export function cloudTripTitle(destination: string | null | undefined, days: number | null | undefined): string {
  if (destination && days) return `${destination} · ${days} 天行程`
  if (destination) return `${destination} 行程`
  return '未命名行程'
}

export function normalizeCloudTrips(conversations: Conversation[]): NormalizedCloudTrip[] {
  const seen = new Set<number>()
  const trips: NormalizedCloudTrip[] = []
  for (const conversation of conversations) {
    if (seen.has(conversation.id)) continue // 同会话只出一张卡
    seen.add(conversation.id)
    const destination = conversation.destination?.trim() || null
    const days = typeof conversation.days === 'number' && conversation.days > 0 ? conversation.days : null
    const origin = conversation.origin?.trim() || null
    trips.push({
      key: `cloud-${conversation.id}`,
      conversationId: conversation.id,
      title: cloudTripTitle(destination, days),
      destination,
      origin,
      route: `${origin ?? '出发地待定'} → ${destination ?? '目的地待定'}`,
      date: conversation.start_date || (conversation.updated_at ?? conversation.created_at).slice(0, 10),
      days,
      updatedAt: conversation.updated_at ?? conversation.created_at,
    })
  }
  return trips.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
}
