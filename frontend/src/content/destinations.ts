// 精选目的地 —— 编辑部策划内容（非 API 数据）。
// 每个目的地的景点联动来自真实接口 GET /api/search/attractions?destination=。

export type TravelStyle =
  | '城市漫游' | '自然风景' | '美食旅行' | '亲子旅行' | '浪漫旅行' | '文化探索'

export const travelStyles: TravelStyle[] = [
  '城市漫游', '自然风景', '美食旅行', '亲子旅行', '浪漫旅行', '文化探索',
]

export interface Destination {
  id: string
  name: string
  nameEn: string
  region: string
  coords: string
  styles: TravelStyle[]
  blurb: string
  bestSeason: string
  suggestDays: string
  /** 封面色板：[底色, 主色, 点缀色] */
  palette: [string, string, string]
  /** 预填到规划表单的默认值 */
  formDefaults: { destination: string; days: number; budget: number }
  coverImage?: string
  coverImages?: string[]
  quote?: { text: string; author: string }
  coverAlt?: string
  sections?: { title: string; content: string; items?: string[]; days?: { day: string; title: string; places: string[]; note: string }[] }[]
  planningPrompts?: string[]
  travelStyle?: string
  recommendedDays?: string
  updatedAt?: string
}

const covers: Record<string, string> = {
  tokyo: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=1200&q=80',
  kyoto: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=1200&q=80',
  hangzhou: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=1200&q=80',
  beijing: 'https://images.unsplash.com/photo-1508804185872-d7_bad_?w=1200&q=80',
  chengdu: 'https://images.unsplash.com/photo-1548919973-5cef591cdbc9?w=1200&q=80',
  xiamen: 'https://images.unsplash.com/photo-1507528279846-5f9c1f7b8d0f?w=1200&q=80',
  singapore: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=1200&q=80',
  paris: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1200&q=80',
}

