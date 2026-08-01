import { useEffect, useState } from 'react'
import { User, Mail, Phone, Shield, Calendar, MessageSquare, LogOut, Loader2, ChevronRight } from 'lucide-react'
import { api } from '../hooks/useApi'
import type { UserInfo, Conversation } from '../types'
import type { useAuth } from '../hooks/useAuth'

interface ProfilePageProps {
  auth: ReturnType<typeof useAuth>
}

export default function ProfilePage({ auth }: ProfilePageProps) {
  const { user, isLoggedIn, logout, setShowAuthModal } = auth
  const [profile, setProfile] = useState<UserInfo | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isLoggedIn) return
    setLoading(true)

    Promise.all([
      api.get<UserInfo>('/auth/me'),
      api.get<Conversation[]>('/chat/conversations'),
    ])
      .then(([userInfo, convs]) => {
        setProfile(userInfo)
        setConversations(convs)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isLoggedIn])

  // 未登录
  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-[var(--border)] flex items-center justify-center mb-4">
          <User size={28} className="text-[var(--text-tertiary)]" />
        </div>
        <h2 className="font-semibold text-lg mb-2">个人中心</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-xs">
          登录后管理你的个人信息和旅行规划
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-full">
        <Loader2 size={28} className="animate-spin text-[var(--text-tertiary)]" />
      </div>
    )
  }

  const info = profile || user
  if (!info) return null

  const stats = [
    { icon: MessageSquare, label: '总对话数', value: conversations.length },
    { icon: Calendar, label: '注册时间', value: conversations.length > 0 ? conversations[conversations.length - 1]?.created_at?.slice(0, 10) || '-' : '-' },
  ]

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6 animate-fade-in">
      {/* 头像 & 用户名 */}
      <div className="flex flex-col items-center pt-6 pb-4">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#0071e3] to-[#5e5ce6] flex items-center justify-center shadow-lg shadow-blue-500/20 mb-3">
          <span className="text-2xl font-bold text-white">
            {info.username?.charAt(0).toUpperCase() || '?'}
          </span>
        </div>
        <h1 className="text-xl font-bold">{info.username}</h1>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          {info.role === 'admin' ? '管理员' : '旅行者'}
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="glass rounded-2xl p-4 text-center">
            <Icon size={20} className="mx-auto mb-1.5 text-[#0071e3]" />
            <div className="text-lg font-bold">{value}</div>
            <div className="text-[10px] text-[var(--text-secondary)]">{label}</div>
          </div>
        ))}
      </div>

      {/* 详细信息 */}
      <div className="glass rounded-2xl overflow-hidden">
        {[
          { icon: User, label: '用户名', value: info.username },
          { icon: Mail, label: '邮箱', value: info.email || '未设置' },
          { icon: Phone, label: '手机号', value: info.phone || '未设置' },
          { icon: Shield, label: '角色', value: info.role === 'admin' ? '管理员' : '普通用户' },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] last:border-b-0">
            <Icon size={16} className="text-[var(--text-tertiary)]" />
            <span className="text-xs text-[var(--text-secondary)] min-w-14">{label}</span>
            <span className="text-sm font-medium flex-1 text-right">{value}</span>
          </div>
        ))}
      </div>

      {/* 退出登录 */}
      <button
        onClick={logout}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-red-200 dark:border-red-500/20 text-[#ff3b30] text-sm font-medium hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors active:scale-[0.98]"
      >
        <LogOut size={16} />
        退出登录
      </button>
    </div>
  )
}
