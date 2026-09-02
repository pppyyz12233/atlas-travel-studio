import {
  ChevronsUpDown, Clock3, History, LogIn, LogOut, Moon, Navigation,
  Plus, Route, Sun, Trash2,
} from 'lucide-react'
import type { Conversation } from '../../types'
import type { JourneyPhase, JourneySession } from './model'

interface SessionRailProps {
  sessions: JourneySession[]
  activeId: string
  conversations: Conversation[]
  historyLoading: boolean
  isLoggedIn: boolean
  userName: string
  isDark: boolean
  onNewJourney: () => void
  onActivateSession: (id: string) => void
  onRemoveSession: (id: string) => void
  onLoadConversation: (conversation: Conversation) => void
  onLogin: () => void
  onLogout: () => void
  onToggleTheme: () => void
}

const phaseLabels: Record<JourneyPhase, string> = {
  idle: '待规划',
  planning: '规划中',
  ready: '已完成',
  error: '需处理',
  cancelled: '已停止',
}

function sessionSubtitle(session: JourneySession): string {
  if (session.form.origin && session.form.destination) {
    return `${session.form.origin} → ${session.form.destination}`
  }
  return phaseLabels[session.phase]
}

export default function SessionRail({
  sessions,
  activeId,
  conversations,
  historyLoading,
  isLoggedIn,
  userName,
  isDark,
  onNewJourney,
  onActivateSession,
  onRemoveSession,
  onLoadConversation,
  onLogin,
  onLogout,
  onToggleTheme,
}: SessionRailProps) {
  return (
    <div className="atlas-session-rail">
      <header className="atlas-brand-block">
        <span className="atlas-brand-mark"><Navigation size={20} aria-hidden="true" /></span>
        <span><strong>Atlas</strong><small>Journey intelligence</small></span>
      </header>

      <div className="atlas-rail-content">
        <button type="button" className="atlas-new-journey" onClick={onNewJourney} aria-label="新建旅程">
          <Plus size={17} aria-hidden="true" /> 新建旅程 <span>⌘ N</span>
        </button>

        <section className="atlas-rail-section" aria-labelledby="atlas-local-journeys">
          <div className="atlas-rail-heading">
            <span id="atlas-local-journeys"><Route size={14} aria-hidden="true" /> 工作区</span>
            <small>{sessions.length}</small>
          </div>
          <div className="atlas-session-list">
            {sessions.map(session => (
              <div className={`atlas-session-row ${session.id === activeId ? 'is-active' : ''}`} key={session.id}>
                <button type="button" className="atlas-session-main" onClick={() => onActivateSession(session.id)} aria-current={session.id === activeId ? 'page' : undefined}>
                  <span className={`atlas-session-signal is-${session.phase}`} aria-hidden="true" />
                  <span><strong>{session.title}</strong><small>{sessionSubtitle(session)}</small></span>
                  <em>{phaseLabels[session.phase]}</em>
                </button>
                {sessions.length > 1 && (
                  <button type="button" className="atlas-session-remove" onClick={() => onRemoveSession(session.id)} aria-label={`删除 ${session.title}`}>
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="atlas-rail-section atlas-history-section" aria-labelledby="atlas-cloud-history">
          <div className="atlas-rail-heading">
            <span id="atlas-cloud-history"><History size={14} aria-hidden="true" /> 历史记录</span>
            {isLoggedIn && <small>{conversations.length}</small>}
          </div>
          {historyLoading ? (
            <div className="atlas-history-state"><span className="atlas-mini-loader" />正在同步</div>
          ) : !isLoggedIn ? (
            <button type="button" className="atlas-history-invite" onClick={onLogin}>
              <Clock3 size={17} aria-hidden="true" />
              <span><strong>保存每一次规划</strong><small>登录后同步历史与导出记录</small></span>
            </button>
          ) : conversations.length === 0 ? (
            <div className="atlas-history-state">还没有云端旅程</div>
          ) : (
            <div className="atlas-cloud-list">
              {conversations.map(conversation => (
                <button type="button" key={conversation.id} onClick={() => onLoadConversation(conversation)}>
                  <span><strong>{conversation.title}</strong><small>{new Date(conversation.created_at).toLocaleDateString('zh-CN')}</small></span>
                  <ChevronsUpDown size={14} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <footer className="atlas-account-block">
        {isLoggedIn ? (
          <>
            <span className="atlas-account-avatar">{userName.slice(0, 1).toUpperCase()}</span>
            <span><strong>{userName}</strong><small>已同步旅程</small></span>
            <button type="button" onClick={onLogout} aria-label="退出登录"><LogOut size={16} aria-hidden="true" /></button>
          </>
        ) : (
          <button type="button" className="atlas-login-action" onClick={onLogin} aria-label="登录以保存旅程">
            <LogIn size={17} aria-hidden="true" /><span><strong>登录以保存旅程</strong><small>访客模式可直接体验</small></span>
          </button>
        )}
        <button type="button" className="atlas-theme-action" onClick={onToggleTheme} aria-label={isDark ? '切换到浅色主题' : '切换到深色主题'}>
          {isDark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
        </button>
      </footer>
    </div>
  )
}
