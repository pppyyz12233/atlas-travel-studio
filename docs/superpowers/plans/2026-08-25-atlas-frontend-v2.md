# Atlas Frontend V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the existing Atlas page as a portfolio-grade, state-driven journey intelligence workspace while preserving authentication, SSE streaming, conversation history, export and AMap behavior.

**Architecture:** Keep `AIPage.tsx` as the network/orchestration container and move session state, SSE interpretation, Markdown-derived view models and visual sections into focused files under `frontend/src/features/journey`. A reducer is the single source of truth for the explicit `idle`, `planning`, `ready`, `error` and `cancelled` phases; backend metrics and structured trip data remain optional so the UI never invents unavailable values.

**Tech Stack:** React 18, TypeScript 5.6, Vite 6, Lucide React, existing CSS, Vitest, jsdom and Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-25-atlas-frontend-v2-design.md`

## Global Constraints

- Preserve the selected visual direction: 70% aviation operations console and 30% premium travel editorial.
- Preserve existing authentication, SSE, history, Markdown/PDF export and AMap behavior.
- Model `idle`, `planning`, `ready`, `error` and `cancelled` as explicit phases.
- Do not add Redux, a UI framework, a chart library or an animation library.
- Do not fabricate latency, token, cost or structured itinerary values when the backend does not provide them.
- Use semantic brand tokens: Flight Deck `#0B1220`, Cloud Canvas `#F3F6FA`, Paper White `#FCFDFE`, Route Teal `#287F78`, Signal Amber `#E7A33B` and Alert Coral `#D95D52`.
- Maintain at least 16px mobile input text, 44px interactive hit targets, visible keyboard focus and WCAG AA primary-text contrast.
- Support 1440x900, 1024x768, 390x844, 375x812 and 812x375 without horizontal scrolling.
- Preserve unrelated working-tree changes; never reset or clean the repository.
- Do not configure or invent Git identity. If `user.name` or `user.email` is absent, skip commit commands and report the staged/uncommitted files at the checkpoint.

## File Structure

```text
frontend/src/features/journey/
├── model.ts                    # Session domain types, reducer and derived phase/progress helpers
├── model.test.ts               # Reducer and SSE-event transition tests
├── sseContract.ts              # Additive SSE normalization and optional metric/trip-state types
├── sseContract.test.ts         # Current and future backend payload compatibility tests
├── viewModel.ts                # Pure Markdown-to-budget/day/document view-model derivation
├── viewModel.test.ts           # Parser regression tests for Chinese and English output
├── AppShell.tsx                # Three-column shell and mobile overlay ownership
├── SessionRail.tsx             # Journey/session navigation and account actions
├── MissionBrief.tsx            # Normalized trip form and example brief selection
├── JourneyCommandStrip.tsx     # Pure route manifest and run-state summary
├── OrchestrationTimeline.tsx   # Live graph/worker progress and real metrics only
├── Composer.tsx                # Follow-up input, submit and stop controls
├── ItineraryWorkspace.tsx      # Overview/daily/budget/document/trace result tabs
├── JourneyContextPanel.tsx     # Map, route manifest and trace drawer/panel
├── mapConfig.ts                # Safe AMap environment configuration reader
├── components.test.tsx         # Core interaction and accessibility tests
└── index.ts                    # Stable feature exports
frontend/src/test/setup.ts      # jest-dom registration and browser API stubs
frontend/src/pages/AIPage.tsx   # Network orchestration container using journey feature modules
frontend/src/pages/AIPage.test.tsx
frontend/src/components/TripResult.tsx
frontend/src/components/MapView.tsx
frontend/src/hooks/useSSE.ts
frontend/src/types/index.ts
frontend/src/index.css
frontend/vite.config.ts
frontend/package.json
docs/backend-improvements-for-atlas-v2.md
```

---

### Task 1: Establish the Test Harness and Journey Session Model

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/vite.config.ts`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/src/features/journey/model.ts`
- Create: `frontend/src/features/journey/model.test.ts`

**Interfaces:**
- Produces: `JourneyPhase`, `TripForm`, `JourneyStep`, `JourneySession`, `JourneyState`, `JourneyAction`, `createJourneySession()`, `journeyReducer()`, `journeyProgress()` and `activeJourneySession()`.
- `JourneyStep` contains optional `latencyMs`, `promptTokens`, `completionTokens` and `estimatedCostCny`; absent values stay `undefined`.

