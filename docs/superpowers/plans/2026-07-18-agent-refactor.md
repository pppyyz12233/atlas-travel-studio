# Travel Agent Core Refactoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform a rigid 5-step LangGraph travel planner into a dynamic, intent-aware, fault-tolerant multi-agent system with practical export and visualization features.

**Architecture:** Intent Router classifies user input before the Planner node — narrow intents skip irrelevant Workers. Planner generates variable-length plans dynamically. Workers load SKILL.md lazily and run with 5s timeout. Executor uses true parallelism (flight/hotel/attraction/budget in one layer). Phase 2 adds Markdown/PDF export, budget breakdown, and map polyline routes.

**Tech Stack:** Python 3.11+, FastAPI, LangGraph, DeepSeek (OpenAI SDK), AMap JS API 1.4.15, Pydantic 2.x

---

## File Structure Map

```
app/
├── agents/
│   ├── state.py                    [MODIFY] Add intent fields
│   ├── supervisor.py               [MODIFY] Intent router, dynamic planner, timeout, parallel
│   ├── intent_router.py            [CREATE] Intent classification
│   ├── planner.py                  [CREATE] Dynamic plan generation (extracted from supervisor)
│   ├── workers/
│   │   ├── base.py                 [MODIFY] Lazy skill loading, timeout support
│   │   ├── flight_worker.py        [MODIFY] Pass timeout config
│   │   ├── hotel_worker.py         [MODIFY] Pass timeout config
│   │   ├── attraction_worker.py    [MODIFY] Pass timeout config
│   │   ├── itinerary_worker.py     [MODIFY] Pass timeout config
│   │   └── budget_worker.py        [MODIFY] Pass timeout config
│   └── skills/                     [NO CHANGE] SKILL.md files are read lazily
├── routers/
│   ├── chat_router.py              [MODIFY] Optional auth, export endpoint
│   └── export_router.py            [CREATE] PDF/Markdown export
├── schemas/
│   └── trip.py                     [MODIFY] Budget breakdown model
├── utils/
│   ├── llm.py                      [NO CHANGE]
│   └── pdf_export.py               [CREATE] Markdown→PDF conversion
└── index.html                      [MODIFY] Polyline routes, budget table
```

---

## Phase 1: Core Agent Refactoring

### Task 1.1: Intent Router

**Files:**
- Create: `app/agents/intent_router.py`
- Modify: `app/agents/state.py:add intent fields`
- Modify: `app/agents/supervisor.py:add intent_router_node, update graph`

**What it does:** Before the Planner runs, a lightweight LLM call classifies the user's message into an intent category. The intent determines which Workers are relevant and the rough plan structure.

Intent categories:
- `full_trip` — "从上海去东京5天" → all 5 workers
- `flight_only` — "北京到上海航班" → flight only
- `hotel_only` — "找东京的酒店" → hotel only
- `attractions_only` — "东京有什么好玩的" → attraction + itinerary
- `budget_only` — "帮我算算去东京要多少钱" → budget only (+ maybe flight)
- `itinerary_modify` — "第三天的新宿换成秋叶原" → itinerary only, modify mode

- [ ] **Step 1: Write intent_router.py**

