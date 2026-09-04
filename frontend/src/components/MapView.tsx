/* eslint-disable @typescript-eslint/no-namespace -- AMap 1.4.15 全局类型声明用 namespace 是正当模式 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapPinned } from 'lucide-react'
import type { Location } from '../types'
import type { DayPlan } from '../features/journey/viewModel'
import { readAMapConfig } from '../features/journey/mapConfig'
import { buildMarkerInfo, buildRoutedLocations, escapeHtml } from '../features/journey/mapRouting'
import type { MapRenderPlan, RoutedLocation } from '../features/journey/mapRouting'
import MapOverlays from './MapOverlays'

declare namespace AMap {
  class Map {
    constructor(container: HTMLElement | string, opts?: Record<string, unknown>)
    add(overlay: unknown): void
    remove(overlay: unknown): void
    setFitView(overlays?: unknown[] | null, immediately?: boolean, avoid?: number[]): void
    setCenter(center: [number, number]): void
    setZoomAndCenter(zoom: number, center: [number, number]): void
    setMapStyle(style: string): void
    destroy(): void
  }
  class Marker {
    constructor(opts?: Record<string, unknown>)
    on(event: string, fn: () => void): void
    getExtData(): Record<string, unknown>
    getPosition(): { lng: number; lat: number }
  }
  class Polyline {
    constructor(opts?: Record<string, unknown>)
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
  class Geocoder {
    constructor(opts?: Record<string, unknown>)
    getAddress(
      location: [number, number],
      callback: (status: string, result: {
        regeocode?: {
          formattedAddress?: string
          addressComponent?: {
            province?: string | Array<string>
            city?: string | Array<string> | ''
            district?: string | Array<string>
          }
        }
      }) => void,
    ): void
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
  /** 阶段4：聚焦某个已派生地点（编号 marker + 信息窗）；命中返回 true */
  focusLocation: (locationKey: string) => boolean
}

interface Props {
  locations: Location[]
  /** 逐日行程：用于派生 marker 编号 / 每日分组 / 折线；缺省则只显示编号 marker */
  days?: DayPlan[]
  onMapReady?: (api: MapApi) => void
  className?: string
}

const typeColors: Record<string, string> = {
  flight: '#b04a2f', airport: '#b04a2f',
  hotel: '#2f4a6b',
  attraction: '#4c7a3f',
  itinerary: '#a8742a', station: '#a8742a',
  budget: '#8a6a3e', other: '#746d5f',
}

let scriptPromise: Promise<void> | null = null

