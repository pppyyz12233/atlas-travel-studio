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
  deriveDestinationFromReply,
  eventToJourneyActions,
  getWorkerMeta,
  inferDestinationFromBrief,
  inferOriginFromBrief,
  journeyProgress,
  manualOrigin,
  originLabel,
  routeLabel,
} from '../features/journey'
import { FACTORY_FORM_DEFAULTS } from '../features/journey/model'
import type { OriginPlace } from '../features/journey/model'
import { buildRoutedLocations, findLocationKeyByText } from '../features/journey/mapRouting'
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
  const origin = originLabel(form)
  const destination = form.destination.trim() || '目的地'
  const head = origin ? `从${origin}去${destination}` : `去${destination}`
  return `${head}，${form.date}出发，${form.days}天，${form.people}人，人均预算${form.budget}元。请给出兼顾体验、节奏和预算的完整方案。`
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
  const [composerOpen, setComposerOpen] = useState(false)
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
  // 阶段4：地点派生（编号/分组），供时间轴 → 地图聚焦解析
  const routedLocations = useMemo(
    () => buildRoutedLocations(activeSession.locations, viewModel.days).routed,
    [activeSession.locations, viewModel.days],
  )

  // 时间轴条目 → 优先聚焦编号 marker，未命中回落 POI 搜索；同时确保地图面板打开
  const focusOrSearchMap = useCallback((itemText: string) => {
    setContextOpen(true)
    const key = findLocationKeyByText(routedLocations, itemText)
    if (key && mapRef.current?.focusLocation(key)) return true
    const destination = activeSession.form.destination.trim()
    mapRef.current?.searchAndMark(itemText.slice(0, 28), destination, itemText.slice(0, 12), getWorkerMeta('itinerary').markerColor)
    return true
  }, [routedLocations, activeSession.form.destination])

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
      setComposerOpen(false)
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
      // 恢复的历史会话不带默认"上海 → 东京"：目的地在 hydrate 后从方案本体派生
      form: { ...createJourneySession().form, origin: manualOrigin(''), destination: '' },
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
      const restoredDestination = deriveDestinationFromReply(finalReply)
      if (restoredDestination) {
        dispatch({ type: 'patchForm', id: session.id, patch: { destination: restoredDestination } })
      }
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

  // 导出进行中标记：下载期间禁用导出按钮，防止重复点击
  const [exportingFormat, setExportingFormat] = useState<'md' | 'pdf' | null>(null)

  const exportPlan = useCallback(async (format: 'md' | 'pdf') => {
    if (exportingFormat) return
    setResultNotice(null)
    if (!activeSession.finalReply.trim()) {
      setResultNotice({ tone: 'error', message: '当前没有可导出的完整方案。' })
      return
    }
    setExportingFormat(format)

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
      setExportingFormat(null)
      return
    }

    if (!auth.token || !activeSession.conversationId) {
      try {
        const response = await fetch('/api/export/guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destination: activeSession.form.destination, dates: activeSession.form.date, content: activeSession.finalReply }) })
        if (!response.ok) throw new Error('guest export failed')
        const url = URL.createObjectURL(await response.blob())
        const link = document.createElement('a')
        const stem = `${activeSession.form.destination.trim() || 'trip-plan'}-${activeSession.form.date || ''}`.replace(/[\\/:*?"<>|]+/g, '-').replace(/-+$/, '')
        link.href = url
        link.download = `${stem}-travel-plan.pdf`
        document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
        setResultNotice({ tone: 'success', message: 'PDF 已下载到本地。' })
      } catch { setResultNotice({ tone: 'error', message: 'PDF 导出失败，请稍后重试。' }) }
      setExportingFormat(null)
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
        setExportingFormat(null)
        return
      }
      if (!response.ok) throw new Error('导出失败')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `trip-plan-${activeSession.conversationId}.${format}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setResultNotice({ tone: 'success', message: 'PDF 导出已开始。' })
    } catch {
      setResultNotice({ tone: 'error', message: '导出失败，请稍后重试；当前行程仍可继续查看。' })
    } finally {
      setExportingFormat(null)
    }
  }, [exportingFormat, activeSession.conversationId, activeSession.finalReply, activeSession.form.destination, activeSession.form.date, auth])

  const send = useCallback((rawText: string, formPatch: Partial<TripForm> = {}) => {
    const text = rawText.trim()
    if (!text || isStreaming) return

    const sessionId = activeSession.id
    const effectiveForm = { ...activeSession.form, ...formPatch }
    // 表单未被用户手动改过时，工厂默认的"上海/东京"必须让位于任务文本：
    // 文本里有显式目的地/出发地就用它，没有就清空（显示"待定"），绝不静默沿用默认值。
    const textOrigin = inferOriginFromBrief(text)
    const textDestination = inferDestinationFromBrief(text)
    const formUntouched = !activeSession.formTouched
    const currentOriginLabel = originLabel(effectiveForm)
    const originOverride: OriginPlace | undefined = formPatch.origin
      ?? (formUntouched
        ? (textOrigin !== null
            ? manualOrigin(textOrigin)
            : (currentOriginLabel === FACTORY_FORM_DEFAULTS.origin ? manualOrigin('') : undefined))
        : undefined)
    const destinationOverride = formPatch.destination
      ?? (formUntouched
        ? (textDestination ?? (effectiveForm.destination.trim() === FACTORY_FORM_DEFAULTS.destination ? '' : undefined))
        : undefined)
    const destination = (destinationOverride ?? effectiveForm.destination).trim()
    const currentConversationId = activeSession.conversationId
    // 目的地未知时保留"未命名旅程"，done 后由方案本体回填（见 done 处理）
    const nextTitle = activeSession.title === '未命名旅程' && destination
      ? `${destination} · ${effectiveForm.days}天`
      : activeSession.title

    // 游客（无云端会话）的"继续调整"：后端拿不到上一版方案，
    // 把当前方案摘要随请求带上（只进后端 payload，对话航迹仍显示用户原话）
    const isGuestAdjustment = currentConversationId === null && activeSession.finalReply.trim().length > 0
    const backendMessage = isGuestAdjustment
      ? `${text}\n\n【上一版方案参考，请在此基础上修改】\n${activeSession.finalReply.slice(0, 1600)}`
      : text

    setInput('')
    streamingSessionIdRef.current = sessionId
    mapRef.current?.clearMarkers()
    if (Object.keys(formPatch).length > 0) {
      dispatch({ type: 'patchForm', id: sessionId, patch: formPatch })
    }
    if (originOverride !== undefined || destinationOverride !== undefined) {
      dispatch({
        type: 'patchForm',
        id: sessionId,
        patch: {
          ...(originOverride !== undefined ? { origin: originOverride } : {}),
          ...(destinationOverride !== undefined ? { destination: destinationOverride } : {}),
        },
      })
    }
    dispatch({ type: 'patch', id: sessionId, patch: { title: nextTitle } })
    dispatch({ type: 'submit', id: sessionId, message: text })

    void startStream(backendMessage, currentConversationId, auth.token, {
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

        if (event.event === 'done' && typeof event.reply === 'string') {
          // 目的地收敛：标题/摘要/地图城市/导出全部读 form.destination，
          // 它必须与本次方案（canonical 回复）一致——缺失则回填，冲突则显式提示，不静默覆盖。
          const replyDestination = deriveDestinationFromReply(event.reply)
          if (replyDestination) {
            if (!destination) {
              dispatch({ type: 'patchForm', id: sessionId, patch: { destination: replyDestination } })
              if (activeSession.title === '未命名旅程') {
                dispatch({ type: 'patch', id: sessionId, patch: { title: `${replyDestination} · 行程方案` } })
              }
            } else if (replyDestination !== destination) {
              notify('info', `智能体本次方案的目的地是「${replyDestination}」，与你填写的「${destination}」不一致，请确认后修改目的地或重新生成。`)
            }
          }
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

  // R7：阅读态隐藏工作区顶栏——完成态只剩一个阅读中心，
  // 会话切换交给「我的行程」页与全局顶栏
  const showWorkspaceTopbar = activeSession.phase !== 'ready'

  const workspace = (
    <div className={`atlas-workspace-frame ${showWorkspaceTopbar ? '' : 'is-reading'}`}>
      {showWorkspaceTopbar && (
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
      )}

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
            exportBusy={exportingFormat !== null}
            onOpenTrip={() => navigate(`/trip/${activeSession.id}`)}
            saveState={activeSession.conversationId ? 'cloud' : 'local'}
            onLogin={auth.isLoggedIn ? undefined : () => auth.setShowAuthModal(true)}
            route={routeLabel(activeSession.form)}
            date={activeSession.form.date}
            people={activeSession.form.people}
            onOpenMap={() => setContextOpen(true)}
            onFocusLocation={focusOrSearchMap}
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
          suggestions={activeSession.phase === 'ready' && composerOpen ? followupSuggestions : []}
          collapsed={activeSession.phase === 'ready' && !composerOpen && !isStreaming}
          onExpand={() => setComposerOpen(true)}
          autoFocusOnMount={activeSession.phase === 'ready' && composerOpen}
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
          days={viewModel.days}
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
