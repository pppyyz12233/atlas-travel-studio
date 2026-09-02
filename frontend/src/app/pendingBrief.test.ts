import { afterEach, describe, expect, it } from 'vitest'
import { PENDING_BRIEF_KEY, consumePendingBrief, setPendingBrief } from './pendingBrief'

describe('pending brief handoff', () => {
  afterEach(() => {
    sessionStorage.clear()
  })

  it('stores a brief and consumes it exactly once', () => {
    setPendingBrief('十一月去京都看红叶，两个人')

    expect(consumePendingBrief()).toBe('十一月去京都看红叶，两个人')
    // 一次性：读后即删，刷新/二次渲染不会重复消费
    expect(consumePendingBrief()).toBeNull()
    expect(sessionStorage.getItem(PENDING_BRIEF_KEY)).toBeNull()
  })

  it('returns null for empty or whitespace-only briefs', () => {
    setPendingBrief('   ')

    expect(consumePendingBrief()).toBeNull()
    // 空白内容也不留下脏数据
    expect(sessionStorage.getItem(PENDING_BRIEF_KEY)).toBeNull()
  })

  it('returns null when nothing was stored', () => {
    expect(consumePendingBrief()).toBeNull()
  })
})
