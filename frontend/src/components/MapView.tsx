import { useEffect, useRef, useCallback } from 'react'
import type { Location } from '../types'

// 高德地图类型声明
declare global {
  interface Window {
    AMap: typeof AMap
    _AMapSecurityConfig: { securityJsCode: string }
  }
}

interface MapViewProps {
  locations: Location[]
  className?: string
}

// 类型颜色
const typeColors: Record<string, string> = {
  airport: '#0071e3',
  hotel: '#ff9500',
  attraction: '#34c759',
  station: '#af52de',
  other: '#8e8e93',
}

let scriptLoaded = false
let loadPromise: Promise<void> | null = null

function loadAMap(): Promise<void> {
  if (scriptLoaded) return Promise.resolve()
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    const key = import.meta.env.VITE_AMAP_KEY || 'your-amap-key'
    const secret = import.meta.env.VITE_AMAP_SECRET || ''
    window._AMapSecurityConfig = { securityJsCode: secret }

    const script = document.createElement('script')
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${key}&callback=onAMapLoaded`
    script.async = true
    script.onerror = () => { reject(new Error('高德地图加载失败')) }

    window.onAMapLoaded = () => {
      scriptLoaded = true
      resolve()
    }

    document.head.appendChild(script)
  })

  return loadPromise
}

export default function MapView({ locations, className }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<AMap.Map | null>(null)
  const markersRef = useRef<AMap.Marker[]>([])

  const clearMarkers = useCallback(() => {
    const map = mapRef.current
    if (map) {
      markersRef.current.forEach(m => map.remove(m))
      markersRef.current = []
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current || locations.length === 0) return

    let cancelled = false

    loadAMap().then(() => {
      if (cancelled || !containerRef.current) return

      const AMap = window.AMap

      // 初始化地图
      if (!mapRef.current) {
        mapRef.current = new AMap.Map(containerRef.current, {
          zoom: 12,
          center: [locations[0].lng, locations[0].lat],
          mapStyle: 'amap://styles/light',
        })
      }

      const map = mapRef.current
      clearMarkers()

      // 添加标记
      const markers = locations.map(loc => {
        const content = `<div style="display:flex;align-items:center;gap:4px;padding:4px 10px;background:white;border-radius:20px;box-shadow:0 2px 8px rgba(0,0,0,0.15);font-size:12px;white-space:nowrap;font-weight:500;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${typeColors[loc.type] || typeColors.other};"></span>
          ${loc.name}
        </div>`

        const marker = new AMap.Marker({
          position: [loc.lng, loc.lat],
          content,
          offset: new AMap.Pixel(0, -16),
        })
        map.add(marker)
        return marker
      })

      markersRef.current = markers

      // 自适应视野
      if (locations.length > 1) {
        map.setFitView(null, false, [60, 60, 60, 60])
      }
    })

    return () => {
      cancelled = true
    }
  }, [locations, clearMarkers])

  // 清理
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.destroy()
        mapRef.current = null
      }
    }
  }, [])

  if (locations.length === 0) return null

  return (
    <div className={`rounded-2xl overflow-hidden border border-[var(--border)] shadow-md ${className || ''}`}>
      <div ref={containerRef} className="w-full h-64" />
    </div>
  )
}
