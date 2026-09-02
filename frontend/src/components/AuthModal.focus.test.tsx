import { createPortal } from 'react-dom'
import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AuthModal from './AuthModal'

function ModalHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>打开登录</button>
      {open && createPortal(
        <AuthModal
          onClose={() => setOpen(false)}
          onLogin={vi.fn().mockResolvedValue(null)}
          onLoginByPhone={vi.fn().mockResolvedValue(null)}
          onRegister={vi.fn().mockResolvedValue(null)}
        />,
        document.body,
      )}
    </>
  )
}

describe('AuthModal focus management', () => {
  afterEach(() => {
    document.getElementById('root')?.remove()
  })

  it('focuses the identity field, traps Tab, closes on Escape and restores focus', async () => {
    const user = userEvent.setup()
    render(<ModalHarness />)
    const opener = screen.getByRole('button', { name: '打开登录' })

    await user.click(opener)
    const email = screen.getByRole('textbox', { name: '邮箱地址' })
    await waitFor(() => expect(email).toHaveFocus())

    const close = screen.getByRole('button', { name: '关闭' })
    close.focus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: '创建账号' })).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('makes the application root inert while the modal is mounted', () => {
    const appRoot = document.createElement('div')
    appRoot.id = 'root'
    document.body.appendChild(appRoot)

    const { unmount } = render(
      <AuthModal
        onClose={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(null)}
        onLoginByPhone={vi.fn().mockResolvedValue(null)}
        onRegister={vi.fn().mockResolvedValue(null)}
      />,
    )

    expect(appRoot).toHaveAttribute('inert')
    expect(appRoot).toHaveAttribute('aria-hidden', 'true')
    unmount()
    expect(appRoot).not.toHaveAttribute('inert')
    expect(appRoot).not.toHaveAttribute('aria-hidden')
  })
})