- [ ] **Step 1: Install the test dependencies and expose scripts**

Run:

```powershell
cd frontend
npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Add these exact scripts to `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Add this test block to the existing Vite configuration:

```ts
test: {
  environment: 'jsdom',
  setupFiles: './src/test/setup.ts',
  css: true,
},
```

- [ ] **Step 2: Add browser test setup**

Create `frontend/src/test/setup.ts` with:

```ts
import '@testing-library/jest-dom/vitest'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

Element.prototype.scrollTo = () => undefined
```

- [ ] **Step 3: Write failing reducer tests**

Cover these exact transitions in `model.test.ts`:

```ts
it('moves idle -> planning -> ready without inventing metrics', () => {
  const session = createJourneySession({ id: 'journey-1' })
  let state = { sessions: [session], activeId: session.id }
  state = journeyReducer(state, { type: 'submit', id: session.id, message: '上海到东京五天' })
  expect(activeJourneySession(state).phase).toBe('planning')
  state = journeyReducer(state, { type: 'setPlan', id: session.id, names: ['推荐航班'] })
  state = journeyReducer(state, {
    type: 'stepDone', id: session.id, name: '推荐航班', patch: { worker: 'flight', summary: '已完成' },
  })
  expect(activeJourneySession(state).steps[0].latencyMs).toBeUndefined()
  state = journeyReducer(state, { type: 'complete', id: session.id, reply: '# 东京方案', conversationId: 8 })
  expect(activeJourneySession(state).phase).toBe('ready')
})

it('preserves completed work when a run is cancelled', () => {
  const session = createJourneySession({ id: 'journey-2', phase: 'planning' })
  const state = journeyReducer(
    { sessions: [session], activeId: session.id },
    { type: 'cancel', id: session.id, reason: '用户已停止生成' },
  )
  expect(activeJourneySession(state).phase).toBe('cancelled')
  expect(activeJourneySession(state).statusMessage).toBe('用户已停止生成')
})
```

- [ ] **Step 4: Run the model test and verify failure**

Run: `npm test -- src/features/journey/model.test.ts`

Expected: FAIL because `model.ts` and its exports do not exist.

- [ ] **Step 5: Implement the typed reducer**

Implement the exported types and immutable reducer. The default session must contain this shape:

```ts
{
  id,
  title: '未命名旅程',
  conversationId: null,
  messages: [],
  steps: [],
  finalReply: '',
  locations: [],
  phase: 'idle',
  graphNode: '',
  statusMessage: '',
  form: { origin: '上海', destination: '东京', date: defaultDate(), days: 5, people: 2, budget: 8000 },
}
```

`journeyProgress(steps)` returns `0` for an empty array and otherwise rounds `(done + failed) / total * 100`.

- [ ] **Step 6: Run the model tests and full frontend test suite**

Run:

```powershell
npm test -- src/features/journey/model.test.ts
npm test
```

Expected: all tests PASS.

- [ ] **Step 7: Create a checkpoint commit when Git identity exists**

```powershell
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/src/test/setup.ts frontend/src/features/journey/model.ts frontend/src/features/journey/model.test.ts
git commit -m "test: establish journey session model"
```

---

### Task 2: Normalize Current and Future SSE Contracts

**Files:**
- Create: `frontend/src/features/journey/sseContract.ts`
- Create: `frontend/src/features/journey/sseContract.test.ts`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/hooks/useSSE.ts`

**Interfaces:**
- Consumes: `JourneyAction` and `Location`.
- Produces: `TripState`, `NormalizedSSEEvent`, `normalizeSSEEvent(value: unknown): NormalizedSSEEvent | null` and `eventToJourneyActions(event, sessionId): JourneyAction[]`.

- [ ] **Step 1: Write compatibility tests**

Add tests proving that the current payload stays valid and future fields are preserved only when supplied:

```ts
it('normalizes the current step_done event without metrics', () => {
  const event = normalizeSSEEvent({ event: 'step_done', name: '推荐酒店', worker: 'hotel', tool_calls: 2 })
  expect(event?.event).toBe('step_done')
  expect(event?.toolCalls).toBe(2)
  expect(event?.latencyMs).toBeUndefined()
})