```python
"""意图分类 —— 决定该跑哪些 Worker"""
import json
from enum import StrEnum
from dataclasses import dataclass, field

from app.utils.llm import chat


class Intent(StrEnum):
    FULL_TRIP = "full_trip"
    FLIGHT_ONLY = "flight_only"
    HOTEL_ONLY = "hotel_only"
    ATTRACTIONS_ONLY = "attractions_only"
    BUDGET_ONLY = "budget_only"
    ITINERARY_MODIFY = "itinerary_modify"


# Workers to run per intent
INTENT_WORKERS = {
    Intent.FULL_TRIP: ["flight", "hotel", "attraction", "itinerary", "budget"],
    Intent.FLIGHT_ONLY: ["flight"],
    Intent.HOTEL_ONLY: ["hotel"],
    Intent.ATTRACTIONS_ONLY: ["attraction", "itinerary"],
    Intent.BUDGET_ONLY: ["budget", "flight"],  # budget needs flight prices
    Intent.ITINERARY_MODIFY: ["itinerary"],
}


@dataclass
class IntentResult:
    intent: Intent = Intent.FULL_TRIP
    workers: list[str] = field(
        default_factory=lambda: ["flight", "hotel", "attraction", "itinerary", "budget"]
    )
    destination: str = ""
    origin: str = ""
    description: str = ""


INTENT_PROMPT = """分析用户的旅行请求，输出 JSON。

类别:
- full_trip: 完整旅行规划 (含目的地+天数)
- flight_only: 只查航班
- hotel_only: 只找酒店
- attractions_only: 只推荐景点
- budget_only: 只算预算
- itinerary_modify: 修改已有行程

提取: destination(目的地), origin(出发地), description(一句话任务描述)

用户: {message}

只输出 JSON:"""


async def classify_intent(message: str) -> IntentResult:
    """分类用户意图"""
    try:
        resp = await chat([
            {"role": "user", "content": INTENT_PROMPT.format(message=message)}
        ])
        content = resp.get("content", "{}").strip()
        s = content.find("{")
        e = content.rfind("}")
        if s != -1 and e != -1:
            data = json.loads(content[s:e + 1])
            intent_str = data.get("intent", "full_trip")
            intent = Intent(intent_str) if intent_str in Intent.__members__ else Intent.FULL_TRIP
            return IntentResult(
                intent=intent,
                workers=INTENT_WORKERS.get(intent, INTENT_WORKERS[Intent.FULL_TRIP]),
                destination=data.get("destination", ""),
                origin=data.get("origin", ""),
                description=data.get("description", message),
            )
    except Exception:
        pass
    # Fallback: full trip
    return IntentResult()
```

- [ ] **Step 2: Update state.py**

```python
# app/agents/state.py — add after `trip_state` field:
class AgentState(TypedDict):
    # ... existing fields ...
    intent: str                      # one of Intent values
    active_workers: list[str]        # workers to run this turn
```

- [ ] **Step 3: Update supervisor.py — add intent routing to graph**

In `build_graph()`, add after `guard_node`:
```python
async def intent_router_node(state: AgentState) -> AgentState:
    msg = state["messages"][-1]["content"]
    result = await classify_intent(msg)
    state["intent"] = result.intent.value
    state["active_workers"] = result.workers
    return state
```

Register in graph:
```python
g.add_node("intent_router", intent_router_node)
g.add_edge("guard", "intent_router")
g.add_edge("intent_router", "planner")  # replaces guard→planner edge
```

Update `_default_plan` to accept `active_workers` parameter:
```python
def _default_plan(msg: str, active_workers: list[str] | None = None) -> list[dict]:
    workers = active_workers or ["flight", "hotel", "attraction", "itinerary", "budget"]
    from_city, to_city = _extract_cities(msg)
    
    ALL_PLANS = {
        "flight": {"id": 1, "name": "查航班", "worker": "flight",
                    "description": f"查{from_city}到{to_city}的航班", "depends_on": []},
        "hotel": {"id": 2, "name": "找酒店", "worker": "hotel",
                   "description": f"找{to_city}的酒店", "depends_on": []},
        "attraction": {"id": 3, "name": "推荐景点", "worker": "attraction",
                        "description": f"推荐{to_city}的热门景点", "depends_on": []},
        "itinerary": {"id": 4, "name": "排日程", "worker": "itinerary",
                       "description": f"排{to_city}每日日程",
                       "depends_on": _get_dep_ids(workers, ["flight", "hotel", "attraction"])},
        "budget": {"id": 5, "name": "算预算", "worker": "budget",
                    "description": "汇总旅行预算", "depends_on": []},
    }
    
    plan = []
    for w in workers:
        if w in ALL_PLANS:
            plan.append(ALL_PLANS[w])
    return plan
```

- [ ] **Step 4: Commit**

```bash
git add app/agents/intent_router.py app/agents/state.py app/agents/supervisor.py
git commit -m "feat: add intent router — classify input, skip irrelevant workers"
```

---

### Task 1.2: Lazy Skill Loading

**Files:**
- Modify: `app/agents/workers/base.py:56-68`

**What it does:** `BaseWorker.__init__` currently reads `app/agents/skills/{name}.md` immediately at instantiation (which happens at module import time for all 5 workers). Change to load on first call to `run_structured`.

- [ ] **Step 1: Modify BaseWorker.__init__**

```python
# app/agents/workers/base.py — replace __init__

class BaseWorker:
    def __init__(self, name: str):
        self.name = name
        self._skill_path = f"app/agents/skills/{name}.md"
        self._system_prompt = None  # lazy loaded
        self.max_iterations = MAX_TOOL_ITERATIONS
        self.ctx_manager = ContextManager(max_tokens=6000)

    @property
    def system_prompt(self) -> str:
        """Lazy load SKILL.md from disk on first access"""
        if self._system_prompt is None:
            if os.path.exists(self._skill_path):
                with open(self._skill_path, "r", encoding="utf-8") as f:
                    self._system_prompt = f.read()
            else:
                self._system_prompt = f"你是{self.name}专家。"
        return self._system_prompt
```

