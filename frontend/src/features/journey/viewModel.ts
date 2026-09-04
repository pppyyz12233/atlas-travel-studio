export interface BudgetItem {
  category: string
  amount: number
}

export interface DayPlanItem {
  time: string
  description: string
}

export interface DayPlan {
  day: string
  title: string
  items: DayPlanItem[]
}

export interface ItineraryViewModel {
  budgetItems: BudgetItem[]
  budgetTotal: number
  days: DayPlan[]
  hasStructuredOverview: boolean
  markdown: string
  /** 方案正文中"交通"章节原文（无则空串）——只展示真实生成内容，不编造 */
  transportMarkdown: string
  /** 方案正文中"住宿/酒店"章节原文（无则空串） */
  lodgingMarkdown: string
  tripState?: TripState
}

function findSection(text: string, heading: string): string {
  const matcher = new RegExp(`^##\\s*[^\\n]*${heading}[^\\n]*$`, 'im')
  const match = matcher.exec(text)
  if (!match || match.index === undefined) return ''
  const start = match.index
  const rest = text.slice(start + match[0].length)
  const next = rest.search(/^##\s/m)
  return next === -1 ? text.slice(start) : text.slice(start, start + match[0].length + next)
}

export function parseBudget(markdown: string): { items: BudgetItem[]; total: number } {
  const source = findSection(markdown, '预算') || markdown
  const seen = new Set<string>()
  const items: BudgetItem[] = []
  let declaredTotal = 0

  const add = (category: string, amountText: string) => {
    const name = category.replace(/\*|`/g, '').trim()
    const amount = Number(amountText.replace(/,/g, ''))
    if (!Number.isFinite(amount) || amount < 1 || /航班号|航司|时段|地点|备注/.test(name)) return
    if (/总计|合计|总预算/.test(name)) {
      declaredTotal = Math.max(declaredTotal, amount)
      return
    }
    const key = `${name}:${amount}`
    if (!seen.has(key)) {
      seen.add(key)
      items.push({ category: name, amount })
    }
  }

  for (const match of source.matchAll(/\|\s*\*{0,2}([^|\d]+?)\*{0,2}\s*\|\s*[¥￥]\s*([\d,]+(?:\.\d+)?)\s*\|/g)) {
    add(match[1], match[2])
  }
  for (const match of source.matchAll(/(?:\*\*)?([^\n：:|]{1,12})(?:\*\*)?\s*[：:]\s*[¥￥]\s*([\d,]+(?:\.\d+)?)/g)) {
    add(match[1], match[2])
  }

  const sum = items.reduce((total, item) => total + item.amount, 0)
  return { items: items.slice(0, 8), total: declaredTotal || sum }
}

export function parseDays(markdown: string): DayPlan[] {
  const source = findSection(markdown, '日程') || markdown
  const lines = source.split('\n')
  const days: DayPlan[] = []
  let current: DayPlan | null = null

  for (const line of lines) {
    // 前缀放宽：除行首/空白外，允许 markdown 装饰符（#/粗体星号）紧贴 Day 标题——
    // 后端常见 "**Day1 城市地标**\n| 时段 | 地点 |…" 格式此前匹配不上，被误判为自由叙述。
    // 日序格式兼容：Day 1 / DAY 1 / Day1 / 第1天 / 第 1 天 / 第一天（/i 已覆盖大小写）。
    // 短格式 D1 只认行首/装饰符开头——句中 "乘 D1 路公交" 不构成新的一天。
    const dayMatch = line.match(/(?:^|\s|#|\*)(?:###?\s*)?\**\s*(?:Day\s*(\d+)|第\s*(\d+)\s*天|第\s*([一二三四五六七八九十]+)\s*天)/i)
      ?? line.match(/^(?:#|\*)*\s*D\s*(\d+)(?=\s|$|[：:，,（(])/i)
    if (dayMatch) {
      if (current?.items.length) days.push(current)
      const chineseDays = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
      const number = dayMatch[1] || dayMatch[2] || String(chineseDays.indexOf(dayMatch[3] || '') + 1)
      current = {
        day: `Day ${number}`,
        title: line.replace(/^#+\s*/, '').replace(/\*+/g, '').trim(),
        items: [],
      }
      continue
    }
    if (!current) continue

    const table = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|/)
    if (table) {
      const time = table[1].replace(/\*+/g, '').trim()
      const description = table[2].replace(/\*+/g, '').trim()
      if (!/时段|时间|---/.test(time) && description.length > 1) {
        current.items.push({ time, description })
      }
      continue
    }

    const clean = line
      .replace(/^\s*[-*+]\s+/, '')
      .replace(/^\s*\d+[.)]\s+/, '')
      .replace(/\*+/g, '')
      .trim()
    if (clean.length > 4 && !clean.startsWith('#') && !clean.startsWith('|')) {
      const split = clean.match(/^(\d{1,2}:\d{2})\s*[：:]\s*(.+)$/)
        ?? clean.match(/^([^：:]{1,12})[：:]\s*(.+)$/)
      current.items.push({ time: split?.[1] || '', description: split?.[2] || clean })
    }
  }
  if (current?.items.length) days.push(current)
  return days.slice(0, 14)
}

export function buildItineraryViewModel(markdown: string, tripState?: TripState): ItineraryViewModel {
  const budget = parseBudget(markdown)
  const days = parseDays(markdown)
  return {
    budgetItems: budget.items,
    budgetTotal: budget.total,
    days,
    hasStructuredOverview: budget.items.length > 0 || days.length > 0,
    markdown,
    transportMarkdown: findSection(markdown, '交通'),
    lodgingMarkdown: findSection(markdown, '住宿') || findSection(markdown, '酒店'),
    tripState,
  }
}
import type { TripState } from './model'