it('accepts additive metrics and structured trip state', () => {
  const step = normalizeSSEEvent({
    event: 'step_done', name: '推荐景点', latency_ms: 1840,
    prompt_tokens: 630, completion_tokens: 412, estimated_cost_cny: 0.012,
  })
  const done = normalizeSSEEvent({ event: 'done', reply: '# 行程', trip_state: { itinerary: [], locations: [] } })
  expect(step?.estimatedCostCny).toBe(0.012)
  expect(done?.tripState?.itinerary).toEqual([])
})
```

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- src/features/journey/sseContract.test.ts`

Expected: FAIL because normalization functions do not exist.

- [ ] **Step 3: Implement defensive normalization**

Validate `event` against the known event-name union, accept only finite numbers for metric fields and accept `trip_state` only as an object. Map snake_case backend fields to camelCase view-model fields. Return `null` for arrays, strings, malformed JSON values and unknown event names.

- [ ] **Step 4: Route parsed SSE values through the normalizer**

Change the private line parser in `useSSE.ts` to call `normalizeSSEEvent(JSON.parse(...))`. Keep abort, premature-disconnect and `onDone` behavior unchanged.

- [ ] **Step 5: Verify contract tests and build**

Run:

```powershell
npm test -- src/features/journey/sseContract.test.ts
npm run build
```

Expected: tests PASS and TypeScript/Vite build exits 0.

- [ ] **Step 6: Create a checkpoint commit when Git identity exists**

```powershell
git add frontend/src/features/journey/sseContract.ts frontend/src/features/journey/sseContract.test.ts frontend/src/types/index.ts frontend/src/hooks/useSSE.ts
git commit -m "refactor: normalize journey stream events"
```

---

### Task 3: Extract Markdown Result View Models

**Files:**
- Create: `frontend/src/features/journey/viewModel.ts`
- Create: `frontend/src/features/journey/viewModel.test.ts`
- Modify: `frontend/src/components/TripResult.tsx`

**Interfaces:**
- Produces: `BudgetItem`, `DayPlanItem`, `DayPlan`, `ItineraryViewModel`, `parseBudget()`, `parseDays()` and `buildItineraryViewModel()`.
- `buildItineraryViewModel(markdown)` returns `{ budgetItems, budgetTotal, days, hasStructuredOverview, markdown }`.

- [ ] **Step 1: Write parser regression tests**

Use fixed Markdown fixtures in the test file:

```ts
it('parses Chinese budget tables and day schedules', () => {
  const view = buildItineraryViewModel(`## 预算\n| 类别 | 金额 |\n| --- | --- |\n| 航班 | ¥2,400 |\n| 酒店 | ¥1,800 |\n| **总计** | ¥4,200 |\n\n## 日程\n### 第 1 天 抵达东京\n| 时间 | 安排 |\n| --- | --- |\n| 15:00 | 入住银座酒店 |`)
  expect(view.budgetTotal).toBe(4200)
  expect(view.days[0].items[0]).toEqual({ time: '15:00', description: '入住银座酒店' })
})

it('falls back to the document view for malformed markdown', () => {
  const view = buildItineraryViewModel('这是一段没有结构标题的旅行建议')
  expect(view.hasStructuredOverview).toBe(false)
  expect(view.markdown).toContain('旅行建议')
})
```

- [ ] **Step 2: Verify parser tests fail**

Run: `npm test -- src/features/journey/viewModel.test.ts`

Expected: FAIL because `viewModel.ts` does not exist.

- [ ] **Step 3: Move and harden the pure parser functions**

Move the existing `findSection`, budget parsing and day parsing out of `TripResult.tsx`. Preserve deduplication, total detection, the 8-category cap and 14-day cap. Ensure a Markdown table separator never becomes an itinerary item.

- [ ] **Step 4: Convert `TripResult` to a compatibility wrapper**

Keep the existing props unchanged. Compute `buildItineraryViewModel(markdown)` once and pass it to the new workspace in Task 7 after that component exists; until Task 7, render the same current UI using imported pure helpers.

- [ ] **Step 5: Run parser tests and build**

Run:

```powershell
npm test -- src/features/journey/viewModel.test.ts
npm run build
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Create a checkpoint commit when Git identity exists**

```powershell
git add frontend/src/features/journey/viewModel.ts frontend/src/features/journey/viewModel.test.ts frontend/src/components/TripResult.tsx
git commit -m "refactor: extract itinerary view models"
```

---

### Task 4: Build the Responsive Application Shell and Session Rail

