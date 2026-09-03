import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowUpRight, Check, CheckCircle2, ChevronDown, Copy, FileDown, FileText, MapPinned } from 'lucide-react'
import SafeMarkdown from '../../components/SafeMarkdown'
import TripTimeline from '../../components/TripTimeline'
import OrchestrationTimeline from './OrchestrationTimeline'
import type { JourneyStep } from './model'
import type { ItineraryViewModel } from './viewModel'

const EXPORT_MENU_ID = 'atlas-export-menu'

interface ItineraryWorkspaceProps {
  viewModel: ItineraryViewModel
  city: string
  steps: JourneyStep[]
  locations: LocationLike[]
  onSearchMap: (keyword: string, city: string) => void
  onExport?: (format: 'md' | 'pdf') => void
  notice?: { tone: 'success' | 'error'; message: string } | null
  /** 主流程：完成后去行程详情阅读视图 */
  onOpenTrip?: () => void
  /** 保存状态徽标：cloud = 已落库；local = 游客本地草稿 */
  saveState?: 'cloud' | 'local'
  /** local 徽标可点击唤起登录 */
  onLogin?: () => void
  /** 阅读态摘要行：路线 / 日期 / 人数 */
  route?: string
  date?: string
  people?: number
  /** 阶段4：打开右栏地图（移动端完成态的地图入口） */
  onOpenMap?: () => void
  /** 阶段4：时间轴条目 → 地图聚焦（返回 false 回落 POI 搜索） */
  onFocusLocation?: (itemText: string) => boolean
}

interface LocationLike {
  lng: number
  lat: number
  name: string
  address: string
  type?: string
}

