import { ArrowLeft, ArrowRight, Heart } from 'lucide-react'
import { useRouter } from '../app/router'
import { useFavorites } from '../hooks/useFavorites'
import { destinationById } from '../content/destinations'
import { useJourney } from '../app/JourneyProvider'
import { createJourneySession } from '../features/journey'
import { EmptyState } from '../components/states'

export default function DestinationDetailPage({ destinationId }: { destinationId: string }) {
  const { navigate } = useRouter()
  const { dispatch } = useJourney()
  const { isFavorite, toggle } = useFavorites()
  const destination = destinationById(destinationId)
  if (!destination) return <EmptyState title="找不到这篇目的地文档" description="返回探索页选择其他目的地。" action={<button className="mag-cta" onClick={() => navigate('/explore')}>返回探索</button>} />
  const plan = () => {
    dispatch({ type: 'add', session: createJourneySession({ title: `${destination.name} · 文档规划`, form: { ...createJourneySession().form, destination: destination.formDefaults.destination, days: destination.formDefaults.days, budget: destination.formDefaults.budget } }) })
    navigate('/plan')
  }
  return <article className="mag-page mag-destination-detail">
    <button type="button" className="mag-detail-back" onClick={() => { if (window.history.length > 1) window.history.back(); else navigate('/explore') }}><ArrowLeft size={15} /> 探索目的地</button>
    <header className="mag-detail-head"><img src={destination.coverImages?.[0] ?? destination.coverImage ?? '/images/destinations/fallback.svg'} alt={destination.coverAlt ?? `${destination.name}旅行风景`} onError={e => { e.currentTarget.src = '/images/destinations/fallback.svg' }} /><span className="mag-kicker">目的地文档 · {destination.region}</span><h1>{destination.name}</h1><p>{destination.blurb}</p><div className="mag-destination-tags">{destination.styles.map(s => <i key={s}>{s}</i>)}</div><dl className="destination-detail-facts"><div><dt>建议天数</dt><dd>{destination.recommendedDays ?? destination.suggestDays}</dd></div><div><dt>推荐季节</dt><dd>{destination.bestSeason}</dd></div><div><dt>旅行方式</dt><dd>{destination.travelStyle ?? destination.styles.join('、')}</dd></div></dl></header>
    <nav className="destination-detail-toc" aria-label="攻略导览"><span>攻略导览</span>{['城市印象','必看景点','一日 / 两日思路','吃什么','交通与住宿','避坑提醒'].map(title => <button type="button" key={title} onClick={() => document.getElementById(`destination-${title}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{title}</button>)}</nav>
    <div className="mag-detail-document">{(destination.sections ?? []).map(section => <section id={`destination-${section.title}`} key={section.title}><h2>{section.title}</h2><p>{section.content}</p>{section.items && <ul>{section.items.map(item => <li key={item}>{item}</li>)}</ul>}{section.days && <div className="destination-itinerary">{section.days.map(day => <article key={day.day}><strong>{day.day} · {day.title}</strong><p>{day.places.join(' → ')}</p><small>{day.note}</small></article>)}</div>}</section>)}{destination.planningPrompts && <section><h2>交给 Atlas 这样说</h2><ul>{destination.planningPrompts.map(prompt => <li key={prompt}>“{prompt}”</li>)}</ul></section>}</div>
    <footer className="mag-detail-actions"><button className="mag-cta" onClick={plan}>用这个目的地开始规划 <ArrowRight size={15} /></button><button className="mag-ghost-button" onClick={() => toggle(destination.id)}><Heart size={14} fill={isFavorite(destination.id) ? 'currentColor' : 'none'} /> {isFavorite(destination.id) ? '已收藏' : '收藏'}</button></footer>
  </article>
}
