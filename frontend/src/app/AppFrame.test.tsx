import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouterProvider } from './router'
import AppFrame from './AppFrame'
import type { useAuth } from '../hooks/useAuth'
import type { useTheme } from '../hooks/useTheme'

const guestAuth = () => ({
  user: null, token: null, isLoggedIn: false, isValidating: false,
  login: vi.fn(), loginByPhone: vi.fn(), register: vi.fn(), logout: vi.fn(),
  showAuthModal: false, setShowAuthModal: vi.fn(),
}) as ReturnType<typeof useAuth>

const lightTheme = () => ({ isDark: false, toggle: vi.fn() }) as ReturnType<typeof useTheme>

function renderFrame() {
  return render(
    <RouterProvider>
      <AppFrame auth={guestAuth()} theme={lightTheme()}>
        <div>页面内容</div>
      </AppFrame>
    </RouterProvider>,
  )
}

describe('app frame navigation', () => {
  afterEach(() => {
    location.hash = ''
  })

  it('narrows the primary navigation to three destinations', () => {
    renderFrame()

    const nav = screen.getByRole('navigation', { name: '主导航' })
    expect(nav).toHaveTextContent('首页')
    expect(nav).toHaveTextContent('探索')
    expect(nav).toHaveTextContent('我的行程')
    // 「规划」不再是导航里的一个"地方"，由输入与主按钮触发
    expect(screen.queryByText('AI 规划')).not.toBeInTheDocument()
  })

  it('offers a raised planning action in the bottom navigation', async () => {
    const user = userEvent.setup()
    renderFrame()

    const fab = screen.getByRole('button', { name: '开始新的规划' })
    await user.click(fab)

    expect(window.location.hash).toBe('#/plan')
  })
})
