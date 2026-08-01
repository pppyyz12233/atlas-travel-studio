import { useEffect, useRef } from 'react'
import { marked } from 'marked'

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true,
})

interface MarkdownViewProps {
  content: string
}

export default function MarkdownView({ content }: MarkdownViewProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = marked.parse(content) as string
    }
  }, [content])

  return (
    <div
      ref={ref}
      className="markdown-body text-sm leading-relaxed animate-fade-in"
    />
  )
}
