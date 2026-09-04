// ────────────────────────────────────────────────────────────
// 航班查询意图识别（前端门卫）：
// 「列出机票 / 查询上海到东京的机票 / 帮我找广州到巴黎的航班」这类
// 纯检索请求与"生成行程"分流——发送前先核对必要条件，
// 缺出发地/目的地/日期时明确追问，不拿旧会话默认值顶上。
// ────────────────────────────────────────────────────────────

export interface FlightQueryConditions {
  origin: string | null
  destination: string | null
  date: string | null
}

export interface FlightQueryIntent {
  conditions: FlightQueryConditions
  missing: Array<'origin' | 'destination' | 'date'>
}

const FLIGHT_WORDS = /机票|航班/
const PLAN_WORDS = /行程|日程|规划|方案|旅行计划|几日游|天.*行程/
const FLIGHT_PATTERNS = [
  /列出机票/,
  /列出[^\n]{0,12}航班/,
  /查(一下|询)?[^\n]{0,28}机票/,
  /查(一下|询)?[^\n]{0,28}航班/,
  /机票[^\n]{0,10}(列表|查询)/,
  /(找|搜|看)[^\n]{0,28}航班/,
  /航班[^\n]{0,8}(查询|列表|推荐)/,
]

export function detectFlightQuery(text: string): FlightQueryIntent | null {
  const message = text.trim()
  if (!message || message.length > 40) return null
  if (!FLIGHT_WORDS.test(message) || PLAN_WORDS.test(message)) return null
  if (!FLIGHT_PATTERNS.some(pattern => pattern.test(message))) return null

  const origin = extractRouteCity(message, 'origin')
  const destination = extractRouteCity(message, 'destination')
  const date = message.match(/(20\d{2})[-/年.](\d{1,2})[-/月.](\d{1,2})/)
  const missing: FlightQueryIntent['missing'] = []
  if (!origin) missing.push('origin')
  if (!destination) missing.push('destination')
  if (!date) missing.push('date')
  return {
    conditions: {
      origin,
      destination,
      date: date ? `${date[1]}-${Number(date[2]).toString().padStart(2, '0')}-${Number(date[3]).toString().padStart(2, '0')}` : null,
    },
    missing,
  }
}

/** 从「上海到东京」「广州→巴黎」这类路线表达里取出发/到达城市 */
function extractRouteCity(rawMessage: string, which: 'origin' | 'destination'): string | null {
  // 剥掉动词前缀，避免「查询上海」里的「查询」混进城市名
  const message = rawMessage.replace(/^(请|帮我|麻烦)?\s*(查询|查一下|查查|查|搜索|搜一下|搜|找出|找|列出|看看|看一下|看)\s*/, '')
  const route = message.match(/([一-鿿A-Za-z][一-鿿A-Za-z·]{1,11})\s*(?:→|->|到|飞往|至|去)\s*([一-鿿A-Za-z][一-鿿A-Za-z·]{1,11})/)
  if (route) {
    const city = (which === 'origin' ? route[1] : route[2]).trim()
    // 排除把动词误当城市（"查到"）
    if (/^(查|询|找|搜|看|帮|我|请|列出|查询)$/.test(city)) return null
    return city.length >= 2 ? city : null
  }
  if (which === 'destination') {
    const to = message.match(/(?:到|飞往|至|去)\s*([一-鿿A-Za-z][一-鿿A-Za-z·]{1,11}?)(?=的?(?:机票|航班))/)
    if (to) return to[1].trim()
  }
  return null
}

export const MISSING_FIELD_COPY: Record<'origin' | 'destination' | 'date', string> = {
  origin: '出发地',
  destination: '目的地',
  date: '出发日期',
}
