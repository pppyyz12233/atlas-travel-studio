import SafeMarkdown from '../../components/SafeMarkdown'
import { getTransportGuide } from '../../content/transportGuides'
import { parseHotelRows, splitLodgingProse } from './viewModel'
import type { HotelRow } from './viewModel'

// ────────────────────────────────────────────────────────────
// 落地与住下：到达交通 + 住在哪里 + 编辑部补充（默认折叠）的连续模块。
// 取代此前"交通/住宿"两张等高并列大卡片（短内容被拉高、左侧大片空白）。
//
// 数据来源规则（视觉弱化成一行小字，不再是大徽章）：
//  - 到达交通：优先本次方案正文的"交通"章节（本次行程生成）；
//    没有则显示目的地编辑部指南（静态策展，非实时）；
//    两者皆无（目的地未知）时一行诚实提示。
//  - 住在哪里：住宿章节的 Markdown 表格 → 紧凑酒店列表（只有真实字段）；
//    无表格但有散文建议 → 显示散文；全无 → 紧凑提示。
//    绝不渲染 "—"/0 元/0 分占位，绝不编造酒店。
//  - 编辑部补充建议：默认折叠 details；交通已显示编辑部指南时不再重复。
// ────────────────────────────────────────────────────────────

interface Props {
  transportMarkdown: string
  lodgingMarkdown: string
  city: string
  /** 规划页 h3 / 详情页 h2 */
  headingLevel?: 'h2' | 'h3'
}

function HotelCompactList({ rows }: { rows: HotelRow[] }) {
  return (
    <ul className="arrive-hotel-list">
      {rows.map(row => (
        <li key={row.name} className="arrive-hotel-row">
          <strong className="arrive-hotel-name">{row.name}</strong>
          {row.area && <span className="arrive-hotel-area">{row.area}</span>}
          <span className="arrive-hotel-facts">
            {row.price && <em className="arrive-hotel-price">{row.price}</em>}
            {row.rating && <em className="arrive-hotel-rating">{row.rating} 分</em>}
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function ArriveStay({ transportMarkdown, lodgingMarkdown, city, headingLevel = 'h3' }: Props) {
  const Heading = headingLevel
  const hasTripTransport = transportMarkdown.trim().length > 0
  const guide = getTransportGuide(city)
  const hotelRows = parseHotelRows(lodgingMarkdown)
  const { prose: lodgingProse } = splitLodgingProse(lodgingMarkdown)
  const hasLodging = hotelRows.length > 0 || lodgingProse.length > 0
  const cityKnown = city.trim().length > 0

  return (
    <section className="arrive-stay" aria-label="落地与住下">
      <Heading>落地与住下</Heading>
      <div className="arrive-stay-flow">
        <div className="arrive-block">
          <h4 className="arrive-block-title">到达交通</h4>
          {hasTripTransport ? (
            <>
              <div className="arrive-content">
                <SafeMarkdown content={transportMarkdown} />
              </div>
              <p className="arrive-source">来源：本次行程生成内容 · 非实时，以现场公示为准</p>
            </>
          ) : cityKnown ? (
            <>
              <div className="arrive-content arrive-content--guide">
                <p className="arrive-guide-summary">{guide.summary}</p>
                <ul className="arrive-guide-tips">
                  {guide.tips.map(tip => <li key={tip.slice(0, 24)}>{tip}</li>)}
                </ul>
              </div>
              <p className="arrive-source">来源：Atlas 编辑部指南 · {guide.disclaimer}</p>
            </>
          ) : (
            <p className="arrive-empty">本次方案未生成具体到达交通，可继续追问：如何到达、机场进城或市内怎么坐车。</p>
          )}
        </div>

        <div className="arrive-block">
          <h4 className="arrive-block-title">住在哪里</h4>
          {hotelRows.length > 0 ? (
            <>
              <HotelCompactList rows={hotelRows} />
              <p className="arrive-source">来源：本次行程生成内容 · 非实时，预订前以平台信息为准</p>
            </>
          ) : lodgingProse ? (
            <>
              <p className="arrive-content arrive-content--prose">{lodgingProse}</p>
              <p className="arrive-source">来源：本次行程生成内容 · 非实时</p>
            </>
          ) : (
            <p className="arrive-empty">本次方案未返回酒店结果，可继续追问住宿区域或预算。</p>
          )}
        </div>
      </div>

      <details className="arrive-editorial">
        <summary>编辑部补充建议</summary>
        <div className="arrive-editorial-body">
          {hasTripTransport && (
            <>
              <p className="arrive-editorial-sub">目的地通用交通</p>
              <ul>
                {guide.tips.map(tip => <li key={tip.slice(0, 24)}>{tip}</li>)}
              </ul>
            </>
          )}
          <p className="arrive-editorial-sub">选住宿的判断方法</p>
          <ul>
            <li>优先轨道站步行 500 米内、换乘线路多的区域，多日行程能显著省时。</li>
            <li>连续多晚同一家比每晚换酒店更省打包与通勤成本。</li>
            <li>深夜到达的航班优先选有机场轨道/大巴直达的区域。</li>
          </ul>
          <p className="arrive-source arrive-source--last">{guide.disclaimer}</p>
        </div>
      </details>
    </section>
  )
}
