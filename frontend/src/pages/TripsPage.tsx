import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Cloud, Heart, LogIn, MapPin, Search } from 'lucide-react'
import { Link, useRouter } from '../app/router'
import { useJourney } from '../app/JourneyProvider'
import { api } from '../hooks/useApi'
import { useFavorites } from '../hooks/useFavorites'
import type { useAuth } from '../hooks/useAuth'
import DestinationCard from '../components/DestinationCard'
import TripCard from '../components/TripCard'
import type { TripCardData } from '../components/TripCard'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { createJourneySession } from '../features/journey'
import { destinationById, destinations } from '../content/destinations'
import type { Conversation } from '../types'

type CloudState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; conversations: Conversation[] }

export default function TripsPage({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const { state, dispatch } = useJourney()
  const { navigate } = useRouter()
  const { favorites } = useFavorites()
  const [query, setQuery] = useState('')
  const [cloud, setCloud] = useState<CloudState>({ status: 'idle' })
  const [loadingHistory, setLoadingHistory] = useState<number | null>(null)
  // R4：收藏为次级内容，默认折叠（无收藏时直接显示空态引导）
  const [favoritesOpen, setFavoritesOpen] = useState(false)

  const loadCloud = useCallback(async () => {
    if (!auth.isLoggedIn) {
      setCloud({ status: 'idle' })
      return
    }
    setCloud({ status: 'loading' })
    try {
      const conversations = await api.get<Conversation[]>('/chat/conversations')
      setCloud({ status: 'ready', conversations })
    } catch {
      setCloud({ status: 'error' })
    }
  }, [auth.isLoggedIn])

  useEffect(() => {
    void loadCloud()
  }, [loadCloud])

  const keyword = query.trim()

  const drafts: TripCardData[] = useMemo(() => state.sessions
    .filter(session => session.phase !== 'idle' || session.messages.length > 0 || session.title !== '未命名旅程')
    .slice().reverse()
    .map(session => ({
      id: session.id,
      title: session.title,
      route: `${session.form.origin} → ${session.form.destination}`,
      date: session.form.date,
      days: session.form.days,
      phase: session.phase,
      source: 'local' as const,
    }))
    .filter(trip => !keyword || trip.title.includes(keyword) || trip.route.includes(keyword)),
  [state.sessions, keyword])

  const cloudTrips: TripCardData[] = cloud.status === 'ready'
    ? cloud.conversations
      .filter(conversation => !keyword || conversation.title.includes(keyword))
      .map(conversation => ({
        id: `cloud-${conversation.id}`,
        title: conversation.title,
        route: '云端会话',
        date: conversation.created_at.slice(0, 10),
        days: 0,
        phase: 'ready' as const,
        source: 'cloud' as const,
      }))
    : []

  // 云端会话 → 拉取历史并落地为本地会话，再进详情页
  const openCloudConversation = async (conversation: Conversation) => {
    const existing = state.sessions.find(session => session.conversationId === conversation.id)
    if (existing) {
      dispatch({ type: 'activate', id: existing.id })
      navigate(`/trip/${existing.id}`)
      return
    }
    setLoadingHistory(conversation.id)
    try {
      const messages = await api.get<Array<{ role: string; content: string }>>(
        `/chat/history?conversation_id=${conversation.id}`,
      )
      const normalized = messages
        .filter(item => item.role === 'user' || item.role === 'assistant')
        .map(item => ({ role: item.role as 'user' | 'assistant', content: item.content }))
      const finalReply = [...normalized].reverse().find(item => item.role === 'assistant')?.content ?? ''
      const session = createJourneySession({
        title: conversation.title,
        conversationId: conversation.id,
        phase: finalReply ? 'ready' : 'idle',
        finalReply,
        messages: normalized,
      })
      dispatch({ type: 'add', session })
      navigate(`/trip/${session.id}`)
    } catch {
      setLoadingHistory(null)
    }
  }

  const favoriteDestinations = favorites
    .map(id => destinationById(id))
    .filter((destination): destination is NonNullable<typeof destination> => Boolean(destination))

  const planDestination = (destinationId: string) => {
    const destination = destinations.find(item => item.id === destinationId)
    if (!destination) return
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
    <div className="mag-page mag-trips">
      <header className="mag-page-head">
        <span className="mag-kicker"><MapPin size={14} aria-hidden="true" /> My journeys</span>
        <h1>我的行程</h1>
        <p>云端行程与登录账号绑定；本地草稿保存在当前浏览器；收藏的目的地随时可以开始规划。</p>
      </header>

      <label className="mag-search-field mag-trips-search">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="按标题或目的地筛选"
          aria-label="筛选行程"
        />
      </label>

      <section className="mag-trips-section" aria-labelledby="mag-trips-cloud">
        <header className="mag-section-head">
          <h2 id="mag-trips-cloud"><Cloud size={15} aria-hidden="true" /> 云端行程</h2>
          <button type="button" className="mag-section-more" onClick={() => void loadCloud()}>刷新</button>
        </header>
        {!auth.isLoggedIn ? (
          <EmptyState
            icon={<LogIn size={22} aria-hidden="true" />}
            title="登录后同步云端行程"
            description="登录 Atlas 账号，所有规划历史自动保存在云端，换设备也能继续。"
            action={<button type="button" className="mag-cta" onClick={() => auth.setShowAuthModal(true)}>登录 / 注册</button>}
          />
        ) : cloud.status === 'loading' ? (
          <LoadingState label="正在同步云端行程" />
        ) : cloud.status === 'error' ? (
          <ErrorState title="云端行程加载失败" description="网络异常或登录已过期，可重试。" onRetry={() => void loadCloud()} />
        ) : cloudTrips.length === 0 ? (
          <EmptyState title="云端还没有行程" description="完成一次规划并登录，行程会自动保存到这里。" />
        ) : (
          <div className="mag-trip-grid">
            {cloudTrips.map((trip, index) => {
              const conversation = cloud.status === 'ready' ? cloud.conversations[index] : undefined
              return (
                <div key={trip.id} className="mag-trip-cell">
                  <TripCard
                    trip={trip}
                    onOpen={() => conversation && void openCloudConversation(conversation)}
                  />
                  {loadingHistory === conversation?.id && <LoadingState label="正在读取历史" />}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="mag-trips-section" aria-labelledby="mag-trips-drafts">
        <header className="mag-section-head">
          <h2 id="mag-trips-drafts">本地草稿</h2>
          <small>仅保存在此浏览器</small>
        </header>
        {drafts.length === 0 ? (
          <EmptyState
            title="还没有草稿"
            description="从一句话开始，让 Atlas 先出一版方案。"
            action={<Link to="/plan" className="mag-cta is-ghost">去规划</Link>}
          />
        ) : (
          <div className="mag-trip-grid">
            {drafts.map(trip => (
              <TripCard
                key={trip.id}
                trip={trip}
                onOpen={() => {
                  dispatch({ type: 'activate', id: trip.id })
                  navigate(trip.phase === 'ready' ? `/trip/${trip.id}` : '/plan')
                }}
                onRemove={() => dispatch({ type: 'remove', id: trip.id })}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mag-trips-section" aria-labelledby="mag-trips-favorites">
        <header className="mag-section-head">
          <h2 id="mag-trips-favorites"><Heart size={15} aria-hidden="true" /> 收藏的目的地</h2>
          {favoriteDestinations.length > 0 ? (
            <button
              type="button"
              className={`mag-section-more mag-collapse-toggle ${favoritesOpen ? 'is-open' : ''}`}
              aria-expanded={favoritesOpen}
              aria-controls="mag-favorites-body"
              onClick={() => setFavoritesOpen(value => !value)}
            >
              {favoritesOpen ? '收起' : `展开 (${favoriteDestinations.length})`}
              <ChevronDown size={13} aria-hidden="true" />
            </button>
          ) : (
            <Link to="/explore" className="mag-section-more">去探索</Link>
          )}
        </header>
        {favoriteDestinations.length === 0 ? (
          <EmptyState
            title="还没有收藏"
            description="在探索页点亮任意目的地的心标，它会出现在这里。"
            action={<Link to="/explore" className="mag-cta is-ghost">探索目的地</Link>}
          />
        ) : favoritesOpen ? (
          <div id="mag-favorites-body" className="mag-destination-grid">
            {favoriteDestinations.map(destination => (
              <DestinationCard
                key={destination.id}
                destination={destination}
                onPlan={() => planDestination(destination.id)}
              />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}
