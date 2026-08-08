import { useState, useCallback, useEffect } from 'react'
import type { UserInfo } from '../types'

const TOKEN_KEY = 'travel_token'
const USER_KEY = 'travel_user'

/** Extract error message from any API error shape (FastAPI detail / Pydantic / custom) */
function errMsg(json: Record<string, unknown>): string {
  if (typeof json.message === 'string') return json.message
  if (typeof json.detail === 'string') return json.detail
  if (Array.isArray(json.detail)) {
    const first = json.detail[0] as Record<string, unknown> | undefined
    if (first?.msg) return String(first.msg)
  }
  return ''
}

interface LoginResponse {
  user_id: number; username: string; email: string | null; phone: string | null
  role: string; access_token: string; token_type: string
}

export function useAuth() {
  const [user, setUser] = useState<UserInfo | null>(() => {
    const stored = localStorage.getItem(USER_KEY)
    return stored ? JSON.parse(stored) : null
  })
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [showAuthModal, setShowAuthModal] = useState(false)

  const isLoggedIn = !!token && !!user

  const saveAuth = useCallback((t: string, u: UserInfo) => {
    localStorage.setItem(TOKEN_KEY, t)
    localStorage.setItem(USER_KEY, JSON.stringify(u))
    setToken(t)
    setUser(u)
    setShowAuthModal(false)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    const res = await fetch('/api/auth/login/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const json = await res.json() as Record<string, unknown>
    if (json.code === 200 && json.data) {
      const d = json.data as LoginResponse
      const { access_token, ...userInfo } = d
      saveAuth(access_token, userInfo)
      return null
    }
    return errMsg(json) || '登录失败'
  }, [saveAuth])

  const loginByPhone = useCallback(async (phone: string, password: string): Promise<string | null> => {
    const res = await fetch('/api/auth/login/phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password }),
    })
    const json = await res.json() as Record<string, unknown>
    if (json.code === 200 && json.data) {
      const d = json.data as LoginResponse
      const { access_token, ...userInfo } = d
      saveAuth(access_token, userInfo)
      return null
    }
    return errMsg(json) || '登录失败'
  }, [saveAuth])

  const register = useCallback(async (
    username: string, password: string, email?: string, phone?: string
  ): Promise<string | null> => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email: email || null, phone: phone || null }),
    })
    const json = await res.json() as Record<string, unknown>
    if (json.code === 200 && json.data) {
      const d = json.data as LoginResponse
      const { access_token, ...userInfo } = d
      saveAuth(access_token, userInfo)
      return null
    }
    return errMsg(json) || '注册失败'
  }, [saveAuth])

  // 启动时验证 token
  useEffect(() => {
    if (token && !user) {
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then((json: Record<string, unknown>) => {
          if (json.code === 200 && json.data) {
            localStorage.setItem(USER_KEY, JSON.stringify(json.data))
            setUser(json.data as UserInfo)
          } else { logout() }
        })
        .catch(() => logout())
    }
  }, [token, user, logout])

  return { user, token, isLoggedIn, login, loginByPhone, register, logout, showAuthModal, setShowAuthModal }
}
