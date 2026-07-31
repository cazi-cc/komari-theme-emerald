import importlib.util
import io
import json
import sys
import unittest
from unittest import mock
from pathlib import Path
from types import SimpleNamespace


if sys.platform == "win32":
    sys.modules.setdefault("fcntl", SimpleNamespace())

MODULE_PATH = Path(__file__).with_name("emerald_analytics.py")
SPEC = importlib.util.spec_from_file_location("emerald_analytics", MODULE_PATH)
assert SPEC and SPEC.loader
analytics = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(analytics)


class ScoringModelTests(unittest.TestCase):
    def test_rpc_batch_requests_one_full_window_aggregate(self):
        response = [
            {"id": "stats", "result": {"stats": []}},
        ]

        class FakeResponse(io.BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                self.close()

        captured = {}

        def fake_urlopen(request, timeout):
            captured["payload"] = json.loads(request.data)
            captured["timeout"] = timeout
            return FakeResponse(json.dumps(response).encode("utf-8"))

        with mock.patch.object(analytics.urllib.request, "urlopen", fake_urlopen):
            analytics.rpc_batch("https://example.invalid/api/rpc2", 6, ["node-a"], 30)

        self.assertEqual(captured["timeout"], 30)
        self.assertEqual(len(captured["payload"]), 1)
        stats_request = next(request for request in captured["payload"] if request["id"] == "stats")
        self.assertEqual(stats_request["method"], "public:getPingMetricWindowStats")
        self.assertEqual(stats_request["params"], {"entity_ids": ["node-a"], "hours": 6})

    def test_legacy_settings_migrate_to_v2_defaults(self):
        config = analytics.scoring_config(
            {
                "networkScoreLossWeight": 40,
                "networkScoreP50Weight": 25,
                "networkScoreP95Weight": 20,
                "networkScoreVolatilityWeight": 10,
                "networkScoreCoverageWeight": 5,
                "networkScoreExcellentThreshold": 85,
            }
        )

        self.assertEqual(config["model_version"], 2)
        self.assertEqual(
            config["weights"],
            {"loss": 40.0, "p50": 30.0, "p95": 25.0, "volatility": 3.0, "coverage": 2.0},
        )
        self.assertEqual(config["grade_thresholds"], {"excellent": 95.0, "good": 85.0, "fair": 70.0})

    def test_current_model_keeps_custom_weights(self):
        config = analytics.scoring_config(
            {
                "networkScoreModelVersion": 2,
                "networkScoreLossWeight": 45,
                "networkScoreP50Weight": 30,
                "networkScoreP95Weight": 20,
                "networkScoreVolatilityWeight": 3,
                "networkScoreCoverageWeight": 2,
            }
        )

        self.assertEqual(
            config["weights"],
            {"loss": 45.0, "p50": 30.0, "p95": 20.0, "volatility": 3.0, "coverage": 2.0},
        )

    def test_small_volatility_is_not_exaggerated(self):
        self.assertEqual(analytics.volatility_score(0), 100.0)
        self.assertGreater(analytics.volatility_score(0.061), 90)
        self.assertLess(analytics.volatility_score(0.50), analytics.volatility_score(0.20))

    def test_legend_example_is_good_not_excellent(self):
        components = {
            "loss": 100.0,
            "p50": 83.7874,
            "p95": 84.4514,
            "volatility": analytics.volatility_score(0),
            "coverage": 79.0,
        }
        weights = analytics.scoring_config({})["weights"]
        score = sum(components[key] * weights[key] for key in components) / 100

        self.assertGreaterEqual(score, 85)
        self.assertLess(score, 95)
        self.assertEqual(
            analytics.grade_for(score, {"excellent": 95.0, "good": 85.0, "fair": 70.0}),
            "良好",
        )

    def test_public_window_omits_private_task_target(self):
        window = analytics.build_window(
            1,
            [],
            [
                {
                    "id": 1,
                    "name": "移动 IPv6",
                    "target": "private.example.invalid",
                    "type": "icmp",
                    "interval": 30,
                    "clients": [],
                }
            ],
            analytics.scoring_config({}),
            {
                "stats": {"stats": []},
            },
        )

        self.assertEqual(window["schema_version"], 4)
        self.assertNotIn("target", window["tasks"][0])

    def test_public_window_includes_robust_full_latency_range(self):
        stats = {
            "stats": [
                {
                    "entity_id": "node-a",
                    "task_id": "1",
                    "p005": 21.25,
                    "p50": 32.5,
                    "p95": 48.75,
                    "p995": 91.0,
                    "loss": 0.0,
                    "total": 120,
                }
            ]
        }

        window = analytics.build_window(
            1,
            [{"uuid": "node-a", "name": "Node A", "region": "SG"}],
            [{"id": 1, "name": "Task", "type": "icmp", "interval": 30, "clients": ["node-a"]}],
            analytics.scoring_config({}),
            {
                "stats": stats,
            },
        )

        node = window["tasks"][0]["nodes"][0]
        self.assertEqual(node["p005"], 21.25)
        self.assertEqual(node["p50"], 32.5)
        self.assertEqual(node["p95"], 48.75)
        self.assertEqual(node["p995"], 91.0)


if __name__ == "__main__":
    unittest.main()