// R2 次级折叠：默认收起，点击展开完整内容；数据不删只改层级
function Fold({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="atlas-fold">
      <button
        type="button"
        className={`atlas-fold-toggle ${open ? 'is-open' : ''}`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen(value => !value)}
      >
        <ChevronDown size={15} aria-hidden="true" />
        {label}
      </button>
      {open && (
        <div id={`${id}-panel`} className="atlas-fold-panel" role="region" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  )
}

// R1 阅读态：done 后的规划页不再是 Tab 工作区，而是一条线性阅读主线
// 摘要（路线/日期/预算 + 保存状态 + 唯一主按钮）→ 每日安排 → 方案全文
export default function ItineraryWorkspace({
  viewModel,
  city,
  steps,
  onSearchMap,
  onExport,
  notice = null,
  onOpenTrip,
  saveState,
  onLogin,
  route,
  date,
  people,
  onOpenMap,
  onFocusLocation,
}: ItineraryWorkspaceProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [exportOpen, setExportOpen] = useState(false)
  const copyTimerRef = useRef<number | null>(null)
  const exportRef = useRef<HTMLDivElement | null>(null)
  const exportTriggerRef = useRef<HTMLButtonElement | null>(null)
  const maxBudget = Math.max(...viewModel.budgetItems.map(item => item.amount), 1)

  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
  }, [])

  // R3 导出菜单：Esc 关闭并回焦触发钮；点击菜单外区域关闭
  useEffect(() => {
    if (!exportOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setExportOpen(false)
        exportTriggerRef.current?.focus()
      }
    }
    const onPointerDown = (event: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [exportOpen])

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

  const runExport = (format: 'md' | 'pdf') => {
    setExportOpen(false)
    onExport?.(format)
  }

  return (
    <section className="atlas-reading" aria-labelledby="atlas-reading-title">
      <header className="atlas-reading-head">
        <p className="atlas-reading-status">
          <CheckCircle2 size={15} aria-hidden="true" /> 方案已生成
          {saveState === 'cloud' && <span className="atlas-save-badge is-cloud">已保存到云端</span>}
          {saveState === 'local' && (onLogin
            ? <button type="button" className="atlas-save-badge is-local" onClick={onLogin}>已存为本地草稿 · 登录后可同步</button>
            : <span className="atlas-save-badge is-local">已存为本地草稿</span>)}
        </p>
        <div className="atlas-reading-title-row">
          <h2 id="atlas-reading-title">{city || '目的地'} · 行程方案</h2>
          <div className="atlas-result-actions">
            {onOpenTrip && (
              <button type="button" className="atlas-open-trip-action" onClick={onOpenTrip}>
                查看完整行程 <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            )}
            {onOpenMap && (
              <button type="button" className="atlas-viewmap-action" onClick={onOpenMap}>
                <MapPinned size={15} aria-hidden="true" /> 查看地图
              </button>
            )}
            <div className="atlas-export-wrap" ref={exportRef}>
              <button
                type="button"
                ref={exportTriggerRef}
                className={`atlas-export-trigger ${exportOpen ? 'is-open' : ''}`}
                aria-haspopup="menu"
                aria-expanded={exportOpen}
                aria-controls={EXPORT_MENU_ID}
                onClick={() => setExportOpen(value => !value)}
              >
                <FileDown size={15} aria-hidden="true" /> 导出
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              {exportOpen && (
                <div id={EXPORT_MENU_ID} className="atlas-export-menu" role="menu" aria-label="导出操作">
                  <button type="button" role="menuitem" onClick={() => { setExportOpen(false); void copyPlan() }}>
                    {copyStatus === 'success' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                    {copyStatus === 'success' ? '已复制，再复制一份' : '复制方案'}
                  </button>
                  {onExport && (
                    <>
                      <button type="button" role="menuitem" onClick={() => runExport('md')}>
                        <FileText size={15} aria-hidden="true" /> 导出 Markdown
                      </button>
                      <button type="button" role="menuitem" onClick={() => runExport('pdf')}>
                        <FileDown size={15} aria-hidden="true" /> 导出 PDF
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <p className="atlas-reading-stats">
          {route && <span className="atlas-reading-route">{route}</span>}
          {date && <time dateTime={date}>{date}</time>}
          {viewModel.days.length > 0 && <span>{viewModel.days.length} 天</span>}
          {people !== undefined && <span>{people} 人</span>}
          {viewModel.budgetItems.length > 0 && (
            <span className="atlas-reading-budget">预算合计 <strong>¥{Math.round(viewModel.budgetTotal).toLocaleString()}</strong></span>
          )}
          <small>金额均来自后端真实返回</small>
        </p>
      </header>

      {copyStatus === 'error' && <p className="atlas-result-notice is-error" role="alert">复制失败，请检查浏览器剪贴板权限后重试。</p>}
      {notice && (
        <p className={`atlas-result-notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.message}
        </p>
      )}

      <section className="atlas-reading-days" aria-label="每日安排">
        <h3>每日安排</h3>
        {viewModel.days.length > 0 ? (
          <TripTimeline days={viewModel.days} city={city} onSearchMap={onSearchMap} onFocusLocation={onFocusLocation} collapsible />
        ) : (
          <p className="atlas-reading-note">本次方案为自由叙述式，未解析出结构化日程；完整内容见下方方案全文。</p>
        )}
      </section>

      <div className="atlas-reading-folds">
        {viewModel.budgetItems.length > 0 && (
          <Fold id="atlas-fold-budget" label="预算明细">
            <div className="atlas-budget-board">
              <header>
                <span>费用结构</span>
                <strong>¥{Math.round(viewModel.budgetTotal).toLocaleString()}</strong>
              </header>
              <div>
                {viewModel.budgetItems.map(item => (
                  <div className="atlas-budget-row" key={`${item.category}-${item.amount}`}>
                    <span>{item.category}</span>
                    <div><i style={{ width: `${Math.max(item.amount / maxBudget * 100, 8)}%` }} /></div>
                    <strong>¥{Math.round(item.amount).toLocaleString()}</strong>
                  </div>
                ))}
              </div>
            </div>
          </Fold>
        )}

        <Fold id="atlas-fold-execution" label="执行明细">
          {steps.length > 0 ? (
            <OrchestrationTimeline
              steps={steps}
              graphNode=""
              phase="ready"
              statusMessage=""
              onRetry={() => undefined}
              onEditBrief={() => undefined}
            />
          ) : (
            <p className="atlas-reading-note">本次执行没有记录执行明细（如从历史会话恢复的方案）。</p>
          )}
        </Fold>

        <Fold id="atlas-fold-document" label="完整方案">
          {viewModel.markdown.trim() ? (
            <article className="atlas-document"><SafeMarkdown content={viewModel.markdown} /></article>
          ) : (
            <p className="atlas-reading-note">暂无方案全文。</p>
          )}
        </Fold>
      </div>
    </section>
  )
}
