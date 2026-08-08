import { useState, useRef, useEffect, useCallback, useReducer, useMemo } from 'react'
import { useSSE } from '../hooks/useSSE'
import { api } from '../hooks/useApi'
import MapView from '../components/MapView'
import TripResult from '../components/TripResult'
import type { SSEEvent, Location, Conversation } from '../types'
import type { useAuth } from '../hooks/useAuth'
import type { useTheme } from '../hooks/useTheme'

/* ================================================================
   Constants
   ================================================================ */
const WC: Record<string, string> = { flight: '#ef4444', hotel: '#3b82f6', attraction: '#10b981', itinerary: '#8b5cf6', budget: '#f59e0b' }
const WI: Record<string, string> = { flight: '✈️', hotel: '🏨', attraction: '🎯', itinerary: '📋', budget: '💰' }
type MapAPI = { searchAndMark: (kw: string, city: string, step: string, color: string) => void; clearMarkers: () => void }

let _m: { parse: (s: string) => string } | null = null
function md(s: string): string {
  if (!_m) { const w = window as unknown as Record<string, unknown>; _m = (w.marked as { parse: (s: string) => string }) || { parse: (s: string) => s.replace(/\n/g, '<br>') } }
  return _m.parse(s)
}

/* ================================================================
   Session — React's killer feature: isolated state per tab

   In vanilla JS, switching between sessions means manually
   hiding/showing DOM, saving/restoring scroll positions,
   and praying event listeners don't cross-fire.

   In React, it's just: swap the activeSessionId → re-render.
   ================================================================ */

interface Step { name: string; worker: string; status: 'pending' | 'running' | 'done' | 'failed'; summary: string; locations: Location[] }
interface Message { role: 'user' | 'assistant'; content: string }

interface Session {
  id: string
  title: string
  conversationId: number | null
  messages: Message[]
  steps: Step[]
  finalReply: string
  locations: Location[]
  hasStarted: boolean
  dest: string; from: string; date: string; days: number; people: number; budget: number
}

type SessionAction =
  | { type: 'ADD_SESSION' }
  | { type: 'REMOVE_SESSION'; id: string }
  | { type: 'SET_ACTIVE'; id: string }
  | { type: 'UPDATE_SESSION'; id: string; patch: Partial<Session> }
  | { type: 'LOAD_CONV'; id: string; conv: Conversation }

function newSession(): Session {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  return { id, title: '新规划', conversationId: null, messages: [], steps: [], finalReply: '', locations: [], hasStarted: false, dest: '东京', from: '上海', date: new Date().toISOString().slice(0, 10), days: 5, people: 2, budget: 8000 }
}

function sessionReducer(state: { sessions: Session[]; active: string }, action: SessionAction): { sessions: Session[]; active: string } {
  switch (action.type) {
    case 'ADD_SESSION': {
      const s = newSession()
      return { sessions: [...state.sessions, s], active: s.id }
    }
    case 'REMOVE_SESSION': {
      const next = state.sessions.filter(s => s.id !== action.id)
      if (next.length === 0) {
        const fallback = newSession()
        return { sessions: [fallback], active: fallback.id }
      }
      return { sessions: next, active: state.active === action.id ? next[0].id : state.active }
    }
    case 'SET_ACTIVE':
      return { ...state, active: action.id }
    case 'UPDATE_SESSION':
      return {
        ...state,
        sessions: state.sessions.map(s => s.id === action.id ? { ...s, ...action.patch } : s),
      }
    case 'LOAD_CONV': {
      const existing = state.sessions.find(s => s.conversationId === action.conv.id)
      if (existing) return { ...state, active: existing.id }
      const s = newSession()
      s.title = action.conv.title; s.conversationId = action.conv.id; s.hasStarted = true
      return { sessions: [...state.sessions, s], active: s.id }
    }
    default:
      return state
  }
}

/* ================================================================
   Sub-components
   ================================================================ */

