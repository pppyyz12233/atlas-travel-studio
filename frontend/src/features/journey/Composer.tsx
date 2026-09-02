import { CornerDownLeft, Send, Square } from 'lucide-react'
import { useRef } from 'react'

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
  isStreaming: boolean
  disabled: boolean
  suggestions: string[]
}

export default function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming,
  disabled,
  suggestions,
}: ComposerProps) {
  const composingRef = useRef(false)
  const canSubmit = Boolean(value.trim()) && !disabled && !isStreaming

  return (
    <div className="atlas-composer-wrap">
      {suggestions.length > 0 && !isStreaming && (
        <div className="atlas-followups" aria-label="快捷修改建议">
          {suggestions.map(suggestion => (
            <button type="button" key={suggestion} onClick={() => onChange(suggestion)}>{suggestion}</button>
          ))}
        </div>
      )}
      <div className="atlas-composer">
        <textarea
          aria-label="补充或修改旅行需求"
          placeholder="例如：第二天少安排一个景点，酒店靠近地铁站……"
          value={value}
          disabled={disabled}
          rows={1}
          onChange={event => onChange(event.target.value)}
          onCompositionStart={() => { composingRef.current = true }}
          onCompositionEnd={() => { composingRef.current = false }}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !composingRef.current && !event.nativeEvent.isComposing) {
              event.preventDefault()
              if (canSubmit) onSubmit()
            }
          }}
        />
        {isStreaming ? (
          <button type="button" className="atlas-stop-action" onClick={onStop} aria-label="停止生成">
            <Square size={14} fill="currentColor" aria-hidden="true" /> 停止
          </button>
        ) : (
          <button type="button" className="atlas-send-action" onClick={onSubmit} disabled={!canSubmit} aria-label="发送旅行要求">
            <Send size={17} aria-hidden="true" />
          </button>
        )}
      </div>
      <span className="atlas-composer-hint"><CornerDownLeft size={12} aria-hidden="true" /> Enter 发送 · Shift + Enter 换行</span>
    </div>
  )
}

