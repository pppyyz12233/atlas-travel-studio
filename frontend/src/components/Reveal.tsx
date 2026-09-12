import { createElement, useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode, Ref } from 'react'

// ============================================================
// 滚动渐显：进入视口一次触发 fade-up（stagger 用 delay 传毫秒）。
// IntersectionObserver 不可用（jsdom）或用户偏好减少动效时
// 直接加 is-in 立即显示——内容永不被隐藏，测试/无障碍安全。
// ============================================================

type RevealTag = 'div' | 'section' | 'aside' | 'li' | 'article'

interface RevealProps {
  as?: RevealTag
  children: ReactNode
  className?: string
  /** 错峰延迟（毫秒），用于列表/网格的依次进场 */
  delay?: number
  style?: CSSProperties
}

export default function Reveal({ as = 'div', children, className, delay = 0, style }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    if (typeof IntersectionObserver === 'undefined'
      || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      node.classList.add('is-in')
      return undefined
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        node.classList.add('is-in')
        observer.disconnect()
      }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const props = {
    ref: ref as Ref<HTMLElement>,
    className: ['reveal', className].filter(Boolean).join(' '),
    style: delay ? { ...style, transitionDelay: `${delay}ms` } : style,
  }
  return createElement(as, props as Record<string, unknown>, children)
}
