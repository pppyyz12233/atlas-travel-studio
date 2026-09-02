import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  CalendarRange, Check, ChevronDown, Copy, FileDown, FileText, MapPin,
  Route, Sparkles, WalletCards,
} from 'lucide-react'
import SafeMarkdown from '../../components/SafeMarkdown'
import type { Location } from '../../types'
import type { JourneyStep } from './model'
import OrchestrationTimeline from './OrchestrationTimeline'
import type { ItineraryViewModel } from './viewModel'

type ResultTab = 'overview' | 'daily' | 'budget' | 'document' | 'trace'

interface ItineraryWorkspaceProps {
  viewModel: ItineraryViewModel
  city: string
  steps: JourneyStep[]
  locations: Location[]
  onSearchMap: (keyword: string, city: string) => void
  onExport?: (format: 'md' | 'pdf') => void
  notice?: { tone: 'success' | 'error'; message: string } | null
}

const categoryClass: Record<string, string> = {
  '机票': 'is-flight', '航班': 'is-flight',
  '酒店': 'is-hotel', '住宿': 'is-hotel',
  '门票': 'is-attraction', '景点': 'is-attraction',
  '餐饮': 'is-food', '交通': 'is-transit',
}

export default function ItineraryWorkspace({
  viewModel,
  city,
  steps,
  locations,
  onSearchMap,
  onExport,
  notice = null,
}: ItineraryWorkspaceProps) {
  const [tab, setTab] = useState<ResultTab>(viewModel.hasStructuredOverview ? 'overview' : 'document')
  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({ 0: true })
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const copyTimerRef = useRef<number | null>(null)
  const tabRefs = useRef<Partial<Record<ResultTab, HTMLButtonElement | null>>>({})
  const maxBudget = useMemo(
    () => Math.max(...viewModel.budgetItems.map(item => item.amount), 1),
    [viewModel.budgetItems],
  )

  const tabs: Array<{ id: ResultTab; label: string; disabled: boolean }> = [
    { id: 'overview', label: '概览', disabled: !viewModel.hasStructuredOverview },
    { id: 'daily', label: '逐日行程', disabled: viewModel.days.length === 0 },
    { id: 'budget', label: '预算', disabled: viewModel.budgetItems.length === 0 },
    { id: 'document', label: '完整方案', disabled: !viewModel.markdown.trim() },
    { id: 'trace', label: '执行记录', disabled: steps.length === 0 },
  ]
  const availableTabs = tabs.filter(item => !item.disabled)

  useEffect(() => {
    if (tabs.find(item => item.id === tab)?.disabled) {
      setTab(availableTabs[0]?.id ?? 'document')
    }
  }, [tab, viewModel.hasStructuredOverview, viewModel.days.length, viewModel.budgetItems.length, viewModel.markdown, steps.length])

  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
  }, [])

  const copyPlan = async () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
    try {
      await navigator.clipboard.writeText(viewModel.markdown)
      setCopyStatus('success')
      copyTimerRef.current = window.setTimeout(() => {
        setCopyStatus('idle')
        copyTimerRef.current = null
      }, 1600)
    } catch {
      setCopyStatus('error')
    }
  }

  const moveTab = (current: ResultTab, key: string) => {
    const currentIndex = availableTabs.findIndex(item => item.id === current)
    if (currentIndex === -1) return
    let nextIndex = currentIndex
    if (key === 'ArrowRight') nextIndex = (currentIndex + 1) % availableTabs.length
    if (key === 'ArrowLeft') nextIndex = (currentIndex - 1 + availableTabs.length) % availableTabs.length
    if (key === 'Home') nextIndex = 0
    if (key === 'End') nextIndex = availableTabs.length - 1
    if (nextIndex === currentIndex && key !== 'Home' && key !== 'End') return
    const next = availableTabs[nextIndex]
    if (!next) return
    setTab(next.id)
    tabRefs.current[next.id]?.focus()
  }

  const dossierFacts = [
    viewModel.days.length > 0 ? `${viewModel.days.length} 天` : '',
    locations.length > 0 ? `${locations.length} 个地图地点` : '',
  ].filter(Boolean).join(' · ')

  const exportResult = (format: 'md' | 'pdf') => {
    if (!onExport) return
    if (format === 'pdf' && viewModel.markdown.trim() && tab !== 'document') {
      flushSync(() => setTab('document'))
    }
    onExport(format)
  }

  return (
    <section className="atlas-itinerary" aria-labelledby="atlas-itinerary-title">
      <header className="atlas-result-header">
        <div>
          <span className="atlas-kicker"><Sparkles size={13} aria-hidden="true" /> Curated itinerary</span>
          <h2 id="atlas-itinerary-title">{city || '目的地'}旅程工作区</h2>
          <p>方案来自真实执行结果；你可以查看日程、预算、地点和智能体记录。</p>
        </div>
        <div className="atlas-result-actions">
          <button type="button" onClick={() => void copyPlan()} aria-label={copyStatus === 'success' ? '已复制方案' : copyStatus === 'error' ? '复制失败，重试复制方案' : '复制方案'}>
            {copyStatus === 'success' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
            {copyStatus === 'success' ? '已复制' : copyStatus === 'error' ? '重试复制' : '复制'}
          </button>
          {onExport && (
            <>
              <button type="button" onClick={() => exportResult('md')} aria-label="导出 Markdown"><FileText size={15} aria-hidden="true" /> Markdown</button>
              <button type="button" onClick={() => exportResult('pdf')} aria-label="导出 PDF"><FileDown size={15} aria-hidden="true" /> PDF</button>
            </>
          )}
        </div>
      </header>

      {copyStatus === 'error' && <p className="atlas-result-notice is-error" role="alert">复制失败，请检查浏览器剪贴板权限后重试。</p>}
      {notice && (
        <p className={`atlas-result-notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.message}
        </p>
      )}

      <div className="atlas-result-tabs" role="tablist" aria-label="旅行方案视图">
        {tabs.map(item => (
          <button
            type="button"
            role="tab"
            id={`atlas-tab-${item.id}`}
            aria-controls={`atlas-panel-${item.id}`}
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            className={tab === item.id ? 'is-active' : ''}
            disabled={item.disabled}
            key={item.id}
            ref={element => { tabRefs.current[item.id] = element }}
            onClick={() => setTab(item.id)}
            onKeyDown={event => {
              if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              moveTab(item.id, event.key)
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="atlas-result-panel" role="tabpanel" id={`atlas-panel-${tab}`} aria-labelledby={`atlas-tab-${tab}`}>
        {tab === 'overview' && (
          <div className="atlas-overview-grid">
            <article className="atlas-overview-lead">
              <span>Journey dossier</span>
              <h3>{dossierFacts || '完整旅行提案'}</h3>
              <p>{viewModel.days[0]?.title || '完整旅行提案已生成，可继续通过对话微调。'}</p>
              {viewModel.days[0]?.items.slice(0, 3).map((item, index) => (
                <div className="atlas-highlight-row" key={`${item.description}-${index}`}>
                  <b>{item.time || String(index + 1).padStart(2, '0')}</b><span>{item.description}</span>
                </div>
              ))}
            </article>
            {viewModel.budgetItems.length > 0 && <article className="atlas-overview-stat">
              <WalletCards size={20} aria-hidden="true" />
              <span>预算合计</span>
              <strong>¥{Math.round(viewModel.budgetTotal).toLocaleString()}</strong>
              <small>{viewModel.budgetItems.length} 个费用项目</small>
            </article>}
            {viewModel.days.length > 0 && <article className="atlas-overview-stat">
              <CalendarRange size={20} aria-hidden="true" />
              <span>日程密度</span>
              <strong>{viewModel.days.reduce((total, day) => total + day.items.length, 0)}</strong>
              <small>项可执行安排</small>
            </article>}
          </div>
        )}

        {tab === 'daily' && (
          <div className="atlas-days">
            {viewModel.days.map((day, index) => {
              const expanded = Boolean(expandedDays[index])
              return (
                <article className={`atlas-day-card ${expanded ? 'is-expanded' : ''}`} key={`${day.day}-${index}`}>
                  <button type="button" className="atlas-day-trigger" onClick={() => setExpandedDays(value => ({ ...value, [index]: !value[index] }))} aria-expanded={expanded}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <span><strong>{day.day}</strong><small>{day.title.replace(/^Day\s*\d+\s*[-—：:]?\s*/i, '') || `${city}探索日`}</small></span>
                    <em>{day.items.length} 项</em>
                    <ChevronDown size={17} aria-hidden="true" />
                  </button>
                  {expanded && (
                    <div className="atlas-day-timeline">
                      {day.items.map((item, itemIndex) => (
                        <div className="atlas-day-item" key={`${item.description}-${itemIndex}`}>
                          <span className="atlas-day-dot" aria-hidden="true" />
                          <time>{item.time || String(itemIndex + 1)}</time>
                          <p>{item.description}</p>
                          <button type="button" onClick={() => onSearchMap(item.description.slice(0, 28), city)} aria-label={`在地图查看 ${item.description}`}>
                            <MapPin size={14} aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}

        {tab === 'budget' && (
          <div className="atlas-budget-board">
            <header><span><WalletCards size={19} aria-hidden="true" /> 费用结构</span><strong>¥{Math.round(viewModel.budgetTotal).toLocaleString()}</strong></header>
            <div>
              {viewModel.budgetItems.map(item => (
                <div className="atlas-budget-row" key={`${item.category}-${item.amount}`}>
                  <span>{item.category}</span>
                  <div><i className={categoryClass[item.category] || 'is-other'} style={{ width: `${Math.max(item.amount / maxBudget * 100, 8)}%` }} /></div>
                  <strong>¥{Math.round(item.amount).toLocaleString()}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'document' && <article className="atlas-document"><SafeMarkdown content={viewModel.markdown} /></article>}

        {tab === 'trace' && (
          <OrchestrationTimeline steps={steps} graphNode="" phase="ready" statusMessage="" onRetry={() => undefined} onEditBrief={() => undefined} compact />
        )}

        {tab === 'overview' && !viewModel.hasStructuredOverview && (
          <div className="atlas-empty-result"><Route size={22} aria-hidden="true" /> 当前结果仅提供完整文档视图。</div>
        )}
      </div>
    </section>
  )
}
