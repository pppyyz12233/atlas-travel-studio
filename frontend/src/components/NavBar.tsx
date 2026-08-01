import { NavLink } from 'react-router-dom'
import { Plane, MessageSquare, Clock, User, Menu, X } from 'lucide-react'
import { useState } from 'react'

interface NavBarProps {
  isDark: boolean
  onToggleTheme: () => void
}

const links = [
  { to: '/ai', icon: MessageSquare, label: 'AI 定制' },
  { to: '/history', icon: Clock, label: '历史' },
  { to: '/profile', icon: User, label: '我的' },
]

export default function NavBar({ isDark, onToggleTheme }: NavBarProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      {/* 桌面端：底部导航栏 */}
      <nav className="hidden md:flex fixed bottom-0 left-0 right-0 z-50 glass h-16 items-center justify-center gap-1 border-t border-[var(--border)]">
        <div className="flex items-center gap-1 max-w-lg w-full justify-around px-4">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-[var(--fast)] ${
                isActive
                  ? 'text-[#0071e3] scale-105'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`
            }
          >
            <Plane size={22} />
            <span className="text-[10px] font-medium">首页</span>
          </NavLink>

          {links.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-[var(--fast)] ${
                  isActive
                    ? 'text-[#0071e3] scale-105'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`
              }
            >
              <Icon size={22} />
              <span className="text-[10px] font-medium">{label}</span>
            </NavLink>
          ))}

          {/* 暗色模式切换 */}
          <button
            onClick={onToggleTheme}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all duration-[var(--fast)]"
          >
            {isDark ? <span className="text-lg">☀️</span> : <span className="text-lg">🌙</span>}
            <span className="text-[10px] font-medium">{isDark ? '亮色' : '暗色'}</span>
          </button>
        </div>
      </nav>

      {/* 移动端：顶部 header + 汉堡菜单 */}
      <div className="md:hidden">
        <div className="fixed top-0 left-0 right-0 z-50 glass h-12 flex items-center justify-between px-4 border-b border-[var(--border)]">
          <span className="font-semibold text-sm flex items-center gap-2">
            <Plane size={18} className="text-[#0071e3]" />
            旅行规划师
          </span>
          <div className="flex items-center gap-1">
            <button onClick={onToggleTheme} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
              {isDark ? '☀️' : '🌙'}
            </button>
            <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* 汉堡菜单展开 */}
        {menuOpen && (
          <div className="fixed top-12 left-0 right-0 z-50 glass border-b border-[var(--border)] animate-slide-up">
            {links.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                    isActive ? 'text-[#0071e3] bg-blue-50 dark:bg-blue-500/10' : 'text-[var(--text-primary)]'
                  }`
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
