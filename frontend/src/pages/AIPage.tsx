import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Plus, MessageSquare, LogIn, Loader2, StopCircle } from 'lucide-react'
import ChatBubble from '../components/ChatBubble'
import ResultCard from '../components/ResultCard'
import MarkdownView from '../components/MarkdownView'
import MapView from '../components/MapView'
import { useSSE } from '../hooks/useSSE'
import { api } from '../hooks/useApi'
import type { SSEEvent, PlanStep, Conversation, Location, Message } from '../types'
import type { useAuth } from '../hooks/useAuth'

interface AIPageProps {
  auth: ReturnType<typeof useAuth>
}

// 收集所有 step_done 的 locations
function collectLocations(steps: PlanStep[]): Location[] {
  const seen = new Set<string>()
  const all: Location[] = []
  for (const s of steps) {
    for (const loc of s.locations) {
      const key = `${loc.lng},${loc.lat}`
      if (!seen.has(key)) {
        seen.add(key)
        all.push(loc)
      }
    }
  }
  return all
}

export default function AIPage({ auth }: AIPageProps) {
  const { user, token, isLoggedIn, setShowAuthModal } = auth
  const { isStreaming, startStream, stopStream } = useSSE()

  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [steps, setSteps] = useState<PlanStep[]>([])
  const [finalReply, setFinalReply] = useState('')
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingConvs, setLoadingConvs] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 自动滚动
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, steps, finalReply])

  // 加载对话列表
  useEffect(() => {
    if (!isLoggedIn) return
    setLoadingConvs(true)
    api.get<Conversation[]>('/chat/conversations')
      .then(setConversations)
      .catch(() => {})
      .finally(() => setLoadingConvs(false))
  }, [isLoggedIn])

  // 切换对话
  const loadConversation = useCallback(async (convId: number) => {
    setConversationId(convId)
    setSteps([])
    setFinalReply('')
    try {
      const msgs = await api.get<Message[]>(`/chat/history?conversation_id=${convId}`)
      setChatMessages(msgs.map(m => ({ role: m.role, content: m.content })))
    } catch {
      setChatMessages([])
    }
  }, [])

  // 新建对话
  const newChat = useCallback(() => {
    setConversationId(null)
    setSteps([])
    setFinalReply('')
    setChatMessages([])
    inputRef.current?.focus()
  }, [])

  // 发送消息
  const handleSend = useCallback(() => {
    const msg = input.trim()
    if (!msg || isStreaming) return

    setInput('')
    setSteps([])
    setFinalReply('')
    setChatMessages(prev => [...prev, { role: 'user', content: msg }])

    startStream(msg, conversationId, token, {
      onEvent: (event: SSEEvent) => {
        switch (event.event) {
          case 'guard':
            if (event.blocked) {
              setFinalReply(`⚠️ 内容被拦截：${event.reason || '请修改后重试'}`)
            }
            break

          case 'plan':
            // 初始化所有步骤
            if (event.steps) {
              setSteps(event.steps.map((name, i) => ({
                name,
                worker: '',
                status: 'pending' as const,
                summary: '',
                locations: [],
                items: [],
              })))
            }
            break

          case 'step_start':
            setSteps(prev => prev.map(s =>
              s.name === event.name
                ? { ...s, worker: event.worker || s.worker, status: 'running' as const }
                : s
            ))
            break

          case 'step_done':
            setSteps(prev => prev.map(s =>
              s.name === event.name
                ? {
                    ...s,
                    worker: event.worker || s.worker,
                    status: (event.status === 'failed' ? 'failed' : 'done') as PlanStep['status'],
                    summary: event.summary || event.result_snippet || '',
                    locations: event.locations || [],
                  }
                : s
            ))
            break

          case 'done':
            if (event.reply) {
              setFinalReply(event.reply)
              setChatMessages(prev => [...prev, { role: 'assistant', content: event.reply! }])
            }
            if (event.conversation_id) {
              setConversationId(event.conversation_id)
              // 刷新对话列表
              if (isLoggedIn) {
                api.get<Conversation[]>('/chat/conversations').then(setConversations).catch(() => {})
              }
            }
            break
        }
      },
      onError: (error) => {
        setFinalReply(`❌ 连接出错：${error}`)
      },
    })
  }, [input, isStreaming, conversationId, token, startStream, isLoggedIn])

  const allLocations = collectLocations(steps)

  return (
    <div className="flex h-full">
      {/* 桌面端左侧对话列表 */}
      {isLoggedIn && (
        <aside className={`hidden md:flex flex-col glass-sidebar border-r border-[var(--border)] transition-all duration-300 ${
          sidebarOpen ? 'w-64' : 'w-0 overflow-hidden border-r-0'
        }`}>
          <div className="p-4 border-b border-[var(--border)]">
            <button
              onClick={newChat}
              className="w-full flex items-center gap-2 px-3 py-2.5 bg-[#0071e3] text-white text-sm font-medium rounded-xl hover:bg-[#0077ed] transition-colors active:scale-[0.98]"
            >
              <Plus size={16} />
              新建对话
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loadingConvs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-[var(--text-tertiary)]" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="text-xs text-[var(--text-tertiary)] text-center py-8">暂无对话</p>
            ) : (
              conversations.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => loadConversation(conv.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                    conv.id === conversationId
                      ? 'bg-blue-50 dark:bg-blue-500/10 text-[#0071e3] font-medium'
                      : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.04] text-[var(--text-primary)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare size={14} className="flex-shrink-0" />
                    <span className="truncate">{conv.title}</span>
                  </div>
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 ml-6">
                    {conv.created_at?.slice(0, 10)}
                  </p>
                </button>
              ))
            )}
          </div>
        </aside>
      )}

      {/* 主聊天区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] glass">
          <div className="flex items-center gap-3">
            {isLoggedIn && (
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="hidden md:block p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--text-secondary)]"
              >
                <MessageSquare size={18} />
              </button>
            )}
            <h2 className="font-semibold text-sm">
              {conversationId ? '对话详情' : 'AI 行程定制'}
            </h2>
          </div>

          {!isLoggedIn && (
            <button
              onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0071e3] bg-blue-50 dark:bg-blue-500/10 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
            >
              <LogIn size={14} />
              登录
            </button>
          )}
        </div>

        {/* 聊天内容 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* 历史消息 */}
          {chatMessages.map((msg, i) => (
            <ChatBubble key={i} role={msg.role} content={msg.content} />
          ))}

          {/* Worker 执行进度卡片（流式进行中） */}
          {steps.length > 0 && (
            <div className="space-y-3 animate-fade-in">
              <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                📋 执行计划 · {steps.filter(s => s.status === 'done').length}/{steps.length} 步骤完成
              </p>
              <div className="space-y-2">
                {steps.map((step, i) => (
                  <ResultCard key={`${step.name}-${i}`} step={step} />
                ))}
              </div>
              {/* 地图打点 */}
              {allLocations.length > 0 && (
                <MapView locations={allLocations} />
              )}
            </div>
          )}

          {/* 最终 Markdown 结果 */}
          {finalReply && steps.length > 0 && (
            <div className="glass rounded-2xl p-5 animate-slide-up">
              <MarkdownView content={finalReply} />
            </div>
          )}

          {/* 流式进行中的提示 */}
          {isStreaming && !finalReply && (
            <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] animate-pulse-soft">
              <Loader2 size={16} className="animate-spin" />
              AI 正在规划您的行程...
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* 底部输入区 */}
        <div className="p-4 border-t border-[var(--border)] glass">
          <div className="max-w-3xl mx-auto flex items-center gap-2">
            <div className="flex-1 flex items-center bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl px-4 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-blue-200 dark:focus-within:ring-blue-800 transition-all">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="输入旅行需求，如：帮我规划上海到东京5天行程..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-tertiary)]"
                disabled={isStreaming}
              />
            </div>

            {isStreaming ? (
              <button
                onClick={stopStream}
                className="p-2.5 rounded-full bg-[#ff3b30] text-white shadow-md hover:bg-red-600 transition-all active:scale-90"
              >
                <StopCircle size={20} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="p-2.5 rounded-full bg-[#0071e3] text-white shadow-md hover:bg-[#0077ed] transition-all active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send size={20} />
              </button>
            )}
          </div>

          {!isLoggedIn && (
            <p className="text-[10px] text-[var(--text-tertiary)] text-center mt-2">
              未登录模式 · 登录后可保存和查看历史对话
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
