import { MessageSquareText, Sparkles, UserRound } from 'lucide-react'
import SafeMarkdown from '../../components/SafeMarkdown'
import type { JourneyMessage } from './model'

interface ConversationFeedProps {
  messages: JourneyMessage[]
  finalReply: string
}

export default function ConversationFeed({ messages, finalReply }: ConversationFeedProps) {
  if (messages.length === 0) return null
  const latestExpandedIndex = [...messages]
    .map((message, index) => ({ message, index }))
    .reverse()
    .find(({ message }) => message.role === 'assistant' && message.content === finalReply)?.index

  return (
    <section className="atlas-conversation-feed" aria-label="对话记录">
      <header>
        <span><MessageSquareText size={15} aria-hidden="true" /> 对话航迹</span>
        <small>{messages.length} 条消息</small>
      </header>
      <div className="atlas-conversation-list">
        {messages.map((message, index) => {
          const isLatestExpanded = index === latestExpandedIndex
          return (
            <article className={`atlas-conversation-message is-${message.role}`} key={`${message.role}-${index}-${message.content.slice(0, 24)}`}>
              <span className="atlas-conversation-avatar" aria-hidden="true">
                {message.role === 'user' ? <UserRound size={15} /> : <Sparkles size={15} />}
              </span>
              <div>
                <small>{message.role === 'user' ? '你的任务' : 'Atlas 回复'}</small>
                {isLatestExpanded ? (
                  <p className="atlas-conversation-latest">最新版方案已在下方工作区展开。</p>
                ) : message.role === 'assistant' ? (
                  <SafeMarkdown content={message.content} />
                ) : (
                  <p>{message.content}</p>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
