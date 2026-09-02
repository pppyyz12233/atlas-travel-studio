import type { ApiResponse } from '../types'

const BASE = '/api'
const DEFAULT_TIMEOUT_MS = 8000

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options
  const token = localStorage.getItem('travel_token')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // 每个请求自带超时：服务器无响应时给用户可读错误，而不是无限 pending
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(`${BASE}${url}`, { ...init, headers, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError('请求超时，请稍后重试')
    }
    throw new ApiError('无法连接服务器，请检查网络后重试')
  } finally {
    clearTimeout(timer)
  }

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
