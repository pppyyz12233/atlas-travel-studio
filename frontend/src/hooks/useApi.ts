import type { ApiResponse } from '../types'

const BASE = '/api'

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('travel_token')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as Record<string, string>) || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE}${url}`, { ...options, headers })
  let json: ApiResponse<T>
  try {
    json = await res.json() as ApiResponse<T>
  } catch {
    throw new ApiError(res.ok ? '服务响应格式异常' : `请求失败 (${res.status})`, res.status)
  }
  if (!res.ok || json.code !== 200) {
    const status = res.ok ? json.code : res.status
    throw new ApiError(json.message || `请求失败 (${status})`, status)
  }
  return json.data
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(url: string) => request<T>(url, { method: 'DELETE' }),
}
