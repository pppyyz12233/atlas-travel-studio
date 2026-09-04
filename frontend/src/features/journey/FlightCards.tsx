import { useMemo, useState } from 'react'
import { Plane, RefreshCw, ArrowUpRight } from 'lucide-react'

// ────────────────────────────────────────────────────────────
// 航班结果卡：把航班从执行日志/完整方案里独立出来，成为结果区一等公民。
// 数据来源两种（必须标注，不把模型输出伪装成实时接口数据）：
//  - worker：done 事件 trip_state.flights —— 执行智能体的结构化检索结果
//    →「查询结果，请以航空公司或平台最终价格为准」
//  - reply：从方案正文 Markdown 表格解析 —— 模型生成的建议
//    →「示例结果，非实时价格」
// ────────────────────────────────────────────────────────────

export interface FlightRow {
  name: string
  detail: string
  price: string
  date: string
}

export interface FlightQueryConditions {
  origin: string | null
  destination: string | null
  date: string | null
}

interface Props {
  flights: FlightRow[]
  conditions: FlightQueryConditions
  source: 'worker' | 'reply'
  queriedAt?: string
  onRequery?: () => void
  onAddToTrip?: () => void
}

function parsePrice(price: string): number {
  const match = price.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY
}

/** 从方案正文的「航班」章节 Markdown 表格解析航班行（模型建议来源） */
export function parseFlightsFromReply(markdown: string): FlightRow[] {
  const sectionStart = markdown.search(/^#{2,4}\s*[^\n]*航班/m)
  if (sectionStart === -1) return []
  const rest = markdown.slice(sectionStart)
  // 从第二行起找下一个标题（第一行是本节标题本身，slice(1) 会误匹配它）
  const bodyStart = rest.indexOf('\n')
  const afterBody = bodyStart === -1 ? '' : rest.slice(bodyStart)
  const nextHeading = afterBody.search(/^#{1,4}\s/m)
  const section = nextHeading === -1 ? rest : rest.slice(0, bodyStart + nextHeading)
  const rows: FlightRow[] = []
  for (const line of section.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue
    const cells = trimmed.slice(1, -1).split('|').map(cell => cell.replace(/\*+/g, '').trim())
    if (cells.every(cell => /^:?-{2,}:?$/.test(cell) || !cell)) continue
    if (/航班号|航司|出发/.test(cells[0])) continue // 表头
    const [flightNo, airline, times, price] = cells
    if (!flightNo) continue
    rows.push({
      name: [flightNo, airline].filter(Boolean).join(' · '),
      detail: times ?? '',
      price: price ?? '',
      date: '',
    })
  }
  return rows.slice(0, 8)
}

export default function FlightCards({ flights, conditions, source, queriedAt, onRequery, onAddToTrip }: Props) {
  const [sortBy, setSortBy] = useState<'price' | 'time'>('price')

  const sorted = useMemo(() => {
    const rows = [...flights]
    if (sortBy === 'price') rows.sort((a, b) => parsePrice(a.price) - parsePrice(b.price))
    else rows.sort((a, b) => (a.date || a.detail).localeCompare(b.date || b.detail))
    return rows
  }, [flights, sortBy])

  if (flights.length === 0) return null
  const route = `${conditions.origin ?? '出发地待定'} → ${conditions.destination ?? '目的地待定'}`

  return (
    <section className="atlas-flight-cards" aria-label="航班查询结果">
      <header className="atlas-flight-head">
        <h3><Plane size={15} aria-hidden="true" /> 航班结果</h3>
        <div className="atlas-flight-conds" role="status">
          <span className="atlas-flight-route">{route}</span>
          <span>{conditions.date ?? '日期待定'}</span>
          <span>查询时间 {queriedAt ?? new Date().toLocaleString('zh-CN', { hour12: false })}</span>
        </div>
        <small className="atlas-flight-source">
          {source === 'worker'
            ? '数据来源：执行智能体检索结果 · 查询结果，请以航空公司或平台最终价格为准'
            : '数据来源：方案正文（模型建议） · 示例结果，非实时价格'}
        </small>
      </header>

      <div className="atlas-flight-toolbar" role="group" aria-label="航班排序">
        <button
          type="button"
          className={`atlas-flight-sort ${sortBy === 'price' ? 'is-active' : ''}`}
          aria-pressed={sortBy === 'price'}
          onClick={() => setSortBy('price')}
        >
          按价格
        </button>
        <button
          type="button"
          className={`atlas-flight-sort ${sortBy === 'time' ? 'is-active' : ''}`}
          aria-pressed={sortBy === 'time'}
          onClick={() => setSortBy('time')}
        >
          按时间
        </button>
      </div>

      <ol className="atlas-flight-list">
        {sorted.map((flight, index) => (
          <li key={`${flight.name}-${index}`} className="atlas-flight-row">
            <strong className="atlas-flight-no">{flight.name || '航班待定'}</strong>
            <span className="atlas-flight-detail">{flight.detail || '时刻待定'}</span>
            <span className="atlas-flight-price">{flight.price || '价格待定'}</span>
          </li>
        ))}
      </ol>

      {(onRequery || onAddToTrip) && (
        <footer className="atlas-flight-actions">
          {onRequery && (
            <button type="button" className="mag-ghost-button" onClick={onRequery}>
              <RefreshCw size={14} aria-hidden="true" /> 重新查询
            </button>
          )}
          {onAddToTrip && (
            <button type="button" className="mag-ghost-button" onClick={onAddToTrip}>
              <ArrowUpRight size={14} aria-hidden="true" /> 加入行程
            </button>
          )}
        </footer>
      )}
    </section>
  )
}
