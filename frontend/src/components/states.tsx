import type { ReactNode } from 'react'
import { Compass, LoaderCircle, RefreshCw, WifiOff } from 'lucide-react'

// 页面级空状态 / 加载状态 / 错误状态 原语
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="mag-empty">
      <span className="mag-empty-icon">{icon ?? <Compass size={24} aria-hidden="true" />}</span>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action && <div className="mag-empty-action">{action}</div>}
    </div>
  )
}

export function LoadingState({ label = '正在加载' }: { label?: string }) {
  return (
    <div className="mag-loading" role="status" aria-live="polite">
      <LoaderCircle size={20} aria-hidden="true" />
      <span>{label}…</span>
    </div>
  )
}

export function ErrorState({
  title = '加载失败',
  description,
  onRetry,
}: {
  title?: string
  description?: string
  onRetry?: () => void
}) {
  return (
    <div className="mag-error-state" role="alert">
      <WifiOff size={22} aria-hidden="true" />
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {onRetry && (
        <button type="button" className="mag-retry-action" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden="true" /> 重试
        </button>
      )}
    </div>
  )
}
