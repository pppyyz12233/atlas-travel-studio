import { useMemo } from 'react'
import { marked } from 'marked'

const blockedTags = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON',
  'TEXTAREA', 'SELECT', 'OPTION', 'LINK', 'META', 'SVG', 'MATH', 'IMG',
])

function isSafeUrl(value: string): boolean {
  const url = value.trim().toLowerCase()
  return url === '' || url.startsWith('/') || url.startsWith('#') ||
    url.startsWith('https://') || url.startsWith('http://') ||
    url.startsWith('mailto:') || url.startsWith('tel:')
}

export function sanitizeMarkdown(markdown: string): string {
  const raw = String(marked.parse(markdown, { breaks: true, gfm: true }))
  const doc = new DOMParser().parseFromString(raw, 'text/html')

  for (const element of Array.from(doc.body.querySelectorAll('*'))) {
    if (blockedTags.has(element.tagName)) {
      element.remove()
      continue
    }

    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on') || name === 'style' || name === 'srcdoc') {
        element.removeAttribute(attr.name)
        continue
      }
      if ((name === 'href' || name === 'src') && !isSafeUrl(attr.value)) {
        element.removeAttribute(attr.name)
      }
    }

    if (element.tagName === 'A') {
      element.setAttribute('rel', 'noopener noreferrer')
      element.setAttribute('target', '_blank')
    }
  }

  return doc.body.innerHTML
}

interface Props {
  content: string
  className?: string
}

export default function SafeMarkdown({ content, className = '' }: Props) {
  const html = useMemo(() => sanitizeMarkdown(content), [content])
  return <div className={`markdown-body ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}
