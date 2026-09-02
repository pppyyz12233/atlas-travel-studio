import { Compass, Home, LogIn, LogOut, Map, Moon, Navigation, Sun, UserRound } from 'lucide-react'
import { Link, useRouter } from './router'
import type { RouteName } from './router'
import type { useAuth } from '../hooks/useAuth'
import type { useTheme } from '../hooks/useTheme'

interface AppFrameProps {
  auth: ReturnType<typeof useAuth>
  theme: ReturnType<typeof useTheme>
  children: React.ReactNode
}

const navItems: Array<{ to: string; label: string; name: RouteName; icon: typeof Home }> = [
  { to: '/', label: '首页', name: 'home', icon: Home },
  { to: '/plan', label: 'AI 规划', name: 'plan', icon: Navigation },
  { to: '/explore', label: '探索', name: 'explore', icon: Compass },
  { to: '/trips', label: '我的行程', name: 'trips', icon: Map },
]

export default function AppFrame({ auth, theme, children }: AppFrameProps) {
  const { route } = useRouter()

  return (
    <div className="mag-frame">
      <a className="mag-skip-link" href="#mag-main">跳到主要内容</a>

      <header className="mag-header">
        <Link to="/" className="mag-brand" ariaLabel="Atlas 首页">
          <span className="mag-brand-mark" aria-hidden="true"><Navigation size={17} /></span>
          <span className="mag-brand-copy">
            <strong>Atlas</strong>
            <small>智能旅行工作室</small>
          </span>
        </Link>

        <nav className="mag-nav" aria-label="主导航">
          {navItems.map(item => {
            const Icon = item.icon
            const active = route.name === item.name
            return (
              <Link key={item.to} to={item.to} className={`mag-nav-link ${active ? 'is-active' : ''}`}>
                <Icon size={14} aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="mag-header-actions">
          <button
            type="button"
            className="mag-icon-action"
            onClick={theme.toggle}
            aria-label={theme.isDark ? '切换到浅色主题' : '切换到深色主题'}
          >
            {theme.isDark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
          </button>
          {auth.isLoggedIn ? (
            <>
              <span className="mag-user-chip" title={auth.user?.username ?? ''}>
                <UserRound size={14} aria-hidden="true" />
                {auth.user?.username ?? '旅行者'}
              </span>
              <button type="button" className="mag-icon-action" onClick={auth.logout} aria-label="退出登录">
                <LogOut size={16} aria-hidden="true" />
              </button>
            </>
          ) : (
            <button type="button" className="mag-login-action" onClick={() => auth.setShowAuthModal(true)}>
              <LogIn size={15} aria-hidden="true" /> 登录
            </button>
          )}
        </div>
      </header>

      <main id="mag-main" className="mag-main">
        {children}
      </main>

      <nav className="mag-mobilenav" aria-label="底部导航">
        {navItems.map(item => {
          const Icon = item.icon
          const active = route.name === item.name
          return (
            <Link key={item.to} to={item.to} className={`mag-mobilenav-link ${active ? 'is-active' : ''}`}>
              <Icon size={19} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
