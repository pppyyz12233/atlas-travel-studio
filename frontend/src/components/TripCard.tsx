import { ArrowRight, Clock3, MapPin, Sparkles } from 'lucide-react'
import type { JourneyPhase } from '../features/journey'

export interface TripCardData {
  id: string
  title: string
  route: string
  date: string
  days: number
  phase: JourneyPhase
  /** 来源标记：cloud = 登录用户的云端会话；local = 本地草稿 */
  source: 'cloud' | 'local'
}

const phaseCopy: Record<JourneyPhase, string> = {
  idle: '待规划',
  planning: '规划中',
  ready: '已完成',
  error: '需处理',
  cancelled: '已停止',
}

export default function TripCard({
  trip,
  onOpen,
  onRemove,
}: {
  trip: TripCardData
  onOpen: () => void
  onRemove?: () => void
}) {
  return (
    <article className={`mag-trip-card is-${trip.phase}`}>
      <button type="button" className="mag-trip-main" onClick={onOpen}>
        <span className="mag-trip-kicker">
          {trip.source === 'cloud' ? '云端行程' : '本地草稿'}
          <i aria-hidden="true" />
          {phaseCopy[trip.phase]}
        </span>
        <strong>{trip.title}</strong>
        <span className="mag-trip-route"><MapPin size={13} aria-hidden="true" />{trip.route}</span>
        <span className="mag-trip-meta">
          <time dateTime={trip.date}><Clock3 size={12} aria-hidden="true" />{trip.date}</time>
          <em>{trip.days} 天</em>
          {trip.phase === 'planning' && <em className="mag-trip-live"><Sparkles size={12} aria-hidden="true" />生成中</em>}
        </span>
        <ArrowRight className="mag-trip-arrow" size={16} aria-hidden="true" />
      </button>
      {onRemove && (
        <button type="button" className="mag-trip-remove" onClick={onRemove} aria-label={`删除 ${trip.title}`}>
          移除
        </button>
      )}
    </article>
  )
}
