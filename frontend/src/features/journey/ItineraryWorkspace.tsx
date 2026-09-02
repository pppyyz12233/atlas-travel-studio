import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, CheckCircle2, Copy, FileDown, FileText } from 'lucide-react'
import SafeMarkdown from '../../components/SafeMarkdown'
import TripTimeline from '../../components/TripTimeline'
import type { JourneyStep } from './model'
import type { ItineraryViewModel } from './viewModel'

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
}

interface LocationLike {
  lng: number
  lat: number
  name: string
  address: string
  type?: string
}

// R1 阅读态：done 后的规划页不再是 Tab 工作区，而是一条线性阅读主线
// 摘要（路线/日期/预算 + 保存状态 + 唯一主按钮）→ 每日安排 → 方案全文
export default function ItineraryWorkspace({
  viewModel,
  city,
  onSearchMap,
  onExport,
  notice = null,
  onOpenTrip,
  saveState,
  onLogin,
  route,
  date,
  people,
}: ItineraryWorkspaceProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const copyTimerRef = useRef<number | null>(null)

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
            <button type="button" onClick={() => void copyPlan()} aria-label={copyStatus === 'success' ? '已复制方案' : copyStatus === 'error' ? '复制失败，重试复制方案' : '复制方案'}>
              {copyStatus === 'success' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
              {copyStatus === 'success' ? '已复制' : copyStatus === 'error' ? '重试复制' : '复制'}
            </button>
            {onExport && (
              <>
                <button type="button" onClick={() => onExport('md')} aria-label="导出 Markdown"><FileText size={15} aria-hidden="true" /> Markdown</button>
                <button type="button" onClick={() => onExport('pdf')} aria-label="导出 PDF"><FileDown size={15} aria-hidden="true" /> PDF</button>
              </>
            )}
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
          <TripTimeline days={viewModel.days} city={city} onSearchMap={onSearchMap} />
        ) : (
          <p className="atlas-reading-note">本次方案为自由叙述式，未解析出结构化日程；完整内容见下方方案全文。</p>
        )}
      </section>

      <section className="atlas-reading-document" aria-label="完整方案">
        <h3>完整方案</h3>
        <article className="atlas-document"><SafeMarkdown content={viewModel.markdown} /></article>
      </section>
    </section>
  )
}
