import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './useApi'

describe('api error contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('preserves the HTTP status from a JSON error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: 401, message: '登录已过期', data: null }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )))

    await expect(api.get('/chat/conversations')).rejects.toMatchObject({
      name: 'ApiError',
      message: '登录已过期',
      status: 401,
    })
  })

  it('preserves the HTTP status when an error response is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      '<html>Bad gateway</html>',
      { status: 502, headers: { 'Content-Type': 'text/html' } },
    )))

    await expect(api.get('/chat/conversations')).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
    })
  })
})
