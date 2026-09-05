import { describe, expect, it } from 'vitest'
import { parseHotelRows, splitLodgingProse } from './viewModel'

describe('住宿结果解析（紧凑列表数据源）', () => {
  const LODGING_TABLE = [
    '### 住宿',
    '建议住地铁沿线。',
    '',
    '| 名称 | 位置 | 价格/晚 | 评分 |',
    '|------|------|---------|------|',
    '| 涩谷艾美酒店 | 涩谷区道玄坂 | ¥880 | 4.6 |',
    '| 银座蒙特利酒店 | 中央区银座 | ¥750 |  |',
    '| 经济型旅馆 | 新宿 |  |  |',
    '',
    '> 价格为方案生成时的建议。',
  ].join('\n')

  it('parses hotel rows keeping only fields that really exist', () => {
    const rows = parseHotelRows(LODGING_TABLE)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ name: '涩谷艾美酒店', area: '涩谷区道玄坂', price: '¥880', rating: '4.6' })
    // 缺评分 → 字段不存在（渲染层直接隐藏，不显示 "—"）
    expect(rows[1]).toEqual({ name: '银座蒙特利酒店', area: '中央区银座', price: '¥750', rating: undefined })
    expect(rows[2]).toEqual({ name: '经济型旅馆', area: '新宿', price: undefined, rating: undefined })
  })

  it('never fabricates placeholders or fake scores/prices', () => {
    const rows = parseHotelRows('| 名称 | 位置 |\n|---|---|\n| 某酒店 | 某区 |')
    expect(rows[0].price).toBeUndefined()
    expect(rows[0].rating).toBeUndefined()
    expect(JSON.stringify(rows)).not.toContain('—')
    expect(JSON.stringify(rows)).not.toContain('0')
  })

  it('ignores separator rows, header rows and flights tables', () => {
    const rows = parseHotelRows([
      '### 酒店',
      '| 航班号 | 航司 |',
      '|---|---|',
      '| MU523 | 东航 |',
      '| 名称 | 区域 |',
      '|------|------|',
      '| A酒店 | 甲区 |',
    ].join('\n'))
    expect(rows.map(row => row.name)).toEqual(['A酒店'])
  })

  it('returns [] when there is no hotel table at all', () => {
    expect(parseHotelRows('### 住宿\n- 建议住老城区')).toEqual([])
    expect(parseHotelRows('')).toEqual([])
  })

  it('separates non-table prose from hotel rows (prose stays visible as real advice)', () => {
    const { prose, tableMarkdown } = splitLodgingProse(LODGING_TABLE)
    expect(prose).toContain('建议住地铁沿线')
    expect(tableMarkdown).toContain('| 涩谷艾美酒店')
  })
})
