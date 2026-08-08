import { useEffect, useRef, useCallback } from 'react'
import type { Location } from '../types'

// 高德地图类型声明
declare namespace AMap {
  class Map {
    constructor(container: HTMLElement | string, opts?: Record<string, unknown>)
    add(overlay: unknown): void
    remove(overlay: unknown): void
    setFitView(overlays?: unknown[] | null, immediately?: boolean, avoid?: number[]): void
    setCenter(center: [number, number]): void
    destroy(): void
    clearMap(): void
  }
  class Marker {
    constructor(opts?: Record<string, unknown>)
    on(event: string, fn: () => void): void
    getExtData(): Record<string, unknown>
    getPosition(): { lng: number; lat: number }
  }
  class Icon {
    constructor(opts?: Record<string, unknown>)
  }
  class Pixel {
    constructor(x: number, y: number)
  }
  class InfoWindow {
    constructor(opts?: Record<string, unknown>)
    setContent(content: string): void
    open(map: Map, pos: { lng: number; lat: number }): void
  }
  class PlaceSearch {
    constructor(opts?: Record<string, unknown>)
    search(
      keyword: string,
      cb: (status: string, result: { poiList?: { pois?: Array<{ location: { lng: number; lat: number }; name: string; address: string }> } }) => void
    ): void
  }
}

declare global {
  interface Window {
    AMap: typeof AMap
    _AMapSecurityConfig: { securityJsCode: string }
    onAMapLoaded: () => void
  }
}

interface MapViewProps {
  locations: Location[]
  onMapReady?: (map: { searchAndMark: (keyword: string, city: string, stepName: string, color: string) => void; clearMarkers: () => void }) => void
  className?: string
}

const typeColors: Record<string, string> = {
  flight: '#ff3b30',
  hotel: '#0071e3',
  attraction: '#34c759',
  itinerary: '#af52de',
  budget: '#ff9500',
  airport: '#ff3b30',
  station: '#af52de',
  other: '#8e8e93',
}

let scriptLoaded = false
let loadPromise: Promise<void> | null = null

function loadAMap(): Promise<void> {
  if (scriptLoaded) return Promise.resolve()
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    const key = '67b0518fb9e4f2039c9feafd773db12d'
    const secret = '654b5821c6b564d63ce1bea94d3ab16d'
    window._AMapSecurityConfig = { securityJsCode: secret }

    // 先加载安全配置，再加载地图（v1.4.15 与原 index.html 一致）
    const secScript = document.createElement('script')
    secScript.textContent = `window._AMapSecurityConfig={securityJsCode:'${secret}'}`
    document.head.appendChild(secScript)

    const script = document.createElement('script')
    script.src = `https://webapi.amap.com/maps?v=1.4.15&key=${key}&plugin=AMap.PlaceSearch`
    script.async = true
    script.onerror = () => reject(new Error('高德地图加载失败'))

    // 轮询检测加载完成（原 index.html 的方式）
    let attempts = 0
    const check = setInterval(() => {
      attempts++
      if (window.AMap && typeof window.AMap.Map === 'function') {
        clearInterval(check)
        scriptLoaded = true
        resolve()
      } else if (attempts > 100) {
        clearInterval(check)
        reject(new Error('高德地图加载超时'))
      }
    }, 200)

    document.head.appendChild(script)
  })

  return loadPromise
}

export default function MapView({ locations, onMapReady, className }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<AMap.Map | null>(null)
  const markersRef = useRef<AMap.Marker[]>([])
  const infoWindowRef = useRef<AMap.InfoWindow | null>(null)

  const clearMarkers = useCallback(() => {
    const map = mapRef.current
    if (map) {
      markersRef.current.forEach(m => map.remove(m))
      markersRef.current = []
    }
  }, [])

  const searchAndMark = useCallback((keyword: string, city: string, stepName: string, color: string) => {
    const map = mapRef.current
    if (!map || !keyword) return
    const AMap = window.AMap
    new AMap.PlaceSearch({ city: city || '全国', pageSize: 5 }).search(keyword, (status, result) => {
      if (status !== 'complete' || !result.poiList?.pois) return
      result.poiList.pois.slice(0, 5).forEach(p => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="${encodeURIComponent(color)}"/><circle cx="12" cy="11" r="5" fill="white"/></svg>`
        const marker = new AMap.Marker({
          position: [p.location.lng, p.location.lat],
          title: p.name,
          icon: new AMap.Icon({
            size: new AMap.Pixel(24, 32),
            image: 'data:image/svg+xml,' + encodeURIComponent(svg),
            imageSize: new AMap.Pixel(24, 32),
          }),
          zIndex: 100,
          extData: { step: stepName, color, title: p.name, subtitle: p.address || keyword },
        })
        marker.on('click', () => {
          const d = marker.getExtData()
          infoWindowRef.current?.setContent(
            `<div class="amap-info-content"><span class="iw-tag" style="background:${d.color || '#0071e3'}">${d.step}</span><h4>${d.title}</h4><p>${d.subtitle}</p></div>`
          )
          infoWindowRef.current?.open(map, marker.getPosition())
        })
        map.add(marker)
        markersRef.current.push(marker)
      })
      if (markersRef.current.length > 0) {
        map.setFitView(null, false, [60, 60, 60, 320])
      }
    })
  }, [])

  // 初始化地图
  useEffect(() => {
    let cancelled = false

    loadAMap().then(() => {
      if (cancelled || !containerRef.current) return
      const AMap = window.AMap

      if (!mapRef.current) {
        mapRef.current = new AMap.Map(containerRef.current, {
          zoom: 13,
          center: [113.2644, 23.1291],
          resizeEnable: true,
        })
        infoWindowRef.current = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -30) })

        if (onMapReady) {
          onMapReady({ searchAndMark, clearMarkers })
        }
      }
    })

    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 根据 locations 数组打点
  useEffect(() => {
    const map = mapRef.current
    if (!map || locations.length === 0) return
    const AMap = window.AMap
    if (!AMap) return

    clearMarkers()

    locations.forEach(loc => {
      const color = typeColors[loc.type] || typeColors.other
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="${encodeURIComponent(color)}"/><circle cx="12" cy="11" r="5" fill="white"/></svg>`
      const marker = new AMap.Marker({
        position: [loc.lng, loc.lat],
        title: loc.name,
        icon: new AMap.Icon({
          size: new AMap.Pixel(24, 32),
          image: 'data:image/svg+xml,' + encodeURIComponent(svg),
          imageSize: new AMap.Pixel(24, 32),
        }),
        zIndex: 100,
        extData: { step: loc.type, color, title: loc.name, subtitle: loc.address || '' },
      })
      marker.on('click', () => {
        const d = marker.getExtData()
        infoWindowRef.current?.setContent(
          `<div class="amap-info-content"><span class="iw-tag" style="background:${d.color || '#0071e3'}">${d.step}</span><h4>${d.title}</h4><p>${d.subtitle}</p></div>`
        )
        infoWindowRef.current?.open(map, marker.getPosition())
      })
      map.add(marker)
      markersRef.current.push(marker)
    })

    if (locations.length > 1) {
      map.setFitView(null, false, [60, 60, 60, 320])
    } else if (locations.length === 1) {
      map.setCenter([locations[0].lng, locations[0].lat])
    }
  }, [locations, clearMarkers])

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.destroy()
        mapRef.current = null
      }
    }
  }, [])

  return (
    <div ref={containerRef} className={`w-full h-full ${className || ''}`} />
  )
}
