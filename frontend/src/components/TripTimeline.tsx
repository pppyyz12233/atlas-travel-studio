import { MapPin } from 'lucide-react'
import type { DayPlan } from '../features/journey/viewModel'

// 行程时间轴：编辑式双栏（日期轨 + 内容），逐项 stagger 进入
export default function TripTimeline({
  days,
  city,
  onSearchMap,
}: {
  days: DayPlan[]
  city: string
  onSearchMap?: (keyword: string, city: string) => void
}) {
  if (days.length === 0) return null
  return (
    <ol className="mag-timeline" aria-label="逐日行程时间轴">
      {days.map((day, index) => (
        <li className="mag-timeline-day" key={`${day.day}-${index}`} style={{ '--i': index } as React.CSSProperties}>
          <div className="mag-timeline-rail" aria-hidden="true">
            <b>{String(index + 1).padStart(2, '0')}</b>
            <i />
          </div>
          <div className="mag-timeline-body">
            <header>
              <h3>{day.day}</h3>
              <p>{day.title.replace(/^Day\s*\d+\s*[-—：:]?\s*/i, '') || `${city}行程日`}</p>
            </header>
            {day.items.length > 0 ? (
              <ul className="mag-timeline-items">
                {day.items.map((item, itemIndex) => (
                  <li key={`${item.description}-${itemIndex}`}>
                    <time>{item.time || String(itemIndex + 1)}</time>
                    <span>{item.description}</span>
                    {onSearchMap && (
                      <button
                        type="button"
                        onClick={() => onSearchMap(item.description.slice(0, 28), city)}
                        aria-label={`在地图查看 ${item.description.slice(0, 18)}`}
                      >
                        <MapPin size={13} aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mag-timeline-note">当日安排较为松弛，随性探索。</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
