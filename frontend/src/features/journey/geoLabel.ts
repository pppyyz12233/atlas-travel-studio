import { loadAMap } from '../../components/MapView'

// ────────────────────────────────────────────────────────────
// 逆地理编码：把浏览器定位坐标转成可读地名（省/市/区），
// 让「使用我的当前位置」保存的 origin.label 是地名而不是裸坐标。
// 失败时返回 null —— 调用方保留坐标串作为 label，绝不猜测城市。
// ────────────────────────────────────────────────────────────

function firstText(value: string | Array<string> | '' | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

/** "中国上海市黄浦区南京东路1号" → "上海市黄浦区"（省+市+区，去掉街道细节） */
function compactAddress(components: {
  province?: string | Array<string>
  city?: string | Array<string> | ''
  district?: string | Array<string>
}, fallback: string): string {
  const province = firstText(components.province)
  const city = firstText(components.city)
  const district = firstText(components.district)
  const compact = `${province}${city === province ? '' : city}${district}`.replace(/^中国/, '')
  return compact.length >= 2 ? compact : fallback.slice(0, 18)
}

export function reverseGeocodeLabel(latitude: number, longitude: number): Promise<string | null> {
  return loadAMap()
    .then(() => new Promise<string | null>(resolve => {
      const geocoder = new window.AMap.Geocoder()
      geocoder.getAddress([longitude, latitude], (status, result) => {
        if (status === 'complete' && result?.regeocode?.formattedAddress) {
          const regeo = result.regeocode
          resolve(compactAddress(regeo.addressComponent ?? {}, regeo.formattedAddress ?? ''))
        } else {
          resolve(null)
        }
      })
    }))
    .catch(() => null)
}