export const destinations: Destination[] = [
  {
    id: 'paris', name: '巴黎', nameEn: 'Paris', region: '法国 · 法兰西岛',
    coords: '48.86°N 2.35°E', styles: ['文化探索', '浪漫旅行'],
    blurb: '沿着塞纳河散步，把博物馆、街角面包店和黄昏的城市光线串成一天。',
    bestSeason: '4-6 月 / 9-10 月', suggestDays: '4 天 · ¥9,000+', palette: ['#e8e1d9', '#52657a', '#b06b4e'],
    formDefaults: { destination: '巴黎', days: 4, budget: 9000 },
  },
  {
    id: 'tokyo', name: '东京', nameEn: 'Tokyo', region: '日本 · 关东',
    coords: '35.68°N 139.69°E', styles: ['城市漫游', '美食旅行'],
    blurb: '霓虹街区与枯山水庭院只隔一条小巷，早晨的筑地与午后的代代木完全属于两种时间。',
    bestSeason: '3-4 月 / 10-11 月', suggestDays: '5 天 · ¥8,000+',
    palette: ['#e8e3d8', '#2f4a6b', '#b04a2f'],
    formDefaults: { destination: '东京', days: 5, budget: 8000 },
  },
  {
    id: 'kyoto', name: '京都', nameEn: 'Kyoto', region: '日本 · 关西',
    coords: '35.01°N 135.77°E', styles: ['文化探索', '浪漫旅行'],
    blurb: '千年的木构、石庭与町屋，把季节过成一种日常仪式。',
    bestSeason: '4 月樱 / 11 月红叶', suggestDays: '4 天 · ¥7,000+',
    palette: ['#efe6da', '#56633f', '#a8742a'],
    formDefaults: { destination: '京都', days: 4, budget: 7000 },
  },
  {
    id: 'hangzhou', name: '杭州', nameEn: 'Hangzhou', region: '中国 · 浙江',
    coords: '30.27°N 120.15°E', styles: ['自然风景', '文化探索'],
    blurb: '湖山、茶山与南宋旧巷，一次不赶时间的江南漫步。',
    bestSeason: '4-5 月 / 9-10 月', suggestDays: '2 天 · ¥3,000+',
    palette: ['#e6ece2', '#3f5a48', '#c2913c'],
    formDefaults: { destination: '杭州', days: 2, budget: 3000 },
  },
  {
    id: 'beijing', name: '北京', nameEn: 'Beijing', region: '中国 · 华北',
    coords: '39.90°N 116.40°E', styles: ['文化探索'],
    blurb: '沿中轴线走完六百年，在胡同深处吃一顿认真早点。',
    bestSeason: '9-10 月', suggestDays: '4 天 · ¥5,000+',
    palette: ['#ece5d8', '#8a3b28', '#2f4a6b'],
    formDefaults: { destination: '北京', days: 4, budget: 5000 },
  },
  {
    id: 'shanghai', name: '上海', nameEn: 'Shanghai', region: '中国 · 华东',
    coords: '31.23°N 121.47°E', styles: ['城市漫游'],
    blurb: '梧桐区的街角咖啡、外滩的晨雾与苏河的旧仓库。',
    bestSeason: '4-5 月 / 10-11 月', suggestDays: '2 天 · ¥2,500+',
    palette: ['#e9e4dc', '#4a5468', '#b04a2f'],
    formDefaults: { destination: '上海', days: 2, budget: 2500 },
  },
  {
    id: 'guangzhou', name: '广州', nameEn: 'Guangzhou', region: '中国 · 华南',
    coords: '23.13°N 113.26°E', styles: ['美食旅行'],
    blurb: '从一盅两件的早晨开始，把老城区吃成一张地图。',
    bestSeason: '10-12 月', suggestDays: '3 天 · ¥3,500+',
    palette: ['#f0e7d4', '#9c5a22', '#4f6b48'],
    formDefaults: { destination: '广州', days: 3, budget: 3500 },
  },
  {
    id: 'dali', name: '大理', nameEn: 'Dali', region: '中国 · 云南',
    coords: '25.61°N 100.27°E', styles: ['自然风景', '浪漫旅行'],
    blurb: '苍山雪、洱海月，把节奏放慢到环湖骑行的速度。',
    bestSeason: '3-5 月 / 10-11 月', suggestDays: '4 天 · ¥4,000+',
    palette: ['#e3ebee', '#3e5e66', '#c8995c'],
    formDefaults: { destination: '大理', days: 4, budget: 4000 },
  },
  {
    id: 'chengdu', name: '成都', nameEn: 'Chengdu', region: '中国 · 四川',
    coords: '30.57°N 104.07°E', styles: ['美食旅行', '城市漫游'],
    blurb: '茶馆、熊猫与街边火锅，一座教你休息的城市。',
    bestSeason: '3-6 月 / 9-11 月', suggestDays: '3 天 · ¥3,500+',
    palette: ['#eee6d8', '#7c4a2d', '#56633f'],
    formDefaults: { destination: '成都', days: 3, budget: 3500 },
  },
  {
    id: 'singapore', name: '新加坡', nameEn: 'Singapore', region: '东南亚',
    coords: '1.35°N 103.82°E', styles: ['亲子旅行', '城市漫游'],
    blurb: '干净、安全、处处花园——带小朋友看世界的第一站。',
    bestSeason: '全年 · 2-4 月最舒适', suggestDays: '6 天 · ¥9,000+',
    palette: ['#e7e9df', '#2f5d52', '#d0952f'],
    formDefaults: { destination: '新加坡', days: 6, budget: 9000 },
  },
  {
    id: 'osaka', name: '大阪', nameEn: 'Osaka', region: '日本 · 关西',
    coords: '34.69°N 135.50°E', styles: ['美食旅行', '城市漫游'],
    blurb: '章鱼烧、串炸与道顿堀的灯牌，关西的烟火气中心。',
    bestSeason: '3-5 月 / 10-11 月', suggestDays: '3 天 · ¥6,000+',
    palette: ['#ece2d6', '#a04a30', '#33465e'],
    formDefaults: { destination: '大阪', days: 3, budget: 6000 },
  },
  {
    id: 'xiamen', name: '厦门', nameEn: 'Xiamen', region: '中国 · 福建',
    coords: '24.48°N 118.09°E', styles: ['浪漫旅行', '自然风景'],
    blurb: '海风、骑楼与鼓浪屿的琴声，短途度假的温柔选项。',
    bestSeason: '4-6 月 / 9-11 月', suggestDays: '3 天 · ¥3,000+',
    palette: ['#e6ecef', '#41626e', '#c07a4a'],
    formDefaults: { destination: '厦门', days: 3, budget: 3000 },
  },
  {
    id: 'qingdao', name: '青岛', nameEn: 'Qingdao', region: '中国 · 山东',
    coords: '36.07°N 120.38°E', styles: ['自然风景', '亲子旅行'],
    blurb: '红瓦绿树、碧海蓝天，配上夏天的第一杯散啤。',
    bestSeason: '6-9 月', suggestDays: '3 天 · ¥3,000+',
    palette: ['#e9e8e0', '#33586b', '#c19a3f'],
    formDefaults: { destination: '青岛', days: 3, budget: 3000 },
  },
  {
    id: 'hongkong', name: '香港', nameEn: 'Hong Kong', region: '中国 · 华南',
    coords: '22.32°N 114.17°E', styles: ['城市漫游', '美食旅行'],
    blurb: '垂直城市的密度美学，与一间间值得专程前往的小店。',
    bestSeason: '10-12 月', suggestDays: '3 天 · ¥5,000+',
    palette: ['#eae5dc', '#54423a', '#2f4a6b'],
    formDefaults: { destination: '香港', days: 3, budget: 5000 },
  },
]

