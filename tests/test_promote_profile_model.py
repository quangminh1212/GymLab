"""Regression tests for the profile-model release gate."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory

from promote_profile_model import promote_model


def _model() -> dict:
    return {
        "schema_version": "gymlab.exercise-profile-model.v1",
        "status": "candidate",
        "training": {"subject_count": 2, "camera_count": 2},
        "classes": {
            "squat": {
                "centroid": {},
                "scale": {},
                "subject_count": 2,
                "camera_count": 2,
                "runtime_profile": {"signal": "knee_angle", "direction": "low", "duration_only": False},
            },
        },
    }


def _report(failures: list[str] | None = None) -> dict:
    return {
        "evaluator_version": "1.7.0",
        "provenance_required": True,
        "metrics": {
            "sample_count": 2,
            "classification": {"macro_f1": 1.0, "per_class": {"squat": {"f1": 1.0}}},
            "reps": {"mae": 0.0},
            "active_seconds": {"mae": 0.0},
            "load_kg": {"within_tolerance_rate": 1.0},
            "calories": {"mae": 0.0},
            "class_coverage": {
                "squat": {"support": 2, "subject_count": 2, "camera_count": 2},
            },
        },
        "thresholds": {
            "min_macro_f1": 0.95,
            "max_rep_mae": 1.0,
            "max_active_duration_mae": 5.0,
            "min_load_accuracy": 0.9,
            "max_load_abstention": 0.1,
            "max_calorie_mae": 1.0,
            "min_class_support": 2,
            "min_subjects_per_class": 2,
            "required_classes": ["squat"],
            "strict_disjoint": True,
        },
        "split": {"subject_overlap": [], "camera_overlap": []},
        "failures": failures or [],
    }


def test_promotion_requires_passing_provenance_report() -> None:
    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        model_path = root / "candidate.json"
        report_path = root / "report.json"
        model_path.write_text(json.dumps(_model()), encoding="utf-8")
        report_path.write_text(json.dumps(_report()), encoding="utf-8")
        promoted = promote_model(model_path, report_path)
        assert promoted["status"] == "validated"
        assert promoted["release_gate"]["evaluator_version"] == "1.7.0"
        assert len(promoted["release_gate"]["report_sha256"]) == 64
        assert promoted["release_gate"]["report"] == _report()


def test_promotion_rejects_failures() -> None:
    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        model_path = root / "candidate.json"
        report_path = root / "report.json"
        model_path.write_text(json.dumps(_model()), encoding="utf-8")
        report_path.write_text(json.dumps(_report(["macro_f1 below threshold"])), encoding="utf-8")
        try:
            promote_model(model_path, report_path)
        except ValueError as error:
            assert "not passing" in str(error)
        else:
            raise AssertionError("models with evaluator failures must not be promoted")


def test_promotion_rejects_stale_evaluator() -> None:
    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        model_path = root / "candidate.json"
        report_path = root / "report.json"
        model_path.write_text(json.dumps(_model()), encoding="utf-8")
        report_path.write_text(json.dumps(_report() | {"evaluator_version": "1.6.0"}), encoding="utf-8")
        try:
            promote_model(model_path, report_path)
        except ValueError as error:
            assert "evaluator 1.7.0" in str(error)
        else:
            raise AssertionError("stale evaluator reports must not be promoted")


def test_promotion_rejects_missing_runtime_profile() -> None:
    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        model = _model()
        del model["classes"]["squat"]["runtime_profile"]
        model_path = root / "candidate.json"
        report_path = root / "report.json"
        model_path.write_text(json.dumps(model), encoding="utf-8")
        report_path.write_text(json.dumps(_report()), encoding="utf-8")
        try:
            promote_model(model_path, report_path)
        except ValueError as error:
            assert "runtime_profile" in str(error)
        else:
            raise AssertionError("models without runtime profile metadata must not be promoted")


def test_promotion_rejects_missing_class_coverage() -> None:
    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        model_path = root / "candidate.json"
        report_path = root / "report.json"
        model_path.write_text(json.dumps(_model()), encoding="utf-8")
        report = _report()
        del report["metrics"]["class_coverage"]
        report_path.write_text(json.dumps(report), encoding="utf-8")
        try:
            promote_model(model_path, report_path)
        except ValueError as error:
            assert "class coverage" in str(error)
        else:
            raise AssertionError("reports without class coverage must not be promoted")


if __name__ == "__main__":
    test_promotion_requires_passing_provenance_report()
    test_promotion_rejects_failures()
    test_promotion_rejects_stale_evaluator()
    test_promotion_rejects_missing_runtime_profile()
    test_promotion_rejects_missing_class_coverage()
    print("profile-model-promotion: OK")
