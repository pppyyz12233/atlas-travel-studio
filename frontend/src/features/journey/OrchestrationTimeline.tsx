import {
  AlertTriangle, Check, Circle, Clock3, Coins, LoaderCircle, RefreshCw,
  Route, Sparkles, Undo2, Wrench,
} from 'lucide-react'
import type { JourneyPhase, JourneyStep } from './model'
import { getWorkerMeta, workerMeta } from './workerMeta'

interface OrchestrationTimelineProps {
  steps: JourneyStep[]
  graphNode: string
  phase: JourneyPhase
  statusMessage: string
  onRetry: () => void
  onEditBrief: () => void
  compact?: boolean
}

const nodeLabels: Record<string, string> = {
  guard: '正在检查请求安全性',
  memory_reader: '正在读取旅行偏好',
  intent_router: '正在理解你的要求',
  planner: '正在拆解规划任务',
  executor: '多个智能体正在并行工作',
  aggregator: '正在汇总完整方案',
  memory_writer: '正在保存旅行偏好',
}

const statusLabels = {
  pending: '等待',
  running: '执行中',
  done: '完成',
  failed: '失败',
}

function WorkerIcon({ worker }: { worker: string }) {
  const Icon = getWorkerMeta(worker).icon
  return <Icon size={17} aria-hidden="true" />
}

export default function OrchestrationTimeline({
  steps,
  graphNode,
  phase,
  statusMessage,
  onRetry,
  onEditBrief,
  compact = false,
}: OrchestrationTimelineProps) {
  const doneCount = steps.filter(step => step.status === 'done').length
  const latestStep = [...steps].reverse().find(step => step.status === 'running')
    ?? [...steps].reverse().find(step => step.status === 'done' || step.status === 'failed')
  const liveText = graphNode ? nodeLabels[graphNode] ?? graphNode : latestStep?.name ?? ''

  return (
    <section className={`atlas-orchestration ${compact ? 'is-compact' : ''}`} aria-labelledby={compact ? undefined : 'atlas-orchestration-title'} aria-label={compact ? '智能体执行链' : undefined}>
      {!compact && (
        <header className="atlas-orchestration-header">
          <div>
            <span className="atlas-kicker"><Sparkles size={13} aria-hidden="true" /> 多智能体执行</span>
            <h2 id="atlas-orchestration-title">实时执行链</h2>
          </div>
          <span className={`atlas-run-badge is-${phase}`}><i aria-hidden="true" />{phase === 'planning' ? '执行中' : phase === 'ready' ? '已完成' : '执行状态'}</span>
        </header>
      )}

      <p className="atlas-live-region" aria-live="polite">{liveText ? `最新状态：${liveText}` : ''}</p>

      {(phase === 'error' || phase === 'cancelled') && (
        <div className={`atlas-recovery is-${phase}`} role="status">
          <span><AlertTriangle size={20} aria-hidden="true" /></span>
          <div>
            <strong>{phase === 'cancelled' ? '生成已停止' : '这次规划没有完成'}</strong>
            <p>
              {statusMessage || (phase === 'cancelled' ? '已保留当前进度，你可以修改要求后继续。' : '已保留完成的步骤，请重新生成或修改要求。')}
              {doneCount > 0 && ` 已保留 ${doneCount} 个完成的步骤。`}
            </p>
          </div>
          <div className="atlas-recovery-actions">
            <button type="button" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" /> 重新生成</button>
            <button type="button" onClick={onEditBrief}><Undo2 size={15} aria-hidden="true" /> 修改要求</button>
          </div>
        </div>
      )}

      {steps.length === 0 ? (
        <div className="atlas-orchestration-empty">
          <Route size={24} aria-hidden="true" />
          <strong>{phase === 'planning' ? nodeLabels[graphNode] ?? '正在建立执行计划' : phase === 'ready' ? '历史会话 · 无本次执行记录' : '执行链尚未启动'}</strong>
          <p>{phase === 'ready'
            ? '这是从历史记录恢复的方案，执行明细未随会话保存。'
            : compact ? '五位智能体整装待发，提交任务后实时展示各自的进展。' : '任务拆解后，每个智能体的真实状态会显示在这里。'}</p>
          {compact && phase !== 'ready' && (
            <div className="atlas-agent-roster" aria-hidden="true">
              {Object.values(workerMeta).map(meta => {
                const Icon = meta.icon
                return <span key={meta.shortLabel}><Icon size={14} />{meta.shortLabel}</span>
              })}
            </div>
          )}
        </div>
      ) : (
        <ol className="atlas-step-list">
          {steps.map((step, index) => {
            const tokens = step.promptTokens === undefined && step.completionTokens === undefined
              ? undefined
              : (step.promptTokens ?? 0) + (step.completionTokens ?? 0)
            return (
              <li className={`atlas-step is-${step.status}`} key={`${step.name}-${index}`}>
                <div className="atlas-step-track" aria-hidden="true"><span>{String(index + 1).padStart(2, '0')}</span><i /></div>
                <div className="atlas-step-card">
                  <span className="atlas-step-icon"><WorkerIcon worker={step.worker} /></span>
                  <div className="atlas-step-copy">
                    <span><strong>{step.name}</strong><em>{getWorkerMeta(step.worker).label}</em></span>
                    <p>{step.summary || (step.status === 'pending' ? '等待上游任务完成' : step.status === 'running' ? '正在分析和调用工具' : '步骤已完成')}</p>
                    <div className="atlas-step-metrics">
                      {step.iterations > 0 && <span><Clock3 size={12} aria-hidden="true" />{step.iterations} 轮分析</span>}
                      {step.toolCalls > 0 && <span><Wrench size={12} aria-hidden="true" />{step.toolCalls} 次工具</span>}
                      {step.latencyMs !== undefined && <span><Clock3 size={12} aria-hidden="true" />{(step.latencyMs / 1000).toFixed(1)}s</span>}
                      {tokens !== undefined && <span><Sparkles size={12} aria-hidden="true" />{tokens.toLocaleString()} tokens</span>}
                      {step.estimatedCostCny !== undefined && <span><Coins size={12} aria-hidden="true" />¥{step.estimatedCostCny.toFixed(3)}</span>}
                    </div>
                  </div>
                  <span className="atlas-step-status">
                    {step.status === 'done' ? <Check size={15} aria-hidden="true" /> : step.status === 'running' ? <LoaderCircle size={15} aria-hidden="true" /> : <Circle size={11} aria-hidden="true" />}
                    {statusLabels[step.status]}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
