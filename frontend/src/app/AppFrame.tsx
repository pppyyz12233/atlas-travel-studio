import { Compass, Home, LogIn, LogOut, Map, Moon, Plus, Sun, UserRound } from 'lucide-react'
import { Link, useRouter } from './router'
import type { RouteName } from './router'
import type { useAuth } from '../hooks/useAuth'
import type { useTheme } from '../hooks/useTheme'

interface AppFrameProps {
  auth: ReturnType<typeof useAuth>
  theme: ReturnType<typeof useTheme>
  children: React.ReactNode
}

// R4 导航收敛：规划不再是导航里的一个"地方"——它由首页输入与中央主按钮触发
const navItems: Array<{ to: string; label: string; name: RouteName; icon: typeof Home }> = [
  { to: '/', label: '首页', name: 'home', icon: Home },
  { to: '/explore', label: '探索', name: 'explore', icon: Compass },
  { to: '/trips', label: '我的行程', name: 'trips', icon: Map },
]

export default function AppFrame({ auth, theme, children }: AppFrameProps) {
  const { route, navigate } = useRouter()

  return (
    <div className="mag-frame">
      <a className="mag-skip-link" href="#mag-main">跳到主要内容</a>

      <header className="mag-header">
        <Link to="/" className="mag-brand" ariaLabel="Atlas 首页">
          <span className="mag-brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" role="img"><path d="M16 3 27 9v14l-11 6-11-6V9l11-6Z" fill="none" stroke="currentColor" strokeWidth="2"/><path d="m7 11 9 5 9-5M16 16v11" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="16" cy="10" r="2" fill="currentColor"/></svg></span>
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
        {navItems.slice(0, 2).map(item => {
          const Icon = item.icon
          const active = route.name === item.name
          return (
            <Link key={item.to} to={item.to} className={`mag-mobilenav-link ${active ? 'is-active' : ''}`}>
              <Icon size={19} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          )
        })}
        <button
          type="button"
          className="mag-mobilenav-fab"
          onClick={() => navigate('/plan')}
          aria-label="开始新的规划"
        >
          <Plus size={22} aria-hidden="true" />
        </button>
        {navItems.slice(2).map(item => {
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
