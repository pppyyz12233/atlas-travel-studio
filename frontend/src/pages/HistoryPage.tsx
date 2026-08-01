import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, Download, Trash2, ChevronRight, Loader2, Calendar, MapPin, ExternalLink } from 'lucide-react'
import { api } from '../hooks/useApi'
import MarkdownView from '../components/MarkdownView'
import type { Conversation, Message } from '../types'
import type { useAuth } from '../hooks/useAuth'

interface HistoryPageProps {
  auth: ReturnType<typeof useAuth>
}

export default function HistoryPage({ auth }: HistoryPageProps) {
  const { isLoggedIn, setShowAuthModal } = auth
  const navigate = useNavigate()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [exporting, setExporting] = useState(false)

  // 加载对话列表
  useEffect(() => {
    if (!isLoggedIn) return
    setLoading(true)
    api.get<Conversation[]>('/chat/conversations')
      .then(setConversations)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isLoggedIn])

  // 加载对话消息
  const loadMessages = useCallback(async (convId: number) => {
    setSelectedId(convId)
    setLoadingMsgs(true)
    try {
      const msgs = await api.get<Message[]>(`/chat/history?conversation_id=${convId}`)
      setMessages(msgs)
    } catch {
      setMessages([])
    } finally {
      setLoadingMsgs(false)
    }
  }, [])

  // 导出
  const handleExport = useCallback(async (convId: number, format: 'md' | 'pdf') => {
    setExporting(true)
    try {
      const token = localStorage.getItem('travel_token')
      const res = await fetch(`/api/export/${convId}?format=${format}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error('导出失败')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const ext = format === 'md' ? 'md' : 'pdf'
      const a = document.createElement('a')
      a.href = url
      a.download = `trip_plan_${convId}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(err instanceof Error ? err.message : '导出失败')
    } finally {
      setExporting(false)
    }
  }, [])

  // 未登录
  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-6 text-center">
        <MessageSquare size={48} className="text-[var(--text-tertiary)] mb-4" />
        <h2 className="font-semibold text-lg mb-2">历史对话</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-xs">
          登录后可查看和导出你的旅行规划历史
        </p>
        <button
          onClick={() => setShowAuthModal(true)}
          className="px-5 py-2.5 bg-[#0071e3] text-white text-sm font-medium rounded-xl hover:bg-[#0077ed] transition-colors"
        >
          立即登录
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* 列表 */}
      <div className={`w-full md:w-80 flex-shrink-0 border-r border-[var(--border)] flex flex-col ${
        selectedId ? 'hidden md:flex' : 'flex'
      }`}>
        <div className="p-4 border-b border-[var(--border)]">
          <h2 className="font-semibold text-sm">对话历史</h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center py-12 px-4 text-center">
              <Calendar size={32} className="text-[var(--text-tertiary)] mb-2" />
              <p className="text-sm text-[var(--text-secondary)]">暂无对话</p>
              <button
                onClick={() => navigate('/ai')}
                className="mt-3 text-xs text-[#0071e3] font-medium hover:underline"
              >
                去创建第一个行程 →
              </button>
            </div>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => loadMessages(conv.id)}
                className={`w-full text-left px-4 py-3 border-b border-[var(--border)] transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02] ${
                  conv.id === selectedId ? 'bg-blue-50 dark:bg-blue-500/5 border-l-2 border-l-[#0071e3]' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm truncate flex-1">{conv.title}</span>
                  <ChevronRight size={14} className="text-[var(--text-tertiary)] flex-shrink-0 ml-2" />
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
                  {conv.created_at?.slice(0, 10)}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 详情 */}
      <div className={`flex-1 flex flex-col min-w-0 ${!selectedId ? 'hidden md:flex' : 'flex'}`}>
        {!selectedId ? (
          <div className="flex flex-col items-center justify-center flex-1 text-[var(--text-tertiary)]">
            <MessageSquare size={40} className="mb-2" />
            <p className="text-sm">选择一个对话查看详情</p>
          </div>
        ) : loadingMsgs ? (
          <div className="flex items-center justify-center flex-1">
            <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
          </div>
        ) : (
          <>
            {/* 顶部操作栏 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] glass">
              <button
                onClick={() => setSelectedId(null)}
                className="md:hidden p-1 text-[var(--text-secondary)]"
              >
                ← 返回
              </button>
              <h3 className="font-semibold text-sm flex-1 md:flex-none truncate">
                {conversations.find(c => c.id === selectedId)?.title || '对话详情'}
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleExport(selectedId, 'md')}
                  disabled={exporting}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors disabled:opacity-50"
                >
                  <Download size={12} />
                  MD
                </button>
                <button
                  onClick={() => handleExport(selectedId, 'pdf')}
                  disabled={exporting}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors disabled:opacity-50"
                >
                  <ExternalLink size={12} />
                  PDF
                </button>
              </div>
            </div>

            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
              {messages.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)] text-center py-12">暂无消息</p>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} className="animate-fade-in">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                        msg.role === 'user'
                          ? 'bg-[var(--border)]'
                          : 'bg-gradient-to-br from-blue-500 to-purple-600 text-white'
                      }`}>
                        {msg.role === 'user' ? '我' : 'AI'}
                      </div>
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {msg.created_at?.slice(0, 19).replace('T', ' ')}
                      </span>
                    </div>

                    {msg.role === 'assistant' ? (
                      <div className="ml-8 glass rounded-2xl p-5">
                        <MarkdownView content={msg.content} />
                      </div>
                    ) : (
                      <div className="ml-8 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl px-4 py-2.5 text-sm">
                        {msg.content}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
