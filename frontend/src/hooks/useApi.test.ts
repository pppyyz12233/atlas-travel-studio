import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './useApi'

describe('api error contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
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

  it('rejects with a timeout error when the server never responds', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'))
        }, { once: true })
      }),
    ))

    const pending = api.get('/chat/conversations')
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'ApiError',
      message: '请求超时，请稍后重试',
    })
    await vi.advanceTimersByTimeAsync(8000)
    await assertion
  })

  it('resolves normally when the response arrives before the timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: 200, message: '', data: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )))

    await expect(api.get('/chat/conversations')).resolves.toEqual([])
  })
})
