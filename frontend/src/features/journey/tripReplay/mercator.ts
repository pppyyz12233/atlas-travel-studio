// ============================================================
// Web Mercator 投影（球面，256·2^z 世界像素）——与高德瓦片/静态地图同一网格。
// 全链路 GCJ-02：搜索 worker、JS SDK、静态图 REST 坐标系一致，无需换算。
// ============================================================

/** Web Mercator 纬度极限 */
export const MAX_LATITUDE = 85.051129

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

/** 经纬度 → 缩放级 z 的世界像素坐标 */
export function mercatorProject(lng: number, lat: number, zoom: number): { x: number; y: number } {
  const world = 256 * 2 ** zoom
  const safeLat = clamp(lat, -MAX_LATITUDE, MAX_LATITUDE)
  const x = (lng / 360 + 0.5) * world
  const sin = Math.sin((safeLat * Math.PI) / 180)
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world
  return { x, y }
}

/** 缩放级 z 的世界像素坐标 → 经纬度（mercatorProject 的逆） */
export function mercatorUnproject(x: number, y: number, zoom: number): { lng: number; lat: number } {
  const world = 256 * 2 ** zoom
  const lng = (x / world) * 360 - 180
  const n = Math.PI * (1 - (2 * y) / world)
  const lat = (Math.atan(Math.sinh(n)) * 180) / Math.PI
  return { lng, lat }
}