**Files:**
- Create: `frontend/src/features/journey/AppShell.tsx`
- Create: `frontend/src/features/journey/SessionRail.tsx`
- Create: `frontend/src/features/journey/components.test.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- `AppShell` consumes `rail`, `workspace`, `context`, `railOpen`, `contextOpen`, `onCloseRail` and `onCloseContext`.
- `SessionRail` consumes local sessions, server conversations, authentication state and explicit navigation/account callbacks; it performs no network calls.

- [ ] **Step 1: Write shell interaction tests**

```tsx
it('labels and closes both mobile drawers', async () => {
  const user = userEvent.setup()
  const closeRail = vi.fn()
  const closeContext = vi.fn()
  render(<AppShell rail={<div>会话</div>} workspace={<main>工作区</main>} context={<div>地图</div>} railOpen contextOpen onCloseRail={closeRail} onCloseContext={closeContext} />)
  await user.click(screen.getByRole('button', { name: '关闭旅程列表' }))
  await user.click(screen.getByRole('button', { name: '关闭地图与执行详情' }))
  expect(closeRail).toHaveBeenCalledOnce()
  expect(closeContext).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: Verify the component test fails**

Run: `npm test -- src/features/journey/components.test.tsx`

Expected: FAIL because `AppShell` does not exist.

- [ ] **Step 3: Implement shell and rail semantics**

Use `<aside aria-label="旅程列表">`, `<main id="journey-workspace">` and `<aside aria-label="地图与执行详情">`. Mobile overlays close from a named close button and backdrop. Apply `aria-hidden` to closed drawers and restore ordinary document flow at desktop breakpoints.

- [ ] **Step 4: Add shell tokens and layout CSS**

Define root semantic variables for the six specified brand colors, surface/text/border states, spacing, radii, shadows and 120/180/240ms motion. Implement desktop three columns, tablet compact rail plus context drawer and mobile single column. Do not use hover transforms that shift layout.

- [ ] **Step 5: Run the shell tests**

Run: `npm test -- src/features/journey/components.test.tsx`

Expected: PASS.

- [ ] **Step 6: Create a checkpoint commit when Git identity exists**

```powershell
git add frontend/src/features/journey/AppShell.tsx frontend/src/features/journey/SessionRail.tsx frontend/src/features/journey/components.test.tsx frontend/src/index.css
git commit -m "feat: add atlas journey application shell"
```

---

### Task 5: Build the Mission Brief and Journey Command Strip

**Files:**
- Create: `frontend/src/features/journey/MissionBrief.tsx`
- Create: `frontend/src/features/journey/JourneyCommandStrip.tsx`
- Modify: `frontend/src/features/journey/components.test.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- `MissionBrief` consumes `form`, `onChange`, `onSubmit`, `onUseSuggestion` and `disabled`.
- `JourneyCommandStrip` consumes `form`, `phase`, `progress` and optional `graphNode`; it never mutates state.

- [ ] **Step 1: Add failing mission-form tests**

```tsx
it('submits a normalized travel brief from the mission form', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  render(<MissionBrief form={{ origin: '上海', destination: '东京', date: '2026-09-08', days: 5, people: 2, budget: 8000 }} onChange={() => undefined} onSubmit={onSubmit} onUseSuggestion={() => undefined} disabled={false} />)
  await user.click(screen.getByRole('button', { name: '开始规划旅程' }))
  expect(onSubmit).toHaveBeenCalledWith(expect.stringContaining('上海'))
  expect(onSubmit).toHaveBeenCalledWith(expect.stringContaining('东京'))
})
```

- [ ] **Step 2: Verify the new test fails**

Run: `npm test -- src/features/journey/components.test.tsx`

Expected: FAIL because `MissionBrief` does not exist.

- [ ] **Step 3: Implement the mission brief**

Use real `<label>` elements for origin, destination, departure date, days, people and per-person budget. Clamp days to 1-30, people to 1-20 and budget to a non-negative integer. Use the three approved example briefs and expose them as buttons, not non-interactive cards.

- [ ] **Step 4: Implement the signature command strip**

Render origin and destination as the dominant route, then date, days, party and budget as compact manifest cells. Render one of these labels: `准备任务`, `正在编排`, `方案就绪`, `需要处理`, `已停止`. The planning state includes a progress bar with `aria-valuenow`.

- [ ] **Step 5: Add responsive styling and verify tests**

At desktop, render the manifest as one horizontal strip. Below 768px, use a two-row grid with origin/destination spanning the width. Run `npm test -- src/features/journey/components.test.tsx` and expect PASS.

- [ ] **Step 6: Create a checkpoint commit when Git identity exists**

```powershell
git add frontend/src/features/journey/MissionBrief.tsx frontend/src/features/journey/JourneyCommandStrip.tsx frontend/src/features/journey/components.test.tsx frontend/src/index.css
git commit -m "feat: add journey mission command surface"
```

---

### Task 6: Build Live Orchestration, Recovery and Composer Controls

**Files:**
- Create: `frontend/src/features/journey/OrchestrationTimeline.tsx`
- Create: `frontend/src/features/journey/Composer.tsx`
- Modify: `frontend/src/features/journey/components.test.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- `OrchestrationTimeline` consumes `steps`, `graphNode`, `phase`, `statusMessage`, `onRetry` and `onEditBrief`.
- `Composer` consumes `value`, `onChange`, `onSubmit`, `onStop`, `isStreaming`, `disabled` and `suggestions`.

- [ ] **Step 1: Add failing state and keyboard tests**

```tsx
it('shows only metrics supplied by the backend', () => {
  render(<OrchestrationTimeline steps={[{ name: '推荐景点', worker: 'attraction', status: 'done', summary: '完成', locations: [], iterations: 2, toolCalls: 1 }]} graphNode="" phase="ready" statusMessage="" onRetry={() => undefined} onEditBrief={() => undefined} />)
  expect(screen.getByText('2 轮分析')).toBeInTheDocument()
  expect(screen.queryByText(/token/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/¥0\./)).not.toBeInTheDocument()
})

it('submits on Enter and keeps Shift+Enter as a newline', async () => {
  const onSubmit = vi.fn()
  const user = userEvent.setup()
  render(<Composer value="缩短第二天行程" onChange={() => undefined} onSubmit={onSubmit} onStop={() => undefined} isStreaming={false} disabled={false} suggestions={[]} />)
  await user.type(screen.getByRole('textbox'), '{Enter}')
  expect(onSubmit).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- src/features/journey/components.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the execution timeline and recovery center**

Give each step a non-color status label and icon. Show iterations/tool calls when greater than zero. Show latency, total tokens and estimated CNY cost only when the corresponding optional values are defined. In `error` and `cancelled`, preserve the timeline and render explicit retry/edit-brief actions.

- [ ] **Step 4: Implement composer semantics**

Use a `<textarea>` with `aria-label="补充或修改旅行需求"`. Enter submits a non-empty trimmed value, Shift+Enter inserts a newline, and IME composition never submits. During streaming, replace the send control with a 44px stop control named `停止生成`.

- [ ] **Step 5: Add ARIA live updates and motion rules**

Expose graph-node and latest-step state through a polite live region. Add restrained timeline reveal and active-step pulse, then disable both in `@media (prefers-reduced-motion: reduce)`.

- [ ] **Step 6: Run tests and create checkpoint commit when possible**

Run `npm test -- src/features/journey/components.test.tsx`; expect PASS.

```powershell
git add frontend/src/features/journey/OrchestrationTimeline.tsx frontend/src/features/journey/Composer.tsx frontend/src/features/journey/components.test.tsx frontend/src/index.css
git commit -m "feat: show live agent orchestration states"
```

---

### Task 7: Build the Itinerary Workspace and Compatibility Wrapper

**Files:**
- Create: `frontend/src/features/journey/ItineraryWorkspace.tsx`
- Modify: `frontend/src/features/journey/components.test.tsx`
- Modify: `frontend/src/components/TripResult.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- `ItineraryWorkspace` consumes `viewModel`, `city`, `steps`, `locations`, `onSearchMap` and optional `onExport`.
- Result tabs are `overview`, `daily`, `budget`, `document` and `trace`; a tab is disabled when its corresponding real data is absent.

- [ ] **Step 1: Add failing tab and export tests**

```tsx
it('switches itinerary tabs and forwards export actions', async () => {
  const user = userEvent.setup()
  const onExport = vi.fn()
  const viewModel = buildItineraryViewModel('## 日程\n### Day 1 抵达\n- 15:00：入住酒店')
  render(<ItineraryWorkspace viewModel={viewModel} city="东京" steps={[]} locations={[]} onSearchMap={() => undefined} onExport={onExport} />)
  await user.click(screen.getByRole('tab', { name: '完整方案' }))
  expect(screen.getByRole('tabpanel')).toHaveTextContent('入住酒店')
  await user.click(screen.getByRole('button', { name: '导出 PDF' }))
  expect(onExport).toHaveBeenCalledWith('pdf')
})
```

- [ ] **Step 2: Verify test failure**

Run: `npm test -- src/features/journey/components.test.tsx`

Expected: FAIL because `ItineraryWorkspace` does not exist.

- [ ] **Step 3: Implement real-data-only result tabs**

The overview combines the command summary, budget total and first-day highlights. Daily cards use time/place/transit hierarchy and a named map button. Budget uses CSS bars computed from real parsed values. Agent Trace uses the same real `JourneyStep[]`. Document renders `SafeMarkdown` and remains the fallback for malformed output.

- [ ] **Step 4: Preserve copy and export behavior**

Copy uses `navigator.clipboard.writeText(viewModel.markdown)` and reports `已复制` for 1600ms. The PDF and Markdown buttons appear only when `onExport` exists. Structured replace/delete/regenerate buttons are not rendered because the backend mutation endpoints do not yet exist.

- [ ] **Step 5: Convert `TripResult` into a stable wrapper**

Keep the current `TripResult` public props and delegate to `ItineraryWorkspace`, so any other caller remains source-compatible.

- [ ] **Step 6: Verify and checkpoint**

Run:

```powershell
npm test -- src/features/journey/components.test.tsx
npm run build
```

Expected: PASS.

```powershell
git add frontend/src/features/journey/ItineraryWorkspace.tsx frontend/src/features/journey/components.test.tsx frontend/src/components/TripResult.tsx frontend/src/index.css
git commit -m "feat: add structured itinerary workspace"
```

---

### Task 8: Build the Journey Context Panel and Secure AMap Configuration

**Files:**
- Create: `frontend/src/features/journey/JourneyContextPanel.tsx`
- Create: `frontend/src/features/journey/mapConfig.ts`
- Create: `frontend/src/features/journey/mapConfig.test.ts`
- Modify: `frontend/src/components/MapView.tsx`
- Modify: `frontend/src/features/journey/components.test.tsx`
- Modify: `frontend/src/index.css`
- Modify: `.env.example`

**Interfaces:**
- `readAMapConfig(env)` returns `{ ok: true, key, securityCode }` or `{ ok: false, message }`.
- `JourneyContextPanel` consumes `form`, `locations`, `steps`, `phase`, `progress`, `onMapReady` and `onClose`.

- [ ] **Step 1: Write failing map configuration tests**

```ts
it('rejects missing AMap browser credentials instead of using checked-in fallbacks', () => {
  expect(readAMapConfig({})).toEqual({
    ok: false,
    message: '请在 frontend/.env.local 配置 VITE_AMAP_KEY 和 VITE_AMAP_SECURITY_CODE',
  })
})

it('accepts explicitly configured credentials', () => {
  expect(readAMapConfig({ VITE_AMAP_KEY: 'key', VITE_AMAP_SECURITY_CODE: 'code' })).toEqual({
    ok: true, key: 'key', securityCode: 'code',
  })
})
```

- [ ] **Step 2: Verify test failure**

Run: `npm test -- src/features/journey/mapConfig.test.ts`

Expected: FAIL because `readAMapConfig` does not exist.

- [ ] **Step 3: Remove hard-coded AMap secrets**

Implement the discriminated union and use it in `loadAMap()`. If configuration is missing, reject with the exact actionable message from the test. Keep the itinerary usable and show the existing map error surface.

- [ ] **Step 4: Document frontend environment variables**

Add these names to `.env.example` without values:

```dotenv
VITE_AMAP_KEY=
VITE_AMAP_SECURITY_CODE=
```

- [ ] **Step 5: Implement context-panel composition**

Render `MapView` first, then the route manifest and execution trace. Desktop keeps the panel persistent. Tablet/mobile use the shell drawer; the close button is always visible and focus returns to the launcher after close.

- [ ] **Step 6: Verify and checkpoint**

Run:

```powershell
npm test -- src/features/journey/mapConfig.test.ts src/features/journey/components.test.tsx
npm run build
```

Expected: PASS and no embedded AMap key remains under `frontend/src`.

Run: `rg "67b0518|654b582" frontend/src`

Expected: no matches.

```powershell
git add .env.example frontend/src/features/journey/JourneyContextPanel.tsx frontend/src/features/journey/mapConfig.ts frontend/src/features/journey/mapConfig.test.ts frontend/src/components/MapView.tsx frontend/src/features/journey/components.test.tsx frontend/src/index.css
git commit -m "fix: secure atlas map configuration"
```

---

### Task 9: Integrate the Feature Modules into `AIPage`

**Files:**
- Create: `frontend/src/features/journey/index.ts`
- Modify: `frontend/src/pages/AIPage.tsx`
- Create: `frontend/src/pages/AIPage.test.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes all public exports from `frontend/src/features/journey/index.ts`.
- `AIPage` remains the only owner of authenticated history requests, exports and `useSSE().startStream/stopStream`.

- [ ] **Step 1: Write an integration-state test with mocked network hooks**

Mock `useSSE` so `startStream` captures callbacks and mock `api.get` to resolve `[]`. Assert the page starts at the mission brief, enters planning after submission, enters ready after a real `done.reply`, and enters cancelled after `停止生成`. Use accessible role/name queries rather than CSS selectors.

- [ ] **Step 2: Verify integration test failure**

Run: `npm test -- src/pages/AIPage.test.tsx`

Expected: FAIL until `AIPage` renders the new feature modules and phase labels.

- [ ] **Step 3: Replace local types and reducer with the feature model**

Delete the duplicated `Step`, `ChatMessage`, `TripForm`, `Session`, `SessionState`, `SessionAction`, `createSession`, `uniqueLocations`, `sessionReducer` and `progressOf` definitions from `AIPage.tsx`. Import the canonical equivalents from `features/journey`.

- [ ] **Step 4: Map every SSE event through `eventToJourneyActions`**

Continue updating the map with real `locations`. On `done`, store `reply`, optional `tripState` and `conversationId`; never create a synthetic structured itinerary from Markdown. On stream error, dispatch the `error` phase while retaining steps and draft. On local abort, dispatch `cancelled` before calling `stopStream()`.

- [ ] **Step 5: Compose the four explicit page states**

Use `AppShell` for all phases. Idle renders `MissionBrief`; planning renders command strip, request and timeline; ready renders command strip, messages and itinerary workspace; error/cancelled renders the recovery center with completed work. Keep mobile rail/map launchers in the workspace header.

- [ ] **Step 6: Preserve existing product behavior**

Keep guest-token fallback, authenticated conversation refresh/load, new local session, session deletion, logout, theme toggle, PDF/Markdown export and AMap search. Authentication failure opens the existing auth modal without deleting the current draft.

- [ ] **Step 7: Verify integration, full tests and build**

Run:

```powershell
npm test -- src/pages/AIPage.test.tsx
npm test
npm run build
```

Expected: all tests PASS and build exits 0.

- [ ] **Step 8: Confirm decomposition**

Run: `(Get-Content frontend/src/pages/AIPage.tsx).Count`

Expected: `AIPage.tsx` is below 400 lines and contains no presentation-only child component definitions.

- [ ] **Step 9: Create a checkpoint commit when Git identity exists**

```powershell
git add frontend/src/features/journey/index.ts frontend/src/pages/AIPage.tsx frontend/src/pages/AIPage.test.tsx frontend/src/index.css
git commit -m "feat: integrate atlas frontend v2 workspace"
```

---

### Task 10: Complete Accessibility, Responsive and Browser Visual QA

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/features/journey/AppShell.tsx`
- Modify: `frontend/src/features/journey/JourneyContextPanel.tsx`
- Modify: `frontend/src/features/journey/SessionRail.tsx`
- Modify: `frontend/src/features/journey/components.test.tsx`

**Interfaces:**
- Produces the final responsive behavior and keyboard/focus contract from the design spec.

- [ ] **Step 1: Add focus-restoration and accessible-state tests**

Add tests that open/close each drawer, verify focus returns to its launcher, verify active tabs have `aria-selected="true"`, and verify planning progress exposes `aria-valuenow`.

- [ ] **Step 2: Verify the accessibility tests fail before final adjustments**

Run: `npm test -- src/features/journey/components.test.tsx`

Expected: at least the focus-restoration assertions FAIL.

- [ ] **Step 3: Implement focus containment and restoration**

When a drawer opens, focus its close button. Tab and Shift+Tab wrap between the drawer's first and last focusable elements. Escape closes it. On close, focus the launcher element supplied by ref.

- [ ] **Step 4: Complete responsive CSS**

Verify desktop at 1280px+, tablet at 768-1279px, mobile below 768px and low-height landscape. Add `min-width: 0` to grid/flex children, `overflow-wrap: anywhere` for generated text and safe-area padding for the sticky composer.

- [ ] **Step 5: Run automated checks**

Run:

```powershell
npm test
npm run build
```

Expected: PASS with zero TypeScript errors.

- [ ] **Step 6: Run browser QA at required viewports**

Start `npm run dev -- --host 127.0.0.1`, then inspect 1440x900, 1024x768, 390x844, 375x812 and 812x375. At every size verify no horizontal scroll, all primary controls are reachable, drawers close, composer remains visible, and the map failure state does not block itinerary content.

- [ ] **Step 7: Check themes, reduced motion and console**

Repeat the ready state in light and dark themes. Emulate `prefers-reduced-motion: reduce` and verify no timeline pulse or smooth scrolling remains. Confirm the browser console contains no application errors.

- [ ] **Step 8: Create a checkpoint commit when Git identity exists**

```powershell
git add frontend/src/index.css frontend/src/features/journey/AppShell.tsx frontend/src/features/journey/JourneyContextPanel.tsx frontend/src/features/journey/SessionRail.tsx frontend/src/features/journey/components.test.tsx
git commit -m "fix: polish atlas responsive accessibility"
```

---

### Task 11: Document the Backend Work That Unlocks Full Atlas V2

**Files:**
- Create: `docs/backend-improvements-for-atlas-v2.md`

**Interfaces:**
- Produces a recruiter-oriented backend roadmap; it does not alter backend behavior.

- [ ] **Step 1: Write the prioritized backend roadmap**

Create sections with evidence, current risk, smallest credible implementation, acceptance checks and interview value for exactly these items:

1. Replace the manually replayed chain in `chat_router.py` with events from the compiled LangGraph graph.
2. Return complete optional `trip_state` in the final SSE event.
3. Emit real per-step latency, prompt/completion tokens, retries and estimated cost.
4. Add backend run cancellation by `run_id`.
5. Add structured itinerary item delete/replace and day-regenerate endpoints.
6. Connect the attraction worker to backend AMap POI retrieval with TTL cache and graceful fallback.
7. Split fast offline unit tests, integration tests and golden-dataset Eval regression.
8. Remove exposed secrets, narrow CORS and fail production startup when the JWT secret is still the default.

- [ ] **Step 2: Add a practical autumn-recruitment order**

Rank the work as:

```text
★★★★★ SSE single orchestration + offline regression tests
★★★★★ real latency/token/cost observation
★★★★☆ backend AMap POI + cache
★★★★☆ structured itinerary mutations
★★★☆☆ server-side cancellation
★★★☆☆ repository/production security cleanup
```

For each item include a demonstration sentence the user can say in an interview and avoid claiming any unimplemented metric.

- [ ] **Step 3: Verify document accuracy**

Run:

```powershell
rg "chat_router|trip_state|latency|token|cancel|AMap|Eval|CORS|JWT" docs/backend-improvements-for-atlas-v2.md
rg "已完成|已经实现|提升了 [0-9]+%" docs/backend-improvements-for-atlas-v2.md
```

Expected: the first command finds every required topic; the second command has no unsupported completion or performance claims.

- [ ] **Step 4: Create a checkpoint commit when Git identity exists**

```powershell
git add docs/backend-improvements-for-atlas-v2.md
git commit -m "docs: prioritize atlas backend hardening"
```

---

### Task 12: Final Review and Verification

**Files:**
- Review all files touched in Tasks 1-11.

**Interfaces:**
- Produces a verified handoff with no claims beyond executed evidence.

- [ ] **Step 1: Run the complete frontend verification suite**

```powershell
cd frontend
npm test
npm run build
```

Expected: both commands exit 0.

- [ ] **Step 2: Run repository safety checks**

```powershell
cd ..
rg "67b0518|654b582|VITE_AMAP_KEY\s*\|\|" frontend/src
git diff --check
git status --short
```

Expected: no embedded AMap fallback secret, no whitespace errors, and only intentional/unrelated pre-existing working-tree changes.

- [ ] **Step 3: Perform a code review**

Review for reducer correctness, stale closure risks, abort/done races, event normalization, XSS-safe map labels, keyboard behavior, missing accessible names, fabricated metrics and accidental regressions in authentication/history/export.

- [ ] **Step 4: Re-run targeted checks after review fixes**

Run the smallest relevant test file after each fix, then run `npm test` and `npm run build` once more.

- [ ] **Step 5: Prepare the final handoff**

Report changed files, verified commands and remaining backend dependencies. State clearly that Git commits were not created if local identity remains unset; do not alter identity settings.
