import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTheme } from './useTheme'

const mediaQuery = {
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}

vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mediaQuery))

describe('theme hook', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.content = '#f7f8fa'
    document.head.appendChild(meta)
    mediaQuery.matches = false
    mediaQuery.addEventListener.mockClear()
    mediaQuery.removeEventListener.mockClear()
  })

  afterEach(() => {
    document.querySelector('meta[name="theme-color"]')?.remove()
  })

  it('applies the stored dark theme and syncs the theme-color meta tag', () => {
    localStorage.setItem('theme', 'dark')

    const { result } = renderHook(() => useTheme())

    expect(result.current.isDark).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#16130f')
  })

  it('follows the system color scheme until the user picks a theme manually', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.isDark).toBe(false)

    const listener = mediaQuery.addEventListener.mock.calls[0]?.[1] as () => void
    mediaQuery.matches = true
    act(() => { listener() })
    expect(result.current.isDark).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    // 手动切换后写入选择，系统再变化不再覆盖
    act(() => { result.current.toggle() })
    expect(result.current.isDark).toBe(false)
    expect(localStorage.getItem('theme')).toBe('light')

    mediaQuery.matches = true
    act(() => { listener() })
    expect(result.current.isDark).toBe(false)
  })

  it('stops listening on unmount', () => {
    const { unmount } = renderHook(() => useTheme())
    unmount()
    expect(mediaQuery.removeEventListener).toHaveBeenCalled()
  })
})
