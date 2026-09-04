import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Map as MapIcon, X } from 'lucide-react'

interface AppShellProps {
  rail: ReactNode
  workspace: ReactNode
  context: ReactNode
  railOpen: boolean
  contextOpen: boolean
  onCloseRail: () => void
  onCloseContext: () => void
  /** R3：右栏收起时的边缘展开按钮（桌面） */
  onOpenContext?: () => void
}

const focusableSelector = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

// R3 主流程收敛：
// - 会话栏在所有断点都是左侧抽屉，默认收起（入口在顶栏「会话」按钮）
// - 右栏（地图+执行）桌面端随 contextOpen 展开为栏位、收起为边缘竖条；移动端保持右抽屉
export default function AppShell({
  rail,
  workspace,
  context,
  railOpen,
  contextOpen,
  onCloseRail,
  onCloseContext,
  onOpenContext,
}: AppShellProps) {
  const [isCompact, setIsCompact] = useState(
    () => window.matchMedia('(max-width: 1279px)').matches,
  )
  const railRef = useRef<HTMLElement>(null)
  const contextRef = useRef<HTMLElement>(null)
  const workspaceRef = useRef<HTMLElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1279px)')
    const update = () => setIsCompact(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  // 任意抽屉打开（会话栏 / 移动端右栏）都做焦点圈闭
  const drawerOpen = railOpen || (isCompact && contextOpen)
  const railHidden = !railOpen
  const contextCollapsed = !contextOpen

  useEffect(() => {
    if (!drawerOpen) return
    const panel = (isCompact && contextOpen) ? contextRef.current : railRef.current
    if (!panel) return

    const focusedBeforeOpen = document.activeElement
    if (focusedBeforeOpen instanceof HTMLElement && !panel.contains(focusedBeforeOpen)) {
      restoreFocusRef.current = focusedBeforeOpen
    }

    const focusables = () => Array.from(
      panel.querySelectorAll<HTMLElement>(focusableSelector),
    ).filter(element => !element.hasAttribute('disabled'))
    const focusTimer = window.setTimeout(() => focusables()[0]?.focus(), 0)
    const closeDrawer = (isCompact && contextOpen) ? onCloseContext : onCloseRail

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDrawer()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        panel.focus()
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
      const target = restoreFocusRef.current
      restoreFocusRef.current = null
      if (target?.isConnected) target.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 抽屉开合才需要重建圈闭
  }, [drawerOpen, isCompact && contextOpen])

  useEffect(() => {
    railRef.current?.toggleAttribute('inert', railHidden)
    contextRef.current?.toggleAttribute('inert', contextCollapsed)
    workspaceRef.current?.toggleAttribute('inert', drawerOpen)
  }, [contextCollapsed, drawerOpen, railHidden])

  return (
    <div className="atlas-shell">
      <button
        type="button"
        className={`atlas-scrim atlas-rail-scrim ${railOpen ? 'is-visible' : ''}`}
        aria-hidden="true"
        tabIndex={-1}
        onClick={onCloseRail}
      />
      <aside
        ref={railRef}
        className={`atlas-rail ${railOpen ? 'is-open' : ''}`}
        aria-label="旅程列表"
        aria-hidden={railHidden ? 'true' : undefined}
        aria-modal={railOpen ? 'true' : undefined}
        role={railOpen ? 'dialog' : undefined}
        tabIndex={-1}
      >
        <button type="button" className="atlas-drawer-close atlas-rail-close" onClick={onCloseRail} aria-label="关闭旅程列表">
          <X size={18} aria-hidden="true" />
        </button>
        {rail}
      </aside>

      <main ref={workspaceRef} className="atlas-workspace" id="journey-workspace">
        {workspace}
      </main>

      {!isCompact && contextCollapsed && (
        <button
          type="button"
          className="atlas-context-tab"
          onClick={onOpenContext}
          aria-label="展开地图与执行详情"
          disabled={!onOpenContext}
        >
          <MapIcon size={16} aria-hidden="true" />
          <span>地图 · 执行</span>
        </button>
      )}

      <button
        type="button"
        className={`atlas-scrim atlas-context-scrim ${isCompact && contextOpen ? 'is-visible' : ''}`}
        aria-hidden="true"
        tabIndex={-1}
        onClick={onCloseContext}
      />
      <aside
        ref={contextRef}
        className={`atlas-context ${contextOpen ? 'is-open' : ''} ${!isCompact && contextCollapsed ? 'is-collapsed' : ''}`}
        aria-label="地图与执行详情"
        aria-hidden={contextCollapsed ? 'true' : undefined}
        aria-modal={isCompact && contextOpen ? 'true' : undefined}
        role={isCompact && contextOpen ? 'dialog' : undefined}
        tabIndex={-1}
      >
        <button type="button" className="atlas-drawer-close atlas-context-close" onClick={onCloseContext} aria-label="关闭地图面板">
          <X size={18} aria-hidden="true" />
        </button>
        {context}
      </aside>
    </div>
  )
}
