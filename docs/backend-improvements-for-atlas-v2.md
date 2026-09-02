# Atlas V2 后端改进路线（秋招版）

评估日期：2026-08-25

这份路线只记录能够从当前仓库代码中验证的事实，不给项目编造分数、延迟、准确率或成本。目标不是把个人项目扩成完整 OTA，而是用有限工作量证明你具备 Agent 工程化能力。

## 六项复查结论

| 能力 | 状态 | 当前代码证据 | 下一步验收 |
| --- | --- | --- | --- |
| 安全与仓库清理 | 部分完成 | 已有 HMAC 访客 Cookie、访客隔离、非法认证返回 401；`.gitignore` 已覆盖密钥和生成物；旧高德凭据已清除；缺 DeepSeek Key 不再阻止应用导入 | 生产环境拒绝默认 JWT；CORS 使用白名单；依赖锁版；CI 做密钥扫描 |
| SSE 单一编排 | 未完成 | `app/routers/chat_router.py` 仍直接调用 supervisor 的节点和 `_build_execution_layers`、`_run_step_with_subgraph` | 流式与非流式请求只执行同一张编译图，SSE 仅负责事件映射 |
| 离线测试与 Eval | 未完成 | 有 pytest 和前端 Vitest，但 `tests/test_eval.py::test_quick_check` 仍请求真实模型，普通回归依赖 Key 和网络 | `pytest -m "not online"` 在无 Key、无网络环境稳定运行；golden dataset 进入 CI |
| 高德真实 POI | 未完成 | `app/mcp/registry.py` 中 `ATTRACTION_TOOLS = []`；`search_router.py` 仍读取 `ATTRACTIONS_MOCK` | 服务端 POI 检索、标准化、缓存、fixture 测试和 LLM 重排形成闭环 |
| 可修改的结构化行程 | 部分完成 | 已有 `TripState` 和 `itinerary_modify`，但 itinerary/budget 仍是 `list[dict]`，条目无稳定 ID，SSE `done` 未返回 `trip_state` | 支持修改、删除、按天重生成；刷新后恢复；Markdown 从结构化状态派生 |
| 延迟和成本观测 | 部分完成 | 只记录总执行时间、Worker iterations/tool_calls 和文本日志；没有 run/step 持久化指标 | 记录真实 run_id、步骤耗时、SDK usage token、版本化单价和可查询历史 |

## 秋招竞争力优先级

### ★★★★★ 1. SSE 单一编排与服务端取消

当前 `chat_router.py` 为了发送进度，手动重演 guard、memory、intent、planner、executor、aggregator 和 memory writer；`supervisor.py` 中同时存在完整 LangGraph。两份编排已经形成 schema drift 风险，也让 checkpointer、异常处理和后续节点变更需要维护两次。

建议把编译图作为唯一执行入口：

```text
POST /api/chat/stream
  -> compiled_graph.astream_events(...)
  -> SSE adapter
  -> graph_state / plan / step_start / step_done / done / error
```

同时完成服务端取消传播：客户端断开或收到取消请求时，取消当前 graph task 和同层 Worker task；捕获 `asyncio.CancelledError` 后只做必要清理，不继续调用聚合与记忆写入。

验收条件：

- 流式与非流式端点不再分别实现业务编排。
- `chat_router.py` 不再 import supervisor 私有执行函数。
- 同一输入下，两种端点得到语义一致的最终状态。
- 客户端断开后，未完成 Worker 不再继续产生模型调用。
- 并发访客继续保持独立 thread/checkpoint。

这是最值得面试展开的重构故事：它同时体现状态机、事件流、一致性和资源治理。

### ★★★★★ 2. 真正离线的 Eval 与 CI 回归

现有测试能证明部分函数可运行，但不能稳定回答“这次修改让 Agent 变好还是变坏”。先做轻量三层评测，不急着上复杂平台：

1. 纯离线单元测试：意图 fallback、执行分层、结构化提取、SSE 事件映射、取消传播。
2. 20–30 条 JSONL golden dataset：人工标注 intent、active_workers、origin、destination、dates、budget。
3. 可选在线评测：显式 `@pytest.mark.online`，手动或定时触发，不阻塞普通 CI。

验收条件：

- 无 `.env`、无网络也能执行离线测试。
- golden case 的期望值由人工标注，不由被测代码生成。
- GitHub Actions 同时运行 Python 离线测试、前端测试和前端构建。
- README 只展示真实运行产生的基线；没有实测值就不写数字。

### ★★★★★ 3. 高德 POI 检索 + LLM 重排

景点 Worker 当前没有工具，是项目里最明显的真实性缺口。前端地图 JS Key 只用于展示，后端检索应使用独立的 Web Service Key：

```env
AMAP_WEB_SERVICE_KEY=
```

建议流程：

