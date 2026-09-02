import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, LogIn, Map as MapIcon, Menu, MessageSquareText, Moon, Sparkles, Sun } from 'lucide-react'
import type { MapApi } from '../components/MapView'
import {
  AppShell,
  Composer,
  ConversationFeed,
  ItineraryWorkspace,
  JourneyCommandStrip,
  JourneyContextPanel,
  MissionBrief,
  OrchestrationTimeline,
  SessionRail,
  buildItineraryViewModel,
  createJourneySession,
  eventToJourneyActions,
  getWorkerMeta,
  journeyProgress,
} from '../features/journey'
import type { JourneyMessage, TripForm } from '../features/journey'
import type { NormalizedSSEEvent } from '../features/journey/sseContract'
import { useJourney } from '../app/JourneyProvider'
import { consumePendingBrief } from '../app/pendingBrief'
import { useRouter } from '../app/router'
import { useToast } from '../app/Toast'
import { api } from '../hooks/useApi'
import type { useAuth } from '../hooks/useAuth'
import { useSSE } from '../hooks/useSSE'
import type { useTheme } from '../hooks/useTheme'
import type { Conversation } from '../types'

interface Props {
  auth: ReturnType<typeof useAuth>
  theme: ReturnType<typeof useTheme>
}

const followupSuggestions = [
  '酒店尽量靠近地铁站',
  '第二天减少一个景点',
  '把预算控制得更紧一些',
]

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('status' in error)) return undefined
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}

function fallbackBrief(form: TripForm): string {
  return `从${form.origin.trim()}去${form.destination.trim()}，${form.date}出发，${form.days}天，${form.people}人，人均预算${form.budget}元。请给出兼顾体验、节奏和预算的完整方案。`
}

