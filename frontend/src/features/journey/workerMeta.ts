import { Hotel, MapPin, Plane, Route, Sparkles, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Worker 元数据唯一来源：标签、主题色、地图 marker 色、图标。
// AIPage / OrchestrationTimeline / MapView 一律从这里取值，避免四套近似色漂移。
export interface WorkerMeta {
  label: string
  shortLabel: string
  color: string
  markerColor: string
  icon: LucideIcon
}

export const workerMeta: Record<string, WorkerMeta> = {
  flight: {
    label: '航班智能体', shortLabel: '航班',
    color: '#d9604c', markerColor: '#d9604c', icon: Plane,
  },
  hotel: {
    label: '住宿智能体', shortLabel: '住宿',
    color: '#335f74', markerColor: '#335f74', icon: Hotel,
  },
  attraction: {
    label: '地点智能体', shortLabel: '地点',
    color: '#397764', markerColor: '#397764', icon: MapPin,
  },
  itinerary: {
    label: '日程智能体', shortLabel: '日程',
    color: '#6b5b83', markerColor: '#6b5b83', icon: Route,
  },
  budget: {
    label: '预算智能体', shortLabel: '预算',
    color: '#a87836', markerColor: '#a87836', icon: Wallet,
  },
}

export const fallbackWorkerMeta: WorkerMeta = {
  label: '规划智能体',
  shortLabel: '规划',
  color: '#335f74',
  markerColor: '#6d746f',
  icon: Sparkles,
}

export function getWorkerMeta(worker: string): WorkerMeta {
  return workerMeta[worker] ?? fallbackWorkerMeta
}

// 地图 Location.type → marker 颜色（类型色对齐 worker 色）
export const locationTypeColors: Record<string, string> = {
  flight: workerMeta.flight.markerColor,
  airport: workerMeta.flight.markerColor,
  hotel: workerMeta.hotel.markerColor,
  attraction: workerMeta.attraction.markerColor,
  itinerary: workerMeta.itinerary.markerColor,
  station: workerMeta.itinerary.markerColor,
  budget: workerMeta.budget.markerColor,
  other: fallbackWorkerMeta.markerColor,
}
