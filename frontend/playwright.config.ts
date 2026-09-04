import { defineConfig } from '@playwright/test'

// E2E 针对本地 FastAPI（http://localhost:8000 托管 dist）。
// 运行前需要：后端已启动 + npm run build 已产出最新 dist。
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:8000',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
