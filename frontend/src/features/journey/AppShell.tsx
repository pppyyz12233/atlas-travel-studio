import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface AppShellProps {
  rail: ReactNode
  workspace: ReactNode
  context: ReactNode
  railOpen: boolean
  contextOpen: boolean
  onCloseRail: () => void
  onCloseContext: () => void
}

const focusableSelector = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export default function AppShell({
  rail,
  workspace,
  context,
  railOpen,
  contextOpen,
  onCloseRail,
  onCloseContext,
}: AppShellProps) {
  const [isCompact, setIsCompact] = useState(
    () => window.matchMedia('(max-width: 1279px)').matches,
  )
  const railRef = useRef<HTMLElement>(null)
  const contextRef = useRef<HTMLElement>(null)
  const workspaceRef = useRef<HTMLElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const drawerOpen = isCompact && (railOpen || contextOpen)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1279px)')
    const update = () => setIsCompact(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!drawerOpen) return
    const panel = contextOpen ? contextRef.current : railRef.current
    if (!panel) return

    const focusedBeforeOpen = document.activeElement
    if (focusedBeforeOpen instanceof HTMLElement && !panel.contains(focusedBeforeOpen)) {
      restoreFocusRef.current = focusedBeforeOpen
    }

    const focusables = () => Array.from(
      panel.querySelectorAll<HTMLElement>(focusableSelector),
    ).filter(element => !element.hasAttribute('disabled'))
    const focusTimer = window.setTimeout(() => focusables()[0]?.focus(), 0)
    const closeDrawer = contextOpen ? onCloseContext : onCloseRail

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
  }, [drawerOpen])

  const railHidden = isCompact && !railOpen
  const contextHidden = isCompact && !contextOpen

  useEffect(() => {
    railRef.current?.toggleAttribute('inert', railHidden)
    contextRef.current?.toggleAttribute('inert', contextHidden)
    workspaceRef.current?.toggleAttribute('inert', drawerOpen)
  }, [contextHidden, drawerOpen, railHidden])

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
        aria-modal={isCompact && railOpen ? 'true' : undefined}
        role={isCompact ? 'dialog' : undefined}
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

      <button
        type="button"
        className={`atlas-scrim atlas-context-scrim ${contextOpen ? 'is-visible' : ''}`}
        aria-hidden="true"
        tabIndex={-1}
        onClick={onCloseContext}
      />
      <aside
        ref={contextRef}
        className={`atlas-context ${contextOpen ? 'is-open' : ''}`}
        aria-label="地图与执行详情"
        aria-hidden={contextHidden ? 'true' : undefined}
        aria-modal={isCompact && contextOpen ? 'true' : undefined}
        role={isCompact ? 'dialog' : undefined}
        tabIndex={-1}
      >
        <button type="button" className="atlas-drawer-close atlas-context-close" onClick={onCloseContext} aria-label="关闭地图与执行详情">
          <X size={18} aria-hidden="true" />
        </button>
        {context}
      </aside>
    </div>
  )
}
