import { useCallback, useEffect, useRef, useState } from 'react'
import { MapPinned } from 'lucide-react'
import type { Location } from '../types'
import { readAMapConfig } from '../features/journey/mapConfig'

declare namespace AMap {
  class Map {
    constructor(container: HTMLElement | string, opts?: Record<string, unknown>)
    add(overlay: unknown): void
    remove(overlay: unknown): void
    setFitView(overlays?: unknown[] | null, immediately?: boolean, avoid?: number[]): void
    setCenter(center: [number, number]): void
    setMapStyle(style: string): void
    destroy(): void
  }
  class Marker {
    constructor(opts?: Record<string, unknown>)
    on(event: string, fn: () => void): void
    getExtData(): Record<string, string>
    getPosition(): { lng: number; lat: number }
  }
  class Icon { constructor(opts?: Record<string, unknown>) }
  class Pixel { constructor(x: number, y: number) }
  class InfoWindow {
    constructor(opts?: Record<string, unknown>)
    setContent(content: string): void
    open(map: Map, pos: { lng: number; lat: number }): void
  }
  class PlaceSearch {
    constructor(opts?: Record<string, unknown>)
    search(keyword: string, callback: (status: string, result: {
      poiList?: { pois?: Array<{ location: { lng: number; lat: number }; name: string; address: string }> }
    }) => void): void
  }
}

declare global {
  interface Window {
    AMap: typeof AMap
    _AMapSecurityConfig: { securityJsCode: string }
  }
}

export interface MapApi {
  searchAndMark: (keyword: string, city: string, stepName: string, color: string) => void
  clearMarkers: () => void
}

interface Props {
  locations: Location[]
  onMapReady?: (api: MapApi) => void
  className?: string
}

const typeColors: Record<string, string> = {
  flight: '#d9604c', airport: '#d9604c',
  hotel: '#335f74',
  attraction: '#397764',
  itinerary: '#6b5b83', station: '#6b5b83',
  budget: '#a87836', other: '#6d746f',
}

let scriptPromise: Promise<void> | null = null

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[char] || char))
}

function loadAMap(): Promise<void> {
  if (window.AMap?.Map) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const config = readAMapConfig(import.meta.env)
    if (!config.ok) {
      reject(new Error(config.message))
      return
    }
    window._AMapSecurityConfig = { securityJsCode: config.securityCode }

    const script = document.createElement('script')
    script.src = `https://webapi.amap.com/maps?v=1.4.15&key=${encodeURIComponent(config.key)}&plugin=AMap.PlaceSearch`
    script.async = true
    script.onload = () => {
      if (window.AMap?.Map) resolve()
      else reject(new Error('地图组件初始化失败'))
    }
    script.onerror = () => reject(new Error('地图资源加载失败'))
    document.head.appendChild(script)
  }).catch(error => {
    scriptPromise = null
    throw error
  })

  return scriptPromise!
}

export default function MapView({ locations, onMapReady, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<AMap.Map | null>(null)
  const markersRef = useRef<AMap.Marker[]>([])
  const infoWindowRef = useRef<AMap.InfoWindow | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  const clearMarkers = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach(marker => map.remove(marker))
    markersRef.current = []
  }, [])

  const openMarker = useCallback((marker: AMap.Marker) => {
    const map = mapRef.current
    if (!map) return
    const data = marker.getExtData()
    infoWindowRef.current?.setContent(
      `<div class="amap-info-content"><span class="iw-tag">${escapeHtml(data.step || '地点')}</span><h4>${escapeHtml(data.title || '')}</h4><p>${escapeHtml(data.subtitle || '')}</p></div>`,
    )
    infoWindowRef.current?.open(map, marker.getPosition())
  }, [])

  const addMarker = useCallback((location: { lng: number; lat: number; name: string; address: string }, step: string, color: string) => {
    const map = mapRef.current
    if (!map || !window.AMap) return
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 30 38"><path d="M15 1C7.8 1 2 6.8 2 14c0 9.8 13 22 13 22s13-12.2 13-22C28 6.8 22.2 1 15 1z" fill="${color}" stroke="white" stroke-width="2"/><circle cx="15" cy="14" r="5" fill="white" fill-opacity=".94"/></svg>`
    const marker = new window.AMap.Marker({
      position: [location.lng, location.lat],
      title: location.name,
      icon: new window.AMap.Icon({
        size: new window.AMap.Pixel(30, 38),
        image: `data:image/svg+xml,${encodeURIComponent(svg)}`,
        imageSize: new window.AMap.Pixel(30, 38),
      }),
      zIndex: 100,
      extData: { step, color, title: location.name, subtitle: location.address || '' },
    })
    marker.on('click', () => openMarker(marker))
    map.add(marker)
    markersRef.current.push(marker)
  }, [openMarker])

  const searchAndMark = useCallback((keyword: string, city: string, stepName: string, color: string) => {
    const map = mapRef.current
    if (!map || !keyword || !window.AMap) return
    new window.AMap.PlaceSearch({ city: city || '全国', pageSize: 4 }).search(keyword, (status, result) => {
      if (status !== 'complete' || !result.poiList?.pois?.length) return
      result.poiList.pois.slice(0, 4).forEach(poi => addMarker({
        lng: poi.location.lng,
        lat: poi.location.lat,
        name: poi.name,
        address: poi.address || keyword,
      }, stepName, color))
      map.setFitView(null, false, [56, 56, 56, 56])
    })
  }, [addMarker])

  useEffect(() => {
    let cancelled = false
    loadAMap()
      .then(() => {
        if (cancelled || !containerRef.current || mapRef.current) return
        const map = new window.AMap.Map(containerRef.current, {
          zoom: 11,
          center: [121.4737, 31.2304],
          resizeEnable: true,
          mapStyle: document.documentElement.classList.contains('dark') ? 'amap://styles/dark' : 'amap://styles/normal',
        })
        mapRef.current = map
        infoWindowRef.current = new window.AMap.InfoWindow({ offset: new window.AMap.Pixel(0, -34) })
        setReady(true)
        onMapReady?.({ searchAndMark, clearMarkers })
      })
      .catch(reason => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '地图加载失败')
      })
    return () => { cancelled = true }
  }, [clearMarkers, onMapReady, searchAndMark])

  useEffect(() => {
    if (!ready || !mapRef.current) return
    clearMarkers()
    locations.forEach(location => addMarker(location, location.type, typeColors[location.type] || typeColors.other))
    if (locations.length > 1) mapRef.current.setFitView(null, false, [52, 52, 52, 52])
    if (locations.length === 1) mapRef.current.setCenter([locations[0].lng, locations[0].lat])
  }, [locations, ready, clearMarkers, addMarker])

  useEffect(() => {
    const observer = new MutationObserver(() => {
      mapRef.current?.setMapStyle(document.documentElement.classList.contains('dark') ? 'amap://styles/dark' : 'amap://styles/normal')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => () => {
    mapRef.current?.destroy()
    mapRef.current = null
  }, [])

  return (
    <div className={`map-surface ${className}`}>
      <div ref={containerRef} className="map-canvas" />
      {!ready && !error && <div className="map-state"><span className="map-loader" /><p>正在展开地图</p></div>}
      {error && <div className="map-state map-error"><MapPinned size={26} aria-hidden="true" /><p>地图尚未接入</p><small>{error} · 规划不受影响</small></div>}
    </div>
  )
}
