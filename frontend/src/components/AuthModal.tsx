import { useState } from 'react'
import { X, Mail, Phone, User, Lock, Eye, EyeOff } from 'lucide-react'

interface Props {
  onClose: () => void
  onLogin: (email: string, password: string) => Promise<string | null>
  onLoginByPhone: (phone: string, password: string) => Promise<string | null>
  onRegister: (username: string, password: string, email?: string, phone?: string) => Promise<string | null>
}

type Page = 'login' | 'register'
type IdType = 'email' | 'phone'

export default function AuthModal({ onClose, onLogin, onLoginByPhone, onRegister }: Props) {
  const [page, setPage] = useState<Page>('login')
  const [idType, setIdType] = useState<IdType>('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const isRegister = page === 'register'

  const submit = async () => {
    setError('')

    if (isRegister) {
      if (!username || username.length < 2) { setError('用户名至少 2 位'); return }
      if (!password || password.length < 6) { setError('密码至少 6 位'); return }
      if (idType === 'email' && !email.trim()) { setError('请输入邮箱'); return }
      if (idType === 'phone' && !phone.trim()) { setError('请输入手机号'); return }
    } else {
      if (!password || password.length < 6) { setError('密码至少 6 位'); return }
      if (idType === 'email' && !email.trim()) { setError('请输入邮箱'); return }
      if (idType === 'phone' && !phone.trim()) { setError('请输入手机号'); return }
    }

    setLoading(true)
    let err: string | null = null
    try {
      if (isRegister) {
        err = await onRegister(
          username, password,
          idType === 'email' ? email.trim() : undefined,
          idType === 'phone' ? phone.trim() : undefined,
        )
      } else if (idType === 'email') {
        err = await onLogin(email, password)
      } else {
        err = await onLoginByPhone(phone, password)
      }
    } finally { setLoading(false) }
    if (err) setError(err)
  }

  const inputCls = "flex items-center gap-2.5 px-3.5 h-10 rounded-xl text-[13px] bg-[var(--surface)] text-[var(--text)]"
  const iconCls = "text-[var(--text3)] flex-shrink-0"

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in">
      <div className="rounded-3xl w-full max-w-sm mx-4 overflow-hidden animate-in-up" style={{ background: 'var(--card)', boxShadow: 'var(--shadow-lg)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)]">
          <h2 className="font-semibold text-[15px] text-[var(--text)]">
            {isRegister ? '创建账号' : '登录'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--surface)] transition-colors">
            <X size={18} className="text-[var(--text2)]" />
          </button>
        </div>

        <div className="p-5 space-y-3.5">
          {/* 邮箱 / 手机号 切换 */}
          <div className="flex rounded-xl p-1 bg-[var(--surface)]">
            <button
              onClick={() => { setIdType('email'); setError('') }}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                idType === 'email' ? 'bg-white text-[var(--text)] shadow-sm' : 'text-[var(--text3)]'
              }`}
            >
              <Mail size={13} /> 邮箱
            </button>
            <button
              onClick={() => { setIdType('phone'); setError('') }}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                idType === 'phone' ? 'bg-white text-[var(--text)] shadow-sm' : 'text-[var(--text3)]'
              }`}
            >
              <Phone size={13} /> 手机号
            </button>
          </div>

          {/* 注册时：用户名 */}
          {isRegister && (
            <div className={inputCls}>
              <User size={15} className={iconCls} />
              <input value={username} onChange={e => setUsername(e.target.value)}
                placeholder="用户名" onKeyDown={e => e.key === 'Enter' && submit()}
                className="bg-transparent flex-1 outline-none placeholder:text-[var(--text3)]" />
            </div>
          )}

          {/* 邮箱输入 */}
          {idType === 'email' && (
            <div className={inputCls}>
              <Mail size={15} className={iconCls} />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="邮箱地址" onKeyDown={e => e.key === 'Enter' && submit()}
                className="bg-transparent flex-1 outline-none placeholder:text-[var(--text3)]" />
            </div>
          )}

          {/* 手机号输入 */}
          {idType === 'phone' && (
            <div className={inputCls}>
              <Phone size={15} className={iconCls} />
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="手机号" onKeyDown={e => e.key === 'Enter' && submit()}
                className="bg-transparent flex-1 outline-none placeholder:text-[var(--text3)]" />
            </div>
          )}

          {/* 密码 */}
          <div className={inputCls}>
            <Lock size={15} className={iconCls} />
            <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
              placeholder="密码" onKeyDown={e => e.key === 'Enter' && submit()}
              className="bg-transparent flex-1 outline-none placeholder:text-[var(--text3)]" />
            <button onClick={() => setShowPwd(!showPwd)} type="button" className="flex-shrink-0">
              {showPwd ? <EyeOff size={15} className={iconCls} /> : <Eye size={15} className={iconCls} />}
            </button>
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-[var(--coral)] bg-[var(--coral)]/5 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Submit */}
          <button onClick={submit} disabled={loading}
            className="w-full h-10 rounded-xl text-white text-[13px] font-semibold transition-all active:scale-[0.98] disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[var(--blue)]/30"
            style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>
            {loading ? '处理中...' : isRegister ? '注册并登录' : '登录'}
          </button>

          {/* 切换 登录/注册 */}
          <p className="text-center text-[11px] text-[var(--text3)]">
            {isRegister ? '已有账号？' : '没有账号？'}
            <button
              onClick={() => { setPage(isRegister ? 'login' : 'register'); setError('') }}
              className="ml-1 text-[var(--blue)] font-medium hover:opacity-80 transition-opacity"
            >
              {isRegister ? '去登录' : '去注册'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
