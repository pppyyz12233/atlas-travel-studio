import { Outlet } from 'react-router-dom'
import NavBar from './NavBar'
import type { useAuth } from '../hooks/useAuth'
import type { useTheme } from '../hooks/useTheme'

interface LayoutProps {
  auth: ReturnType<typeof useAuth>
  theme: ReturnType<typeof useTheme>
}

export default function Layout({ auth, theme }: LayoutProps) {
  return (
    <div className="min-h-screen bg-[var(--content-bg)] transition-colors duration-300">
      <NavBar isDark={theme.isDark} onToggleTheme={theme.toggle} />
      {/* 移动端留出顶部空间，桌面端留出底部空间 */}
      <main className="md:pb-20 pt-12 md:pt-0 h-screen overflow-y-auto">
        <Outlet context={{ auth, theme }} />
      </main>
    </div>
  )
}
