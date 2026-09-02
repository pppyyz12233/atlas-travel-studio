import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppShell from './AppShell'

const originalMatchMedia = window.matchMedia

function DrawerHarness() {
  const [railOpen, setRailOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setRailOpen(true)}>打开导航</button>
      <AppShell
        rail={<button type="button">旅程操作</button>}
        workspace={<div>工作区</div>}
        context={<button type="button">地图操作</button>}
        railOpen={railOpen}
        contextOpen={false}
        onCloseRail={() => setRailOpen(false)}
        onCloseContext={() => undefined}
      />
    </>
  )
}

describe('AppShell compact drawer focus', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('max-width: 1279px'),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }))
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('traps focus, closes on Escape and restores the opener', async () => {
    const user = userEvent.setup()
    render(<DrawerHarness />)
    const opener = screen.getByRole('button', { name: '打开导航' })

    await user.click(opener)
    const close = screen.getByRole('button', { name: '关闭旅程列表' })
    await waitFor(() => expect(close).toHaveFocus())
    expect(screen.getByRole('main')).toHaveAttribute('inert')

    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: '旅程操作' })).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(opener).toHaveFocus()
    expect(screen.getByRole('main')).not.toHaveAttribute('inert')
  })
})
