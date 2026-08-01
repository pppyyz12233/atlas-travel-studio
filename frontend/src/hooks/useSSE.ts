import { useState, useCallback, useRef } from 'react'
import type { SSEEvent } from '../types'

interface UseSSEOptions {
  onEvent: (event: SSEEvent) => void
  onError?: (error: string) => void
  onDone?: () => void
}

export function useSSE() {
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const startStream = useCallback(async (message: string, conversationId: number | null, token: string | null, options: UseSSEOptions) => {
    setIsStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message, conversation_id: conversationId }),
        signal: controller.signal,
      })

      if (!response.ok) {
        options.onError?.(`请求失败 (${response.status})`)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        options.onError?.('不支持流式读取')
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data: ')) continue
          const jsonStr = trimmed.slice(6)
          try {
            const event: SSEEvent = JSON.parse(jsonStr)
            options.onEvent(event)
            if (event.event === 'done') {
              options.onDone?.()
            }
          } catch {
            // skip malformed JSON
          }
        }
      }

      // 处理缓冲区剩余
      if (buffer.trim().startsWith('data: ')) {
        try {
          const event: SSEEvent = JSON.parse(buffer.trim().slice(6))
          options.onEvent(event)
          if (event.event === 'done') options.onDone?.()
        } catch { /* skip */ }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      options.onError?.(err instanceof Error ? err.message : '连接异常')
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [])

  const stopStream = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
  }, [])

  return { isStreaming, startStream, stopStream }
}
