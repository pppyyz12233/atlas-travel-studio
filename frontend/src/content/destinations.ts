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
}

export const destinations: Destination[] = [
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

export function destinationById(id: string): Destination | undefined {
  return destinations.find(destination => destination.id === id)
}
