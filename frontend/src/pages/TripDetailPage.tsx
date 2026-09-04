import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, CalendarDays, Copy, Check, Download, FileDown, FileText,
  MapPinned, Users, Wallet, ListChecks,
} from 'lucide-react'
import { Link, useRouter } from '../app/router'
import { useJourney } from '../app/JourneyProvider'
import { useToast } from '../app/Toast'
import SafeMarkdown from '../components/SafeMarkdown'
import TripTimeline from '../components/TripTimeline'
import MapView from '../components/MapView'
import type { MapApi } from '../components/MapView'
import { EmptyState } from '../components/states'
import { buildItineraryViewModel, routeLabel } from '../features/journey'
import { buildRoutedLocations, findLocationKeyByText } from '../features/journey/mapRouting'
import { getWorkerMeta } from '../features/journey'
import { getTransportGuide, hasTripTransport } from '../content/transportGuides'
import { destinations } from '../content/destinations'

export default function TripDetailPage({ sessionId }: { sessionId: string }) {
  const { state, dispatch } = useJourney()
  const { navigate } = useRouter()
  const { notify } = useToast()
  const mapRef = useRef<MapApi | null>(null)
  const session = state.sessions.find(item => item.id === sessionId)
  const [checklist, setChecklist] = useState<Record<string, boolean>>({})
  const [activeDay, setActiveDay] = useState<number | null>(0)
  // hooks 必须在下面的早退 return 之前（此前 pdfExporting 声明在早退之后，属条件调用 hook）
  const [pdfExporting, setPdfExporting] = useState(false)
  useEffect(() => {
    document.querySelector('.mag-main')?.scrollTo({ top: 0, behavior: 'auto' })
  }, [sessionId])

  const searchMap = useCallback((keyword: string, city: string) => {
    mapRef.current?.searchAndMark(keyword, city, keyword, getWorkerMeta('itinerary').markerColor)
  }, [])

  const viewModel = useMemo(
    () => buildItineraryViewModel(session?.finalReply ?? '', session?.tripState),
    [session?.finalReply, session?.tripState],
  )

  // 阶段4：地点派生 + 时间轴 → 地图聚焦（未命中回落 POI 搜索）
  const routedLocations = useMemo(
    () => buildRoutedLocations(session?.locations ?? [], viewModel.days).routed,
    [session?.locations, viewModel.days],
  )
  const visibleDays = useMemo(() => activeDay === null ? viewModel.days : viewModel.days.filter((_, index) => index === activeDay), [activeDay, viewModel.days])
  const visibleLocations = useMemo(() => activeDay === null ? (session?.locations ?? []) : routedLocations.filter(location => location.day === activeDay), [activeDay, routedLocations, session?.locations])
  const visibleRouted = useMemo(() => activeDay === null ? routedLocations : routedLocations.filter(location => location.day === activeDay), [activeDay, routedLocations])
  const focusOrSearchMap = useCallback((itemText: string): boolean => {
    const mapSection = document.querySelector('.mag-detail-map')
    const rect = mapSection?.getBoundingClientRect()
    const visible = Boolean(rect && rect.top < window.innerHeight && rect.bottom > 0)
    const key = findLocationKeyByText(visibleRouted, itemText)
    const focus = () => {
      if (key && mapRef.current?.focusLocation(key)) {
        notify('success', `地图已定位到：${itemText.slice(0, 24)}`)
        return
      }
      if (mapRef.current) {
        const combined = itemText.match(/[（(]([^）)]+)[）)]/)?.[1]
        const searchTerm = combined?.split(/[、,，\-—]/)[0]?.trim() || itemText.replace(/^\s*\d{1,2}:\d{2}\s*/, '').slice(0, 28)
        searchMap(searchTerm, session?.form.destination ?? '')
        notify('info', `正在地图中搜索：${searchTerm.slice(0, 24)}`)
      } else notify('info', '地图仍在加载，请稍后再试')
    }
    if (visible) focus()
    else if (mapSection) {
      mapSection.scrollIntoView({ behavior: 'smooth', block: 'center' })
      window.setTimeout(focus, 500)
    } else focus()
    return true
  }, [visibleRouted, session?.form.destination, notify, searchMap])

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

  // PDF 走后端下载；游客不自动打开打印窗口（pdfExporting 状态已上移到 hooks 区）
  const exportPdf = async () => {
    const token = localStorage.getItem('travel_token')
    const endpoint = session.conversationId ? `/api/export/${session.conversationId}?format=pdf` : '/api/export/guest'
    if (pdfExporting) return
    setPdfExporting(true)
    try {
      const response = await fetch(endpoint, session.conversationId ? { headers: { Authorization: `Bearer ${token}` } } : {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: session.form.destination, dates: session.form.date, content: viewModel.markdown }),
      })
      if (!response.ok) throw new Error('export failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const stem = `${session.form.destination.trim() || 'trip-plan'}-${session.form.date || ''}`.replace(/[\\/:*?"<>|]+/g, '-').replace(/-+$/, '')
      link.href = url
      link.download = `${stem}-travel-plan.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      notify('success', 'PDF 导出已开始')
    } catch {
      notify('error', 'PDF 导出失败；Markdown 导出不受影响。')
    } finally { setPdfExporting(false) }
  }

  return (
    <div className="mag-page mag-trip-detail">
      <nav className="mag-detail-back" aria-label="返回">
        <button type="button" onClick={() => navigate('/trips')}>
          <ArrowLeft size={15} aria-hidden="true" /> 我的行程
        </button>
      </nav>

      <header className="mag-detail-head mag-detail-head--compact">
        <span className="mag-kicker">Itinerary · {session.conversationId ? '云端行程' : '本地行程'}</span>
        <h1>{session.form.destination || '目的地待定'} · {session.form.days} 天行程</h1>
        <p className="mag-detail-route">
          <b>{session.form.origin.label || '出发地待定'}</b>
          <ArrowRight size={14} aria-hidden="true" />
          <b>{session.form.destination || '目的地待定'}</b>
        </p>
        <dl className="mag-detail-facts mag-detail-summary">
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
          <button type="button" disabled={pdfExporting} className="mag-ghost-button" onClick={() => void exportPdf()}>
            <FileDown size={14} aria-hidden="true" /> PDF
          </button>
        </div>
      </header>

      {/* 目的地攻略条：只使用编辑部已策展的真实内容（blurb/最佳季节/建议天数），
          未收录目的地不渲染——不生成占位假攻略 */}
      {(() => {
        const guide = destinations.find(item => item.name === session.form.destination.trim())
        if (!guide) return null
        return (
          <aside className="mag-destination-strip" aria-label="目的地攻略（Atlas 编辑部）">
            <span className="mag-kicker">Atlas 编辑部 · {guide.region}</span>
            <p>{guide.blurb}</p>
            <dl>
              <div><dt>最佳季节</dt><dd>{guide.bestSeason}</dd></div>
              <div><dt>建议时长</dt><dd>{guide.suggestDays}</dd></div>
              <div><dt>旅行风格</dt><dd>{guide.styles.join(' / ')}</dd></div>
            </dl>
          </aside>
        )
      })()}

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

      {viewModel.days.length > 0 ? (
        <>
          <nav className="trip-day-switcher" aria-label="行程日期"><span>查看行程</span>{viewModel.days.map((day, index) => <button type="button" key={day.day} className={activeDay === index ? 'is-active' : ''} aria-pressed={activeDay === index} onClick={() => setActiveDay(index)}><b>{String(index + 1).padStart(2, '0')}</b><span>第{index + 1}天</span><small>{(() => { const located = buildRoutedLocations(session.locations, viewModel.days).plan.legendDays.find(item => item.day === index + 1)?.count ?? 0; return `${day.items.length} 个行程地点 · ${located} 个可定位` })()}</small></button>)}<button type="button" className={activeDay === null ? 'is-active' : ''} aria-pressed={activeDay === null} onClick={() => setActiveDay(null)}><b>—</b><span>全部</span><small>完整行程</small></button></nav>

          <div className="mag-detail-grid">
            <section className="mag-detail-timeline" aria-label="逐日行程">
              <h2>每日安排</h2>
              <TripTimeline days={visibleDays} city={session.form.destination} />
            </section>

            <aside className="mag-detail-map" aria-label="路线预览">
              <h2><MapPinned size={15} aria-hidden="true" /> 路线预览</h2>
              <div className="mag-map-frame">
                {/* days 传完整列表：MapView 内部按“地点名⊂日程条目”重新派生天/顺序，
                    若传过滤后的 days 会把第 N 天重标成 D1 且颜色错位；locations 才是过滤维度 */}
                <MapView locations={visibleLocations} days={viewModel.days} onMapReady={apiInstance => { mapRef.current = apiInstance }} />
              </div>
              <p className="mag-map-note">{session.locations.length > 0 ? '坐标来自智能体检索的真实地点。' : '本次执行未返回坐标数据。'}</p>
            </aside>
          </div>
        </>
      ) : (
        /* 无结构化日程：不渲染空时间轴和空的日期选择器，只留紧凑提示；
           地图仍显示全部坐标（未排期 marker）——只有真没有有效坐标才显示空态 */
        <>
          <section className="mag-detail-timeline" aria-label="逐日行程">
            <h2>每日安排</h2>
            <p className="mag-timeline-note mag-timeline-note--solo">本次方案为自由叙述式，未解析出结构化日程 —— 完整内容请直接阅读下方方案全文。</p>
            <aside className="mag-detail-map mag-detail-map--solo" aria-label="路线预览">
              <h2><MapPinned size={15} aria-hidden="true" /> 路线预览</h2>
              <div className="mag-map-frame">
                <MapView locations={session.locations} days={[]} onMapReady={apiInstance => { mapRef.current = apiInstance }} />
              </div>
              <p className="mag-map-note">{session.locations.length > 0 ? '坐标来自智能体检索的真实地点。' : '本次执行未返回坐标数据。'}</p>
            </aside>
          </section>
        </>
      )}

      {/* 交通与住宿 —— 与规划页阅读态同构的双来源结构：
          A. 本次行程生成内容（正文原文，优先）；B. Atlas 编辑部交通指南（带免责声明）。
          无本次交通数据时展示编辑部指南，绝不留大面积空白，也不编造实时数据。 */}
      <section className="mag-detail-transit" aria-label="交通与住宿">
        <h2>交通与住宿</h2>
        <div className="atlas-transit-grid">
          <div className="atlas-transit-card">
            <h3>交通 {hasTripTransport(viewModel.transportMarkdown)
              ? <span className="atlas-source-tag">本次行程生成内容</span>
              : <span className="atlas-source-tag is-editorial">Atlas 编辑部指南</span>}
            </h3>
            {hasTripTransport(viewModel.transportMarkdown)
              ? <>
                <SafeMarkdown content={viewModel.transportMarkdown} />
                <details className="atlas-transit-editorial">
                  <summary>目的地通用交通建议（编辑部）</summary>
                  <ul>
                    {getTransportGuide(session.form.destination).tips.map(tip => <li key={tip.slice(0, 24)}>{tip}</li>)}
                  </ul>
                  <p className="atlas-transport-guide-disclaimer">{getTransportGuide(session.form.destination).disclaimer}</p>
                </details>
              </>
              : (
                <div className="atlas-transport-guide">
                  <p className="atlas-transport-guide-summary">{getTransportGuide(session.form.destination).summary}</p>
                  <ul>
                    {getTransportGuide(session.form.destination).tips.map(tip => <li key={tip.slice(0, 24)}>{tip}</li>)}
                  </ul>
                  <p className="atlas-transport-guide-disclaimer">{getTransportGuide(session.form.destination).disclaimer}</p>
                </div>
              )}
          </div>
          <div className="atlas-transit-card">
            <h3>住宿 <span className="atlas-source-tag">本次行程生成内容</span></h3>
            {viewModel.lodgingMarkdown.trim()
              ? <>
                <SafeMarkdown content={viewModel.lodgingMarkdown} />
                <p className="atlas-data-note">酒店与价格为方案生成时的建议，非实时数据；预订前请以平台实时信息为准。</p>
              </>
              : <p className="mag-timeline-note">本次方案未生成住宿内容，可回到规划页继续追问「推荐住哪个区域」。</p>}
          </div>
        </div>
      </section>

      {visibleDays[0] && (
        <section className="today-execution" aria-labelledby="today-execution-title">
          <div className="today-execution__head"><div><span className="mag-kicker">Today</span><h2 id="today-execution-title">今日执行</h2><p>{session.form.date || '出发日期待定'} · {activeDay === null ? '全部行程' : visibleDays[0].day}</p></div></div>
          <ol>{visibleDays[0].items.map((item, index) => <li key={`${item.description}-${index}`}><time>{item.time || `${String(index + 1).padStart(2, '0')}`}</time><span>{item.description}</span><button type="button" className="mag-ghost-button" onClick={() => focusOrSearchMap(item.description)}>查看地图</button></li>)}</ol>
        </section>
      )}

      <section className="trip-checklist" aria-labelledby="trip-checklist-title">
        <h2 id="trip-checklist-title"><ListChecks size={16} aria-hidden="true" /> 出行清单</h2>
        <div className="trip-checklist__items">{['证件与必要预约已确认', '交通和住宿地址已保存', '天气与随身衣物已检查', '充电器、药品等随身物品已准备'].map(item => <label key={item}><input type="checkbox" checked={Boolean(checklist[item])} onChange={event => setChecklist(current => ({ ...current, [item]: event.target.checked }))} /><span>{item}</span></label>)}</div>
      </section>

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
