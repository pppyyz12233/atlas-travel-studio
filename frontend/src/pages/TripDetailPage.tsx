import { useMemo, useRef } from 'react'
import {
  ArrowLeft, ArrowRight, CalendarDays, Copy, Check, Download, FileDown, FileText,
  MapPinned, Users, Wallet,
} from 'lucide-react'
import { Link, useRouter } from '../app/router'
import { useJourney } from '../app/JourneyProvider'
import { useToast } from '../app/Toast'
import SafeMarkdown from '../components/SafeMarkdown'
import TripTimeline from '../components/TripTimeline'
import MapView from '../components/MapView'
import type { MapApi } from '../components/MapView'
import { EmptyState } from '../components/states'
import { buildItineraryViewModel } from '../features/journey'
import { getWorkerMeta } from '../features/journey'

export default function TripDetailPage({ sessionId }: { sessionId: string }) {
  const { state, dispatch } = useJourney()
  const { navigate } = useRouter()
  const { notify } = useToast()
  const mapRef = useRef<MapApi | null>(null)
  const session = state.sessions.find(item => item.id === sessionId)

  const viewModel = useMemo(
    () => buildItineraryViewModel(session?.finalReply ?? '', session?.tripState),
    [session?.finalReply, session?.tripState],
  )

  if (!session) {
    return (
      <div className="mag-page">
        <EmptyState
          title="找不到这份行程"
          description="它可能来自一次已清理的本地草稿。回到我的行程看看其余记录。"
          action={<Link to="/trips" className="mag-cta is-ghost">前往我的行程</Link>}
        />
      </div>
    )
  }

  if (!session.finalReply.trim()) {
    return (
      <div className="mag-page">
        <EmptyState
          title="这份行程还没有生成结果"
          description={session.phase === 'planning' ? '它正在规划中，去工作区看看实时进度。' : '回到规划页补充需求并生成方案。'}
          action={<button type="button" className="mag-cta" onClick={() => { dispatch({ type: 'activate', id: session.id }); navigate('/plan') }}>继续规划</button>}
        />
      </div>
    )
  }

  const searchMap = (keyword: string, city: string) => {
    mapRef.current?.searchAndMark(keyword, city, keyword, getWorkerMeta('itinerary').markerColor)
  }

  const copyPlan = async () => {
    try {
      await navigator.clipboard.writeText(viewModel.markdown)
      notify('success', '方案已复制到剪贴板')
    } catch {
      notify('error', '复制失败，请检查剪贴板权限')
    }
  }

  const exportMarkdown = () => {
    const blob = new Blob([viewModel.markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const city = session.form.destination.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'trip-plan'
    link.href = url
    link.download = `${city}-travel-plan.md`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    notify('success', 'Markdown 已下载')
  }

  // PDF 走后端 /api/export（需登录 + Bearer 头）；无会话或失败时降级浏览器打印
  const exportPdf = async () => {
    const token = localStorage.getItem('travel_token')
    if (!token || !session.conversationId) {
      window.print()
      notify('info', '已打开系统打印窗口，可选择「另存为 PDF」。')
      return
    }
    try {
      const response = await fetch(`/api/export/${session.conversationId}?format=pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('export failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `trip-plan-${session.conversationId}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      notify('success', 'PDF 导出已开始')
    } catch {
      notify('error', 'PDF 导出失败；Markdown 导出不受影响。')
    }
  }

  return (
    <div className="mag-page mag-trip-detail">
      <nav className="mag-detail-back" aria-label="返回">
        <button type="button" onClick={() => navigate('/trips')}>
          <ArrowLeft size={15} aria-hidden="true" /> 我的行程
        </button>
      </nav>

      <header className="mag-detail-head">
        <span className="mag-kicker">Itinerary · {session.conversationId ? '云端行程' : '本地行程'}</span>
        <h1>{session.form.destination} · {session.form.days} 天行程</h1>
        <p className="mag-detail-route">
          <b>{session.form.origin}</b>
          <ArrowRight size={14} aria-hidden="true" />
          <b>{session.form.destination}</b>
        </p>
        <dl className="mag-detail-facts">
          <div><dt><CalendarDays size={14} aria-hidden="true" /> 出发日期</dt><dd>{session.form.date || '待定'}</dd></div>
          <div><dt><Users size={14} aria-hidden="true" /> 同行人数</dt><dd>{session.form.people} 人</dd></div>
          <div><dt><Wallet size={14} aria-hidden="true" /> 预算参考</dt><dd>¥{session.form.budget.toLocaleString()} / 人</dd></div>
          <div><dt><MapPinned size={14} aria-hidden="true" /> 地图坐标</dt><dd>{session.locations.length} 个真实地点</dd></div>
        </dl>
        <div className="mag-detail-actions">
          <button type="button" className="mag-cta" onClick={() => { dispatch({ type: 'activate', id: session.id }); navigate('/plan') }}>
            继续调整 <ArrowRight size={15} aria-hidden="true" />
          </button>
          <button type="button" className="mag-ghost-button" onClick={() => void copyPlan()}>
            <Copy size={14} aria-hidden="true" /> 复制
          </button>
          <button type="button" className="mag-ghost-button" onClick={exportMarkdown}>
            <Download size={14} aria-hidden="true" /> Markdown
          </button>
          <button type="button" className="mag-ghost-button" onClick={() => void exportPdf()}>
            <FileDown size={14} aria-hidden="true" /> PDF
          </button>
        </div>
      </header>

      {viewModel.budgetItems.length > 0 && (
        <section className="mag-detail-budget" aria-label="预算结构">
          <h2>预算结构</h2>
          <div className="mag-budget-rows">
            {viewModel.budgetItems.map(item => {
              const max = Math.max(...viewModel.budgetItems.map(part => part.amount), 1)
              return (
                <div className="mag-budget-line" key={`${item.category}-${item.amount}`}>
                  <span>{item.category}</span>
                  <i><b style={{ width: `${Math.max(item.amount / max * 100, 6)}%` }} /></i>
                  <strong>¥{Math.round(item.amount).toLocaleString()}</strong>
                </div>
              )
            })}
            <p className="mag-budget-total">
              合计约 <strong>¥{Math.round(viewModel.budgetTotal).toLocaleString()}</strong>
              <small>（金额均来自后端真实返回，预订前请复核）</small>
            </p>
          </div>
        </section>
      )}

      <div className="mag-detail-grid">
        <section className="mag-detail-timeline" aria-label="逐日行程">
          <h2>逐日行程</h2>
          {viewModel.days.length > 0 ? (
            <TripTimeline days={viewModel.days} city={session.form.destination} onSearchMap={searchMap} />
          ) : (
            <p className="mag-timeline-note">本次方案为自由叙述式，未解析出结构化日程；完整内容见下方方案全文。</p>
          )}
        </section>

        <aside className="mag-detail-map" aria-label="行程地图">
          <h2><MapPinned size={15} aria-hidden="true" /> 行程地图</h2>
          <div className="mag-map-frame">
            <MapView locations={session.locations} onMapReady={apiInstance => { mapRef.current = apiInstance }} />
          </div>
          <p className="mag-map-note">{session.locations.length > 0 ? '坐标来自智能体检索的真实地点。' : '本次执行未返回坐标数据。'}</p>
        </aside>
      </div>

      <section className="mag-detail-document" aria-label="方案全文">
        <h2><FileText size={15} aria-hidden="true" /> 方案全文</h2>
        <article className="mag-document-paper">
          <SafeMarkdown content={viewModel.markdown} />
        </article>
        <p className="mag-detail-hint"><Check size={13} aria-hidden="true" /> 以上内容由 Atlas 智能体生成并原样保留，可随时在规划页继续追问修改。</p>
      </section>
    </div>
  )
}
