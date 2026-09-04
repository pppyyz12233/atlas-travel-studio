// ────────────────────────────────────────────────────────────
// Atlas 编辑部目的地交通指南（静态策展内容，非实时数据）。
// 用途：当本次行程的方案正文没有"交通"章节时，交通区仍保有基础内容，
// 而不是大面积空白。规则（与页面展示一致）：
//  - 不编造航班号、实时票价、精确耗时、拥堵状况、实时距离；
//  - 展示时必须携带 disclaimer 免责声明；
//  - 有本次行程真实交通内容时优先展示正文内容，编辑部内容只作补充。
// ────────────────────────────────────────────────────────────

export interface TransportGuide {
  /** 一句话概览（机场/车站格局 + 市内主力交通） */
  summary: string
  /** 具体建议条目（静态常识，不含实时数字） */
  tips: string[]
  /** 必须原样展示的免责声明 */
  disclaimer: string
}

export const TRANSPORT_DISCLAIMER = '以下为目的地通用建议，不代表实时航班、票价或路线。'

const curated: Record<string, TransportGuide> = {
  上海: {
    summary: '双机场（浦东、虹桥）+ 以地铁为骨干的市内交通，市区分工明确。',
    tips: [
      '到达方式：浦东（PVG）与虹桥（SHA）两场分工，购票前先确认起飞机场；虹桥离市区更近。',
      '机场进城：两场均有地铁 2 号线衔接；浦东另有磁浮线可换乘（以现场公示为准）。',
      '市内交通：地铁网络密集，覆盖绝大多数景点；跨江轮渡适合观光体验。',
      '交通卡 / App：Metro 大都会 App 扫码进站；也可使用交通联合卡。',
      '打车：出租与网约车都广泛可用，高峰期建议预留余量。',
    ],
    disclaimer: TRANSPORT_DISCLAIMER,
  },
  广州: {
    summary: '白云机场 + 地铁骨干网，老城与新区之间通勤成本低。',
    tips: [
      '到达方式：白云国际机场为唯一主力机场，与市区以北的枢纽站衔接顺畅。',
      '机场进城：地铁 3 号线北延段直达市区；也有机场大巴多条线路（以现场公示为准）。',
      '市内交通：地铁覆盖天河、越秀、荔湾等主要片区；珠江新城与老城之间通勤便利。',
      '交通卡 / App：羊城通或各乘车码 App；地铁公交通用。',
      '打车：网约车响应快；老城单行路多，短途步行常常更快。',
    ],
    disclaimer: TRANSPORT_DISCLAIMER,
  },
  巴黎: {
    summary: '戴高乐（CDG）/ 奥利（ORY）双机场 + 地铁（Métro）与 RER 城郊快线网。',
    tips: [
      '到达方式：确认机票落在 CDG 还是 ORY，两场位于城市不同方向。',
      '机场进城：RER B 线连接戴高乐机场与市区多个换乘枢纽；奥利有轨道线接驳（以现场公示为准）.',
      '市内交通：地铁线路密集，博物馆与景点之间通常一两趟直达。',
      '交通卡 / App：Navigo Easy 卡或 Bonjour RATP 短期票；官方 RATP App 查路线。',
      '安全提示：地铁与景区注意随身物品；夜间优先主干道与正规出租车。',
    ],
    disclaimer: TRANSPORT_DISCLAIMER,
  },
  东京: {
    summary: '羽田（HND）/ 成田（NRT）双机场 + JR 山手线与地铁网的组合。',
    tips: [
      '到达方式：羽田离市区近，成田较远，购票时可优先比较两场价格与通勤时间。',
      '机场进城：成田有特快列车与接驳轨道，羽田有单轨电车与私铁线路（以现场公示为准）。',
      '市内交通：JR 山手线环线串起主要枢纽，叠加都营/东京 Metro 地铁覆盖全城。',
      '交通卡 / App：Suica / PASMO 交通卡（手机钱包可开通）；乘换案内或 Google Maps 查换乘。',
      '打车：出租车费用较高，深夜或携大件行李时再考虑。',
    ],
    disclaimer: TRANSPORT_DISCLAIMER,
  },
  新加坡: {
    summary: '樟宜机场（SIN）+ MRT 地铁网，官方规定严格、通行效率高。',
    tips: [
      '到达方式：樟宜机场是唯一主力机场，机场本身即是景点。',
      '机场进城：MRT 东西线直达市区；出租车与网约车在到达层有明确排队区（以现场公示为准）。',
      '市内交通：MRT + 公交接驳覆盖全岛，景点之间通常无需换乘超过一次。',
      '交通卡 / App：EZ-Link / NETS FlashPay 卡，或直接刷感应式银行卡进出站。',
      '打车：Grab 等网约车普及；注意车内饮食、系安全带等当地法规。',
    ],
    disclaimer: TRANSPORT_DISCLAIMER,
  },
}

/** 通用兜底：任何目的地（含未收录的国内/国外城市）都有基础交通内容 */
function genericGuide(destination: string): TransportGuide {
  return {
    summary: `${destination}的机场/车站与市区之间的接驳，通常有轨道、机场大巴与出租车三类选择。`,
    tips: [
      '到达方式：购票前确认具体机场/车站名称——大城市常有多个场站，走错代价很高。',
      '机场进城：优先查机场官方的轨道/大巴接驳信息，其次再比较出租车与网约车。',
      '市内交通：大城市以地铁/轨道为骨干；小城市公交 + 步行往往更从容。',
      '交通卡 / App：出发前查好当地官方交通 App 与交通卡开通方式（手机钱包通常可用）。',
      '通用建议：把住宿选在轨道站步行范围内，能显著降低每天的通勤成本。',
    ],
    disclaimer: TRANSPORT_DISCLAIMER,
  }
}

/** 按目的地名取编辑部交通指南：精选城市用策展内容，其余用通用模板。 */
export function getTransportGuide(destination: string): TransportGuide {
  const key = destination.trim()
  return curated[key] ?? genericGuide(key || '目的地')
}

/** 本次行程是否已有真实交通内容（用于决定 A/B 展示顺序） */
export function hasTripTransport(transportMarkdown: string): boolean {
  return transportMarkdown.trim().length > 0
}