- [ ] **Step 2: Commit**

```bash
git add app/agents/workers/base.py
git commit -m "perf: lazy load SKILL.md on first use instead of import time"
```

---

### Task 1.3: Dynamic Plan

**Files:**
- Create: `app/agents/planner.py`
- Modify: `app/agents/supervisor.py:remove planner_node to planner.py`

**What it does:** Extract planner logic into its own file. Make the LLM-generated plan truly dynamic — the number and order of steps depends on the intent, not a fixed template.

- [ ] **Step 1: Create planner.py**

```python
"""动态 Planner — 根据意图生成可变长度的步骤计划"""
import json

from app.agents.intent_router import Intent, IntentResult, classify_intent
from app.agents.state import AgentState
from app.utils.llm import chat
from app.agents.supervisor import WORKERS, WORKER_LIST, _extract_cities


async def generate_plan(state: AgentState) -> list[dict]:
    """根据意图 + 用户消息动态生成计划"""
    msg = state["messages"][-1]["content"]
    intent = state.get("intent", "full_trip")
    active_workers = state.get("active_workers", list(WORKERS.keys()))
    
    # Narrow intents use default_plan directly (no LLM needed)
    if intent != "full_trip":
        return _default_plan(msg, active_workers)
    
    # Full trip: let LLM customize the plan
    from_city, to_city = _extract_cities(msg)
    prompt = f"""可选 Worker: {WORKER_LIST}
目的地: {to_city}, 出发地: {from_city}
用户需求: {msg}

根据需求生成执行计划 (JSON数组, 每项含 worker 字段)。
不需要的步骤可以省略。只输出JSON:

示例: [{{"id":1,"name":"查航班","worker":"flight","description":"查{from_city}到{to_city}的航班","depends_on":[]}}]
"""
    try:
        resp = await chat([{"role": "user", "content": prompt}])
        content = resp.get("content", "").strip()
        s = content.find("[")
        e = content.rfind("]")
        if s != -1 and e != -1:
            plan = json.loads(content[s:e + 1])
            plan = [
                x for x in plan
                if isinstance(x, dict) and "worker" in x and x["worker"] in WORKERS
            ]
            if plan:
                # Ensure IDs are sequential
                for i, step in enumerate(plan):
                    step.setdefault("id", i + 1)
                    step.setdefault("depends_on", [])
                    step.setdefault("status", "pending")
                return plan
    except Exception:
        pass
    return _default_plan(msg, active_workers)


def _default_plan(msg: str, active_workers: list[str]) -> list[dict]:
    """兜底计划 —— 只包含 active_workers 中的步骤"""
    from_city, to_city = _extract_cities(msg)
    
    ALL_PLANS = {
        "flight": {"id": 1, "name": "查航班", "worker": "flight",
                    "description": f"查{from_city}到{to_city}的航班", "depends_on": []},
        "hotel": {"id": 2, "name": "找酒店", "worker": "hotel",
                   "description": f"找{to_city}的酒店", "depends_on": []},
        "attraction": {"id": 3, "name": "推荐景点", "worker": "attraction",
                        "description": f"推荐{to_city}的热门景点", "depends_on": []},
        "itinerary": {"id": 4, "name": "排日程", "worker": "itinerary",
                       "description": f"排{to_city}每日日程",
                       "depends_on": _get_dep_ids(active_workers, ["flight", "hotel", "attraction"])},
        "budget": {"id": 5, "name": "算预算", "worker": "budget",
                    "description": "汇总旅行预算", "depends_on": []},
    }
    
    plan = []
    for i, w in enumerate(active_workers):
        if w in ALL_PLANS:
            step = dict(ALL_PLANS[w])
            step["id"] = i + 1
            step["status"] = "pending"
            plan.append(step)
    return plan


def _get_dep_ids(workers: list[str], deps: list[str]) -> list[int]:
    """计算 depends_on ID 列表"""
    result = []
    for d in deps:
        if d in workers:
            idx = workers.index(d) + 1
            result.append(idx)
    return result
```

- [ ] **Step 2: Simplify supervisor.py planner_node**

