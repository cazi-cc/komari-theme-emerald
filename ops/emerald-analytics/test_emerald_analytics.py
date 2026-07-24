import importlib.util
import sys
import unittest
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


if __name__ == "__main__":
    unittest.main()
