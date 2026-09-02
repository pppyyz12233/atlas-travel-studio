import { useEffect, useMemo, useState } from 'react'
import { MapPin, Search, Star, Ticket } from 'lucide-react'
import { useRouter } from '../app/router'
import { useJourney } from '../app/JourneyProvider'
import { useFavorites } from '../hooks/useFavorites'
import { api } from '../hooks/useApi'
import DestinationCard from '../components/DestinationCard'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { createJourneySession } from '../features/journey'
import { destinations, travelStyles } from '../content/destinations'
import type { Destination, TravelStyle } from '../content/destinations'

interface Attraction {
  name: string
  category: string
  price: number
  rating: number
  duration: string
  address: string
}

type AttractionsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: Attraction[]; total: number }

const idleAttractions: AttractionsState = { status: 'idle' }

export default function ExplorePage() {
  const { navigate } = useRouter()
  const { dispatch } = useJourney()
  const { isFavorite, toggle } = useFavorites()
  const [query, setQuery] = useState('')
  const [style, setStyle] = useState<TravelStyle | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [attractions, setAttractions] = useState<Record<string, AttractionsState>>({})

  const filtered = useMemo(() => {
    const keyword = query.trim()
    return destinations.filter(destination => {
      const matchStyle = !style || destination.styles.includes(style)
      const matchKeyword = !keyword
        || destination.name.includes(keyword)
        || destination.nameEn.toLowerCase().includes(keyword.toLowerCase())
        || destination.region.includes(keyword)
      return matchStyle && matchKeyword
    })
  }, [query, style])

  // 展开目的地时拉取真实景点数据（GET /api/search/attractions）
  useEffect(() => {
    if (!expanded) return
    if (attractions[expanded]?.status === 'ready' || attractions[expanded]?.status === 'loading') return
    const destination = destinations.find(item => item.id === expanded)
    if (!destination) return

    let cancelled = false
    setAttractions(current => ({ ...current, [expanded]: { status: 'loading' } }))
    void (async () => {
      try {
        const data = await api.get<{ total: number; items: Attraction[] }>(
          `/search/attractions?destination=${encodeURIComponent(destination.formDefaults.destination)}&size=6`,
        )
        if (!cancelled) {
          setAttractions(current => ({
            ...current,
            [expanded]: { status: 'ready', items: data.items, total: data.total },
          }))
        }
      } catch {
        if (!cancelled) {
          setAttractions(current => ({ ...current, [expanded]: { status: 'error' } }))
        }
      }
    })()
    return () => { cancelled = true }
  }, [expanded, attractions])

  const planDestination = (destination: Destination) => {
    dispatch({
      type: 'add',
      session: createJourneySession({
        title: `${destination.name} · 编辑部精选`,
        form: {
          ...createJourneySession().form,
          destination: destination.formDefaults.destination,
          days: destination.formDefaults.days,
          budget: destination.formDefaults.budget,
        },
      }),
    })
    navigate('/plan')
  }

  const loadAttractions = (destinationId: string) => {
    setAttractions(current => {
      const next = { ...current }
      delete next[destinationId]
      return next
    })
    setExpanded(current => (current === destinationId ? null : destinationId))
  }

  return (
    <div className="mag-page mag-explore">
      <header className="mag-page-head">
        <span className="mag-kicker"><MapPin size={14} aria-hidden="true" /> Destinations</span>
        <h1>探索目的地</h1>
        <p>从编辑部策划的十二处坐标出发，点开任意目的地查看当地真实景点数据，或直接交给 Atlas 规划。</p>
      </header>

      <div className="mag-filterbar" role="search">
        <label className="mag-search-field">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="搜索目的地或地区，如 京都 / 云南"
            aria-label="搜索目的地"
          />
        </label>
        <div className="mag-filter-chips" aria-label="按旅行类型筛选">
          <button
            type="button"
            className={!style ? 'is-active' : ''}
            aria-pressed={!style}
            onClick={() => setStyle(null)}
          >
            全部
          </button>
          {travelStyles.map(item => (
            <button
              type="button"
              key={item}
              className={style === item ? 'is-active' : ''}
              aria-pressed={style === item}
              onClick={() => setStyle(current => (current === item ? null : item))}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="没有匹配的目的地"
          description="换个关键词，或清除类型筛选再试一次。"
          action={
            <button type="button" className="mag-ghost-button" onClick={() => { setQuery(''); setStyle(null) }}>
              清除筛选
            </button>
          }
        />
      ) : (
        <div className="mag-destination-grid">
          {filtered.map(destination => (
            <div key={destination.id} className="mag-destination-cell">
              <DestinationCard
                destination={destination}
                favorited={isFavorite(destination.id)}
                onToggleFavorite={toggle}
                onPlan={planDestination}
              />
              <div className="mag-destination-expand">
                <button
                  type="button"
                  onClick={() => loadAttractions(destination.id)}
                  aria-expanded={expanded === destination.id}
                >
                  {expanded === destination.id ? '收起景点' : '看看当地景点'}
                </button>
                {expanded === destination.id && (
                  <AttractionPanel state={attractions[destination.id] ?? idleAttractions} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AttractionPanel({ state }: { state: AttractionsState }) {
  if (state.status === 'loading') return <LoadingState label="正在查询当地景点" />
  if (state.status === 'error') {
    return <ErrorState title="景点数据加载失败" description="稍后重试，或直接让 Atlas 规划。" />
  }
  if (state.status === 'idle') return null
  if (state.items.length === 0) {
    return (
      <p className="mag-attractions-empty">
        这座城市暂无景点数据，点击「规划行程」让 Atlas 为你编排。
      </p>
    )
  }
  return (
    <ul className="mag-attractions">
      {state.items.map(item => (
        <li key={item.name}>
          <span className="mag-attraction-name"><Ticket size={13} aria-hidden="true" />{item.name}</span>
          <span className="mag-attraction-meta">
            <em>{item.category}</em>
            <b><Star size={11} aria-hidden="true" />{item.rating}</b>
            {item.price > 0 && <i>¥{item.price}</i>}
            <small>{item.duration}</small>
          </span>
        </li>
      ))}
    </ul>
  )
}
