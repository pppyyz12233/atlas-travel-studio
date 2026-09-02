import { ArrowRight, Compass, Navigation, PenLine } from 'lucide-react'
import { Link, useRouter } from '../app/router'
import { useJourney } from '../app/JourneyProvider'
import DestinationCard from '../components/DestinationCard'
import TripCard from '../components/TripCard'
import type { TripCardData } from '../components/TripCard'
import { destinations } from '../content/destinations'
import { createJourneySession } from '../features/journey'

const featuredIds = ['tokyo', 'hangzhou', 'dali']

export default function HomePage() {
  const { navigate } = useRouter()
  const { state, dispatch } = useJourney()

  const recentTrips: TripCardData[] = state.sessions
    .filter(session => session.phase !== 'idle' || session.messages.length > 0)
    .slice(-3)
    .reverse()
    .map(session => ({
      id: session.id,
      title: session.title,
      route: `${session.form.origin} → ${session.form.destination}`,
      date: session.form.date,
      days: session.form.days,
      phase: session.phase,
      source: 'local' as const,
    }))

  const featured = featuredIds
    .map(id => destinations.find(destination => destination.id === id))
    .filter((destination): destination is NonNullable<typeof destination> => Boolean(destination))

  const startPlanning = () => navigate('/plan')

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
          <p>
            告诉 Atlas 你想去哪里、和谁同行、预算多少——五位旅行智能体将并行检索航班、住宿、
            景点与汇率，为你编排一份可以继续对话修改的完整行程。
          </p>
          <div className="mag-hero-actions">
            <button type="button" className="mag-cta" onClick={startPlanning}>
              <PenLine size={16} aria-hidden="true" /> 开始规划
            </button>
            <Link to="/explore" className="mag-cta is-ghost">
              <Compass size={16} aria-hidden="true" /> 探索目的地
            </Link>
          </div>
          <dl className="mag-hero-facts">
            <div><dt>多智能体并行</dt><dd>航班 · 住宿 · 景点 · 日程 · 预算</dd></div>
            <div><dt>真实数据</dt><dd>实时天气与汇率，不虚构价格</dd></div>
            <div><dt>游客可用</dt><dd>无需注册即可完成一次规划</dd></div>
          </dl>
        </div>
        <figure className="mag-hero-visual" aria-hidden="true">
          <span className="mag-hero-arc mag-hero-arc-a" />
          <span className="mag-hero-arc mag-hero-arc-b" />
          <span className="mag-hero-coordinate">35.68°N — 139.69°E</span>
          <blockquote>
            “旅行的方法论，<br />是先有一个想去的地方，<br />再让细节自己长出来。”
          </blockquote>
          <figcaption>— Atlas 编辑部</figcaption>
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
          <h2 id="mag-featured">编辑部精选</h2>
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

      <section className="mag-how" aria-labelledby="mag-how-title">
        <span className="mag-kicker"><Navigation size={14} aria-hidden="true" /> 工作方式</span>
        <h2 id="mag-how-title">从一句话到一份可执行的行程</h2>
        <ol className="mag-how-steps">
          <li><b>01</b><strong>描述想法</strong><span>目的地、日期、人数、预算，或直接一句话。</span></li>
          <li><b>02</b><strong>智能体并行工作</strong><span>实时查看每个智能体的检索、推理与工具调用。</span></li>
          <li><b>03</b><strong>继续对话修改</strong><span>“第二天少一个景点”“酒店靠近地铁站”，随说随改。</span></li>
          <li><b>04</b><strong>导出与收藏</strong><span>生成 Markdown / PDF，登录后云端保存全部历史。</span></li>
        </ol>
        <button type="button" className="mag-cta" onClick={startPlanning}>
          现在开始 <ArrowRight size={15} aria-hidden="true" />
        </button>
      </section>
    </div>
  )
}