export default function AIPage({ auth, theme }: Props) {
  // 会话状态来自 App 级 JourneyProvider：首页/详情页/我的行程与规划页共享同一份
  const { state: journeyState, dispatch, activeSession } = useJourney()
  const { navigate } = useRouter()
  const { notify } = useToast()
  const { isStreaming, startStream, stopStream } = useSSE()
  const [input, setInput] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [railOpen, setRailOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [feedOpen, setFeedOpen] = useState(false)
  const [resultNotice, setResultNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const mapRef = useRef<MapApi | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeIdRef = useRef(activeSession.id)
  const streamingSessionIdRef = useRef<string | null>(null)
  const conversationsRequestRef = useRef(0)
  activeIdRef.current = activeSession.id

  const progress = journeyProgress(activeSession.steps, activeSession.graphNode)
  const viewModel = useMemo(
    () => buildItineraryViewModel(activeSession.finalReply, activeSession.tripState),
    [activeSession.finalReply, activeSession.tripState],
  )

  const requestLoginForExpiredSession = useCallback(() => {
    auth.logout()
    auth.setShowAuthModal(true)
  }, [auth.logout, auth.setShowAuthModal])

  const refreshConversations = useCallback(async () => {
    const requestId = ++conversationsRequestRef.current
    if (!auth.isLoggedIn) {
      setConversations([])
      setHistoryLoading(false)
      return
    }
    setHistoryLoading(true)
    try {
      const nextConversations = await api.get<Conversation[]>('/chat/conversations')
      if (conversationsRequestRef.current === requestId) {
        setConversations(nextConversations)
      }
    } catch (error: unknown) {
      if (conversationsRequestRef.current === requestId) {
        setConversations([])
        if (errorStatus(error) === 401) requestLoginForExpiredSession()
      }
    } finally {
      if (conversationsRequestRef.current === requestId) setHistoryLoading(false)
    }
  }, [auth.isLoggedIn, auth.token, requestLoginForExpiredSession])

  useEffect(() => {
    void refreshConversations()
  }, [refreshConversations])

  useEffect(() => {
    setResultNotice(null)
  }, [activeSession.id])

  // R3/R4/R5：规划中自动展开右栏；完成进入阅读态自动收起右栏并折叠对话轨迹，
  // 与「恢复已完成会话」路径保持一致；用户此后可主动展开（phase 不再变化，不会被覆盖）
  useEffect(() => {
    if (activeSession.phase === 'planning') setContextOpen(true)
    if (activeSession.phase === 'ready') {
      setContextOpen(false)
      setFeedOpen(false)
    }
  }, [activeSession.phase])

  useEffect(() => {
    const scrollingElement = scrollRef.current
    if (!scrollingElement) return
    if (activeSession.phase === 'idle') {
      scrollingElement.scrollTo({ top: 0 })
      return
    }
    scrollingElement.scrollTo({
      top: scrollingElement.scrollHeight,
      behavior: activeSession.phase === 'planning' ? 'smooth' : 'auto',
    })
  }, [activeSession.finalReply, activeSession.id, activeSession.phase, activeSession.steps])

  const patchForm = useCallback((patch: Partial<TripForm>) => {
    dispatch({ type: 'patchForm', id: activeSession.id, patch })
  }, [activeSession.id])

  const loadConversation = useCallback(async (conversation: Conversation) => {
    const existing = journeyState.sessions.find(session => session.conversationId === conversation.id)
    if (existing) {
      dispatch({ type: 'activate', id: existing.id })
      setRailOpen(false)
      return
    }

    const previousActiveId = journeyState.activeId
    const session = createJourneySession({
      title: conversation.title,
      conversationId: conversation.id,
    })
    dispatch({ type: 'add', session })
    setRailOpen(false)

    try {
      const messages = await api.get<Array<{ role: string; content: string }>>(
        `/chat/history?conversation_id=${conversation.id}`,
      )
      const normalized = messages
        .filter(item => item.role === 'user' || item.role === 'assistant')
        .map(item => ({
          role: item.role as JourneyMessage['role'],
          content: item.content,
        }))
      const finalReply = [...normalized]
        .reverse()
        .find(item => item.role === 'assistant')?.content ?? ''
      dispatch({ type: 'hydrate', id: session.id, messages: normalized, finalReply })
    } catch (error: unknown) {
      if (errorStatus(error) === 401) {
        dispatch({ type: 'remove', id: session.id })
        dispatch({ type: 'activate', id: previousActiveId })
        requestLoginForExpiredSession()
        return
      }
      dispatch({ type: 'error', id: session.id, reason: '历史记录加载失败，请稍后重试。' })
    }
  }, [journeyState.activeId, journeyState.sessions, requestLoginForExpiredSession])

  const exportPlan = useCallback(async (format: 'md' | 'pdf') => {
    setResultNotice(null)
    if (!activeSession.finalReply.trim()) {
      setResultNotice({ tone: 'error', message: '当前没有可导出的完整方案。' })
      return
    }

    if (format === 'md') {
      const blob = new Blob([activeSession.finalReply], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const city = activeSession.form.destination.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'trip-plan'
      link.href = url
      link.download = `${city}-travel-plan.md`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setResultNotice({ tone: 'success', message: 'Markdown 已下载到本地。' })
      return
    }

    if (!auth.token || !activeSession.conversationId) {
      window.print()
      setResultNotice({ tone: 'success', message: '已打开系统打印窗口，可选择“另存为 PDF”。' })
      return
    }

    try {
      const response = await fetch(
        `/api/export/${activeSession.conversationId}?format=${format}`,
        { headers: { Authorization: `Bearer ${auth.token}` } },
      )
      if (response.status === 401) {
        auth.setShowAuthModal(true)
        setResultNotice({ tone: 'error', message: '登录状态已过期，请重新登录后再导出 PDF。' })
        return
      }
      if (!response.ok) throw new Error('导出失败')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `trip-plan-${activeSession.conversationId}.${format}`
      link.click()
      URL.revokeObjectURL(url)
      setResultNotice({ tone: 'success', message: 'PDF 导出已开始。' })
    } catch {
      setResultNotice({ tone: 'error', message: '导出失败，请稍后重试；当前行程仍可继续查看。' })
    }
  }, [activeSession.conversationId, activeSession.finalReply, activeSession.form.destination, auth])

  const send = useCallback((rawText: string, formPatch: Partial<TripForm> = {}) => {
    const text = rawText.trim()
    if (!text || isStreaming) return

    const sessionId = activeSession.id
    const effectiveForm = { ...activeSession.form, ...formPatch }
    const destination = effectiveForm.destination.trim()
    const currentConversationId = activeSession.conversationId
    const nextTitle = activeSession.title === '未命名旅程'
      ? `${destination || '目的地'} · ${effectiveForm.days}天`
      : activeSession.title

    setInput('')
    streamingSessionIdRef.current = sessionId
    mapRef.current?.clearMarkers()
    if (Object.keys(formPatch).length > 0) {
      dispatch({ type: 'patchForm', id: sessionId, patch: formPatch })
    }
    dispatch({ type: 'patch', id: sessionId, patch: { title: nextTitle } })
    dispatch({ type: 'submit', id: sessionId, message: text })

    void startStream(text, currentConversationId, auth.token, {
      onEvent(event: NormalizedSSEEvent) {
        for (const action of eventToJourneyActions(event, sessionId)) dispatch(action)

        if (event.event === 'worker_think' && event.name) {
          dispatch({
            type: 'updateStep',
            id: sessionId,
            name: event.name,
            patch: { summary: `正在进行第 ${event.round ?? 1} 轮分析` },
          })
        }

        if (event.event === 'worker_tools' && event.name) {
          dispatch({
            type: 'updateStep',
            id: sessionId,
            name: event.name,
            patch: { summary: `正在调用 ${event.tools?.join('、') || '检索工具'}` },
          })
        }

        if (event.event === 'aggregating') {
          dispatch({ type: 'graphNode', id: sessionId, node: 'aggregator' })
        }

        if (event.event === 'step_done' && event.status !== 'failed' && activeIdRef.current === sessionId) {
          const worker = event.worker ?? ''
          const keyword = worker === 'flight' ? `${destination}机场`
            : worker === 'hotel' ? `${destination}酒店`
              : worker === 'attraction' ? `${destination}景点`
                : ''
          if (keyword) {
            mapRef.current?.searchAndMark(
              keyword,
              destination,
              event.name ?? keyword,
              getWorkerMeta(worker).markerColor,
            )
          }
        }

        if (event.event === 'done' && event.conversationId) {
          void refreshConversations()
        }

        if (event.event === 'done') {
          notify('success', event.conversationId ? '方案已生成，已保存到云端' : '方案已生成，已存为本地草稿')
        }
      },
      onError(error) {
        streamingSessionIdRef.current = null
        if (error.status === 401) requestLoginForExpiredSession()
        dispatch({ type: 'error', id: sessionId, reason: error.message })
      },
      onDone() {
        streamingSessionIdRef.current = null
      },
    })
  }, [activeSession, auth.token, isStreaming, refreshConversations, requestLoginForExpiredSession, startStream])

  const retry = useCallback(() => {
    const latestRequest = [...activeSession.messages]
      .reverse()
      .find(message => message.role === 'user')?.content
    send(latestRequest || fallbackBrief(activeSession.form))
  }, [activeSession.form, activeSession.messages, send])

  const editBrief = useCallback(() => {
    dispatch({
      type: 'patch',
      id: activeSession.id,
      patch: { phase: 'idle', graphNode: '', statusMessage: '' },
    })
    setInput('')
  }, [activeSession.id])

  const stop = useCallback(() => {
    const sessionId = streamingSessionIdRef.current
    stopStream()
    streamingSessionIdRef.current = null
    if (sessionId) {
      dispatch({ type: 'cancel', id: sessionId, reason: '已停止生成，当前完成的步骤仍然保留。' })
    }
  }, [stopStream])

  // 首页一句话 handoff：mount 时一次性消费并自动发起规划（读后即删，刷新/重挂载不重复）
  const handoffConsumedRef = useRef(false)
  useEffect(() => {
    if (handoffConsumedRef.current) return
    handoffConsumedRef.current = true
    const brief = consumePendingBrief()
    if (brief) send(brief)
  }, [send])

  // 离开规划页（路由切换卸载）时中止在途流，并把会话标记为已停止，
  // 避免回来时永远停在"规划中"；已完成的步骤照常保留
  useEffect(() => () => {
    const sessionId = streamingSessionIdRef.current
    streamingSessionIdRef.current = null
    if (sessionId) {
      dispatch({ type: 'cancel', id: sessionId, reason: '已离开规划页，生成已停止；已完成的步骤仍然保留。' })
    }
  }, [])

  const createNewJourney = useCallback(() => {
    dispatch({ type: 'add' })
    setInput('')
    setRailOpen(false)
    mapRef.current?.clearMarkers()
  }, [])

  const workspace = (
    <div className="atlas-workspace-frame">
      <header className="atlas-mobile-topbar">
        <button type="button" onClick={() => setRailOpen(true)} aria-label="打开旅程列表">
          <Menu size={19} aria-hidden="true" />
        </button>
        <span><Sparkles size={16} aria-hidden="true" /><strong>{activeSession.title}</strong></span>
        <div>
          <button type="button" onClick={() => setContextOpen(true)} aria-label="打开地图与执行详情">
            <MapIcon size={18} aria-hidden="true" />
          </button>
          <button type="button" onClick={theme.toggle} aria-label={theme.isDark ? '切换到浅色主题' : '切换到深色主题'}>
            {theme.isDark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </button>
          {!auth.isLoggedIn && (
            <button type="button" onClick={() => auth.setShowAuthModal(true)} aria-label="登录以保存旅程">
              <LogIn size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      <div className="atlas-workspace-scroll" ref={scrollRef}>
        <JourneyCommandStrip
          form={activeSession.form}
          phase={activeSession.phase}
          progress={progress}
          graphNode={activeSession.graphNode}
        />

        {activeSession.phase !== 'idle' && activeSession.messages.length > 0 && (
          activeSession.phase === 'ready' && !feedOpen ? (
            <button
              type="button"
              className="atlas-feed-toggle"
              aria-expanded={false}
              aria-controls="atlas-conversation-feed"
              onClick={() => setFeedOpen(true)}
            >
              <MessageSquareText size={14} aria-hidden="true" />
              对话过程 ({activeSession.messages.length})
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          ) : (
            <ConversationFeed messages={activeSession.messages} finalReply={activeSession.finalReply} />
          )
        )}

        {activeSession.phase === 'idle' && (
          <MissionBrief
            form={activeSession.form}
            onChange={patchForm}
            onSubmit={send}
            onUseSuggestion={suggestion => send(suggestion.prompt, suggestion.formPatch)}
            disabled={isStreaming}
          />
        )}

        {(activeSession.phase === 'planning'
          || activeSession.phase === 'error'
          || activeSession.phase === 'cancelled') && (
          <OrchestrationTimeline
            steps={activeSession.steps}
            graphNode={activeSession.graphNode}
            phase={activeSession.phase}
            statusMessage={activeSession.statusMessage}
            onRetry={retry}
            onEditBrief={editBrief}
          />
        )}

        {activeSession.phase === 'ready' && (
          <ItineraryWorkspace
            viewModel={viewModel}
            city={activeSession.form.destination}
            steps={activeSession.steps}
            locations={activeSession.locations}
            onSearchMap={(keyword, city) => {
              mapRef.current?.searchAndMark(keyword, city, keyword, getWorkerMeta('itinerary').markerColor)
              setContextOpen(true)
            }}
            onExport={format => void exportPlan(format)}
            notice={resultNotice}
            onOpenTrip={() => navigate(`/trip/${activeSession.id}`)}
            saveState={activeSession.conversationId ? 'cloud' : 'local'}
            onLogin={auth.isLoggedIn ? undefined : () => auth.setShowAuthModal(true)}
            route={`${activeSession.form.origin} → ${activeSession.form.destination}`}
            date={activeSession.form.date}
            people={activeSession.form.people}
          />
        )}
      </div>

      <footer className="atlas-workspace-footer">
        <Composer
          value={input}
          onChange={setInput}
          onSubmit={() => send(input)}
          onStop={stop}
          isStreaming={isStreaming}
          suggestions={activeSession.phase === 'ready' ? followupSuggestions : []}
        />
        <p>Atlas 只展示后端实际返回的价格、地点和运行指标；预订前请再次核验。</p>
      </footer>
    </div>
  )

  return (
    <AppShell
      rail={(
        <SessionRail
          sessions={journeyState.sessions}
          activeId={journeyState.activeId}
          conversations={conversations}
          historyLoading={historyLoading}
          isLoggedIn={auth.isLoggedIn}
          userName={auth.user?.username || '访客'}
          isDark={theme.isDark}
          onNewJourney={createNewJourney}
          onActivateSession={id => {
            dispatch({ type: 'activate', id })
            setRailOpen(false)
          }}
          onRemoveSession={id => dispatch({ type: 'remove', id })}
          onLoadConversation={conversation => void loadConversation(conversation)}
          onLogin={() => auth.setShowAuthModal(true)}
          onLogout={auth.logout}
          onToggleTheme={theme.toggle}
        />
      )}
      workspace={workspace}
      context={(
        <JourneyContextPanel
          form={activeSession.form}
          locations={activeSession.locations}
          steps={activeSession.steps}
          phase={activeSession.phase}
          progress={progress}
          onMapReady={apiInstance => { mapRef.current = apiInstance }}
        />
      )}
      railOpen={railOpen}
      contextOpen={contextOpen}
      onCloseRail={() => setRailOpen(false)}
      onCloseContext={() => setContextOpen(false)}
      onOpenContext={() => setContextOpen(true)}
    />
  )
}
