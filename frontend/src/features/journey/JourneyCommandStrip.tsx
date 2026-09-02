import { ArrowRight } from 'lucide-react'
import type { JourneyPhase, TripForm } from './model'

interface JourneyCommandStripProps {
  form: TripForm
  phase: JourneyPhase
  progress: number
  graphNode?: string
}

const phaseLabels: Record<Exclude<JourneyPhase, 'idle'>, string> = {
  planning: '正在规划',
  ready: '方案已完成',
  error: '规划中断',
  cancelled: '已停止',
}

const nodeLabels: Record<string, string> = {
  guard: '安全检查',
  memory_reader: '读取偏好',
  intent_router: '理解需求',
  planner: '拆解任务',
  executor: '并行执行',
  aggregator: '汇总方案',
  memory_writer: '保存偏好',
}

const phaseDetails: Record<Exclude<JourneyPhase, 'idle' | 'planning'>, string> = {
  ready: '可继续修改或导出',
  error: '请重试或修改需求',
  cancelled: '已保留当前结果',
}

function compactDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return date || '日期待定'
  return `${Number(match[2])}月${Number(match[3])}日`
}

export default function JourneyCommandStrip({ form, phase, progress, graphNode = '' }: JourneyCommandStripProps) {
  if (phase === 'idle') return null

  const safeProgress = Math.max(0, Math.min(100, progress))
  const detail = phase === 'planning'
    ? `${nodeLabels[graphNode] ?? '正在执行'} · ${safeProgress}%`
    : phaseDetails[phase]

  return (
    <section className={`atlas-command-strip is-${phase}`} aria-label="当前旅程任务">
      <div className="atlas-command-summary">
        <div className="atlas-command-route">
          <strong>{form.origin || '出发地'}</strong>
          <ArrowRight size={15} aria-hidden="true" />
          <strong>{form.destination || '目的地'}</strong>
        </div>
        <div className="atlas-command-meta">
          <time dateTime={form.date}>{compactDate(form.date)}</time>
          <span>{form.days}天</span>
          <span>{form.people}人</span>
          <span>¥{form.budget.toLocaleString()}/人</span>
        </div>
      </div>
      <div className="atlas-command-status">
        <span className="atlas-status-signal"><i aria-hidden="true" /><b>{phaseLabels[phase]}</b></span>
        <small>{detail}</small>
        {phase === 'planning' && (
          <div className="atlas-command-progress" role="progressbar" aria-label="旅程规划进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <i style={{ width: `${safeProgress}%` }} />
          </div>
        )}
      </div>
    </section>
  )
}
