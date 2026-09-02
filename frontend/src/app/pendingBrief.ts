// 首页一句话需求 → 规划页的一次性交接。
// 语义：读后即删 —— 刷新 / StrictMode 二次挂载 / 返回首页再来都不会重复发送。
export const PENDING_BRIEF_KEY = 'atlas_pending_brief'

export function setPendingBrief(text: string): void {
  try {
    sessionStorage.setItem(PENDING_BRIEF_KEY, text)
  } catch {
    // 存储不可用时静默放弃，用户仍可在规划页手动输入
  }
}

export function consumePendingBrief(): string | null {
  try {
    const raw = sessionStorage.getItem(PENDING_BRIEF_KEY)
    if (raw !== null) sessionStorage.removeItem(PENDING_BRIEF_KEY)
    const text = raw?.trim()
    return text ? text : null
  } catch {
    return null
  }
}
