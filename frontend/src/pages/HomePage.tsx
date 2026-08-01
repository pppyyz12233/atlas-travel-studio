import { useNavigate } from 'react-router-dom'
import { Plane, MessageSquare, Sparkles, ArrowRight } from 'lucide-react'

export default function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-12 text-center">
      {/* Logo */}
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#0071e3] to-[#5e5ce6] flex items-center justify-center mb-6 shadow-lg shadow-blue-500/20 animate-slide-up">
        <Plane size={36} className="text-white -rotate-12" />
      </div>

      {/* 标题 */}
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight animate-fade-in">
        智能旅行规划师
      </h1>
      <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-sm animate-fade-in">
        AI 驱动的旅行助手，一句话搞定航班、酒店、景点、日程和预算
      </p>

      {/* 快捷入口 */}
      <div className="mt-10 grid gap-3 w-full max-w-sm animate-slide-up">
        <button
          onClick={() => navigate('/ai')}
          className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-200 active:scale-[0.98]"
        >
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Sparkles size={20} />
          </div>
          <div className="text-left flex-1">
            <div className="font-semibold text-sm">AI 定制行程</div>
            <div className="text-xs text-white/70">输入目的地和日期，AI 帮你规划一切</div>
          </div>
          <ArrowRight size={18} className="text-white/70" />
        </button>

        <button
          onClick={() => navigate('/history')}
          className="flex items-center gap-4 p-4 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98]"
        >
          <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center">
            <MessageSquare size={20} className="text-[#ff9500]" />
          </div>
          <div className="text-left flex-1">
            <div className="font-semibold text-sm">历史行程</div>
            <div className="text-xs text-[var(--text-secondary)]">查看和导出已保存的旅行方案</div>
          </div>
          <ArrowRight size={18} className="text-[var(--text-tertiary)]" />
        </button>
      </div>

      {/* 特性 */}
      <div className="mt-12 grid grid-cols-3 gap-4 w-full max-w-sm text-xs text-[var(--text-secondary)] animate-fade-in">
        {[
          { emoji: '✈️', label: '航班搜索' },
          { emoji: '🏨', label: '酒店推荐' },
          { emoji: '🎯', label: '景点攻略' },
          { emoji: '📅', label: '日程规划' },
          { emoji: '💰', label: '预算管理' },
          { emoji: '🗺️', label: '地图打点' },
        ].map(({ emoji, label }) => (
          <div key={label} className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[var(--card-bg)] border border-[var(--border)]">
            <span className="text-xl">{emoji}</span>
            <span className="text-[10px]">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