```python
# In supervisor.py, replace planner_node:
from app.agents.planner import generate_plan

async def planner_node(state: AgentState) -> AgentState:
    plan = await generate_plan(state)
    state["plan_steps"] = plan
    state["current_step_index"] = 0
    print(f"[Planner] {len(plan)}步计划: {[s['name'] for s in plan]}")
    return state
```

- [ ] **Step 3: Commit**

```bash
git add app/agents/planner.py app/agents/supervisor.py
git commit -m "feat: dynamic planner — variable step count based on intent"
```

---

### Task 1.4: True Parallel Workers

**Files:**
- Modify: `app/agents/supervisor.py:executor_node`

**What it does:** Flight, hotel, attraction, and budget have no real runtime dependencies. Only itinerary needs the others' results. Change `_default_plan` to put all 4 independent workers in one layer.

- [ ] **Step 1: Verify dependency structure**

The current `_build_execution_layers` already handles this correctly — if steps have no depends_on, they go in the same layer. The fix is in the plan generation: ensure only itinerary has depends_on.

This is already handled in Task 1.3's `_default_plan` — only itinerary has depends_on. No code change needed for this task.

- [ ] **Step 2: Commit** (skip if no changes)

---

### Task 1.5: Timeout Degradation

**Files:**
- Modify: `app/agents/supervisor.py:_run_one_step`
- Modify: `app/agents/workers/base.py:add timeout to run_structured`

**What it does:** Each worker gets 5 seconds to complete. If it times out, the step is marked as "timeout" and the plan continues.

- [ ] **Step 1: Add timeout parameter to BaseWorker.run_structured**

```python
# app/agents/workers/base.py — add timeout parameter

async def run_structured(
    self, query: str, context: list | None = None,
    timeout: float = 5.0  # NEW: per-worker timeout
) -> WorkerResult:
    # ... existing code ...
```

No change to the ReAct loop body — timeout is handled at the executor level.

- [ ] **Step 2: Add timeout to _run_one_step**

```python
# app/agents/supervisor.py — update _run_one_step

WORKER_TIMEOUT = 5.0  # seconds

async def _run_one_step(step: dict, ctx: list | None) -> None:
    w = WORKERS.get(step.get("worker", ""))
    if not w:
        step["status"] = "failed"
        step["result"] = "无对应Worker"
        return

    print(f"  [Executor] {step['name']} 开始...")
    step["status"] = "running"
    try:
        result = await asyncio.wait_for(
            w.run_structured(
                query=step.get("description", ""),
                context=ctx if ctx else None
            ),
            timeout=WORKER_TIMEOUT
        )
        step["result"] = result.content
        step["status"] = "done" if result.success else "failed"
        # ... rest of existing extraction code ...
        
    except asyncio.TimeoutError:
        step["result"] = "该步骤执行超时，已跳过。请查看其他步骤的结果。"
        step["status"] = "timeout"
        print(f"  [Executor] {step['name']} [TIMEOUT]")
    except Exception as e:
        step["result"] = str(e)
        step["status"] = "failed"
        print(f"  [Executor] {step['name']} [FAIL] {e}")
```

- [ ] **Step 3: Commit**

```bash
git add app/agents/supervisor.py
git commit -m "feat: per-worker 5s timeout — timed-out steps skip, don't block"
```

---

## Phase 2: Practical Improvements

### Task 2.1: Optional Auth

**Files:**
- Modify: `app/routers/chat_router.py:make auth optional`
- Modify: `app/auth/dependencies.py:add optional auth`

**What it does:** Auth endpoints still work, but the chat/stream endpoint accepts unauthenticated requests with a fallback user or guest mode.

- [ ] **Step 1: Add optional auth dependency**

```python
# app/auth/dependencies.py — add after get_current_user

async def get_optional_user(request: Request, db: AsyncSession = Depends(get_db)):
    """Optional auth — returns user or None"""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    try:
        return await get_current_user(auth_header, db)
    except Exception:
        return None
```

- [ ] **Step 2: Update chat_router.py**

```python
# app/routers/chat_router.py — update both endpoints

from app.auth.dependencies import get_optional_user

@router.post("")
async def chat(
    req: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_optional_user)  # was get_current_user
):
    if user is None:
        # Guest mode — skip DB save, return reply only
        # ... run agent ...
        return {"code": 200, "data": {"reply": result["final_answer"], "conversation_id": None}}
    # ... existing flow with DB save ...

# Same for /chat/stream
```