/** 加载高德 SDK（PlaceSearch + Geocoder 插件）。导出供 geoLabel 逆地理复用，全局只注入一次。 */
export function loadAMap(): Promise<void> {
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
    script.src = `https://webapi.amap.com/maps?v=1.4.15&key=${encodeURIComponent(config.key)}&plugin=AMap.PlaceSearch,AMap.Geocoder`
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

export default function MapView({ locations, days, onMapReady, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<AMap.Map | null>(null)
  const markersRef = useRef<AMap.Marker[]>([])
  const polylinesRef = useRef<AMap.Polyline[]>([])
  const infoWindowRef = useRef<AMap.InfoWindow | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  // 折叠面板（display:none）下容器尺寸为 0：AMap 在 0 尺容器的 fitView 会退化，
  // 懒挂载的 marker 在容器恢复后不会自动重算——恢复尺寸时重画并触发 resize。
  const [containerVisible, setContainerVisible] = useState(true)

  // 派生渲染计划（纯函数，编号/分组/折线/降级计数都在这里决定）
  const plan: MapRenderPlan | null = useMemo(
    () => buildRoutedLocations(locations, days ?? []).plan,
    [locations, days],
  )

  const clearMarkers = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach(marker => map.remove(marker))
    polylinesRef.current.forEach(polyline => map.remove(polyline))
    markersRef.current = []
    polylinesRef.current = []
  }, [])

  const openMarker = useCallback((marker: AMap.Marker) => {
    const map = mapRef.current
    if (!map) return
    const data = marker.getExtData()
    if (data.routed) {
      infoWindowRef.current?.setContent(buildMarkerInfo(data.routed as RoutedLocation))
    } else {
      infoWindowRef.current?.setContent(
        `<div class="amap-info-content"><span class="iw-tag">${escapeHtml(String(data.step || '地点'))}</span><h4>${escapeHtml(String(data.title || ''))}</h4><p>${escapeHtml(String(data.subtitle || ''))}</p></div>`,
      )
    }
    infoWindowRef.current?.open(map, marker.getPosition())
  }, [])

  // 编号 marker：颜色随天，数字为行程顺序（内容全部由内部整数/色板生成，安全）。
  // title 提供悬停/读屏语义：D1·3 = 第 1 天第 3 站（点开信息窗可见完整说明）
  const addRoutedMarker = useCallback((spec: MapRenderPlan['markers'][number]) => {
    const map = mapRef.current
    if (!map || !window.AMap) return
    const label = spec.location.day === null ? `·${spec.number}` : `D${spec.location.day + 1}·${(spec.location.orderInDay ?? 0) + 1}`
    const hoverTitle = spec.location.day === null
      ? `${escapeHtml(spec.location.name)}（未排期）`
      : `${escapeHtml(spec.location.name)} · 第 ${spec.location.day + 1} 天第 ${(spec.location.orderInDay ?? 0) + 1} 站`
    const badge = `<div class="amap-num-marker" title="${hoverTitle}" aria-label="${hoverTitle}" style="background:${spec.color}"><span>${label}</span></div>`
    const marker = new window.AMap.Marker({
      position: [spec.location.lng, spec.location.lat],
      content: badge,
      offset: new window.AMap.Pixel(-12, -12),
      zIndex: 110,
      extData: { routed: spec.location },
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
      result.poiList.pois.slice(0, 4).forEach(poi => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 30 38"><path d="M15 1C7.8 1 2 6.8 2 14c0 9.8 13 22 13 22s13-12.2 13-22C28 6.8 22.2 1 15 1z" fill="${color}" stroke="white" stroke-width="2"/><circle cx="15" cy="14" r="5" fill="white" fill-opacity=".94"/></svg>`
        const marker = new window.AMap.Marker({
          position: [poi.location.lng, poi.location.lat],
          title: poi.name,
          icon: new window.AMap.Icon({
            size: new window.AMap.Pixel(30, 38),
            image: `data:image/svg+xml,${encodeURIComponent(svg)}`,
            imageSize: new window.AMap.Pixel(30, 38),
          }),
          zIndex: 100,
          extData: { step: stepName, title: poi.name, subtitle: poi.address || keyword },
        })
        marker.on('click', () => openMarker(marker))
        map.add(marker)
        markersRef.current.push(marker)
      })
      map.setFitView(null, false, [56, 56, 56, 56])
    })
  }, [openMarker])

  // 阶段4：时间轴联动——聚焦指定地点键（未命中返回 false 由 POI 搜索兜底）
  const focusLocation = useCallback((locationKey: string): boolean => {
    const map = mapRef.current
    if (!map) return false
    const marker = markersRef.current.find(m => (m.getExtData().routed as RoutedLocation | undefined)?.key === locationKey)
    if (!marker) return false
    const position = marker.getPosition()
    map.setZoomAndCenter(15, [position.lng, position.lat])
    openMarker(marker)
    return true
  }, [openMarker])

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
        infoWindowRef.current = new window.AMap.InfoWindow({ offset: new window.AMap.Pixel(0, -30) })
        setReady(true)
        onMapReady?.({ searchAndMark, clearMarkers, focusLocation })
      })
      .catch(reason => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '地图加载失败')
      })
    return () => { cancelled = true }
  }, [clearMarkers, onMapReady, searchAndMark, focusLocation])

  // 容器尺寸监听：0 尺寸（右栏折叠）→ 恢复可见时置位重画；jsdom 无 ResizeObserver 时跳过
  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const hasSize = el.clientWidth > 0 && el.clientHeight > 0
      setContainerVisible(current => (current === hasSize ? current : hasSize))
      if (hasSize) window.dispatchEvent(new Event('resize'))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // 消费渲染计划：清旧（marker+折线）→ 画编号 marker → 画每日折线 → 自适应视野
  // containerVisible 守卫：容器不可见时跳过，恢复可见后重画（含 fitView，marker 懒挂载得以重算）
  useEffect(() => {
    if (!ready || !containerVisible || !mapRef.current) return
    clearMarkers()

    if (plan) {
      plan.markers.forEach(addRoutedMarker)
      plan.polylines.forEach(spec => {
        const polyline = new window.AMap.Polyline({
          path: spec.path.map(point => [point.lng, point.lat]),
          strokeColor: spec.color,
          strokeWeight: 4,
          strokeOpacity: .82,
          showDir: true,
          lineJoin: 'round',
          zIndex: 50,
        })
        mapRef.current?.add(polyline)
        polylinesRef.current.push(polyline)
      })

      if (markersRef.current.length > 1) mapRef.current.setFitView(null, false, [52, 52, 52, 52])
      if (markersRef.current.length === 1) {
        const only = plan.markers[0].location
        mapRef.current.setCenter([only.lng, only.lat])
      }
    }
  }, [plan, ready, containerVisible, clearMarkers, addRoutedMarker])

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
    <div className={`map-view-stack ${className}`}>
      <div className="map-surface">
        <div ref={containerRef} className="map-canvas" />
        {!ready && !error && <div className="map-state"><span className="map-loader" /><p>正在展开地图</p></div>}
        {error && <div className="map-state map-error"><MapPinned size={26} aria-hidden="true" /><p>地图尚未接入</p><small>{error} · 规划不受影响</small></div>}
      </div>
      {ready && <MapOverlays plan={plan} />}
    </div>
  )
}
