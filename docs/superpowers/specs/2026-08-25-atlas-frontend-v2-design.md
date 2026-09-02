# Atlas Frontend V2 Design

**Date:** 2026-08-25

**Goal:** Turn the existing Atlas travel-planning UI into a distinctive, portfolio-grade journey intelligence workspace that presents real multi-agent orchestration clearly, remains useful on mobile, and can evolve toward structured itinerary editing without blocking on unfinished backend work.

## Product Positioning

Atlas is a travel intelligence workspace for a job-seeking portfolio project. Its single job is to turn a travel brief into an understandable, inspectable and reusable itinerary while demonstrating how multiple agents collaborate.

The interface must communicate two ideas at once:

1. The traveler receives a calm, premium planning experience.
2. A technical reviewer can see the orchestration, tools, progress and evidence behind the answer.

The selected direction is **70% aviation operations console + 30% premium travel editorial**. The existing navy planning rail, technical map texture, amber signal color and teal route color remain the visual foundation.

## Approaches Considered

### Selected: Atlas Operations Workspace

A state-driven application shell that changes from mission briefing to live orchestration to an itinerary workspace. This direction preserves the project's strongest differentiator: the multi-agent system is visible without overwhelming the traveler.

### Rejected: Luxury Travel Magazine

Large photography and editorial typography would produce attractive screenshots but would hide the technical value of the project and make live planning states harder to understand.

### Rejected: Enterprise Agent Dashboard

A dense trace-first dashboard would demonstrate engineering depth but would feel detached from the travel use case and would be less approachable to general reviewers.

## Visual System

### Palette

- **Flight Deck:** `#0B1220` — primary navigation and dark technical surfaces.
- **Cloud Canvas:** `#F3F6FA` — main light workspace.
- **Paper White:** `#FCFDFE` — cards and readable content surfaces.
- **Route Teal:** `#287F78` — selected routes, completion and map relationships.
- **Signal Amber:** `#E7A33B` — active planning state and primary emphasis.
- **Alert Coral:** `#D95D52` — destructive and failure states only.

Colors are exposed through semantic CSS tokens. Components do not introduce page-local brand colors.

### Typography

- Display headings use the existing characterful display family with restrained weight and tighter tracking.
- Body content uses the existing readable sans-serif stack at a 16px base size.
- Operational labels, timings and metadata use a compact utility treatment with tabular numerals.
- Long itinerary content stays within a readable measure of 70-78 characters.

### Signature Element

The memorable element is the **Journey Command Strip**: a route manifest connecting origin, destination, dates, party and budget with the currently active orchestration state. It appears in the mission briefing and condenses into a sticky summary during planning and result review.

## Application States

The page is modeled as four explicit states instead of a collection of unrelated booleans.

### Idle — Mission Brief

- Route, date, days, party and budget form.
- Three high-quality example briefs.
- Clear explanation of the five collaborating agent roles.
- Login is not required to explore the interface; authentication is requested only for saving, history and export.

### Planning — Live Orchestration

- User request remains visible at the top of the conversation.
- A compact command strip shows the active trip constraints.
- The center workspace shows the live execution timeline.
- The context panel shows map markers and an agent trace summary.
- Stop control remains reachable and visibly changes the state to cancelled.

### Ready — Journey Workspace

- Result navigation: Overview, Daily Plan, Budget, Map and Agent Trace.
- Daily itinerary cards use clear time, place and transit hierarchy.
- Budget communicates total, category distribution and remaining budget.
- Existing backend output continues to render safely from Markdown.
- Edit affordances are shown only for actions that can be completed with current APIs; structured replace/delete/regenerate actions are enabled when backend contracts are added.

### Error or Cancelled — Recovery Center

- Error message explains whether the problem is authentication, connection, configuration or generation failure.
- The primary recovery action is explicit: retry, log in, configure the service or edit the brief.
- Partial completed steps remain visible instead of disappearing.

## Information Architecture

```text
AppShell
├── SessionRail
│   ├── BrandBlock
│   ├── NewJourneyAction
│   ├── ConversationList
│   └── AccountControls
├── JourneyWorkspace
│   ├── WorkspaceHeader
│   ├── MissionBrief
│   ├── ConversationFeed
│   ├── OrchestrationTimeline
│   ├── ItineraryWorkspace
│   └── Composer
└── JourneyContextPanel
    ├── MapCanvas
    ├── RouteManifest
    └── AgentTrace
```

`AIPage.tsx` becomes an orchestration container. Presentation-heavy sections move into focused components with explicit props.

## Component Responsibilities

### `AppShell`

Owns the three-column desktop layout, mobile drawers and theme-level structural behavior.

### `SessionRail`

Owns conversation navigation, new journey creation and account controls. It does not own chat network state.

### `MissionBrief`

Owns the initial route form and suggestions. It emits one normalized travel brief.

### `JourneyCommandStrip`

Displays route constraints and the current run state. It remains a pure view component.

### `OrchestrationTimeline`

Displays graph nodes, worker steps, parallel groups, iterations and tool calls from SSE events. Future latency, tokens and cost fields are additive.

