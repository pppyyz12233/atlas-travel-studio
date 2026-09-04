import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

// ────────────────────────────────────────────────────────────
// 轻量 hash 路由：#/、#/plan、#/explore、#/trips、#/trip/<id>、#/trip/<id>/edit
// 自研而非引第三方：路由面很窄，且 FastAPI 静态托管下 hash 路由无需服务端回退
// ────────────────────────────────────────────────────────────

export type RouteName = 'home' | 'plan' | 'explore' | 'destination' | 'trips' | 'trip'

export interface AppRoute {
  name: RouteName
  sessionId: string | null
  /** 当前完整 hash，如 '#/trip/abc' */
  raw: string
}

export function parseHash(hash: string): AppRoute {
  const raw = hash || '#/'
  const path = raw.replace(/^#/, '').split('?')[0]
  const segments = path.split('/').filter(Boolean)

  if (segments.length === 0) return { name: 'home', sessionId: null, raw }
  if (segments[0] === 'plan') return { name: 'plan', sessionId: null, raw }
  if (segments[0] === 'explore') return { name: 'explore', sessionId: null, raw }
  if (segments[0] === 'destination' && segments[1]) return { name: 'destination', sessionId: segments[1], raw }
  if (segments[0] === 'trips') return { name: 'trips', sessionId: null, raw }
  if (segments[0] === 'trip' && segments[1]) {
    return { name: 'trip', sessionId: segments[1], raw }
  }
  return { name: 'home', sessionId: null, raw }
}

interface RouterValue {
  route: AppRoute
  navigate: (to: string) => void
}

const RouterContext = createContext<RouterValue | null>(null)

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<AppRoute>(() => parseHash(window.location.hash))

  useEffect(() => {
    const sync = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const navigate = useCallback((to: string) => {
    const next = to.startsWith('#') ? to : `#${to.startsWith('/') ? to : `/${to}`}`
    if (window.location.hash === next) {
      // 同锚点重复跳转也强制同步一次（如从详情回规划再进同一详情）
      setRoute(parseHash(next))
      return
    }
    window.location.hash = next
  }, [])

  const value = useMemo(() => ({ route, navigate }), [route, navigate])
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext)
  if (!value) throw new Error('useRouter 必须在 RouterProvider 内使用')
  return value
}

export function Link({
  to,
  children,
  className,
  ariaLabel,
  onClick,
}: {
  to: string
  children: ReactNode
  className?: string
  ariaLabel?: string
  onClick?: () => void
}) {
  const { navigate } = useRouter()
  const href = to.startsWith('#') ? to : `#${to.startsWith('/') ? to : `/${to}`}`
  return (
    <a
      href={href}
      className={className}
      aria-label={ariaLabel}
      onClick={event => {
        event.preventDefault()
        onClick?.()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}
