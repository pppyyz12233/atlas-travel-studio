import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle2, Info, X } from 'lucide-react'

type ToastTone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  tone: ToastTone
  message: string
}

interface ToastValue {
  notify: (tone: ToastTone, message: string) => void
}

const ToastContext = createContext<ToastValue | null>(null)

const TOAST_TTL_MS = 3600

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextIdRef = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts(current => current.filter(item => item.id !== id))
  }, [])

  const notify = useCallback((tone: ToastTone, message: string) => {
    const id = nextIdRef.current++
    setToasts(current => [...current.slice(-2), { id, tone, message }])
  }, [])

  // 独立 effect 管理过期，避免同批多计时器
  useEffect(() => {
    if (toasts.length === 0) return
    const timer = window.setTimeout(() => {
      setToasts(current => current.slice(1))
    }, TOAST_TTL_MS)
    return () => window.clearTimeout(timer)
  }, [toasts])

  const value = useMemo(() => ({ notify }), [notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="mag-toast-viewport" aria-live="polite">
        {toasts.map(item => (
          <div className={`mag-toast is-${item.tone}`} key={item.id} role="status">
            {item.tone === 'success'
              ? <CheckCircle2 size={16} aria-hidden="true" />
              : <Info size={16} aria-hidden="true" />}
            <span>{item.message}</span>
            <button type="button" onClick={() => dismiss(item.id)} aria-label="关闭提示">
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast 必须在 ToastProvider 内使用')
  return value
}