### `ItineraryWorkspace`

Owns result tabs and composes daily plan, budget, document and trace views. It does not parse network events.

### `JourneyContextPanel`

Owns map presentation and trace summaries. On tablet and mobile it becomes a modal drawer with focus trapping and a clear close action.

### `Composer`

Owns draft input, keyboard submission, stop action and contextual follow-up suggestions.

## Data and State Flow

```text
MissionBrief
  -> normalized TravelBrief
  -> session reducer creates a planning session
  -> useSSE consumes typed events
  -> session reducer updates graph/step/location/result state
  -> workspace and context panel render the same session model
```

The reducer remains the single source of truth for session state. Components receive derived view models and do not duplicate SSE interpretation.

The current backend `done.reply` response remains supported. A future `done.trip_state` field is optional and progressively enhances structured views.

## Backend Contract Needed for Full Experience

The frontend redesign remains compatible with current endpoints. The following additive fields unlock the complete experience:

```json
{
  "event": "step_done",
  "run_id": "run_123",
  "name": "推荐景点",
  "worker": "attraction",
  "status": "done",
  "latency_ms": 1840,
  "prompt_tokens": 630,
  "completion_tokens": 412,
  "estimated_cost_cny": 0.012,
  "tool_calls": 1,
  "locations": []
}
```

```json
{
  "event": "done",
  "reply": "markdown fallback",
  "trip_state": {
    "flights": [],
    "hotels": [],
    "attractions": [],
    "itinerary": [],
    "budget_items": [],
    "locations": []
  }
}
```

Required future mutation endpoints:

- `DELETE /trips/{trip_id}/items/{item_id}`
- `PATCH /trips/{trip_id}/items/{item_id}`
- `POST /trips/{trip_id}/days/{day}/regenerate`
- `POST /chat/runs/{run_id}/cancel`

## Responsive Behavior

### Desktop — 1280px and above

- Persistent session rail.
- Fluid central workspace.
- Persistent context panel sized for a usable map.

### Tablet — 768px to 1279px

- Session rail remains compact or collapsible.
- Context panel becomes a right drawer.
- Workspace maintains readable content width.

### Mobile — below 768px

- Single-column workspace.
- Session navigation opens as a left drawer.
- Map and trace open as a bottom sheet or full-height drawer.
- Composer respects bottom safe-area insets.
- Form controls use at least 16px input text and 44px hit targets.

### Low-height Landscape

- Header and composer become compact.
- Decorative copy is reduced.
- Map drawer uses the available height without hiding its close control.

## Interaction and Motion

- Shared motion tokens range from 120ms to 240ms.
- Motion communicates state changes, drawer continuity and completion.
- Layout-shifting hover transforms are not used.
- `prefers-reduced-motion` removes non-essential animation and preserves immediate state changes.
- Buttons provide visible hover, focus, active and disabled states in both themes.

## Accessibility

- All icon controls have accessible names.
- Focus remains visible and is not hidden behind sticky UI.
- Drawers and modals trap focus and restore it on close.
- Semantic headings follow a logical hierarchy.
- Status changes exposed visually also have an ARIA live-region path.
- Color is not the only indicator for pending, running, completed and failed states.
- Primary text meets WCAG AA contrast in light and dark themes.

## Error Handling

- Authentication errors lead to login without deleting the current draft.
- SSE disconnects preserve completed steps and offer retry.
- Map failure leaves itinerary content usable.
- Export failure is reported next to the export action.
- Empty or malformed Markdown falls back to a safe document panel.
- Stopping a run visibly marks it cancelled and never presents it as completed.

## Testing and Visual QA

- Reducer tests cover session creation, plan events, step completion, cancellation and done events.
- Component tests cover mission submission, tab selection, drawer behavior and error recovery.
- Production build must pass with TypeScript checks.
- Browser QA covers 1440x900, 1024x768, 390x844, 375x812 and 812x375.
- Light theme, dark theme and reduced-motion behavior are checked independently.
- Browser console must contain no application errors.
- The final page must not create horizontal scrolling at supported sizes.

## Scope

### Included

- Application-shell refinement.
- Component decomposition.
- State-driven mission, planning, ready and recovery experiences.
- Result workspace and trace presentation.
- Responsive, dark-mode and accessibility improvements.
- Backward compatibility with existing SSE and Markdown output.

### Not Included

- Replacing the backend orchestration in this frontend task.
- Implementing real structured itinerary mutation APIs.
- Adding a new state-management library.
- Adding a heavy charting or animation dependency.
- Replacing the existing map provider.
- Creating marketing pages, payment, booking or admin features.

## Success Criteria

The redesign is successful when:

1. A recruiter understands the product and its multi-agent differentiation within 15 seconds.
2. A user can submit, monitor, stop, review, map and export a journey without guessing where controls are.
3. The interface remains coherent at desktop, tablet, phone and landscape sizes.
4. The code no longer concentrates the complete visual application in one page component.
5. Existing authentication, SSE, map, history and export behavior continues to work.
6. Build, reducer tests and browser visual checks pass with no application console errors.
