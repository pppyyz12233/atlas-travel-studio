import { useState, useCallback, useEffect } from 'react'
import type { UserInfo } from '../types'

const TOKEN_KEY = 'travel_token'
const USER_KEY = 'travel_user'

interface LoginResponse extends UserInfo {
  access_token: string
  token_type: string
}

function readStoredUser(): UserInfo | null {
  try {
    const stored = localStorage.getItem(USER_KEY)
    return stored ? JSON.parse(stored) as UserInfo : null
  } catch {
    localStorage.removeItem(USER_KEY)
    return null
  }
}

function errorMessage(json: Record<string, unknown>): string {
  if (typeof json.message === 'string' && json.message) return json.message
  if (typeof json.detail === 'string' && json.detail) return json.detail
  if (Array.isArray(json.detail)) {
    const first = json.detail[0] as Record<string, unknown> | undefined
    if (first?.msg) return String(first.msg)
  }
  return '请求失败，请稍后重试'
}

async function postAuth(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return await response.json() as Record<string, unknown>
}

export function useAuth() {
  const [user, setUser] = useState<UserInfo | null>(readStoredUser)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [isValidating, setIsValidating] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)))

  const logout = useCallback(() => {
    // 尽力通知服务端吊销 token（失败不影响本地登出）
    const currentToken = localStorage.getItem(TOKEN_KEY)
    if (currentToken) {
      void fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentToken}` },
        keepalive: true,
      }).catch(() => undefined)
    }
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
  }, [])

  const saveAuth = useCallback((nextToken: string, nextUser: UserInfo) => {
    localStorage.setItem(TOKEN_KEY, nextToken)
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser))
    setToken(nextToken)
    setUser(nextUser)
    setShowAuthModal(false)
  }, [])

  const completeAuth = useCallback((json: Record<string, unknown>): string | null => {
    if (json.code === 200 && json.data) {
      const data = json.data as LoginResponse
      const { access_token, token_type: _tokenType, ...userInfo } = data
      saveAuth(access_token, userInfo)
      return null
    }
    return errorMessage(json)
  }, [saveAuth])

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      return completeAuth(await postAuth('/api/auth/login/email', { email, password }))
    } catch {
      return '无法连接服务器，请检查服务是否已启动'
    }
  }, [completeAuth])

  const loginByPhone = useCallback(async (phone: string, password: string): Promise<string | null> => {
    try {
      return completeAuth(await postAuth('/api/auth/login/phone', { phone, password }))
    } catch {
      return '无法连接服务器，请检查服务是否已启动'
    }
  }, [completeAuth])

  const register = useCallback(async (
    username: string,
    password: string,
    email?: string,
    phone?: string,
  ): Promise<string | null> => {
    try {
      return completeAuth(await postAuth('/api/auth/register', {
        username,
        password,
        email: email || null,
        phone: phone || null,
      }))
    } catch {
      return '无法连接服务器，请检查服务是否已启动'
    }
  }, [completeAuth])

  useEffect(() => {
    let cancelled = false
    if (!token) {
      setIsValidating(false)
      return
    }

    setIsValidating(true)
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(response => response.json())
      .then((json: Record<string, unknown>) => {
        if (cancelled) return
        if (json.code === 200 && json.data) {
          const nextUser = json.data as UserInfo
          localStorage.setItem(USER_KEY, JSON.stringify(nextUser))
          setUser(nextUser)
        } else {
          logout()
        }
      })
      .catch(() => {
        if (!cancelled) logout()
      })
      .finally(() => {
        if (!cancelled) setIsValidating(false)
      })

    return () => { cancelled = true }
  }, [token, logout])

  return {
    user,
    token,
    isLoggedIn: Boolean(token && user),
    isValidating,
    login,
    loginByPhone,
    register,
    logout,
    showAuthModal,
    setShowAuthModal,
  }
}
