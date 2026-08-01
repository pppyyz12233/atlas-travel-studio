import { User, Bot } from 'lucide-react'

interface ChatBubbleProps {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

export default function ChatBubble({ role, content, isStreaming }: ChatBubbleProps) {
  const isUser = role === 'user'

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot size={16} className="text-white" />
        </div>
      )}

      <div
        className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? 'bg-[#0071e3] text-white rounded-br-md'
            : 'bg-[var(--card-bg)] border border-[var(--border)] rounded-bl-md shadow-sm'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{content}</div>
        {isStreaming && (
          <span className="inline-flex ml-0.5 animate-pulse-soft text-[#0071e3]">●</span>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-[var(--border)] flex items-center justify-center flex-shrink-0 mt-0.5">
          <User size={16} className="text-[var(--text-secondary)]" />
        </div>
      )}
    </div>
  )
}
