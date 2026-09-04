import { useMemo, useState } from 'react'
import { MapPin, Search } from 'lucide-react'
import { useRouter } from '../app/router'
import { useJourney } from '../app/JourneyProvider'
import { useFavorites } from '../hooks/useFavorites'
import DestinationCard from '../components/DestinationCard'
import { EmptyState } from '../components/states'
import { createJourneySession } from '../features/journey'
import { destinations, travelStyles } from '../content/destinations'
import type { Destination, TravelStyle } from '../content/destinations'

export default function ExplorePage() {
  const { navigate } = useRouter()
  const { dispatch } = useJourney()
  const { isFavorite, toggle } = useFavorites()
  const [query, setQuery] = useState('')
  const [style, setStyle] = useState<TravelStyle | null>(null)

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

  return (
    <div className="mag-page mag-explore">
      <header className="mag-page-head">
        <span className="mag-kicker"><MapPin size={14} aria-hidden="true" /> Destinations</span>
        <h1>探索目的地</h1>
        <p>先读一篇目的地攻略，再决定去哪里。每篇文档都包含景点、适合人群和实用建议。</p>
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
