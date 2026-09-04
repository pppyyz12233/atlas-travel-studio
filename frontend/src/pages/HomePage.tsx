import { useState } from 'react'
import { ArrowRight, Compass, MapPin, Navigation, SendHorizontal } from 'lucide-react'
import { Link, useRouter } from '../app/router'
import { useJourney } from '../app/JourneyProvider'
import { setPendingBrief } from '../app/pendingBrief'
import DestinationCard from '../components/DestinationCard'
import TripCard from '../components/TripCard'
import TravelQuotePanel from '../components/TravelQuotePanel'
import type { TripCardData } from '../components/TripCard'
import { destinations } from '../content/destinations'
import { createJourneySession, inferDestinationFromBrief, inferOriginFromBrief, manualOrigin, routeLabel } from '../features/journey'

const featuredIds = ['tokyo', 'hangzhou', 'dali']

export default function HomePage() {
  const { navigate } = useRouter()
  const { state, dispatch } = useJourney()
  const [brief, setBrief] = useState('')

  const recentTrips: TripCardData[] = state.sessions
    .filter(session => session.phase !== 'idle' || session.messages.length > 0)
    .slice(-3)
    .reverse()
    .map(session => ({
      id: session.id,
      title: session.title,
      route: routeLabel(session.form),
      date: session.form.date,
      days: session.form.days,
      phase: session.phase,
      source: 'local' as const,
    }))

  const featured = featuredIds
    .map(id => destinations.find(destination => destination.id === id))
    .filter((destination): destination is NonNullable<typeof destination> => Boolean(destination))

  const trimmedBrief = brief.trim()
  const canStart = trimmedBrief.length > 0

  // 一句话即开规划：建会话 → 一次性 handoff → 规划页自动发送。
  // 目的地/出发地只从用户文本推断；推不出就留空（显示"待定"），
  // 绝不携带 createJourneySession 的默认"上海 → 东京"——那是行程串线的源头。
  const startFromBrief = () => {
    if (!canStart) return
    const inferredDestination = inferDestinationFromBrief(trimmedBrief)
    const inferredOrigin = inferOriginFromBrief(trimmedBrief)
    const baseForm = createJourneySession().form
    dispatch({
      type: 'add',
      session: createJourneySession({
        title: trimmedBrief.slice(0, 24),
        form: {
          ...baseForm,
          origin: manualOrigin(inferredOrigin ?? ''),
          destination: inferredDestination ?? '',
        },
      }),
    })
    setPendingBrief(trimmedBrief)
    navigate('/plan')
  }

  const planDestination = (destination: (typeof destinations)[number]) => {
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
    <div className="mag-page mag-home">
      <section className="mag-hero">
        <div className="mag-hero-copy">
          <span className="mag-kicker"><Compass size={14} aria-hidden="true" /> Atlas 智能旅行工作室</span>
          <h1>让下一段旅程，<br />从一个想法开始。</h1>
          <p>说说你想去哪、和谁同行、预算多少 —— 五位旅行智能体并行检索航班、住宿、景点与汇率，为你编排一份可以继续对话修改的行程。</p>

          <div className="mag-hero-input">
            <textarea
              aria-label="输入你的旅行想法"
              placeholder="想去哪？说说看：十一月去京都看红叶，两个人，预算一万……"
              value={brief}
              rows={2}
              onChange={event => setBrief(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  startFromBrief()
                }
              }}
            />
            <button type="button" className="mag-cta" onClick={startFromBrief} disabled={!canStart}>
              <SendHorizontal size={16} aria-hidden="true" /> 开始规划
            </button>
          </div>
          <p className="mag-hero-assist">一句话就够，Atlas 会自动理解目的地、同行人和预算。</p>

          <Link to="/explore" className="mag-hero-explore-link mag-hero-explore-cta">
            <MapPin size={13} aria-hidden="true" /> 还没想好？浏览编辑部精选目的地
          </Link>
        </div>
        <figure className="mag-hero-visual">
          <span className="mag-hero-arc mag-hero-arc-a" />
          <span className="mag-hero-arc mag-hero-arc-b" />
          <span className="mag-hero-coordinate">35.68°N — 139.69°E</span>
          <TravelQuotePanel />
        </figure>
      </section>

      {recentTrips.length > 0 && (
        <section className="mag-section" aria-labelledby="mag-recent">
          <header className="mag-section-head">
            <h2 id="mag-recent">最近行程</h2>
            <Link to="/trips" className="mag-section-more">查看全部 <ArrowRight size={13} aria-hidden="true" /></Link>
          </header>
          <div className="mag-trip-row">
            {recentTrips.map(trip => (
              <TripCard
                key={trip.id}
                trip={trip}
                onOpen={() => {
                  dispatch({ type: 'activate', id: trip.id })
                  navigate(`/trip/${trip.id}`)
                }}
              />
            ))}
          </div>
        </section>
      )}

      <section className="mag-section" aria-labelledby="mag-featured">
        <header className="mag-section-head">
          <h2 id="mag-featured"><Navigation size={15} aria-hidden="true" /> 编辑部精选</h2>
          <Link to="/explore" className="mag-section-more">全部目的地 <ArrowRight size={13} aria-hidden="true" /></Link>
        </header>
        <div className="mag-feature-grid">
          {featured[0] && <DestinationCard destination={featured[0]} variant="feature" onPlan={planDestination} />}
          <div className="mag-feature-side">
            {featured.slice(1).map(destination => (
              <DestinationCard key={destination.id} destination={destination} variant="grid" onPlan={planDestination} />
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
