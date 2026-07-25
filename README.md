<div align="center">

# ✈️ Smart Travel Planner

### Plan-and-Execute × Worker 子图 Multi-Agent 旅行规划系统

*一句话搞定航班、酒店、景点、日程、预算*

<img src="https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white&style=flat-square" alt="Python"/>
<img src="https://img.shields.io/badge/LangGraph-0.2+-7B3FE4?style=flat-square" alt="LangGraph"/>
<img src="https://img.shields.io/badge/LLM-DeepSeek-536DFE?style=flat-square" alt="DeepSeek"/>
<img src="https://img.shields.io/badge/MCP-FastMCP-FF6F00?style=flat-square" alt="MCP"/>
<img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License"/>

<br/><br/>
</div>

---

## 架构

```
                    ┌─────────────────────┐
                    │  前端 (index.html)    │
                    │  SSE EventSource     │
                    └─────────┬───────────┘
                              │ POST /api/chat/stream
                              ▼
┌──────────────────────────────────────────────────────────┐
│              LangGraph 主图 (8 节点)                       │
│                                                          │
│  guard → memory_reader → intent_router → planner         │
│                                                  │       │
│                                                  ▼       │
│  ┌───────────────────────────────────────────────┐      │
│  │                executor                       │      │
│  │  分层并行调度 5 个 Worker 子图                  │      │
│  │                                               │      │
│  │  ┌──────┐ ┌──────┐ ┌──────────┐ ┌────────┐ ┌──────┐│
│  │  │flight│ │hotel │ │attraction│ │itinrary│ │budget│││
│  │  │ 子图 │ │ 子图 │ │   子图   │ │  子图  │ │ 子图 │││
│  │  └──┬───┘ └──┬───┘ └────┬─────┘ └───┬────┘ └──┬───┘││
│  │     │        │          │           │         │    ││
│  │     └────────┴──────────┴───────────┴─────────┘    ││
│  │                      │ result                      ││
│  └──────────────────────┼────────────────────────────┘│
│                         ▼                              │
│  memory_writer → aggregator → END                      │
│                                                          │
│  持久化: SqliteSaver (状态存档) + InMemoryStore (偏好)     │
└──────────────────────────────────────────────────────────┘
```

| 层级 | 模式 | 说明 |
|------|------|------|
| 主 Agent | Plan-and-Execute | Guard → Memory → Intent → Plan → Execute → Aggregate |
| Worker ×5 | StateGraph 子图 | 每个 Worker 是独立 StateGraph，内嵌 LLM ↔ Tool 标准 ReAct 循环 |

---

## 快速开始

```bash
pip install -r requirements.txt
cp .env.example .env        # 填 DEEPSEEK_API_KEY
python main.py              # → http://localhost:8000
```

---

## 项目结构

```
travel_planning_agent/
├── main.py                          # FastAPI 入口 + Checkpointer 初始化
├── index.html                       # 前端 SPA (Apple Design)
├── app/
│   ├── agents/                      # ★ Agent 核心
│   │   ├── supervisor.py            #   主图 8 节点
│   │   ├── state.py                 #   AgentState
│   │   ├── intent_router.py         #   LLM 意图分类 (6 类)
│   │   ├── planner.py               #   计划生成 + 预过滤
│   │   ├── tools.py                 #   @tool 装饰器封装
│   │   ├── skill_loader.py          #   skills/*.md 加载器
│   │   ├── skills/                  #   7 个角色说明书
│   │   ├── workers/
│   │   │   ├── factory.py           #   build_worker_subgraph()
│   │   │   └── *_worker.py          #   5 个 Worker 导出
│   │   └── workflow/
│   │       └── guard.py             #   正则安全护栏
│   ├── mcp/                         # 标准 MCP + 内部注册表
│   │   ├── server.py                #   FastMCP stdio 服务器
│   │   ├── registry.py              #   ToolRegistry
│   │   └── servers/                 #   航班 / 酒店 / 天气 / 汇率
│   ├── utils/                       # LLM / Config / DB / 限流
│   ├── auth/                        # JWT + bcrypt
│   ├── models/                      # SQLAlchemy ORM
│   ├── crud/                        # 数据访问层
│   ├── routers/                     # chat / auth / admin / export
│   └── schemas/                     # Pydantic 模型
├── static/
│   └── marked.js                    # Markdown 渲染
└── tests/                           # pytest (16 个)
```

---

## Worker 与工具对应

| Worker | 工具 | 数据源 |
|--------|------|--------|
| ✈️ flight | search_flights / get_flight_price | 模拟 8 条航班 |
| 🏨 hotel | search_hotels | 模拟 15 家酒店 |
| 🎯 attraction | 无（纯 LLM 推理） | — |
| 📅 itinerary | get_weather / get_forecast | wttr.in 真实天气 |
| 💰 budget | get_exchange_rate | exchangerate-api 真实汇率 |

### MCP 双轨制

| 层 | 技术 | 用途 |
|----|------|------|
| 外部 | FastMCP (stdio) | Claude Desktop 等 MCP 客户端 |
| 内部 | @tool 装饰器 | Worker 子图通过 ToolNode 调用 |

---

## 技术栈

```
LangGraph · DeepSeek · FastMCP · StateGraph 子图 · ReAct
FastAPI · SQLite · JWT · 高德地图 · SSE 流式
```

---

## License

MIT
