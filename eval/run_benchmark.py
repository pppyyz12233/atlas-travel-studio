"""
旅行规划系统基准评测
====================

用法（项目根目录）：
    # 离线层（无需 API Key、无需启动服务）：校验确定性规则
    python eval/run_benchmark.py --mode offline

    # 在线层（需先启动服务并配置 DEEPSEEK_API_KEY）：全链路真实评测
    python eval/run_benchmark.py --mode online

    # 可选参数
    --only full_trip     # 只跑某一类用例
    --limit 5            # 只跑前 N 条
    --gap 4              # 在线用例间隔秒数（默认 4s，避开 20/min 限流）
    --base-url http://127.0.0.1:8000

指标定义（v2 口径，与 README 一致；评分逻辑见 eval/scoring.py）：
    意图路由准确率     非 guard 用例中，实际执行的 Worker 集合与标注完全一致的比例
                       （guard 用例无意图可言，不进分母，单独见 Guard 拦截准确率）
    Guard 拦截准确率   guard 用例中正确拦截的比例（单独统计）
    必须工具召回率     Σ|required ∩ called| / Σ|required|（required 缺失即失分）
    可选工具调用率     Σ|optional ∩ called| / Σ|optional|（描述性指标，不判对错）
    错误调用率         不属于 required∪optional 的调用次数 / 总调用次数
    过量调用率         重复调用（同工具第 2 次起）次数 / 总调用次数
    计划成功率         收到 done 且回复≥50字 且无失败步骤 / 全部用例数（guard 用例为正确拦截）
    非guard计划成功率  同口径，分母不含 guard 用例
    端到端延迟         客户端墙钟（在线层，全部用例），报 avg / median / P95
    LLM 调用次数(估)   1(意图) + 计划(1, 仅 full_trip>2步) + Σ迭代轮数 + Σ成功步骤(结构化提取) + 1(汇总)
                       （仅非 guard 用例产生，均值分母为非 guard 用例数）
    工具调用次数       Σ step.tool_calls（精确，仅非 guard 用例产生）
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))  # 引入 scoring.py

from scoring import score_tools  # noqa: E402

RESULTS_DIR = Path(__file__).resolve().parent / "results"

try:  # Windows 控制台 UTF-8 输出
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def load_cases(only: str | None, limit: int | None) -> list[dict]:
    data = json.loads((ROOT / "eval" / "testcases.json").read_text(encoding="utf-8"))
    cases = data["cases"]
    if only:
        cases = [c for c in cases if c["category"] == only]
    if limit:
        cases = cases[:limit]
    return cases


def pct(x) -> str:
    return "n/a" if x is None else f"{x * 100:.1f}%"


def median(xs: list[float]) -> float:
    xs = sorted(xs)
    n = len(xs)
    if n == 0:
        return 0.0
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2


def p95(xs: list[float]) -> float:
    if not xs:
        return 0.0
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(len(xs) * 0.95))]


# ══════════════════════════════════════════════════════════════
# 离线层：确定性规则（guard / 城市提取 / 预过滤 / Worker 映射）
# ══════════════════════════════════════════════════════════════

def run_offline(cases: list[dict]) -> dict:
    from app.agents.workflow.guard import check
    from app.agents.supervisor import _extract_cities
    from app.agents.planner import _pre_filter_workers
    from app.agents.intent_router import INTENT_WORKERS, Intent

    guard_ok = guard_total = 0
    city_ok = city_total = 0
    prefilter_ok = prefilter_total = 0
    worker_ok = worker_total = 0
    failures: list[str] = []

    for c in cases:
        msg = c["message"]

        # 1. Guard
        blocked, _reason = check(msg)
        if bool(blocked) == bool(c["guard_blocked"]):
            guard_ok += 1
        else:
            failures.append(f"[guard] #{c['id']} 期望{'拦截' if c['guard_blocked'] else '放行'}，实际{'拦截' if blocked else '放行'}: {msg}")
        guard_total += 1
        if blocked:
            continue

        # 2. 城市提取（包含语义：提取值包含期望城市即算对）
        exp = c.get("cities") or [None, None]
        exp_from, exp_to = (exp + [None, None])[:2]
        if exp_from or exp_to:
            got_from, got_to = _extract_cities(msg)
            ok_f = (not exp_from) or (exp_from in got_from)
            ok_t = (not exp_to) or (exp_to in got_to)
            if ok_f and ok_t:
                city_ok += 1
            else:
                failures.append(f"[city] #{c['id']} 期望({exp_from},{exp_to})，实际({got_from},{got_to}): {msg}")
            city_total += 1

        # 3. Worker 映射（意图 → 基础 Worker 集）+ full_trip 预过滤
        intent = c["intent"]
        if intent:
            base = list(INTENT_WORKERS.get(Intent(intent), INTENT_WORKERS[Intent.FULL_TRIP]))
            got_from, got_to = _extract_cities(msg)
            actual, _excluded = _pre_filter_workers(msg, got_from, got_to, base) if intent == "full_trip" else (base, [])
            if set(actual) == set(c["workers"]):
                worker_ok += 1
            else:
                failures.append(f"[worker] #{c['id']} 期望{sorted(c['workers'])}，实际{sorted(actual)}: {msg}")
            worker_total += 1

            if intent == "full_trip":
                _base5 = list(INTENT_WORKERS[Intent.FULL_TRIP])
                _kept, _ex = _pre_filter_workers(msg, *_extract_cities(msg), _base5)
                dropped = set()
                if "hotel" in _ex or "hotel" not in _kept:
                    dropped.add("hotel")
                if "flight" in _ex or "flight" not in _kept:
                    dropped.add("flight")
                if dropped == set(c.get("prefilter_drop", [])):
                    prefilter_ok += 1
                else:
                    failures.append(f"[prefilter] #{c['id']} 期望剔除{c.get('prefilter_drop', [])}，实际剔除{sorted(dropped)}: {msg}")
                prefilter_total += 1

    return {
        "mode": "offline",
        "ran_at": datetime.now().isoformat(timespec="seconds"),
        "cases": len(cases),
        "guard_accuracy": guard_ok / guard_total if guard_total else None,
        "city_extraction_accuracy": city_ok / city_total if city_total else None,
        "worker_mapping_accuracy": worker_ok / worker_total if worker_total else None,
        "prefilter_accuracy": prefilter_ok / prefilter_total if prefilter_total else None,
        "failures": failures,
    }


# ══════════════════════════════════════════════════════════════
# 在线层：真实调用 /api/chat/stream，全链路指标
# ══════════════════════════════════════════════════════════════

async def run_one_online(session, base_url: str, case: dict, timeout: float) -> dict:
    import aiohttp

    t0 = time.monotonic()
    ev = {
        "blocked": False, "steps": [], "workers": set(), "tools_called": [],
        "iterations": 0, "tool_calls": 0, "failed_steps": 0,
        "reply": "", "error": "", "plan_steps": 0, "done": False,
    }
    step_workers: dict[str, str] = {}
    try:
        async with session.post(
            f"{base_url}/api/chat/stream",
            json={"message": case["message"]},
            timeout=aiohttp.ClientTimeout(total=timeout),
        ) as resp:
            if resp.status != 200:
                ev["error"] = f"HTTP {resp.status}"
                return ev
            async for raw in resp.content:
                line = raw.decode("utf-8", errors="replace").strip()
                if not line.startswith("data:"):
                    continue
                try:
                    evt = json.loads(line[5:].strip())
                except json.JSONDecodeError:
                    continue
                kind = evt.get("event")

                if kind == "guard" and evt.get("blocked"):
                    ev["blocked"] = True
                elif kind == "plan":
                    ev["plan_steps"] = len(evt.get("steps", []))
                elif kind == "step_start":
                    step_workers[evt.get("name", "")] = evt.get("worker", "")
                elif kind == "worker_tools":
                    ev["tools_called"].extend(evt.get("tools", []))
                elif kind == "step_done":
                    name = evt.get("name", "")
                    worker = evt.get("worker", "") or step_workers.get(name, "")
                    if worker:
                        ev["workers"].add(worker)
                    ev["iterations"] += int(evt.get("iterations", 0) or 0)
                    ev["tool_calls"] += int(evt.get("tool_calls", 0) or 0)
                    if evt.get("status") == "failed":
                        ev["failed_steps"] += 1
                    ev["steps"].append(name)
                elif kind == "done":
                    ev["done"] = True
                    ev["reply"] = evt.get("reply", "") or ""
                elif kind == "error":
                    ev["error"] = evt.get("message", "")
    except asyncio.TimeoutError:
        ev["error"] = "timeout"
    except Exception as e:  # 网络/解析异常
        ev["error"] = f"{type(e).__name__}: {e}"
    ev["latency"] = round(time.monotonic() - t0, 2)
    return ev


def summarize_online(cases: list[dict], events: list[dict]) -> dict:
    n = len(cases)
    guard_n = sum(1 for c in cases if c["guard_blocked"])
    non_guard_n = n - guard_n
    intent_ok = 0
    plan_ok = 0  # 含 guard：guard 正确拦截也计成功
    non_guard_plan_ok = 0
    guard_ok = 0
    latencies = []
    llm_total = 0
    tool_calls_total = 0
    req_hit = req_total = 0
    opt_hit = opt_total = 0
    wrong_total = excess_total = called_total = 0
    details = []

    for c, ev in zip(cases, events):
        latencies.append(ev["latency"])
        base_detail = {
            "id": c["id"], "category": c["category"], "message": c["message"],
            "latency": ev["latency"], "error": ev["error"],
            "llm_calls_est": None, "tool_calls": ev["tool_calls"],
        }

        # guard 用例：正确拦截即成功（补齐与其他用例一致的字段）
        if c["guard_blocked"]:
            ok = ev["blocked"] and not ev["steps"]
            if ok:
                plan_ok += 1
                guard_ok += 1
            details.append({**base_detail, "intent_match": None, "guard_blocked_ok": ok,
                            "plan_success": ok, "reply_len": 0, "failed_steps": 0})
            continue

        expected_workers = set(c["workers"])
        actual_workers = ev["workers"]
        intent_match = expected_workers == actual_workers
        if intent_match:
            intent_ok += 1

        s = score_tools(c.get("required_tools", []), c.get("optional_tools", []), ev["tools_called"])
        req_hit += len(s["required_hit"])
        req_total += len(s["required_hit"]) + len(s["required_missed"])
        opt_hit += len(s["optional_hit"])
        opt_total += len(c.get("optional_tools", []))
        wrong_total += s["wrong_count"]
        excess_total += s["excess_count"]
        called_total += s["total_calls"]

        success = ev["done"] and len(ev["reply"]) >= 50 and ev["failed_steps"] == 0
        if success:
            plan_ok += 1
            non_guard_plan_ok += 1

        successful_steps = len(ev["steps"]) - ev["failed_steps"]
        llm = 1 + (1 if c["intent"] == "full_trip" and ev["plan_steps"] > 2 else 0) \
            + ev["iterations"] + successful_steps + 1
        llm_total += llm
        tool_calls_total += ev["tool_calls"]

        details.append({
            **base_detail,
            "intent_match": intent_match,
            "expected_workers": sorted(expected_workers),
            "actual_workers": sorted(actual_workers),
            "plan_success": success,
            "reply_len": len(ev["reply"]),
            "failed_steps": ev["failed_steps"],
            "iterations_total": ev["iterations"],
            "llm_calls_est": llm,
            "actual_tools": ev["tools_called"],
            "required_hit": s["required_hit"],
            "required_missed": s["required_missed"],
            "optional_hit": s["optional_hit"],
            "wrong_calls": s["wrong_calls"],
            "excess_calls": s["excess_calls"],
        })

    # 分类聚合
    by_cat: dict[str, list[dict]] = defaultdict(list)
    for d in details:
        by_cat[d["category"]].append(d)
    per_category = {}
    for cat, ds in by_cat.items():
        plan_ok_cat = sum(1 for d in ds if d["plan_success"])
        intent_ds = [d for d in ds if d["intent_match"] is not None]
        lat = [d["latency"] for d in ds]
        per_category[cat] = {
            "cases": len(ds),
            "intent_accuracy": (sum(1 for d in intent_ds if d["intent_match"]) / len(intent_ds)) if intent_ds else None,
            "plan_success_rate": plan_ok_cat / len(ds),
            "latency_avg_s": round(sum(lat) / len(lat), 1),
            "latency_max_s": max(lat),
            "tool_calls_avg": round(sum(d["tool_calls"] for d in ds) / len(ds), 1),
            "wrong_call_cases": [d["id"] for d in ds if d.get("wrong_calls")],
            "required_missed_cases": [d["id"] for d in ds if d.get("required_missed")],
            "failed_cases": [d["id"] for d in ds if not d["plan_success"]],
        }

    return {
        "mode": "online",
        "ran_at": datetime.now().isoformat(timespec="seconds"),
        "base_url": "recorded-in-cli",
        "cases": n,
        "guard_cases": guard_n,
        "non_guard_cases": non_guard_n,
        "details_count": len(details),
        "intent_accuracy": intent_ok / non_guard_n if non_guard_n else None,  # 分母不含 guard
        "guard_accuracy": guard_ok / guard_n if guard_n else None,  # 单独统计
        "required_tool_recall": (req_hit / req_total) if req_total else None,
        "optional_tool_usage": (opt_hit / opt_total) if opt_total else None,
        "wrong_call_ratio": (wrong_total / called_total) if called_total else None,
        "excess_call_ratio": (excess_total / called_total) if called_total else None,
        "plan_success_rate": plan_ok / n if n else None,  # 含 guard（guard 正确拦截计成功）
        "non_guard_plan_success_rate": (
            non_guard_plan_ok / non_guard_n if non_guard_n else None
        ),
        "latency_avg_s": round(sum(latencies) / len(latencies), 1) if latencies else None,
        "latency_median_s": round(median(latencies), 1),
        "latency_p95_s": round(p95(latencies), 1),
        "llm_calls_total_est": llm_total,  # 仅非 guard 用例
        "llm_calls_avg_est": (
            round(llm_total / non_guard_n, 1) if non_guard_n else None
        ),
        "tool_calls_total": tool_calls_total,  # 仅非 guard 用例
        "tool_calls_avg": (
            round(tool_calls_total / non_guard_n, 1) if non_guard_n else None
        ),
        "per_category": per_category,
        "details": details,
    }


async def run_online(cases: list[dict], base_url: str, gap: float, timeout: float) -> dict:
    import aiohttp

    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(f"{base_url}/health", timeout=aiohttp.ClientTimeout(total=10)) as r:
                if r.status != 200:
                    print(f"✗ 服务不可用（{base_url}/health -> {r.status}）")
                    return {}
        except Exception as e:
            print(f"✗ 无法连接服务 {base_url}：{e}\n  请先启动: python main.py")
            return {}

        events = []
        for i, c in enumerate(cases, 1):
            print(f"[{i}/{len(cases)}] #{c['id']} {c['category']}: {c['message'][:28]}...", flush=True)
            ev = await run_one_online(session, base_url, c, timeout)
            if "DEEPSEEK_API_KEY" in ev.get("error", ""):
                print("\n✗ 检测到未配置 DEEPSEEK_API_KEY：请先在 .env 填写密钥再运行在线评测。")
                return {}
            if ev["error"] and ev["error"] != "timeout":
                print(f"    ⚠ 该用例异常: {ev['error'][:120]}")
            events.append(ev)
            if i < len(cases):
                await asyncio.sleep(gap)

    return summarize_online(cases, events)


# ══════════════════════════════════════════════════════════════
# 报告输出
# ══════════════════════════════════════════════════════════════

def print_report(r: dict) -> None:
    print("\n" + "═" * 56)
    print(f"  评测报告 · {r['mode']} · {r['cases']} 条用例 · {r['ran_at']}")
    print("═" * 56)
    if r["mode"] == "offline":
        print(f"  Guard 拦截准确率        {pct(r['guard_accuracy'])}")
        print(f"  城市提取准确率          {pct(r['city_extraction_accuracy'])}")
        print(f"  Worker 映射准确率       {pct(r['worker_mapping_accuracy'])}")
        print(f"  计划预过滤准确率        {pct(r['prefilter_accuracy'])}")
        if r["failures"]:
            print(f"\n  失败明细 ({len(r['failures'])}):")
            for f in r["failures"]:
                print(f"    ✗ {f}")
        else:
            print("\n  全部通过 ✓")
    else:
        print(f"  意图路由准确率          {pct(r['intent_accuracy'])}（非 guard {r['non_guard_cases']} 条）")
        if r.get("guard_cases"):
            print(f"  Guard 拦截准确率        {pct(r['guard_accuracy'])}（{r['guard_cases']} 条）")
        print(f"  必须工具召回率          {pct(r['required_tool_recall'])}")
        print(f"  可选工具调用率          {pct(r['optional_tool_usage'])}")
        print(f"  错误调用率              {pct(r['wrong_call_ratio'])}")
        print(f"  过量调用率              {pct(r['excess_call_ratio'])}")
        print(f"  计划成功率              {pct(r['plan_success_rate'])}（含 guard）")
        if r.get("non_guard_cases"):
            print(f"  计划成功率(非guard)     {pct(r['non_guard_plan_success_rate'])}")
        print(f"  延迟 avg/median/p95     {r['latency_avg_s']}s / {r['latency_median_s']}s / {r['latency_p95_s']}s")
        print(f"  LLM 调用(估)            共 {r['llm_calls_total_est']} 次 · 均 {r['llm_calls_avg_est']} 次/例（非 guard）")
        print(f"  工具调用(精确)          共 {r['tool_calls_total']} 次 · 均 {r['tool_calls_avg']} 次/例（非 guard）")
    print("═" * 56)


def save_report(r: dict) -> Path:
    RESULTS_DIR.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = RESULTS_DIR / f"{r['mode']}_{stamp}.json"
    json_path.write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding="utf-8")
    return json_path


def main() -> None:
    ap = argparse.ArgumentParser(description="旅行规划系统基准评测")
    ap.add_argument("--mode", choices=["offline", "online"], default="offline")
    ap.add_argument("--base-url", default="http://127.0.0.1:8000")
    ap.add_argument("--only", default=None, help="只跑某一类用例（full_trip/flight_only/...）")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--gap", type=float, default=4.0, help="在线用例间隔秒数")
    ap.add_argument("--timeout", type=float, default=300.0, help="单用例超时秒数")
    args = ap.parse_args()

    cases = load_cases(args.only, args.limit)
    print(f"载入 {len(cases)} 条用例（mode={args.mode}）")

    if args.mode == "offline":
        report = run_offline(cases)
    else:
        report = asyncio.run(run_online(cases, args.base_url, args.gap, args.timeout))
        if not report:
            sys.exit(1)

    print_report(report)
    out = save_report(report)
    print(f"\n报告已保存: {out}")


if __name__ == "__main__":
    main()