for (const destination of destinations) {
  destination.coverImage = covers[destination.id]
  destination.coverAlt = `${destination.name}旅行风景`
  destination.coverImages = [1, 2, 3].map(n => `/images/destinations/${destination.id}-${n}.jpg`)
  destination.coverImage = destination.coverImages[0]
  destination.travelStyle = destination.styles.join('、')
  destination.recommendedDays = destination.suggestDays
  destination.updatedAt = '2026-09'
  destination.planningPrompts = [`${destination.name}第一次去，${destination.suggestDays.split('·')[0].trim()}，重点看地标和当地美食`, `帮我安排一份适合${destination.styles[0]}的${destination.name}行程`]
  const placeSets: Record<string, string[]> = {
    tokyo: ['浅草寺与仲见世', '涩谷街区', '明治神宫与代代木公园'], kyoto: ['清水寺与二年坂', '伏见稻荷大社', '祇园与花见小路'], hangzhou: ['西湖与断桥', '灵隐寺', '龙井村茶园'], beijing: ['故宫与景山', '长城', '天坛与前门'], shanghai: ['外滩与陆家嘴', '豫园与城隍庙', '武康路与梧桐区'], guangzhou: ['陈家祠', '沙面岛', '广州塔'], dali: ['洱海环线', '大理古城', '苍山与崇圣寺三塔'], chengdu: ['大熊猫繁育研究基地', '宽窄巷子', '春熙路与太古里'], singapore: ['滨海湾花园', '鱼尾狮公园', '圣淘沙'], osaka: ['大阪城公园', '道顿堀', '新世界与通天阁'], xiamen: ['鼓浪屿', '环岛路', '沙坡尾'], qingdao: ['栈桥与小鱼山', '八大关', '崂山'], hongkong: ['维多利亚港', '太平山顶', '中环与西九龙'], paris: ['埃菲尔铁塔', '卢浮宫', '蒙马特高地'], }
  const places = placeSets[destination.id] ?? [`${destination.name}城市地标`, `${destination.name}当地街区`, `${destination.name}文化体验`]
  destination.sections = [
    { title: '一句话定位', content: destination.blurb },
    { title: '城市印象', content: `第一次到${destination.name}，建议把节奏放在${destination.styles[0]}上：每天安排 2—3 个重点，其余时间留给街区和临时发现。` },
    { title: '适合什么人', content: `适合${destination.styles.join('、')}的旅行者。${destination.name}更适合愿意步行、接受弹性安排，并且会为一两顿特色餐留出时间的人。` },
    { title: '推荐季节与区域', content: `推荐季节：${destination.bestSeason}。住宿和活动可优先围绕${places[0]}、${places[1]}所在区域选择，减少每天跨城移动。` },
    { title: '必看景点', content: '以下景点适合作为初次到访的主线，具体开放时间和预约规则请以官方信息为准。', items: places.map((p, i) => `${p} · 建议停留 ${i === 1 ? '2—4 小时' : '2—3 小时'} · 适合${i === 2 ? '慢游与拍照' : '第一次到访'}`) },
    { title: '景点怎么组合', content: `可以把${places[0]}和${places[1]}安排在同一天，${places[2]}单独留出半天；若遇到天气或人流变化，优先保留同一区域的组合。` },
    { title: '一日 / 两日思路', content: '先用紧凑的一日主线建立城市印象，再把第二天交给街区、美食或自然景观。', days: [{ day: 'Day 1', title: '城市代表性主线', places: places.slice(0, 2), note: '上午安排核心景点，下午放慢节奏，晚上选择交通方便的用餐区域。' }, { day: 'Day 2', title: '街区与体验', places: [places[2], `${destination.name}当地街区`], note: '留出机动时间，不要把所有行程排满。' }] },
    { title: '吃什么', content: `建议围绕住宿和当天景点就近尝试${destination.name}的代表性风味，先看本地人较多、评价稳定的店。`, items: ['当地早餐或市场小吃', '一顿具有地方特色的正餐', '留时间尝试街区咖啡、甜品或茶饮'] },
    { title: '交通与住宿', content: `优先选择公共交通或步行串联相邻区域；住宿建议靠近主要车站、核心街区或${places[0]}附近，减少往返。高峰期和节假日请预留换乘、排队时间。` },
    { title: '避坑提醒', content: '行程信息会随季节和政策变化，请以景点、交通和商家官方信息为准。', items: ['不要一天安排过多跨区域景点', '热门景点提前确认预约与入场规则', '警惕过低价格、临时揽客和非官方购票渠道'] },
    { title: '行前准备', content: '出发前确认天气、证件、支付方式、网络和必要预约；将重要地址保存为当地语言，方便问路或打车。' },
  ]
}

export function destinationById(id: string): Destination | undefined {
  return destinations.find(destination => destination.id === id)
}
