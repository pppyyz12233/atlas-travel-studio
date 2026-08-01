import { useState, useMemo } from 'react'
import { ChevronDown, MapPin, DollarSign, Calendar } from 'lucide-react'

/* ================================================================
   TripResult — React's killer feature for a travel planner

   Instead of dead markdown text, the AI response is parsed into
   interactive components. Each location is clickable → map focus.
   Budget items are extracted → visual breakdown.

   In vanilla HTML you'd need to querySelector every link, attach
   listeners, track state manually. React does it declaratively.
   ================================================================ */

interface Props {
  markdown: string
  onFocusLocation: (keyword: string) => void
  onSearchMap: (keyword: string, city: string) => void
  city: string
}

interface BudgetItem {
  category: string
  amount: number
  label: string
}

interface DayPlan {
  day: string
  title: string
  items: string[]
  locations: string[]
}

export default function TripResult({ markdown, onFocusLocation, onSearchMap, city }: Props) {
  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({})

  // Parse budget items from markdown
  const budgetItems = useMemo<BudgetItem[]>(() => {
    const items: BudgetItem[] = []
    const lines = markdown.split('\n')
    for (const line of lines) {
      // Match patterns like "机票：¥2000" or "酒店 800元" or "**机票** ¥2000"
      const m = line.match(/(?:[\*]*)?(机票|航班|酒店|住宿|景点|门票|餐饮|交通|预算|总计|合计|购物)(?:[\*\s:：]*)?[¥￥]?\s*(\d[\d,.]*)\s*(?:元|[¥￥])?/i)
      if (m) {
        const cat = m[1].replace(/\*/g, '')
        const amt = parseFloat(m[2].replace(/,/g, ''))
        if (amt > 0) {
          items.push({ category: cat, amount: amt, label: `${cat} ¥${amt.toLocaleString()}` })
        }
      }
    }
    // Also parse table rows with prices
    const tableRx = /\|\s*([^|]+?)\s*\|\s*[^|]*?[¥￥]?\s*(\d[\d,.]*)\s*(?:元|[¥￥])?[^|]*\|/g
    let tm
    while ((tm = tableRx.exec(markdown)) !== null) {
      const name = tm[1].replace(/\*/g, '').trim()
      const amt = parseFloat(tm[2].replace(/,/g, ''))
      if (amt > 0 && name.length < 30) {
        items.push({ category: name, amount: amt, label: `${name} ¥${amt.toLocaleString()}` })
      }
    }
    return items
  }, [markdown])

  const totalBudget = useMemo(() => budgetItems.reduce((s, i) => s + i.amount, 0), [budgetItems])

  // Parse day-by-day structure
  const dayPlans = useMemo<DayPlan[]>(() => {
    const plans: DayPlan[] = []
    const lines = markdown.split('\n')
    let current: DayPlan | null = null

    for (const line of lines) {
      // Match "Day 1" or "第1天" or "第一天"
      const dayRx = /(?:###?\s*)?(?:Day\s*(\d+)|第\s*(\d+)\s*天|第\s*([一二三四五六七八九十]+)\s*天)/i
      const dm = line.match(dayRx)
      if (dm) {
        if (current) plans.push(current)
        const dayNum = dm[1] || dm[2] || ['一','二','三','四','五','六','七','八','九','十'].indexOf(dm[3] || '') + 1
        current = { day: `第${dayNum}天`, title: line.replace(/^#+\s*/, '').trim(), items: [], locations: [] }
        continue
      }
      if (current) {
        // Extract location names (common Chinese city/place patterns)
        const locRx = /(?:去|到|在|参观|游览|入住|抵达)([^\s，。,\.]{2,10}(?:机场|酒店|寺|庙|山|公园|广场|街|路|塔|湖|海|博物馆|美术馆|乐园|温泉|市场|宫|门|塔|窟|瀑布|峡谷))?/g
        let lm
        while ((lm = locRx.exec(line)) !== null) {
          if (lm[1]) current.locations.push(lm[1])
        }
        const clean = line.replace(/^[-*\s\d.]+/, '').trim()
        if (clean.length > 2 && !clean.startsWith('#')) {
          current.items.push(clean)
        }
      }
    }
    if (current) plans.push(current)
    return plans
  }, [markdown])

  const toggleDay = (i: number) => setExpandedDays(p => ({ ...p, [i]: !p[i] }))

  // Category colors for budget
  const catColors: Record<string, string> = {
    '机票': '#ef4444', '航班': '#ef4444',
    '酒店': '#3b82f6', '住宿': '#3b82f6',
    '景点': '#10b981', '门票': '#10b981',
    '餐饮': '#f59e0b', '交通': '#8b5cf6',
    '购物': '#ec4899', '总计': '#6366f1', '合计': '#6366f1', '预算': '#6366f1',
  }

  const maxBudget = Math.max(...budgetItems.map(i => i.amount), 1)

  return (
    <div className="animate-in space-y-4">
      {/* ===== Budget Breakdown ===== */}
      {budgetItems.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--card)', boxShadow: 'var(--shadow)' }}>
          <div className="flex items-center gap-2 mb-3">
            <DollarSign size={15} className="text-[var(--teal)]" />
            <span className="text-[13px] font-semibold text-[var(--text)]">费用明细</span>
            {totalBudget > 0 && (
              <span className="ml-auto text-[13px] font-bold text-[var(--text)]">¥{totalBudget.toLocaleString()}</span>
            )}
          </div>
          <div className="space-y-2">
            {budgetItems.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text2)] w-12 flex-shrink-0">{item.category}</span>
                <div className="flex-1 h-6 rounded-md bg-[var(--surface)] overflow-hidden relative">
                  <div
                    className="h-full rounded-md transition-all duration-700 animate-in flex items-center justify-end pr-2"
                    style={{
                      width: `${Math.max((item.amount / maxBudget) * 100, 8)}%`,
                      background: `linear-gradient(90deg, ${catColors[item.category] || '#6366f1'}, ${(catColors[item.category] || '#6366f1')}88)`,
                    }}
                  />
                </div>
                <span className="text-[11px] font-semibold text-[var(--text)] w-20 text-right flex-shrink-0">¥{item.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== Day-by-Day Timeline ===== */}
      {dayPlans.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--card)', boxShadow: 'var(--shadow)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={15} className="text-[var(--blue)]" />
            <span className="text-[13px] font-semibold text-[var(--text)]">行程概览</span>
          </div>
          <div className="space-y-1.5">
            {dayPlans.map((day, i) => (
              <div key={i} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--line)' }}>
                <button
                  onClick={() => toggleDay(i)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-[var(--surface)] transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, #2563eb, #0891b2)' }}>{i + 1}</span>
                    <span className="text-[12px] font-semibold text-[var(--text)]">{day.title}</span>
                    <span className="text-[10px] text-[var(--text3)]">{day.items.length} 项</span>
                  </div>
                  <ChevronDown size={14} className={`text-[var(--text3)] transition-transform ${expandedDays[i] ? 'rotate-180' : ''}`} />
                </button>
                {expandedDays[i] && (
                  <div className="px-4 pb-3 pt-1 space-y-1.5 border-t border-[var(--line)]">
                    {day.items.map((item, j) => (
                      <div key={j} className="flex items-start gap-2 text-[12px] text-[var(--text2)] group">
                        <span className="mt-1 w-1 h-1 rounded-full flex-shrink-0 bg-[var(--text3)]" />
                        <span className="flex-1">{item}</span>
                        {/* Clickable location links */}
                        {day.locations.length > 0 && j < day.locations.length && (
                          <button
                            onClick={() => onSearchMap(day.locations[j], city)}
                            className="flex-shrink-0 text-[10px] text-[var(--blue)] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 px-1.5 py-0.5 rounded-md hover:bg-[var(--blue)]/8"
                            title="在地图上查看"
                          >
                            <MapPin size={10} /> 地图
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== Full Markdown (expandable) ===== */}
      <details className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', boxShadow: 'var(--shadow)' }}>
        <summary className="px-4 py-2.5 text-[11px] text-[var(--text3)] cursor-pointer hover:text-[var(--text2)] transition-colors select-none">
          查看完整方案
        </summary>
        <div className="px-4 pb-4 markdown-body" dangerouslySetInnerHTML={{ __html: markdown }} />
      </details>
    </div>
  )
}
