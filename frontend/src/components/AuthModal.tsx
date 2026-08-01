import { useState } from 'react'
import { X, Mail, Phone, User, Lock, Eye, EyeOff } from 'lucide-react'

interface AuthModalProps {
  onClose: () => void
  onLogin: (email: string, password: string) => Promise<string | null>
  onLoginByPhone: (phone: string, password: string) => Promise<string | null>
  onRegister: (username: string, password: string, email?: string, phone?: string) => Promise<string | null>
}

type Mode = 'login-email' | 'login-phone' | 'register'

export default function AuthModal({ onClose, onLogin, onLoginByPhone, onRegister }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>('login-email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setError('')
    if (!password || password.length < 6) {
      setError('密码至少 6 位')
      return
    }

    setLoading(true)
    let err: string | null = null
    try {
      switch (mode) {
        case 'login-email':
          if (!email) { setError('请输入邮箱'); setLoading(false); return }
          err = await onLogin(email, password)
          break
        case 'login-phone':
          if (!phone) { setError('请输入手机号'); setLoading(false); return }
          err = await onLoginByPhone(phone, password)
          break
        case 'register':
          if (!username || username.length < 2) { setError('用户名至少 2 位'); setLoading(false); return }
          if (!email && !phone) { setError('邮箱或手机号至少填一个'); setLoading(false); return }
          err = await onRegister(username, password, email || undefined, phone || undefined)
          break
      }
    } finally {
      setLoading(false)
    }

    if (err) setError(err)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="glass rounded-2xl w-full max-w-sm mx-4 shadow-lg overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="font-semibold text-base">
            {mode === 'register' ? '创建账号' : '登录'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* 模式切换 */}
          <div className="flex bg-black/[0.04] dark:bg-white/[0.06] rounded-xl p-1">
            {([
              ['login-email', '邮箱登录'] as const,
              ['login-phone', '手机登录'] as const,
              ['register', '注册'] as const,
            ]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setMode(key); setError('') }}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                  mode === key
                    ? 'bg-white dark:bg-[#3a3a3c] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 邮箱 */}
          {(mode === 'login-email' || mode === 'register') && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-black/[0.02] dark:bg-white/[0.04] rounded-xl border border-[var(--border)]">
              <Mail size={16} className="text-[var(--text-tertiary)]" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="邮箱地址"
                className="bg-transparent flex-1 text-sm outline-none placeholder:text-[var(--text-tertiary)]"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            </div>
          )}

          {/* 手机号 */}
          {(mode === 'login-phone' || mode === 'register') && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-black/[0.02] dark:bg-white/[0.04] rounded-xl border border-[var(--border)]">
              <Phone size={16} className="text-[var(--text-tertiary)]" />
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="手机号"
                className="bg-transparent flex-1 text-sm outline-none placeholder:text-[var(--text-tertiary)]"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            </div>
          )}

          {/* 用户名（注册时） */}
          {mode === 'register' && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-black/[0.02] dark:bg-white/[0.04] rounded-xl border border-[var(--border)]">
              <User size={16} className="text-[var(--text-tertiary)]" />
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="用户名"
                className="bg-transparent flex-1 text-sm outline-none placeholder:text-[var(--text-tertiary)]"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            </div>
          )}

          {/* 密码 */}
          <div className="flex items-center gap-2 px-3 py-2.5 bg-black/[0.02] dark:bg-white/[0.04] rounded-xl border border-[var(--border)]">
            <Lock size={16} className="text-[var(--text-tertiary)]" />
            <input
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="密码"
              className="bg-transparent flex-1 text-sm outline-none placeholder:text-[var(--text-tertiary)]"
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
            <button onClick={() => setShowPwd(!showPwd)} className="p-0.5">
              {showPwd ? <EyeOff size={16} className="text-[var(--text-tertiary)]" /> : <Eye size={16} className="text-[var(--text-tertiary)]" />}
            </button>
          </div>

          {/* 错误提示 */}
          {error && (
            <p className="text-xs text-[#ff3b30] bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* 提交按钮 */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-3 bg-[#0071e3] hover:bg-[#0077ed] text-white text-sm font-semibold rounded-xl transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '处理中...' : mode === 'register' ? '注册并登录' : '登录'}
          </button>
        </div>
      </div>
    </div>
  )
}
