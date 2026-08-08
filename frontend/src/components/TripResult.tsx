import { useState, useMemo } from 'react'
import { ChevronDown, MapPin } from 'lucide-react'

import { marked } from 'marked'

interface Props {
  markdown: string
  onSearchMap: (keyword: string, city: string) => void
  city: string
}

interface BudgetItem { category: string; amount: number; label: string }

interface DayPlan { day: string; title: string; items: string[]; locations: string[] }

const catColors: Record<string, string> = {
  '机票': '#ef4444', '航班': '#ef4444', '酒店': '#3b82f6', '住宿': '#3b82f6',
  '门票': '#10b981', '景点': '#10b981', '餐饮': '#f59e0b', '交通': '#8b5cf6',
  '购物': '#ec4899', '其他': '#6366f1', '总计': '#f59e0b', '合计': '#f59e0b',
}

/** 截取两个 ## 标题之间的内容 */
function section(text: string, heading: string): string {
  const idx = text.search(new RegExp(`##\\s*💰?\\s*${heading}`, 'i'))
  if (idx === -1) return ''
  const rest = text.slice(idx)
  const end = rest.slice(3).search(/\n##\s/) // 找下一个 ##（跳过当前）
  return end === -1 ? rest : rest.slice(0, end + 3)
}

export default function TripResult({ markdown, onSearchMap, city }: Props) {
  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({})

  /* ---- Budget ---- */
  const budgetItems = useMemo<BudgetItem[]>(() => {
    const sec = section(markdown, '预算')
    if (!sec) return []

    const items: BudgetItem[] = []
    const seen = new Set<string>()

    // Table: | 机票 | ¥5,200 |
    for (const m of sec.matchAll(/\|\s*\*{0,2}([^|\d]+?)\*{0,2}\s*\|\s*[¥￥]\s*([\d,]+)\s*\|/g)) {
      const name = m[1].trim()
      const amt = parseInt(m[2].replace(/,/g, ''), 10)
      const key = name + String(amt)
      if (amt >= 10 && !seen.has(key) && !/航班号|航司|出发|到达|时段|地点|交通方式|备注/.test(name)) {
        seen.add(key)
        items.push({ category: name, amount: amt, label: `${name} ¥${amt.toLocaleString()}` })
      }
    }

    // Lines: **机票**：¥5,200
    for (const m of sec.matchAll(/(?:\*\*)?(机票|航班|酒店|住宿|景点|门票|餐饮|交通|购物|其他|总计|合计)(?:\*\*)?(?:\s*[：:]\s*[¥￥]\s*([\d,]+))/gi)) {
      const cat = m[1]; const amt = parseInt(m[2].replace(/,/g, ''), 10)
      const key = cat + String(amt)
      if (amt >= 10 && !seen.has(key)) { seen.add(key); items.push({ category: cat, amount: amt, label: `${cat} ¥${amt.toLocaleString()}` }) }
    }

    return items
  }, [markdown])

  const totalBudget = useMemo(() => budgetItems.reduce((s, i) => s + i.amount, 0), [budgetItems])
  const maxBudget = Math.max(...budgetItems.map(i => i.amount), 1)

  /* ---- Day plans — bounded to 日程 section ---- */
  const dayPlans = useMemo<DayPlan[]>(() => {
    const sec = section(markdown, '日程')
    if (!sec) return []

    const plans: DayPlan[] = []
    const lines = sec.split('\n')
    let cur: DayPlan | null = null

    for (const line of lines) {
      const dm = line.match(/(?:###?\s*)?(?:Day\s*(\d+)|第\s*(\d+)\s*天|第\s*([一二三四五六七八九十]+)\s*天)/i)
      if (dm) {
        if (cur && cur.items.length > 0) plans.push(cur)
        const n = dm[1] || dm[2] || String(['一','二','三','四','五','六','七','八','九','十'].indexOf(dm[3] || '') + 1)
        cur = { day: `第${n}天`, title: line.replace(/^#+\s*/, '').trim(), items: [], locations: [] }
        continue
      }
      if (!cur) continue

      // Table row: | 上午 | 浅草寺 | 步行 |
      const tr = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|/)
      if (tr) {
        const time = tr[1].trim()
        const desc = tr[2].replace(/\*\*/g, '').trim()
        // Skip header rows
        if (!/时段|安排|----/.test(time) && desc.length > 1) {
          cur.items.push(`${time}: ${desc}`)
        }
        continue
      }

      // Plain line
      const clean = line.replace(/^[-*\s\d.]+/, '').trim()
      if (clean.length > 4 && !clean.startsWith('#') && !clean.startsWith('|')) {
        cur.items.push(clean)
      }
    }
    if (cur && cur.items.length > 0) plans.push(cur)
    return plans
  }, [markdown])

  return (
    <div className="space-y-4 animate-in">
      {/* Budget */}
      {budgetItems.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--card)', boxShadow: 'var(--shadow)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[13px] font-semibold text-[var(--text)]">费用明细</span>
            {totalBudget > 0 && <span className="ml-auto text-[13px] font-bold text-[var(--text)]">¥{totalBudget.toLocaleString()}</span>}
          </div>
          <div className="space-y-2">
            {budgetItems.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text2)] w-14 flex-shrink-0 truncate">{item.category}</span>
                <div className="flex-1 h-5 rounded-md bg-[var(--surface)] overflow-hidden">
                  <div className="h-full rounded-md transition-all duration-700 flex items-center justify-end pr-2 text-[10px] text-white font-medium"
                    style={{ width: `${Math.max((item.amount / maxBudget) * 100, 10)}%`, background: catColors[item.category] || '#6366f1' }} />
                </div>
                <span className="text-[11px] font-semibold text-[var(--text)] w-18 text-right flex-shrink-0">¥{item.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Day plans */}
      {dayPlans.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: 'var(--card)', boxShadow: 'var(--shadow)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[13px] font-semibold text-[var(--text)]">行程概览</span>
            <span className="text-[10px] text-[var(--text3)]">{dayPlans.length} 天</span>
          </div>
          <div className="space-y-1.5">
            {dayPlans.map((day, i) => (
              <div key={i} className="rounded-xl overflow-hidden border border-[var(--line)]">
                <button onClick={() => setExpandedDays(p => ({ ...p, [i]: !p[i] }))}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-[var(--surface)] transition-colors">
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, #2563eb, #0891b2)' }}>{i + 1}</span>
                    <span className="text-[12px] font-semibold text-[var(--text)] truncate max-w-[200px]">{day.title}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[var(--text3)]">{day.items.length}</span>
                    <ChevronDown size={14} className={`text-[var(--text3)] transition-transform ${expandedDays[i] ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {expandedDays[i] && (
                  <div className="px-4 pb-3 pt-1 space-y-1 border-t border-[var(--line)]">
                    {day.items.map((item, j) => {
                      const isTableRow = item.includes(': ')
                      const [time, desc] = isTableRow ? [item.split(': ')[0], item.split(': ').slice(1).join(': ')] : ['', item]
                      return (
                        <div key={j} className="flex items-start gap-2 text-[12px] text-[var(--text2)] group">
                          <span className="mt-1 w-1 h-1 rounded-full flex-shrink-0 bg-[var(--text3)]" />
                          <span className="flex-1">
                            {isTableRow && <span className="font-medium text-[var(--text)] mr-2">{time}</span>}
                            {desc}
                          </span>
                          <button onClick={() => onSearchMap(desc.slice(0, 20), city)}
                            className="flex-shrink-0 text-[10px] text-[var(--blue)] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-[var(--blue)]/8"
                            title="在地图上搜索">
                            <MapPin size={10} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full markdown — FIXED: actually render markdown, not raw text */}
      <details className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', boxShadow: 'var(--shadow)' }}>
        <summary className="px-4 py-2.5 text-[11px] text-[var(--text3)] cursor-pointer hover:text-[var(--text2)] transition-colors select-none">
          查看完整方案
        </summary>
        <div className="px-4 pb-4 markdown-body" dangerouslySetInnerHTML={{ __html: marked.parse(markdown) }} />
      </details>
    </div>
  )
}
