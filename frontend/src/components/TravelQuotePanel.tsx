import { useEffect, useMemo, useRef, useState } from 'react'

// 引语来源标注规则：可验证出处的保留作者+作品；无法核验的一律标注
// 「Atlas 编辑部原创」——不伪造作者与出处。
const quotes = [
  { text: '世界是一本书，不旅行的人只读了一页。', author: '奥古斯丁', source: '《忏悔录》（常见转引）' },
  { text: '旅行是对偏见、盲从和狭隘思想最有效的疗法。', author: '马克·吐温', source: '《傻瓜威尔逊》（常见转引）' },
  { text: '不要只是为了抵达而旅行，要让沿途也成为目的地。', author: 'Atlas 编辑部', source: '原创文案' },
]

const QUOTE_INTERVAL = 90_000

export default function TravelQuotePanel() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * quotes.length))
  const [paused, setPaused] = useState(false)
  const timer = useRef<number | null>(null)
  const quote = useMemo(() => quotes[index], [index])

  useEffect(() => {
    if (paused) return
    // 动效减弱偏好：不自动轮换，只在用户悬停/聚焦交互外保持静态
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    timer.current = window.setInterval(() => setIndex(current => (current + 1) % quotes.length), QUOTE_INTERVAL)
    return () => { if (timer.current !== null) window.clearInterval(timer.current) }
  }, [paused])

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return (
    <section className="travel-quote-panel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} aria-label="旅行名言">
      <span className="mag-kicker">A note for the journey</span>
      <blockquote key={index} className="travel-quote-panel__quote">“{quote.text}”</blockquote>
      <p className="travel-quote-panel__author">— {quote.author}<span>{quote.source}</span></p>
      <p className="travel-quote-panel__hint">每隔一段时间，换一个出发的理由</p>
    </section>
  )
}