function Field({ l, v, s, t = 'text', p = '', n = false }: { l: string; v: string; s: (v: string) => void; t?: string; p?: string; n?: boolean }) {
  return (
    <div className={n ? 'flex-1' : ''}>
      <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text3)] mb-1 block">{l}</label>
      <input type={t} value={v} onChange={e => s(e.target.value)} placeholder={p}
        className="w-full h-9 px-3 rounded-lg bg-[var(--surface)] border-0 text-[13px] text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--blue)]/15 transition-all placeholder:text-[var(--text3)]" />
    </div>
  )
}

function MapWrap({ locs, onAPI, onCount }: { locs: Location[]; onAPI: (a: MapAPI) => void; onCount: (n: number) => void }) {
  const h = useCallback((api: MapAPI) => {
    onAPI({ searchAndMark: (kw, c, st, cl) => { api.searchAndMark(kw, c, st, cl); setTimeout(() => onCount(document.querySelectorAll('.amap-marker').length), 600) }, clearMarkers: () => { api.clearMarkers(); onCount(0) } })
  }, [onAPI, onCount])
  return <MapView locations={locs} onMapReady={h} />
}

/* ================================================================
   Chat area — pure function of session state
   ================================================================ */
function ChatArea({ session, isStreaming, finalReply, onSearchMap }: { session: Session; isStreaming: boolean; finalReply: string; onSearchMap: (kw: string, city: string) => void }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [session.messages, session.steps, finalReply])

  const cardS = { background: 'var(--card)', boxShadow: 'var(--shadow)' }
  const btnG = { background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }

  if (!session.hasStarted) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center select-none">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'linear-gradient(135deg, #2563eb, #0891b2)' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        </div>
        <h1 className="text-[18px] font-bold tracking-tight text-[var(--text)]">想去哪里旅行？</h1>
        <p className="text-[13px] text-[var(--text2)] mt-2 leading-relaxed">填写左侧信息一键规划，或在下方直接描述</p>
        <div className="text-xs mt-5 px-4 py-2 rounded-lg bg-[var(--surface)] text-[var(--text3)]">例："从上海去东京5天，人均8000，想去秋叶原和浅草寺"</div>
      </div>
    )
  }

  return (
    <>
      {session.messages.map((m, i) => (
        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`} style={{ animation: 'fadeIn .25s cubic-bezier(.16,1,.3,1) both' }}>
          <div className={`max-w-[78%] px-4 py-2.5 text-[13px] leading-relaxed ${m.role === 'user' ? 'text-white rounded-[16px_16px_4px_16px]' : 'rounded-[16px_16px_16px_4px]'}`} style={m.role === 'user' ? btnG : cardS}>
            {m.role === 'assistant'
              ? <span className="text-[var(--text2)] italic">方案已生成，详见下方卡片 ↓</span>
              : m.content
            }
          </div>
        </div>
      ))}

      {session.steps.map((s, i) => (
        <div key={`st${i}`} className="flex justify-start" style={{ animation: `stepIn .3s cubic-bezier(.16,1,.3,1) ${i * 0.04}s both` }}>
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-[14px] max-w-[92%]" style={cardS}>
            <span className="text-[15px]">{WI[s.worker] || '📌'}</span>
            <div className="min-w-0 flex-1"><div className="font-semibold text-[12px] text-[var(--text)]">{s.name}</div>{s.summary && <div className="text-[11px] mt-0.5 line-clamp-2 text-[var(--text2)]">{s.summary}</div>}</div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${s.status === 'done' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : s.status === 'failed' ? 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400' : s.status === 'running' ? 'bg-blue-50 text-[var(--blue)] dark:bg-blue-500/10 dark:text-blue-400' : 'bg-gray-100 text-gray-400'}`}>{s.status === 'done' ? '完成' : s.status === 'failed' ? '失败' : s.status === 'running' ? '执行中' : ''}</span>
          </div>
        </div>
      ))}

      {isStreaming && !finalReply && (
        <div className="flex justify-start"><div className="flex gap-1 px-4 py-3 rounded-[16px_16px_16px_4px]" style={cardS}><span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" /></div></div>
      )}

      {/* React advantage: AI result → interactive cards, not dead markdown */}
      {finalReply && !isStreaming && (
        <TripResult
          markdown={finalReply}
          onSearchMap={onSearchMap}
          city={session.dest}
        />
      )}

      <div ref={endRef} />
    </>
  )
}