```text
城市 + 偏好
  -> 高德 POI 搜索候选
  -> 统一为 name/address/lng/lat/category/source
  -> LLM 根据时间、距离、偏好重排
  -> 结构化景点与地图坐标
```

验收条件：

- 景点名称和坐标来自工具结果，并保留 `source="amap"`。
- 请求有明确超时、有限重试和 10–30 分钟 TTL 缓存。
- 普通测试使用录制 fixture，不访问真实高德。
- API 失败时标记降级来源，不把模型猜测包装成真实检索结果。
- `ATTRACTIONS_MOCK` 只作为开发 fixture，不进入生产路径。

### ★★★★☆ 4. 可修改、可删除、可按天重生成的结构化行程

不要先做复杂拖拽排程器。先把领域状态变成可靠的数据源：

- 为 trip、day、item 增加稳定 ID。
- 用 Pydantic 定义 `DayPlan`、`ItineraryItem`、`BudgetItem`，替换 `list[dict]`。
- SSE `done` 返回可选 `trip_state`，Markdown 仅作为兼容展示。
- 增加三个最小操作：修改条目、删除条目、重生成某一天。
- 所有操作校验当前用户或访客会话的所有权。
- 修改后重新计算预算，并从同一结构化状态生成 Markdown/PDF。

验收条件：修改后写入数据库，刷新可恢复；非法 ID 返回 404；重复请求具备幂等边界；旧 Markdown 对话仍可查看。

### ★★★★☆ 5. 真实延迟、token 与成本观测

个人项目不必先部署 Langfuse。先在 LLM 边界和 Worker 边界建立轻量观测：

- 每次规划生成 `run_id`。
- 记录模型名、步骤名、开始/结束时间、状态和错误类型。
- 从 SDK usage 读取 prompt/completion token，不用字符数伪造。
- 价格表记录模型、币种、输入/输出单价和生效日期。
- 将 run/step 指标写入 SQLite，并提供只读聚合接口。
- SSE 和前端只展示后端真实返回的值；缺值时隐藏。

建议展示：P50/P95 总延迟、各 Worker 平均耗时、每次规划 token、估算成本。只有积累了真实样本后再把数字写进 README。

### ★★★★☆ 6. 生产安全与可复现性

已完成的部分应保留测试：访客 Cookie 签名、访客 checkpoint 隔离、非法 Bearer Token 返回 401、旧前端凭据清理、缺模型 Key 时可启动 UI。

仍需补齐：

- `ENV=production` 时默认 JWT 直接拒绝启动。
- CORS 由环境变量白名单驱动，并与凭据 Cookie 配置一致。
- 使用 `uv.lock` 或 `requirements.lock` 固定 Python 依赖；保留 `package-lock.json`。
- GitHub Actions：ruff、离线 pytest、Vitest、Vite build、密钥扫描。
- Dockerfile 只做可复现演示，不引入微服务和 Kubernetes。
- 结构化日志替代 `print`，且不记录 token、Cookie、完整用户隐私数据。

### ★★★☆☆ 7. 明确真实数据与 Mock Adapter 边界

航班和酒店当前仍以模拟数据为主。秋招项目不需要接支付或真实出票，但必须让接口和文档诚实：

- 为 flight/hotel 定义 provider interface。
- 默认开发环境使用 mock provider，并在返回值中标记 source。
- 可选接一个测试环境 provider；不可用时显式降级。
- README 清楚列出哪些是真实 API、哪些是模拟数据。

### ★★★☆☆ 8. 删除或完成半成品入口

检查 admin 文档上传等未闭环功能。没有前端入口、没有检索链路、没有测试的功能应删除或标记为实验接口，避免面试时出现“看起来已完成，实际只有 TODO”的反效果。

## 推荐实施顺序

只为秋招，建议控制为两阶段：

第一阶段：

1. SSE 单一编排 + 服务端取消。
2. 离线 golden dataset + CI。
3. 高德 POI 检索 + 重排。

第二阶段从下面选两项：

1. 结构化行程的修改、删除、按天重生成。
2. 轻量 run/step 观测。
3. 锁版、CORS/JWT、日志收口。

到这里已经足以形成完整面试叙事。不要增加支付、真实订票、消息队列、微服务或 Kubernetes；它们会显著扩大工作量，却不能比评测、真实检索、单一编排和观测更直接地证明 Agent 工程能力。

## 面试叙事模板

> 我把旅行 Multi-Agent demo 的执行链收敛为一张 LangGraph，通过事件适配器同时支持普通响应和 SSE，并让客户端断开能够取消后端 Worker；随后建立无网络可运行的 golden set 回归，把景点从模型记忆生成改成高德 POI 检索加重排。结构化行程支持修改、删除和按天重生成，所有性能与成本数字都来自真实 run 记录。

只有对应功能和实测证据完成后，才使用这段表述。
