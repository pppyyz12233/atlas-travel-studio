import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSSE } from './useSSE'

describe('useSSE request authentication', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('omits the authorization header for a guest planning request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      'data: {"event":"done","reply":"完成","conversation_id":null}\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    ))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useSSE())

    await act(async () => {
      await result.current.startStream('规划东京', null, null as unknown as string, {
        onEvent: vi.fn(),
      })
    })

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(request.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(request.credentials).toBe('include')
  })

  it('treats a blocked guard event as a complete stream instead of a disconnect', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      'data: {"event":"guard","blocked":true,"reason":"请调整描述"}\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    )))
    const onEvent = vi.fn()
    const onError = vi.fn()
    const { result } = renderHook(() => useSSE())

    await act(async () => {
      await result.current.startStream('被拦截的请求', null, null, { onEvent, onError })
    })

    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'guard',
      blocked: true,
      reason: '请调整描述',
    }))
    expect(onError).not.toHaveBeenCalled()
  })

  it('keeps streaming state owned by the newest overlapping request', async () => {
    let resolveSecond!: (response: Response) => void
    const secondResponse = new Promise<Response>(resolve => { resolveSecond = resolve })
    let call = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      call += 1
      if (call === 1) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          }, { once: true })
        })
      }
      return secondResponse
    }))

    const { result } = renderHook(() => useSSE())
    let firstRun!: Promise<void>
    let secondRun!: Promise<void>

    act(() => {
      firstRun = result.current.startStream('第一次请求', null, null, { onEvent: vi.fn() })
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(true))

    act(() => {
      secondRun = result.current.startStream('第二次请求', null, null, { onEvent: vi.fn() })
    })
    await act(async () => { await firstRun })

    expect(result.current.isStreaming).toBe(true)

    resolveSecond(new Response(
      'data: {"event":"done","reply":"第二次完成","conversation_id":null}\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    ))
    await act(async () => { await secondRun })
    expect(result.current.isStreaming).toBe(false)
  })

  it('preserves the HTTP status when an authenticated stream is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: 401, message: '登录已过期' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )))
    const onError = vi.fn()
    const { result } = renderHook(() => useSSE())

    await act(async () => {
      await result.current.startStream('继续规划', 7, 'expired-token', {
        onEvent: vi.fn(),
        onError,
      })
    })

    expect(onError).toHaveBeenCalledWith({ message: '登录已过期', status: 401 })
  })
})
