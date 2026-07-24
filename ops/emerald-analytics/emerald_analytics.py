#!/usr/bin/env python3
"""Build low-cost, task-first Komari ping comparison caches."""

from __future__ import annotations

import argparse
import fcntl
import json
import math
import os
import sqlite3
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 3
SCORE_MODEL_VERSION = 2
THEME_SHORT = "Emerald-Cazi"
WINDOW_GROUPS = {
    "fast": [1],
    "standard": [6, 12, 24],
    "long": [72, 168],
    "all": [1, 6, 12, 24, 72, 168],
}
DEFAULTS = {
    "networkScoreLossWeight": 40.0,
    "networkScoreP50Weight": 30.0,
    "networkScoreP95Weight": 25.0,
    "networkScoreVolatilityWeight": 3.0,
    "networkScoreCoverageWeight": 2.0,
    "networkScoreMinSamples": 30,
    "networkScoreMinCoverage": 20.0,
    "networkScoreExcellentThreshold": 95.0,
    "networkScoreGoodThreshold": 85.0,
    "networkScoreFairThreshold": 70.0,
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def isoformat(value: datetime) -> str:
    return value.isoformat(timespec="seconds").replace("+00:00", "Z")


def finite_number(value: Any, fallback: float) -> float:
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return float(value)
    return fallback


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


def read_json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")
    if not isinstance(value, str) or not value:
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def read_json_list(value: Any) -> list[str]:
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")
    if not isinstance(value, str) or not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    return [item for item in parsed if isinstance(item, str)] if isinstance(parsed, list) else []


def open_database(path: str) -> sqlite3.Connection:
    database_path = Path(path).resolve().as_posix()
    connection = sqlite3.connect(f"file:{database_path}?mode=ro", uri=True, timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def load_source_data(connection: sqlite3.Connection) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    clients = [
        {
            "uuid": row["uuid"],
            "name": row["name"] or row["uuid"],
            "region": row["region"] or "",
        }
        for row in connection.execute(
            "SELECT uuid, name, region FROM clients WHERE hidden = 0 ORDER BY weight ASC, name ASC"
        )
    ]
    client_ids = {client["uuid"] for client in clients}
    tasks = []
    for row in connection.execute(
        "SELECT id, weight, name, clients, all_clients, type, interval "
        "FROM ping_tasks ORDER BY weight ASC, id ASC"
    ):
        assigned = client_ids if bool(row["all_clients"]) else set(read_json_list(row["clients"])) & client_ids
        tasks.append(
            {
                "id": int(row["id"]),
                "weight": int(row["weight"]),
                "name": row["name"] or f"任务 {row['id']}",
                "type": row["type"] or "icmp",
                "interval": max(1, int(row["interval"] or 60)),
                "clients": sorted(assigned),
            }
        )

    theme_row = connection.execute(
        "SELECT data FROM theme_configurations WHERE short = ?", (THEME_SHORT,)
    ).fetchone()
    settings = read_json_object(theme_row["data"]) if theme_row else {}
    return clients, tasks, settings


def scoring_config(settings: dict[str, Any]) -> dict[str, Any]:
    settings_model_version = int(finite_number(settings.get("networkScoreModelVersion"), 1))
    score_settings = settings if settings_model_version >= SCORE_MODEL_VERSION else {}
    raw_weights = {
        "loss": clamp(finite_number(score_settings.get("networkScoreLossWeight"), DEFAULTS["networkScoreLossWeight"]), 0, 100),
        "p50": clamp(finite_number(score_settings.get("networkScoreP50Weight"), DEFAULTS["networkScoreP50Weight"]), 0, 100),
        "p95": clamp(finite_number(score_settings.get("networkScoreP95Weight"), DEFAULTS["networkScoreP95Weight"]), 0, 100),
        "volatility": clamp(
            finite_number(score_settings.get("networkScoreVolatilityWeight"), DEFAULTS["networkScoreVolatilityWeight"]),
            0,
            100,
        ),
        "coverage": clamp(
            finite_number(score_settings.get("networkScoreCoverageWeight"), DEFAULTS["networkScoreCoverageWeight"]),
            0,
            100,
        ),
    }
    total = sum(raw_weights.values())
    if total <= 0:
        raw_weights = {"loss": 40.0, "p50": 30.0, "p95": 25.0, "volatility": 3.0, "coverage": 2.0}
        total = 100.0
    weights = {key: round(value * 100 / total, 4) for key, value in raw_weights.items()}
    fair_threshold = clamp(
        finite_number(score_settings.get("networkScoreFairThreshold"), DEFAULTS["networkScoreFairThreshold"]),
        0,
        100,
    )
    good_threshold = max(
        fair_threshold,
        clamp(
            finite_number(score_settings.get("networkScoreGoodThreshold"), DEFAULTS["networkScoreGoodThreshold"]),
            0,
            100,
        ),
    )
    excellent_threshold = max(
        good_threshold,
        clamp(
            finite_number(
                score_settings.get("networkScoreExcellentThreshold"), DEFAULTS["networkScoreExcellentThreshold"]
            ),
            0,
            100,
        ),
    )
    return {
        "name": "同任务网络质量对比指数",
        "model_version": SCORE_MODEL_VERSION,
        "volatility_scale": "absolute_ratio",
        "weights": weights,
        "minimum_samples": max(
            1, int(finite_number(settings.get("networkScoreMinSamples"), DEFAULTS["networkScoreMinSamples"]))
        ),
        "minimum_coverage_percent": clamp(
            finite_number(settings.get("networkScoreMinCoverage"), DEFAULTS["networkScoreMinCoverage"]), 0, 100
        ),
        "minimum_rankable_nodes": 3,
        "grade_thresholds": {
            "excellent": excellent_threshold,
            "good": good_threshold,
            "fair": fair_threshold,
        },
    }


def rpc_batch(endpoint: str, hours: int, entity_ids: list[str], timeout: int) -> dict[str, dict[str, Any]]:
    common = {
        "entity_ids": entity_ids,
        "hours": hours,
        "downsample": True,
        "max_points": 1,
    }
    requests = [
        {
            "jsonrpc": "2.0",
            "id": "p50",
            "method": "public:queryMetrics",
            "params": {**common, "metric_keys": ["ping.latency_ms"], "aggregation": "p50"},
        },
        {
            "jsonrpc": "2.0",
            "id": "p95",
            "method": "public:queryMetrics",
            "params": {**common, "metric_keys": ["ping.latency_ms"], "aggregation": "p95"},
        },
        {
            "jsonrpc": "2.0",
            "id": "loss",
            "method": "public:queryMetrics",
            "params": {**common, "metric_keys": ["ping.loss"], "aggregation": "avg"},
        },
    ]
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(requests, separators=(",", ":")).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "emerald-analytics/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.load(response)
    if not isinstance(payload, list):
        raise RuntimeError("Komari RPC batch response is not a list")
    results: dict[str, dict[str, Any]] = {}
    for item in payload:
        if not isinstance(item, dict):
            continue
        request_id = str(item.get("id", ""))
        if "error" in item:
            raise RuntimeError(f"Komari RPC {request_id} failed: {item['error']}")
        result = item.get("result")
        if isinstance(result, dict):
            results[request_id] = result
    missing = {"p50", "p95", "loss"} - results.keys()
    if missing:
        raise RuntimeError(f"Komari RPC response is missing: {', '.join(sorted(missing))}")
    return results


def metric_points(result: dict[str, Any]) -> dict[tuple[str, int], dict[str, Any]]:
    output: dict[tuple[str, int], dict[str, Any]] = {}
    for series in result.get("series", []):
        if not isinstance(series, dict):
            continue
        entity_id = series.get("entity_id")
        tags = series.get("tags") if isinstance(series.get("tags"), dict) else {}
        task_id = tags.get("task_id")
        points = series.get("points")
        if not isinstance(entity_id, str) or not isinstance(task_id, str) or not isinstance(points, list):
            continue
        try:
            numeric_task_id = int(task_id)
        except ValueError:
            continue
        valid_points = [point for point in points if isinstance(point, dict) and point.get("value") is not None]
        if valid_points:
            output[(entity_id, numeric_task_id)] = valid_points[-1]
    return output


def quantile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * percentile
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    fraction = position - lower
    return ordered[lower] * (1 - fraction) + ordered[upper] * fraction


def robust_score(values: list[float], value: float) -> float:
    if len(values) < 2:
        return 100.0
    lower = quantile(values, 0.1)
    upper = quantile(values, 0.9)
    if upper - lower < 1e-9:
        return 100.0
    return round(100 * (1 - clamp((value - lower) / (upper - lower), 0, 1)), 4)


def loss_score(loss_percent: float) -> float:
    breakpoints = [
        (0.0, 100.0),
        (0.01, 98.0),
        (0.05, 94.0),
        (0.1, 90.0),
        (0.5, 75.0),
        (1.0, 60.0),
        (3.0, 35.0),
        (5.0, 20.0),
        (10.0, 0.0),
    ]
    if loss_percent <= breakpoints[0][0]:
        return breakpoints[0][1]
    for index in range(1, len(breakpoints)):
        left_x, left_y = breakpoints[index - 1]
        right_x, right_y = breakpoints[index]
        if loss_percent <= right_x:
            ratio = (loss_percent - left_x) / (right_x - left_x)
            return round(left_y + ratio * (right_y - left_y), 4)
    return 0.0


def volatility_score(volatility: float) -> float:
    """Score P95/P50 spread against fixed ratios so small group differences are not exaggerated."""
    breakpoints = [
        (0.0, 100.0),
        (0.05, 95.0),
        (0.10, 85.0),
        (0.20, 65.0),
        (0.50, 20.0),
        (1.00, 0.0),
    ]
    value = max(0.0, volatility)
    if value <= breakpoints[0][0]:
        return breakpoints[0][1]
    for index in range(1, len(breakpoints)):
        left_x, left_y = breakpoints[index - 1]
        right_x, right_y = breakpoints[index]
        if value <= right_x:
            ratio = (value - left_x) / (right_x - left_x)
            return round(left_y + ratio * (right_y - left_y), 4)
    return 0.0


def grade_for(score: float | None, thresholds: dict[str, float]) -> str:
    if score is None:
        return "未评级"
    if score >= thresholds["excellent"]:
        return "优秀"
    if score >= thresholds["good"]:
        return "良好"
    if score >= thresholds["fair"]:
        return "一般"
    return "较差"


def unranked_reason(samples: int, coverage: float, p50: Any, p95: Any, config: dict[str, Any]) -> str:
    reasons = []
    if samples < config["minimum_samples"]:
        reasons.append(f"样本少于 {config['minimum_samples']}")
    if coverage < config["minimum_coverage_percent"]:
        reasons.append(f"覆盖率低于 {config['minimum_coverage_percent']:g}%")
    if p50 is None or p95 is None:
        reasons.append("延迟分位数缺失")
    return "、".join(reasons)


def build_window(
    hours: int,
    clients: list[dict[str, Any]],
    tasks: list[dict[str, Any]],
    config: dict[str, Any],
    results: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    generated = utc_now()
    p50_points = metric_points(results["p50"])
    p95_points = metric_points(results["p95"])
    loss_points = metric_points(results["loss"])
    client_map = {client["uuid"]: client for client in clients}
    task_output = []

    for task in tasks:
        nodes = []
        expected_samples = max(1, round(hours * 3600 / task["interval"]))
        for uuid in task["clients"]:
            client = client_map.get(uuid)
            if not client:
                continue
            key = (uuid, task["id"])
            p50_point = p50_points.get(key)
            p95_point = p95_points.get(key)
            loss_point = loss_points.get(key)
            p50 = finite_number(p50_point.get("value"), 0) if p50_point else None
            p95 = finite_number(p95_point.get("value"), 0) if p95_point else None
            if p50 is not None and p50 < 0:
                p50 = None
            if p95 is not None and p95 < 0:
                p95 = None
            samples = int((loss_point or p50_point or {}).get("count") or 0)
            loss_fraction = clamp(finite_number(loss_point.get("value"), 0), 0, 1) if loss_point else 0.0
            loss_percent = loss_fraction * 100
            loss_count = int(round(loss_fraction * samples))
            coverage = min(100.0, samples * 100 / expected_samples)
            volatility = (
                max(0.0, p95 - p50) / max(p50, 10.0)
                if p50 is not None and p95 is not None and p50 >= 0 and p95 >= 0
                else None
            )
            reason = unranked_reason(samples, coverage, p50, p95, config)
            nodes.append(
                {
                    "uuid": uuid,
                    "name": client["name"],
                    "region": client["region"],
                    "rank": None,
                    "rankable": not reason,
                    **({"unranked_reason": reason} if reason else {}),
                    "score": None,
                    "grade": "未评级",
                    "p50": round(p50, 4) if p50 is not None else None,
                    "p95": round(p95, 4) if p95 is not None else None,
                    "loss_percent": round(loss_percent, 6),
                    "loss_count": loss_count,
                    "samples": samples,
                    "expected_samples": expected_samples,
                    "coverage_percent": round(coverage, 4),
                    "volatility": round(volatility, 6) if volatility is not None else None,
                }
            )

        eligible = [node for node in nodes if node["rankable"]]
        ranking_available = len(eligible) >= config["minimum_rankable_nodes"]
        if ranking_available:
            p50_values = [node["p50"] for node in eligible]
            p95_values = [node["p95"] for node in eligible]
            weights = config["weights"]
            for node in eligible:
                components = {
                    "loss": loss_score(node["loss_percent"]),
                    "p50": robust_score(p50_values, node["p50"]),
                    "p95": robust_score(p95_values, node["p95"]),
                    "volatility": volatility_score(node["volatility"]),
                    "coverage": clamp(node["coverage_percent"], 0, 100),
                }
                score = sum(components[key] * weights[key] for key in components) / 100
                node["score_components"] = {key: round(value, 4) for key, value in components.items()}
                node["score"] = round(score, 4)
                node["grade"] = grade_for(score, config["grade_thresholds"])
            eligible.sort(key=lambda node: (-node["score"], node["loss_percent"], node["p95"], node["name"]))
            last_score = None
            last_rank = 0
            for index, node in enumerate(eligible, start=1):
                if last_score is None or abs(node["score"] - last_score) > 1e-9:
                    last_rank = index
                    last_score = node["score"]
                node["rank"] = last_rank

        nodes.sort(
            key=lambda node: (
                node["rank"] is None,
                node["rank"] if node["rank"] is not None else 10**9,
                node["name"],
            )
        )
        task_output.append(
            {
                "id": task["id"],
                "name": task["name"],
                "type": task["type"],
                "interval": task["interval"],
                "node_count": len(nodes),
                "rankable_node_count": len(eligible),
                "ranking_available": ranking_available,
                "nodes": nodes,
            }
        )

    result_ends = [
        result.get("end")
        for result in results.values()
        if isinstance(result.get("end"), str) and result.get("end")
    ]
    result_starts = [
        result.get("start")
        for result in results.values()
        if isinstance(result.get("start"), str) and result.get("start")
    ]
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": isoformat(generated),
        "start": min(result_starts) if result_starts else isoformat(generated),
        "end": max(result_ends) if result_ends else isoformat(generated),
        "hours": hours,
        "scoring": config,
        "tasks": task_output,
    }


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary_name, 0o644)
        os.replace(temporary_name, path)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def update_manifest(output_dir: Path) -> None:
    windows: dict[str, Any] = {}
    generated_values = []
    for path in sorted(output_dir.glob("window-*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            hours = int(payload["hours"])
            generated_at = str(payload["generated_at"])
        except (OSError, ValueError, KeyError, json.JSONDecodeError):
            continue
        windows[str(hours)] = {"path": path.name, "generated_at": generated_at, "hours": hours}
        generated_values.append(generated_at)
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": max(generated_values) if generated_values else isoformat(utc_now()),
        "windows": windows,
    }
    atomic_write_json(output_dir / "manifest.json", manifest)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", default="/opt/komari/data/komari.db")
    parser.add_argument("--endpoint", default="http://127.0.0.1:25774/api/rpc2")
    parser.add_argument("--output", default="/var/lib/emerald-analytics")
    parser.add_argument("--group", choices=WINDOW_GROUPS, default="all")
    parser.add_argument("--hours", nargs="+", type=int)
    parser.add_argument("--timeout", type=int, default=180)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    hours_list = sorted(set(args.hours or WINDOW_GROUPS[args.group]))
    invalid = [hours for hours in hours_list if hours not in WINDOW_GROUPS["all"]]
    if invalid:
        raise SystemExit(f"Unsupported windows: {invalid}")

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    os.chmod(output_dir, 0o755)
    with (output_dir / ".lock").open("w", encoding="utf-8") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        with open_database(args.database) as connection:
            clients, tasks, settings = load_source_data(connection)
        config = scoring_config(settings)
        entity_ids = [client["uuid"] for client in clients]
        for hours in hours_list:
            results = rpc_batch(args.endpoint, hours, entity_ids, args.timeout)
            payload = build_window(hours, clients, tasks, config, results)
            atomic_write_json(output_dir / f"window-{hours}.json", payload)
            print(
                f"generated window-{hours}.json: {len(tasks)} tasks, "
                f"{sum(len(task['nodes']) for task in payload['tasks'])} node-task rows"
            )
        update_manifest(output_dir)


if __name__ == "__main__":
    main()
