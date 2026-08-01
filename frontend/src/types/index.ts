// ============================================================
// API 通用响应
// ============================================================
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

export interface PaginatedData<T> {
  total: number
  items: T[]
  page: number
  size: number
}

// ============================================================
// 用户 & 认证
// ============================================================
export interface UserInfo {
  user_id: number
  username: string
  email: string | null
  phone: string | null
  role: string
}

export interface LoginResponse {
  user_id: number
  username: string
  email: string | null
  phone: string | null
  role: string
  access_token: string
  token_type: string
}

// ============================================================
// 对话 & 消息
// ============================================================
export interface Conversation {
  id: number
  title: string
  created_at: string
}

export interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface ChatResponse {
  conversation_id: number | null
  reply: string
}

// ============================================================
// 地理位置 & 行程
// ============================================================
export interface Location {
  lng: number
  lat: number
  name: string
  address: string
  type: 'airport' | 'hotel' | 'attraction' | 'station' | 'other'
}

export interface TripItem {
  name: string
  detail: string
  price: string
  date: string
}

export interface StepOutput {
  summary: string
  locations: Location[]
  items: TripItem[]
}

// ============================================================
// SSE 事件类型
// ============================================================
export type SSEEventType =
  | 'guard'
  | 'plan'
  | 'step_start'
  | 'step_done'
  | 'aggregating'
  | 'done'

export interface SSEEvent {
  event: SSEEventType
  // guard
  ok?: boolean
  blocked?: boolean
  reason?: string
  // plan
  steps?: string[]
  count?: number
  // step_start
  name?: string
  worker?: string
  layer?: number
  parallel?: boolean
  // step_done
  status?: string
  result_snippet?: string
  summary?: string
  locations?: Location[]
  // done
  reply?: string
  conversation_id?: number | null
}

// ============================================================
// 计划步骤
// ============================================================
export interface PlanStep {
  name: string
  worker: string
  status: 'pending' | 'running' | 'done' | 'failed'
  summary: string
  locations: Location[]
  items: TripItem[]
}
