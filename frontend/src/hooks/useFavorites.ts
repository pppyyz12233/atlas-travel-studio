import { useCallback, useEffect, useState } from 'react'

const FAVORITES_KEY = 'atlas_favorite_destinations'

function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []
  } catch {
    return []
  }
}

// 目的地收藏：纯本地（后端暂无收藏接口），跨页面同步
export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(readFavorites)

  useEffect(() => {
    const sync = () => setFavorites(readFavorites())
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  const toggle = useCallback((destinationId: string) => {
    setFavorites(current => {
      const next = current.includes(destinationId)
        ? current.filter(id => id !== destinationId)
        : [...current, destinationId]
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next))
      } catch {
        // 存储不可用时仅本次会话生效
      }
      return next
    })
  }, [])

  const isFavorite = useCallback(
    (destinationId: string) => favorites.includes(destinationId),
    [favorites],
  )

  return { favorites, toggle, isFavorite }
}