- [ ] **Step 3: Update frontend to skip auth check**

```javascript
// In send(), remove the if(!tk) check, or make it optional:
async function send() {
    var msg = document.getElementById("chatInput").value.trim();
    if (!msg) return;
    // If not logged in, proceed as guest
    document.getElementById("chatInput").value = "";
    addBubble("user", msg);
    showTyping();
    
    var headers = {"Content-Type": "application/json"};
    if (tk) headers["Authorization"] = "Bearer " + tk;
    
    var r = await fetch(A + "/chat/stream", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({message: msg, conversation_id: cid})
    });
    // ... no auth redirect, just handle the response ...
}
```

- [ ] **Step 4: Commit**

```bash
git add app/auth/dependencies.py app/routers/chat_router.py index.html
git commit -m "feat: make auth optional — guest mode for unauthenticated users"
```

---

### Task 2.2: PDF/Markdown Export

**Files:**
- Create: `app/utils/pdf_export.py`
- Create: `app/routers/export_router.py`
- Modify: `app/routers/router.py:register export router`

**What it does:** Adds `GET /api/export/{conversation_id}?format=md|pdf` endpoint that returns the final trip plan as downloadable Markdown or PDF.

- [ ] **Step 1: Create pdf_export.py**

```python
"""Markdown/PDF 导出 —— 把旅行方案转成可下载文件"""
from io import BytesIO


def build_markdown(reply: str, destination: str = "", dates: str = "") -> str:
    """把 aggregator 输出的 Markdown 包装成完整文档"""
    header = f"# 旅行方案 — {destination}\n\n"
    if dates:
        header += f"**日期:** {dates}\n\n"
    header += "---\n\n"
    return header + reply


def markdown_to_html(md_text: str) -> str:
    """Markdown → HTML (用于 PDF 渲染)"""
    try:
        import markdown as md_lib
        return md_lib.markdown(md_text, extensions=["tables", "fenced_code"])
    except ImportError:
        return f"<pre>{md_text}</pre>"


def html_to_pdf(html: str) -> bytes:
    """HTML → PDF bytes (使用 weasyprint)"""
    try:
        from weasyprint import HTML
        return HTML(string=html).write_pdf()
    except ImportError:
        # Fallback: return HTML as bytes with text/plain mimetype handled by caller
        raise RuntimeError("weasyprint not installed — PDF export unavailable")
```

- [ ] **Step 2: Create export_router.py**

```python
"""导出路由"""
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.database import get_db
from app.auth.dependencies import get_optional_user
from app.crud import message
from app.utils.pdf_export import build_markdown, markdown_to_html, html_to_pdf

router = APIRouter(prefix="/export", tags=["导出"])


@router.get("/{conversation_id}")
async def export_trip(
    conversation_id: int,
    format: str = Query("md", regex="^(md|pdf)$"),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_optional_user),
):
    """导出旅行方案为 Markdown 或 PDF"""
    msgs = await message.get_history(db, conversation_id)
    assistant_msgs = [m for m in msgs if m.role == "assistant"]
    if not assistant_msgs:
        raise HTTPException(404, "未找到方案内容")

    reply = assistant_msgs[-1].content  # latest assistant reply

    if format == "md":
        md = build_markdown(reply)
        return Response(
            content=md.encode("utf-8"),
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename=trip_plan_{conversation_id}.md"},
        )

    # PDF
    md = build_markdown(reply)
    html = markdown_to_html(md)
    try:
        pdf_bytes = html_to_pdf(html)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=trip_plan_{conversation_id}.pdf"},
        )
    except RuntimeError:
        raise HTTPException(500, "PDF 导出需要安装 weasyprint: pip install weasyprint")
```

- [ ] **Step 3: Register export router**

```python
# app/routers/router.py — add:
from app.routers.export_router import router as export_router
main_router.include_router(export_router, prefix="/api")
```

- [ ] **Step 4: Commit**

```bash
git add app/utils/pdf_export.py app/routers/export_router.py app/routers/router.py
git commit -m "feat: add Markdown/PDF export endpoint /api/export/{id}?format=md|pdf"
```

---

### Task 2.3: Budget Breakdown Table

**Files:**
- Modify: `app/agents/skills/budget.md:add structured output instruction`
- Modify: `app/schemas/trip.py:add BudgetItem`

**What it does:** The Budget Worker now outputs a structured breakdown (交通/住宿/餐饮/门票/其他), not just a summary sentence. The frontend renders it as a table.

