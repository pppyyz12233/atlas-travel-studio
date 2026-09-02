import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight, Eye, EyeOff, LockKeyhole, Mail, MapPinned,
  Phone, ShieldCheck, Sparkles, UserRound, X,
} from 'lucide-react'

interface Props {
  onClose: () => void
  onLogin: (email: string, password: string) => Promise<string | null>
  onLoginByPhone: (phone: string, password: string) => Promise<string | null>
  onRegister: (username: string, password: string, email?: string, phone?: string) => Promise<string | null>
}

type Page = 'login' | 'register'
type Identity = 'email' | 'phone'

const focusableSelector = [
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export default function AuthModal({ onClose, onLogin, onLoginByPhone, onRegister }: Props) {
  const [page, setPage] = useState<Page>('login')
  const [identity, setIdentity] = useState<Identity>('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const identityInputRef = useRef<HTMLInputElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const isRegister = page === 'register'

  useEffect(() => {
    const dialog = dialogRef.current
    const focusedBeforeOpen = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const appRoot = document.getElementById('root')
    const rootWasInert = appRoot?.hasAttribute('inert') ?? false
    const previousAriaHidden = appRoot?.getAttribute('aria-hidden')
    appRoot?.setAttribute('inert', '')
    appRoot?.setAttribute('aria-hidden', 'true')

    const focusables = () => Array.from(
      dialog?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    )
    const focusTimer = window.setTimeout(() => {
      identityInputRef.current?.focus()
    }, 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      if (appRoot) {
        appRoot.toggleAttribute('inert', rootWasInert)
        if (previousAriaHidden == null) appRoot.removeAttribute('aria-hidden')
        else appRoot.setAttribute('aria-hidden', previousAriaHidden)
      }
      if (focusedBeforeOpen?.isConnected) focusedBeforeOpen.focus()
    }
  }, [])

  const submit = async () => {
    setError('')
    if (isRegister && username.trim().length < 2) {
      setError('用户名至少需要 2 个字符')
      return
    }
    if (password.length < 6) {
      setError('密码至少需要 6 个字符')
      return
    }
    if (identity === 'email' && !email.trim()) {
      setError('请输入邮箱地址')
      return
    }
    if (identity === 'phone' && !phone.trim()) {
      setError('请输入手机号')
      return
    }

    setLoading(true)
    try {
      const result = isRegister
        ? await onRegister(
          username.trim(),
          password,
          identity === 'email' ? email.trim() : undefined,
          identity === 'phone' ? phone.trim() : undefined,
        )
        : identity === 'email'
          ? await onLogin(email.trim(), password)
          : await onLoginByPhone(phone.trim(), password)
      if (result) setError(result)
    } catch {
      setError('操作失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-overlay">
      <button type="button" tabIndex={-1} className="auth-backdrop" onClick={onClose} aria-label="关闭登录窗口" />
      <div ref={dialogRef} className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title" tabIndex={-1}>
        <section className="auth-story" aria-hidden="true">
          <div className="auth-story-orbit auth-story-orbit-one" />
          <div className="auth-story-orbit auth-story-orbit-two" />
          <div className="brand-mark brand-mark-light"><MapPinned size={21} /></div>
          <div className="auth-story-copy">
            <span className="eyebrow eyebrow-light"><Sparkles size={13} /> AI travel atelier</span>
            <h2>让每一次出发，<br />都从容而准确。</h2>
            <p>保存专属偏好、管理历史方案，并在任何设备继续你的旅程。</p>
          </div>
          <div className="auth-trust-row">
            <ShieldCheck size={16} />
            <span>会话隔离 · 安全保存 · 随时可继续</span>
          </div>
        </section>

        <section className="auth-form-panel">
          <button type="button" className="icon-button auth-close" onClick={onClose} aria-label="关闭">
            <X size={18} aria-hidden="true" />
          </button>

          <div className="auth-heading">
            <span className="eyebrow">Private workspace</span>
            <h1 id="auth-title">{isRegister ? '创建旅行档案' : '欢迎回来'}</h1>
            <p>{isRegister ? '建立你的偏好档案，开始长期旅行规划。' : '登录后继续上一次尚未完成的旅程。'}</p>
          </div>

          <div className="segmented-control" aria-label="登录方式">
            <button type="button" className={identity === 'email' ? 'is-active' : ''} aria-pressed={identity === 'email'} onClick={() => { setIdentity('email'); setError('') }}>
              <Mail size={15} aria-hidden="true" /> 邮箱
            </button>
            <button type="button" className={identity === 'phone' ? 'is-active' : ''} aria-pressed={identity === 'phone'} onClick={() => { setIdentity('phone'); setError('') }}>
              <Phone size={15} aria-hidden="true" /> 手机
            </button>
          </div>

          <div className="auth-fields">
            {isRegister && (
              <label className="field-control">
                <span>用户名</span>
                <div><UserRound size={17} /><input value={username} onChange={event => setUsername(event.target.value)} placeholder="你的称呼" autoComplete="username" /></div>
              </label>
            )}

            {identity === 'email' ? (
              <label className="field-control">
                <span>邮箱地址</span>
                <div><Mail size={17} aria-hidden="true" /><input ref={identityInputRef} type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" autoComplete="email" aria-invalid={Boolean(error && !email.trim())} /></div>
              </label>
            ) : (
              <label className="field-control">
                <span>手机号</span>
                <div><Phone size={17} aria-hidden="true" /><input ref={identityInputRef} type="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="138 0000 0000" autoComplete="tel" aria-invalid={Boolean(error && !phone.trim())} /></div>
              </label>
            )}

            <label className="field-control">
              <span>密码</span>
              <div>
                <LockKeyhole size={17} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') void submit() }}
                  placeholder="至少 6 个字符"
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                />
                <button type="button" className="field-action" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? '隐藏密码' : '显示密码'}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
          </div>

          {error && <div className="auth-error" role="alert">{error}</div>}

          <button type="button" className="primary-button auth-submit" onClick={() => void submit()} disabled={loading}>
            <span>{loading ? '处理中…' : isRegister ? '创建并进入' : '进入工作台'}</span>
            {!loading && <ArrowRight size={17} />}
          </button>

          <p className="auth-switch">
            {isRegister ? '已经拥有账号？' : '第一次使用？'}
            <button type="button" onClick={() => { setPage(isRegister ? 'login' : 'register'); setError('') }}>
              {isRegister ? '直接登录' : '创建账号'}
            </button>
          </p>
        </section>
      </div>
    </div>
  )
}
