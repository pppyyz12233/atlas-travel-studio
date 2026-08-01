import { MapPin, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import type { PlanStep } from '../types'

interface ResultCardProps {
  step: PlanStep
}

export default function ResultCard({ step }: ResultCardProps) {
  const statusIcon = () => {
    switch (step.status) {
      case 'running':
        return <Loader2 size={16} className="animate-spin text-[#0071e3]" />
      case 'done':
        return <CheckCircle size={16} className="text-[#34c759]" />
      case 'failed':
        return <XCircle size={16} className="text-[#ff3b30]" />
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-[var(--border)]" />
    }
  }

  const workerLabel: Record<string, string> = {
    flight: '✈️ 航班',
    hotel: '🏨 酒店',
    attraction: '🎯 景点',
    itinerary: '📅 日程',
    budget: '💰 预算',
  }

  return (
    <div className={`glass rounded-2xl p-4 animate-slide-up transition-all duration-200 ${
      step.status === 'running' ? 'ring-2 ring-blue-200 dark:ring-blue-800' : ''
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {statusIcon()}
          <h3 className="font-semibold text-sm">
            {workerLabel[step.worker] || step.worker || step.name}
          </h3>
        </div>
        {step.status === 'running' && (
          <span className="text-xs text-[var(--text-tertiary)] animate-pulse-soft">
            执行中...
          </span>
        )}
      </div>

      {/* 摘要 */}
      {step.summary && (
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-3">
          {step.summary}
        </p>
      )}

      {/* 行程条目 */}
      {step.items.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {step.items.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-xs bg-black/[0.03] dark:bg-white/[0.05] rounded-lg px-3 py-2">
              <span className="font-medium truncate flex-1">{item.name}</span>
              {item.price && (
                <span className="text-[#0071e3] font-semibold ml-2 flex-shrink-0">{item.price}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 地点标记 */}
      {step.locations.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
          <MapPin size={12} />
          <span>{step.locations.length} 个地点</span>
          <span className="mx-1">·</span>
          <span className="truncate">{step.locations.map(l => l.name).join('、')}</span>
        </div>
      )}
    </div>
  )
}