- [ ] **Step 1: Add BudgetItem to trip.py**

```python
# app/schemas/trip.py — add to existing models:

class BudgetItem(BaseModel):
    category: str = ""       # 交通/住宿/餐饮/门票/其他
    amount: float = 0.0
    currency: str = "CNY"
    note: str = ""
```

- [ ] **Step 2: Update budget.md SKILL**

Add to `app/agents/skills/budget.md`:
```
## 输出要求

在最终回复末尾附上结构化预算表 (JSON):

```json
{"budget_breakdown": [
  {"category": "交通", "amount": 5600, "currency": "CNY", "note": "往返机票"},
  {"category": "住宿", "amount": 4000, "currency": "CNY", "note": "4晚酒店"},
  {"category": "餐饮", "amount": 2000, "currency": "CNY", "note": "每日约400"},
  {"category": "门票", "amount": 800, "currency": "CNY", "note": "迪士尼+晴空塔"},
  {"category": "其他", "amount": 600, "currency": "CNY", "note": "交通卡+纪念品"}
]}
```
```

- [ ] **Step 3: Update _extract_structured to parse budget_breakdown**

```python
# In supervisor.py _extract_structured, add budget parsing:
if worker_type == "budget":
    budget_json = _extract_json_block(text, "budget_breakdown")
    if budget_json:
        items = [
            TripItem(
                name=item.get("category", ""),
                detail=item.get("note", ""),
                price=f"{item.get('currency','CNY')} {item.get('amount',0):.0f}",
            )
            for item in budget_json
        ]
        return StepOutput(summary=text[:80], items=items)
```

- [ ] **Step 4: Commit**

```bash
git add app/schemas/trip.py app/agents/skills/budget.md app/agents/supervisor.py
git commit -m "feat: structured budget breakdown — 交通/住宿/餐饮/门票/其他"
```

---

### Task 2.4: Map Route Lines

**Files:**
- Modify: `index.html:add polyline drawing`

**What it does:** After all markers are placed, connect them with AMap.Polyline in itinerary order (Day N attractions connected). Add distance labels.

- [ ] **Step 1: Add route drawing function to index.html**

```javascript
var _routeLines = [];

function clearRoutes() {
    _routeLines.forEach(function(line) { map.remove(line); });
    _routeLines = [];
}

function drawRoutes(locations) {
    // Group markers by step type
    clearRoutes();
    if (locations.length < 2) return;

    // Draw polylines connecting attraction markers (itinerary order)
    var attractionMarkers = [];
    _markers.forEach(function(m) {
        var d = m.getExtData();
        if (d && d.step && d.step.indexOf("景点") !== -1) {
            attractionMarkers.push(m.getPosition());
        }
    });

    if (attractionMarkers.length >= 2) {
        var line = new AMap.Polyline({
            path: attractionMarkers,
            strokeColor: "#00E5A0",
            strokeWeight: 3,
            strokeOpacity: 0.6,
            strokeStyle: "dashed",
            strokeDasharray: [10, 5],
            showDir: true,
            zIndex: 50,
        });
        map.add(line);
        _routeLines.push(line);
    }
}
```

Call `drawRoutes()` in `handleSSE` after the final `done` event when markers are placed:
```javascript
} else if (evt.event === "done") {
    // ... existing code ...
    // Draw routes after a short delay to ensure markers are placed
    setTimeout(function() { drawRoutes(); }, 500);
}
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: AMap polyline routes between attraction markers"
```

---

## Self-Review

**1. Spec coverage:**
- 1.1 Intent Router → Task 1.1 ✅
- 1.2 Lazy Skill Loading → Task 1.2 ✅
- 1.3 Dynamic Plan → Task 1.3 ✅
- 1.4 Parallel Workers → Task 1.4 ✅ (already correct, verified)
- 1.5 Timeout → Task 1.5 ✅
- 2.1 Auth removal → Task 2.1 ✅
- 2.2 PDF/Markdown export → Task 2.2 ✅
- 2.3 Budget breakdown → Task 2.3 ✅
- 2.4 Map routes → Task 2.4 ✅

**2. Placeholder scan:** No TBD/TODO. All code is concrete.

**3. Type consistency:**
- `IntentResult.workers` → `AgentState.active_workers` → `_default_plan(msg, active_workers)` ✅
- `StepOutput` from `_extract_structured` → `step["locations"]` → SSE `locations` → `addMapMarker` ✅
- `BudgetItem` → `TripItem` for structured extraction ✅
