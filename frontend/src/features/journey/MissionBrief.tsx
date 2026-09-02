import { useState } from 'react'
import {
  ArrowUpRight, BedDouble, CalendarDays, ChevronDown, Clock3, Compass, MapPin,
  Plane, Route, Sparkles, Users, Wallet,
} from 'lucide-react'
import type { TripForm } from './model'

export interface MissionSuggestion {
  title: string
  detail: string
  prompt: string
  formPatch: Partial<TripForm>
  icon: typeof Compass
}

export const missionSuggestions: MissionSuggestion[] = [
  {
    icon: Compass,
    title: '城市深度漫游',
    detail: '建筑、咖啡与街区观察',
    prompt: '从上海去东京5天，偏爱建筑、咖啡和城市散步，人均8000元',
    formPatch: { origin: '上海', destination: '东京', days: 5, people: 2, budget: 8000 },
  },
  {
    icon: BedDouble,
    title: '周末松弛之旅',
    detail: '低密度路线与设计酒店',
    prompt: '规划杭州周末两天一夜，不赶景点，想住有设计感的酒店',
    formPatch: { origin: '上海', destination: '杭州', days: 2, people: 2, budget: 3000 },
  },
  {
    icon: Plane,
    title: '海外家庭旅行',
    detail: '儿童友好与轻松节奏',
    prompt: '北京出发去新加坡6天，2位成人1位儿童，需要轻松的亲子安排',
    formPatch: { origin: '北京', destination: '新加坡', days: 6, people: 3 },
  },
]

interface MissionBriefProps {
  form: TripForm
  onChange: (patch: Partial<TripForm>) => void
  onSubmit: (brief: string) => void
  onUseSuggestion: (suggestion: MissionSuggestion) => void
  disabled: boolean
}

function buildTravelBrief(form: TripForm): string {
  return `从${form.origin.trim()}去${form.destination.trim()}，${form.date}出发，${form.days}天，${form.people}人，人均预算${form.budget}元。请给出兼顾体验、节奏和预算的完整方案。`
}

// R3 主流程收敛：一句话优先，结构化字段折叠为「详细条件（可选）」。
// 有自由文本 → 直接以文本发起；否则回落到表单拼装（保持旧行为）。
export default function MissionBrief({
  form,
  onChange,
  onSubmit,
  onUseSuggestion,
  disabled,
}: MissionBriefProps) {
  const [freeText, setFreeText] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const trimmedText = freeText.trim()
  const formReady = Boolean(form.origin.trim() && form.destination.trim() && form.date)
  const canSubmit = (trimmedText.length > 0 || formReady) && !disabled

  const submit = () => {
    if (!canSubmit) return
    onSubmit(trimmedText || buildTravelBrief(form))
  }

  return (
    <section className="atlas-mission" aria-labelledby="atlas-mission-title">
      <div className="atlas-mission-intro">
        <span className="atlas-kicker"><Sparkles size={14} aria-hidden="true" /> Journey intelligence workspace</span>
        <h1 id="atlas-mission-title">把旅行要求，编排成一条可执行的航线。</h1>
        <p>提交一次任务，查看航班、住宿、地点、日程和预算智能体如何并行协作，并随时继续修改方案。</p>
      </div>

      <form
        className="atlas-brief-card"
        onSubmit={event => {
          event.preventDefault()
          submit()
        }}
      >
        <div className="atlas-brief-freetext">
          <textarea
            aria-label="一句话旅行想法"
            placeholder="说说这次旅行：目的地、同行人、节奏和预算……"
            value={freeText}
            rows={3}
            onChange={event => setFreeText(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                submit()
              }
            }}
          />
          <small>一句话就够 —— Atlas 会自动理解目的地与预算；也可在下方补充详细条件。</small>
        </div>

        <div className="atlas-brief-details">
          <button
            type="button"
            className="atlas-brief-details-toggle"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen(value => !value)}
          >
            <ChevronDown size={15} aria-hidden="true" />
            详细条件（可选）
          </button>

          {detailsOpen && (
            <>
              <div className="atlas-route-editor">
                <label>
                  <span>出发地</span>
                  <div><Route size={16} aria-hidden="true" /><input value={form.origin} onChange={event => onChange({ origin: event.target.value })} autoComplete="address-level2" /></div>
                </label>
                <span className="atlas-route-vector" aria-hidden="true"><i /><Plane size={18} /><i /></span>
                <label>
                  <span>目的地</span>
                  <div><MapPin size={16} aria-hidden="true" /><input value={form.destination} onChange={event => onChange({ destination: event.target.value })} autoComplete="address-level2" /></div>
                </label>
              </div>

              <div className="atlas-brief-grid">
                <label>
                  <span><CalendarDays size={15} aria-hidden="true" /> 出发日期</span>
                  <input type="date" value={form.date} onChange={event => onChange({ date: event.target.value })} />
                </label>
                <label>
                  <span><Clock3 size={15} aria-hidden="true" /> 旅行天数</span>
                  <input type="number" min="1" max="30" value={form.days} onChange={event => onChange({ days: Math.min(30, Math.max(1, Number(event.target.value) || 1)) })} />
                </label>
                <label>
                  <span><Users size={15} aria-hidden="true" /> 出行人数</span>
                  <input type="number" min="1" max="20" value={form.people} onChange={event => onChange({ people: Math.min(20, Math.max(1, Number(event.target.value) || 1)) })} />
                </label>
                <label>
                  <span><Wallet size={15} aria-hidden="true" /> 人均预算</span>
                  <div className="atlas-money-field"><b>¥</b><input type="number" min="0" step="500" value={form.budget} onChange={event => onChange({ budget: Math.max(0, Math.round(Number(event.target.value) || 0)) })} /></div>
                </label>
              </div>
            </>
          )}
        </div>

        <div className="atlas-brief-submit-row">
          <button type="submit" className="atlas-primary-action" disabled={!canSubmit}>
            开始规划旅程 <ArrowUpRight size={17} aria-hidden="true" />
          </button>
          <p className="atlas-form-note">无需登录即可体验；保存历史记录和导出时再登录。</p>
        </div>
      </form>

      <div className="atlas-examples" aria-label="示例旅行要求">
        <div className="atlas-section-label"><span>任务样例</span><small>选择后直接开始对话</small></div>
        <div className="atlas-example-grid">
          {missionSuggestions.map(suggestion => {
            const { icon: Icon, title, detail } = suggestion
            return (
            <button type="button" key={title} onClick={() => onUseSuggestion(suggestion)} disabled={disabled}>
              <span className="atlas-example-icon"><Icon size={18} aria-hidden="true" /></span>
              <span><strong>{title}</strong><small>{detail}</small></span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
