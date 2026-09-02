import { useState, useEffect, useCallback } from 'react'

const LIGHT_THEME_COLOR = '#faf7f2'
const DARK_THEME_COLOR = '#16130f'

function readStoredTheme(): string | null {
  try {
    return localStorage.getItem('theme')
  } catch {
    return null
  }
}

export function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    const stored = readStoredTheme()
    if (stored) return stored === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', isDark)
    // 移动端浏览器状态栏颜色跟随主题
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      isDark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR,
    )
  }, [isDark])

  // 用户未手动选择时，跟随系统深浅色变化
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => {
      if (!readStoredTheme()) setIsDark(media.matches)
    }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const toggle = useCallback(() => {
    setIsDark(prev => {
      const next = !prev
      try {
        localStorage.setItem('theme', next ? 'dark' : 'light')
      } catch {
        // 存储不可用时仅本次会话生效
      }
      return next
    })
  }, [])

  return { isDark, toggle }
}
