import { expect, test } from '@playwright/test'

// E2E 规格（真实浏览器 × 本地 FastAPI + dist）：
// 覆盖本轮 P0 的静态可验证项——串线表单、布局零溢出、导出入口、
// 行程页结构。涉及真实 LLM 的生成流程由 CDP 驱动的手动验收覆盖
//（延迟 20-60s，不适合放进 CI 级 spec）。

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    sessionStorage.clear()
    localStorage.removeItem('travel_token')
  })
})

test('homepage accepts 去广州一天 and hands the raw text to /plan', async ({ page }) => {
  await page.getByLabel('输入你的旅行想法').fill('去广州一天')
  await page.locator('.mag-hero-input .mag-cta').click()
  await expect(page).toHaveURL(/#\/plan/)
})

test('plan page shows no Tokyo/Shanghai residue for a Guangzhou form', async ({ page }) => {
  await page.evaluate(() => {
    sessionStorage.setItem('atlas_journey_state', JSON.stringify({
      sessions: [{
        id: 'gz-e2e',
        title: '广州 · 1天',
        conversationId: null,
        messages: [
          { role: 'user', content: '去广州一天' },
          { role: 'assistant', content: '## 广州一日游方案\n\n### 日程\n**Day 1 经典**\n| 时段 | 地点 |\n|---|---|\n| 上午 | 陈家祠 |' },
        ],
        steps: [],
        finalReply: '## 广州一日游方案\n\n### 日程\n**Day 1 经典**\n| 时段 | 地点 |\n|---|---|\n| 上午 | 陈家祠 |',
        locations: [],
        phase: 'ready',
        graphNode: '',
        statusMessage: '',
        formTouched: true,
        form: {
          origin: { label: null, latitude: null, longitude: null, source: 'manual' },
          destination: '广州',
          date: '2026-09-04',
          days: 1,
          people: 2,
          budget: 4000,
        },
      }],
      activeId: 'gz-e2e',
    }))
  })
  await page.goto('/#/plan')
  await page.reload()
  await expect(page.getByRole('heading', { name: '广州 · 行程方案' })).toBeVisible()
  await expect(page.getByText('出发地待定 → 广州')).toBeVisible()
  // 交通区：编辑部广州指南（白云），不是东京
  await expect(page.getByText(/白云机场/).first()).toBeVisible()
  await expect(page.getByText(/羽田|成田/)).toHaveCount(0)
})

test('trip detail shows normalized structure without horizontal overflow at key widths', async ({ page }) => {
  await page.evaluate(() => {
    sessionStorage.setItem('atlas_journey_state', JSON.stringify({
      sessions: [{
        id: 'gz-e2e',
        title: '广州 · 1天',
        conversationId: null,
        messages: [{ role: 'user', content: '去广州一天' }],
        steps: [],
        finalReply: '## 广州一日游方案\n\n### 日程\n**Day 1 经典**\n| 时段 | 地点 |\n|---|---|\n| 上午 | 陈家祠 |',
        locations: [{ name: '陈家祠', address: '', lng: 113.2452, lat: 23.1251, type: 'attraction' }],
        phase: 'ready',
        graphNode: '',
        statusMessage: '',
        form: {
          origin: { label: null, latitude: null, longitude: null, source: 'manual' },
          destination: '广州',
          date: '2026-09-04',
          days: 1,
          people: 2,
          budget: 4000,
        },
      }],
      activeId: 'gz-e2e',
    }))
  })
  for (const width of [1440, 1280, 1152, 768, 375]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 })
    await page.goto('/#/trip/gz-e2e')
    await page.reload()
    await expect(page.getByRole('heading', { name: '广州 · 1 天行程' })).toBeVisible()
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth > document.scrollingElement!.clientWidth + 1)
    expect(overflow, `width=${width}`).toBe(false)
  }
})

test('trips page cloud section renders with no 0-day cards', async ({ page }) => {
  // 未登录：云端区显示登录引导而不是空卡片
  await page.goto('/#/trips')
  await expect(page.getByText('登录后同步云端行程')).toBeVisible()
  await expect(page.getByText('0 天')).toHaveCount(0)
})

test('export menu states PDF/Markdown share the same source', async ({ page }) => {
  await page.evaluate(() => {
    sessionStorage.setItem('atlas_journey_state', JSON.stringify({
      sessions: [{
        id: 'gz-e2e',
        title: '广州 · 1天',
        conversationId: null,
        messages: [],
        steps: [],
        finalReply: '## 广州一日游方案',
        locations: [],
        phase: 'ready',
        graphNode: '',
        statusMessage: '',
        form: {
          origin: { label: null, latitude: null, longitude: null, source: 'manual' },
          destination: '广州',
          date: '2026-09-04',
          days: 1,
          people: 2,
          budget: 4000,
        },
      }],
      activeId: 'gz-e2e',
    }))
  })
  await page.goto('/#/plan')
  await page.reload()
  await page.getByRole('button', { name: /导出/ }).click()
  await expect(page.getByRole('menuitem', { name: '导出 Markdown' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '导出 PDF' })).toBeVisible()
  await expect(page.getByText(/两种格式内容同源/)).toBeVisible()
})
