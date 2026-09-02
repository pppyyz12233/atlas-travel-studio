import { describe, expect, it } from 'vitest'
import { readAMapConfig } from './mapConfig'

describe('AMap browser configuration', () => {
  it('rejects missing credentials instead of using checked-in fallbacks', () => {
    expect(readAMapConfig({})).toEqual({
      ok: false,
      message: '请在 frontend/.env.local 配置 VITE_AMAP_KEY 和 VITE_AMAP_SECURITY_CODE',
    })
  })

  it('rejects a partial configuration', () => {
    expect(readAMapConfig({ VITE_AMAP_KEY: 'key-only' })).toEqual({
      ok: false,
      message: '请在 frontend/.env.local 配置 VITE_AMAP_KEY 和 VITE_AMAP_SECURITY_CODE',
    })
  })

  it('accepts explicitly configured credentials', () => {
    expect(readAMapConfig({
      VITE_AMAP_KEY: ' key ',
      VITE_AMAP_SECURITY_CODE: ' code ',
    })).toEqual({ ok: true, key: 'key', securityCode: 'code' })
  })
})
