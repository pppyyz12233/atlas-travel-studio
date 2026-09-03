import { useState } from 'react'
import { ChevronDown, MapPin } from 'lucide-react'
import type { DayPlan } from '../features/journey/viewModel'

// 行程时间轴：编辑式双栏（日期轨 + 内容），逐项 stagger 进入。
// collapsible=true 时为手风琴模式（阅读态）：Day 1 默认展开，其余折叠，
// 标题按钮可展开/收起，支持键盘操作与 aria-expanded / aria-controls。
// onFocusLocation（阶段4）：优先把条目聚焦到地图编号 marker；未命中回落 POI 搜索。
export default function TripTimeline({
  days,
  city,
  onSearchMap,
  onFocusLocation,
  collapsible = false,
}: {
  days: DayPlan[]
  city: string
  onSearchMap?: (keyword: string, city: string) => void
  onFocusLocation?: (itemText: string) => boolean
  collapsible?: boolean
}) {
  const [openIndex, setOpenIndex] = useState<number>(0)

  if (days.length === 0) return null
  return (
    <ol className="mag-timeline" aria-label="逐日行程时间轴">
      {days.map((day, index) => {
        const expanded = collapsible ? openIndex === index : true
        const panelId = `mag-day-panel-${index}`
        const dayTitle = day.title.replace(/^Day\s*\d+\s*[-—：:]?\s*/i, '') || `${city}行程日`
        return (
          <li className="mag-timeline-day" key={`${day.day}-${index}`} style={{ '--i': index } as React.CSSProperties}>
            <div className="mag-timeline-rail" aria-hidden="true">
              <b>{String(index + 1).padStart(2, '0')}</b>
              <i />
            </div>
            <div className="mag-timeline-body">
              {collapsible ? (
                <button
                  type="button"
                  className={`mag-timeline-trigger ${expanded ? 'is-open' : ''}`}
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex(current => (current === index ? -1 : index))}
                >
                  <span className="mag-timeline-trigger-title">{day.day}</span>
                  <span className="mag-timeline-trigger-sub">{dayTitle}</span>
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
              ) : (
                <header>
                  <h3>{day.day}</h3>
                  <p>{dayTitle}</p>
                </header>
              )}

              {expanded && (
                <div id={panelId} className="mag-timeline-panel">
                  {day.items.length > 0 ? (
                    <ul className="mag-timeline-items">
                      {day.items.map((item, itemIndex) => (
                        <li key={`${item.description}-${itemIndex}`}>
                          <time>{item.time || String(itemIndex + 1)}</time>
                          <span>{item.description}</span>
                          {(onSearchMap || onFocusLocation) && (
                            <button
                              type="button"
                              onClick={() => {
                                if (onFocusLocation?.(item.description)) return
                                onSearchMap?.(item.description.slice(0, 28), city)
                              }}
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
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
