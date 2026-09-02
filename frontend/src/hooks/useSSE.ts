import { useState, useCallback, useRef } from 'react'
import { parseSSEDataLine } from '../features/journey/sseContract'
import type { NormalizedSSEEvent } from '../features/journey/sseContract'

export interface StreamError {
  message: string
  status?: number
}

interface UseSSEOptions {
  onEvent: (event: NormalizedSSEEvent) => void
  onError?: (error: StreamError) => void
  onDone?: () => void
}

export function useSSE() {
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const startStream = useCallback(async (
    message: string,
    conversationId: number | null,
    token: string | null,
    options: UseSSEOptions,
  ) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setIsStreaming(true)
    let receivedTerminalEvent = false

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) headers.Authorization = `Bearer ${token}`

      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message, conversation_id: conversationId }),
        signal: controller.signal,
        credentials: 'include',
      })

      if (!response.ok) {
        let messageText = `请求失败 (${response.status})`
        try {
          const json = await response.json() as Record<string, unknown>
          if (typeof json.message === 'string') messageText = json.message
          if (typeof json.detail === 'string') messageText = json.detail
        } catch { /* response may not be json */ }
        options.onError?.({ message: messageText, status: response.status })
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        options.onError?.({ message: '当前浏览器不支持流式响应' })
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      const emit = (line: string) => {
        const event = parseSSEDataLine(line)
        if (!event) return
        options.onEvent(event)
        const isTerminal = event.event === 'done'
          || (event.event === 'guard' && event.blocked === true)
        if (isTerminal && !receivedTerminalEvent) {
          receivedTerminalEvent = true
          options.onDone?.()
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split(/\r?\n/)
        buffer = chunks.pop() || ''
        chunks.forEach(emit)
      }

      buffer += decoder.decode()
      if (buffer.trim()) emit(buffer)
      if (!receivedTerminalEvent && !controller.signal.aborted) {
        options.onError?.({ message: '连接提前结束，请重试' })
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return
      options.onError?.({ message: error instanceof Error ? error.message : '连接异常' })
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setIsStreaming(false)
      }
    }
  }, [])

  const stopStream = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsStreaming(false)
  }, [])

  return { isStreaming, startStream, stopStream }
}
