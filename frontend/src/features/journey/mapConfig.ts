interface AMapConfigSuccess {
  ok: true
  key: string
  securityCode: string
}

interface AMapConfigFailure {
  ok: false
  message: string
}

export type AMapConfig = AMapConfigSuccess | AMapConfigFailure

const missingConfigMessage = '请在 frontend/.env.local 配置 VITE_AMAP_KEY 和 VITE_AMAP_SECURITY_CODE'

export function readAMapConfig(
  env: Readonly<Record<string, string | boolean | undefined>>,
): AMapConfig {
  const key = typeof env.VITE_AMAP_KEY === 'string' ? env.VITE_AMAP_KEY.trim() : ''
  const securityCode = typeof env.VITE_AMAP_SECURITY_CODE === 'string'
    ? env.VITE_AMAP_SECURITY_CODE.trim()
    : ''

  if (!key || !securityCode) return { ok: false, message: missingConfigMessage }
  return { ok: true, key, securityCode }
}

