import { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import type { ReactNode } from 'react'
import {
  activeJourneySession,
  journeyReducer,
  loadInitialJourneyState,
  saveJourneyState,
} from '../features/journey'
import type { JourneyAction, JourneySession, JourneyState } from '../features/journey'

// 会话状态提升到 App 级：首页(最近行程)、规划页(工作台)、详情页(读方案)、
// 我的行程页(草稿列表)共享同一个 reducer 状态
interface JourneyValue {
  state: JourneyState
  dispatch: (action: JourneyAction) => void
  activeSession: JourneySession
}

const JourneyContext = createContext<JourneyValue | null>(null)

export function JourneyProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(journeyReducer, undefined, loadInitialJourneyState)

  useEffect(() => {
    saveJourneyState(state)
  }, [state])

  const value = useMemo(() => ({
    state,
    dispatch,
    activeSession: activeJourneySession(state),
  }), [state])

  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>
}

export function useJourney(): JourneyValue {
  const value = useContext(JourneyContext)
  if (!value) throw new Error('useJourney 必须在 JourneyProvider 内使用')
  return value
}
