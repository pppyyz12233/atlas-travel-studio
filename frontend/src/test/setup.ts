import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

Element.prototype.scrollTo = () => undefined
Element.prototype.scrollIntoView = () => undefined

// jsdom 无 ResizeObserver：@remotion/player 等库假设其存在（空桩兜底，真渲染路径另有模块级 mock）
if (typeof window.ResizeObserver === 'undefined') {
  class ResizeObserverStub implements ResizeObserver {
    observe() { /* jsdom no-op */ }
    unobserve() { /* jsdom no-op */ }
    disconnect() { /* jsdom no-op */ }
  }
  Object.defineProperty(window, 'ResizeObserver', { writable: true, value: ResizeObserverStub })
}