/* ================================================================
   MAIN
   ================================================================ */
interface Props { auth: ReturnType<typeof useAuth>; theme: ReturnType<typeof useTheme> }

export default function AIPage({ auth, theme }: Props) {
  const { user, token, isLoggedIn, setShowAuthModal, logout } = auth
  const { isDark, toggle: toggleTheme } = theme
  const { isStreaming, startStream, stopStream } = useSSE()

  // ---- Multi-tab sessions — the React advantage ----
  const [{ sessions, active }, dispatch] = useReducer(sessionReducer, { sessions: [newSession()], active: '' })
  // Init first session
  useEffect(() => { if (!active && sessions[0]) dispatch({ type: 'SET_ACTIVE', id: sessions[0].id }) }, [])

  const activeSession = useMemo(() => sessions.find(s => s.id === active) || sessions[0] || newSession(), [sessions, active])

  const update = useCallback((patch: Partial<Session>) => { dispatch({ type: 'UPDATE_SESSION', id: activeSession.id, patch }) }, [activeSession.id])

  // ---- Conversations ----
  const [convs, setConvs] = useState<Conversation[]>([])
  const [convsLoading, setConvsLoading] = useState(false)
  useEffect(() => { if (isLoggedIn) { setConvsLoading(true); api.get<Conversation[]>('/chat/conversations').then(setConvs).catch(() => {}).finally(() => setConvsLoading(false)) } }, [isLoggedIn])

  // ---- Map ----
  const [markerCount, setMarkerCount] = useState(0)
  const mapRef = useRef<MapAPI | null>(null)

  // ---- Timer ----
  const [startTime, setStartTime] = useState(0)
  const [elapsed, setElapsed] = useState('0.0s')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (isStreaming && startTime) { timerRef.current = setInterval(() => setElapsed(((Date.now() - startTime) / 1000).toFixed(1) + 's'), 100) }
    else { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isStreaming, startTime])

  // ---- Input ----
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // ---- Derived ----
  const doneCount = useMemo(() => activeSession.steps.filter(s => s.status === 'done' || s.status === 'failed').length, [activeSession.steps])
  const percent = useMemo(() => activeSession.steps.length ? Math.round(doneCount / activeSession.steps.length * 100) : 0, [activeSession.steps, doneCount])

  // ---- Load conversation ----
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  const loadConv = useCallback(async (conv: Conversation) => {
    // If already loaded, just switch to it
    const existing = sessionsRef.current.find(s => s.conversationId === conv.id)
    if (existing) {
      dispatch({ type: 'SET_ACTIVE', id: existing.id })
      return
    }
    // Create new session and load messages
    dispatch({ type: 'LOAD_CONV', id: '', conv })
    try {
      const ms = await api.get<{ role: string; content: string }[]>(`/chat/history?conversation_id=${conv.id}`)
      // After dispatch + re-render, sessionsRef is updated. Find the new session.
      const target = sessionsRef.current.find(s => s.conversationId === conv.id)
      if (target) {
        dispatch({ type: 'UPDATE_SESSION', id: target.id, patch: { messages: ms.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })), hasStarted: true } })
      }
    } catch { /* */ }
  }, [])

  // ---- Send ----
  const go = useCallback(() => {
    const s = activeSession
    const text = `从${s.from}去${s.dest}，${s.date}出发，${s.days}天，${s.people}人，人均${s.budget}元`
    setInput(text); send(text)
  }, [activeSession])

  const send = useCallback((text: string) => {
    if (!text.trim() || isStreaming) return
    if (!token) { setShowAuthModal(true); return }

    setInput(''); setStartTime(Date.now())
    update({ steps: [], finalReply: '', locations: [], hasStarted: true, messages: [...activeSession.messages, { role: 'user' as const, content: text }] })
    mapRef.current?.clearMarkers(); setMarkerCount(0)

    startStream(text, activeSession.conversationId, token, {
      onEvent(e: SSEEvent) {
        switch (e.event) {
          case 'guard': if (e.blocked) update({ finalReply: `⚠️ ${e.reason || '被拦截'}` }); break
          case 'plan':
            if (e.steps) update({ steps: e.steps.map(n => ({ name: n, worker: '', status: 'pending' as const, summary: '', locations: [] })) })
            break
          case 'step_start':
            dispatch({ type: 'UPDATE_SESSION', id: activeSession.id, patch: { steps: activeSession.steps.map(s => s.name === e.name ? { ...s, worker: e.worker || '', status: 'running' as const } : s) } })
            break
          case 'step_done': {
            const w = e.worker || '', color = WC[w] || '#3b82f6', k = (() => { const n = (e.name || '').toLowerCase(); if (n.includes('航班') || n.includes('flight')) return activeSession.dest + ' 机场'; if (n.includes('酒店') || n.includes('hotel')) return activeSession.dest + ' 酒店'; if (n.includes('景点') || n.includes('attraction')) return activeSession.dest + ' 景点'; return null })()
            dispatch({ type: 'UPDATE_SESSION', id: activeSession.id, patch: {
              steps: activeSession.steps.map(s => s.name === e.name ? { ...s, worker: w || s.worker, status: (e.status === 'failed' ? 'failed' : 'done') as Step['status'], summary: e.summary || e.result_snippet || '', locations: e.locations || [] } : s),
              locations: [...activeSession.locations, ...(e.locations || [])],
            }})
            if (e.status !== 'failed' && mapRef.current && k) mapRef.current.searchAndMark(k, activeSession.dest, e.name || w, color)
            if (e.locations?.length) setMarkerCount(c => c + e.locations!.length)
            break
          }
          case 'done':
            if (e.reply) {
              dispatch({ type: 'UPDATE_SESSION', id: activeSession.id, patch: { finalReply: e.reply, messages: [...activeSession.messages, { role: 'assistant' as const, content: e.reply }], conversationId: e.conversation_id || activeSession.conversationId } })
            }
            if (e.conversation_id) { if (isLoggedIn) api.get<Conversation[]>('/chat/conversations').then(setConvs).catch(() => {}) }
            if (mapRef.current) mapRef.current.searchAndMark(activeSession.dest, activeSession.dest, '总览', '#6366f1')
            break
        }
      },
      onError(err) { update({ finalReply: `❌ ${err}` }) },
    })
  }, [isStreaming, token, activeSession, startStream, update, setShowAuthModal, isLoggedIn, dispatch])

  const handleSend = useCallback(() => { const t = input.trim(); if (t) send(t) }, [input, send])

  // ---- Session switching — restore map ----
  useEffect(() => {
    // When switching sessions, update map markers
    if (mapRef.current && activeSession.locations.length > 0) {
      mapRef.current.clearMarkers()
      activeSession.locations.forEach(loc => {
        const color = WC[loc.type] || '#3b82f6'
        mapRef.current?.searchAndMark(loc.name, activeSession.dest, loc.type, color)
      })
    }
    setMarkerCount(activeSession.locations.length)
  }, [active])

  // ---- Render ----
  const btnG = { background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }

  return (
    <div className="flex h-full bg-[var(--bg)]">
      {/* ==================== SIDEBAR ==================== */}
      <aside className="hidden md:flex flex-col w-[272px] flex-shrink-0 border-r border-[var(--line)] bg-[var(--bg)]">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-5 h-[52px] border-b border-[var(--line)]">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{ background: 'linear-gradient(135deg, #2563eb, #0891b2)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          </div>
          <span className="text-[14px] font-semibold tracking-tight text-[var(--text)]">旅行规划师</span>
        </div>

        {/* ===== SESSION TABS — the React advantage ===== */}
        <div className="px-3 pt-3 pb-1 border-b border-[var(--line)]">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {sessions.map(s => (
              <button
                key={s.id}
                onClick={() => dispatch({ type: 'SET_ACTIVE', id: s.id })}
                className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all flex-shrink-0 max-w-[120px] ${
                  s.id === active
                    ? 'bg-[var(--blue)]/8 text-[var(--blue)]'
                    : 'text-[var(--text2)] hover:bg-[var(--surface)]'
                }`}
                title={s.title}
              >
                <span className="truncate">{s.title}</span>
                {sessions.length > 1 && (
                  <span
                    onClick={e => { e.stopPropagation(); dispatch({ type: 'REMOVE_SESSION', id: s.id }) }}
                    className="opacity-0 group-hover:opacity-100 text-[var(--text3)] hover:text-[var(--coral)] transition-all text-[14px] leading-none"
                  >×</span>
                )}
              </button>
            ))}
            <button
              onClick={() => dispatch({ type: 'ADD_SESSION' })}
              className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[var(--text3)] hover:bg-[var(--surface)] hover:text-[var(--blue)] transition-all text-sm font-medium"
              title="新建规划标签"
            >+</button>
          </div>
        </div>

        {/* Form — driven by active session */}
        <div className="px-4 py-4 space-y-3 overflow-y-auto flex-1">
          <div className="flex gap-2">
            <Field l="目的地" v={activeSession.dest} s={v => update({ dest: v })} p="东京" n />
            <Field l="出发地" v={activeSession.from} s={v => update({ from: v })} p="上海" n />
          </div>
          <Field l="出发日期" v={activeSession.date} s={v => update({ date: v })} t="date" />
          <div className="flex gap-2">
            <Field l="天数" v={String(activeSession.days)} s={v => update({ days: +v || 1 })} n />
            <Field l="人数" v={String(activeSession.people)} s={v => update({ people: +v || 1 })} n />
            <Field l="预算/人" v={String(activeSession.budget)} s={v => update({ budget: +v || 0 })} n />
          </div>

          <button onClick={go} disabled={isStreaming}
            className="w-full h-10 rounded-lg text-white text-[13px] font-semibold transition-all active:scale-[0.97] disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[var(--blue)]/30"
            style={btnG}>
            {isStreaming ? '规划中...' : '开始规划'}
          </button>

          {/* Progress */}
          {activeSession.steps.length > 0 && (
            <div className="pt-1">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[11px] font-medium text-[var(--text2)]">{isStreaming ? `${doneCount}/${activeSession.steps.length} 步` : '✓ 全部完成'}</span>
                <span className="text-[11px] font-mono text-[var(--text3)]">{elapsed}</span>
              </div>
              <div className="h-1 rounded-full mb-3 overflow-hidden bg-[var(--surface)]">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percent}%`, background: 'linear-gradient(90deg, #2563eb, #0891b2)' }} />
              </div>
              <div className="space-y-0.5">
                {activeSession.steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 py-[3px]">
                    <div className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${s.status === 'running' ? 'bg-[var(--blue)] ring-[3px] ring-[var(--blue)]/20' : s.status === 'done' ? 'bg-emerald-500' : s.status === 'failed' ? 'bg-red-500' : 'bg-[var(--text3)]'}`} />
                    <span className={`text-[11px] flex-1 truncate ${s.status === 'running' ? 'font-semibold text-[var(--text)]' : 'text-[var(--text3)]'}`}>{WI[s.worker]} {s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* History — load into new tab */}
          {isLoggedIn && (
            <div className="pt-3 border-t border-[var(--line)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text3)]">历史</span>
              </div>
              <div className="space-y-0.5 max-h-[150px] overflow-y-auto">
                {convsLoading ? <p className="text-[11px] text-[var(--text3)] text-center py-3">加载中...</p>
                : convs.length === 0 ? <p className="text-[11px] text-[var(--text3)] text-center py-3">暂无记录</p>
                : convs.map(c => (
                  <button key={c.id} onClick={() => loadConv(c)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-[12px] transition-colors truncate block ${sessions.some(s => s.conversationId === c.id) ? 'bg-[var(--blue)]/8 text-[var(--blue)] font-medium' : 'hover:bg-[var(--surface)] text-[var(--text)]'}`}>
                    {c.title}<span className="block text-[10px] text-[var(--text3)] mt-0.5">{c.created_at?.slice(0, 10)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--line)] flex items-center justify-between text-xs">
          {isLoggedIn ? (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0" style={{ background: 'linear-gradient(135deg, #2563eb, #0891b2)' }}>{user?.username?.charAt(0).toUpperCase()}</div>
              <span className="font-medium text-[12px] text-[var(--text)] truncate">{user?.username}</span>
              <button onClick={logout} className="text-[var(--text3)] hover:text-[var(--text2)] transition-colors">退出</button>
            </div>
          ) : <button onClick={() => setShowAuthModal(true)} className="text-[var(--blue)] font-medium">登录</button>}
          <button onClick={toggleTheme} className="text-sm text-[var(--text3)] hover:text-[var(--text2)] p-1" aria-label={isDark ? '亮色' : '暗色'}>{isDark ? '☀️' : '🌙'}</button>
        </div>
      </aside>

      {/* ==================== CHAT ==================== */}
      <main className="flex-1 flex flex-col min-w-0 bg-[var(--bg)]">
        <div className="md:hidden flex items-center justify-between h-11 px-4 glass border-b border-[var(--line)]">
          <span className="font-semibold text-[13px] text-[var(--text)]">🗺 旅行规划师</span>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="text-sm">{isDark ? '☀️' : '🌙'}</button>
            {isLoggedIn ? <><span className="text-xs">{user?.username}</span><button onClick={logout} className="text-[10px] text-[var(--text3)]">退出</button></> : <button onClick={() => setShowAuthModal(true)} className="text-xs text-[var(--blue)]">登录</button>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 md:px-8 py-6 space-y-2">
          <ChatArea session={activeSession} isStreaming={isStreaming} finalReply={activeSession.finalReply}
            onSearchMap={(kw, city) => { if (mapRef.current) mapRef.current.searchAndMark(kw, city, kw, '#6366f1') }} />
        </div>

        <div className="p-3 md:p-4 border-t border-[var(--line)] glass">
          <div className="flex gap-2.5 items-center max-w-3xl mx-auto">
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="描述旅行计划，或输入修改请求..." disabled={isStreaming}
              className="flex-1 h-10 px-4 rounded-xl bg-[var(--card)] border border-[var(--line)] text-[13px] outline-none focus:ring-2 focus:ring-[var(--blue)]/15 transition-all placeholder:text-[var(--text3)] text-[var(--text)]"
              aria-label="输入消息" />
            {isStreaming ? (
              <button onClick={stopStream} className="h-10 px-5 rounded-xl bg-[var(--coral)] text-white text-[13px] font-semibold hover:opacity-90 active:scale-95">停止</button>
            ) : (
              <button onClick={handleSend} disabled={!input.trim()} className="h-10 px-5 rounded-xl text-white text-[13px] font-semibold active:scale-95 disabled:opacity-30" style={btnG}>发送</button>
            )}
          </div>
          {!isLoggedIn && <p className="text-[10px] text-center mt-2 text-[var(--text3)]">未登录也可使用，登录后保存对话</p>}
        </div>
      </main>

      {/* ==================== MAP ==================== */}
      <section className="hidden lg:flex flex-col w-[380px] xl:w-[420px] flex-shrink-0 border-l border-[var(--line)] bg-[var(--bg)]">
        <div className="flex justify-between items-center px-4 h-10 border-b border-[var(--line)] text-xs font-medium text-[var(--text2)]">
          <span>地图标注</span><span className="font-normal text-[var(--text3)]">{markerCount} 个标记</span>
        </div>
        <div className="flex-1 relative"><MapWrap locs={activeSession.locations} onAPI={a => { mapRef.current = a }} onCount={setMarkerCount} /></div>
        <div className="flex gap-3 px-4 py-2 border-t border-[var(--line)] text-[10px] text-[var(--text3)]" role="list">
          {Object.entries(WC).map(([k, c]) => (<span key={k} className="flex items-center gap-1" role="listitem"><span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{WI[k]}</span>))}
        </div>
      </section>
    </div>
  )
}
