"""Promote a candidate profile model only after a passing evaluator report."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MODEL_SCHEMA_VERSION = "gymlab.exercise-profile-model.v1"
CURRENT_EVALUATOR_VERSION = "1.7.0"
RUNTIME_PROFILE_SIGNALS = {"knee_angle", "elbow_angle", "hip_angle", "wrist_height"}
RELEASE_THRESHOLD_KEYS = (
    "min_macro_f1",
    "max_rep_mae",
    "max_active_duration_mae",
    "min_load_accuracy",
    "max_load_abstention",
    "max_calorie_mae",
    "min_class_support",
    "min_subjects_per_class",
)


def _canonical_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _canonical_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_canonical_value(item) for item in value]
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def canonical_json(value: Any) -> str:
    """Serialize a report deterministically for runtime hash verification."""
    return json.dumps(
        _canonical_value(value),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def sha256_report(report: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(report).encode("utf-8")).hexdigest()


def promote_model(model_path: Path, report_path: Path) -> dict[str, Any]:
    model = json.loads(model_path.read_text(encoding="utf-8"))
    report = json.loads(report_path.read_text(encoding="utf-8"))
    if not isinstance(model, dict) or model.get("schema_version") != MODEL_SCHEMA_VERSION:
        raise ValueError(f"model must declare {MODEL_SCHEMA_VERSION}")
    if model.get("status") != "candidate":
        raise ValueError("only candidate models can be promoted")
    if not isinstance(model.get("classes"), dict) or not model["classes"]:
        raise ValueError("candidate model has no classes")
    for exercise_id, class_profile in model["classes"].items():
        runtime = class_profile.get("runtime_profile") if isinstance(class_profile, dict) else None
        if not isinstance(runtime, dict) or not isinstance(runtime.get("duration_only"), bool):
            raise ValueError(f"class {exercise_id!r} is missing runtime_profile metadata")
        if runtime["duration_only"]:
            if runtime.get("signal") is not None or runtime.get("direction") is not None:
                raise ValueError(f"duration-only class {exercise_id!r} has rep metadata")
        elif runtime.get("signal") not in RUNTIME_PROFILE_SIGNALS or runtime.get("direction") not in {"low", "high"}:
            raise ValueError(f"class {exercise_id!r} has invalid runtime_profile metadata")
    if not isinstance(report, dict) or not report.get("evaluator_version"):
        raise ValueError("evaluation report is missing evaluator_version")
    if report["evaluator_version"] != CURRENT_EVALUATOR_VERSION:
        raise ValueError(f"evaluation report must use evaluator {CURRENT_EVALUATOR_VERSION}")
    if report.get("provenance_required") is not True:
        raise ValueError("evaluation report must require provenance")
    failures = report.get("failures")
    if not isinstance(failures, list) or failures:
        raise ValueError(f"evaluation report is not passing: {failures!r}")
    thresholds = report.get("thresholds")
    if not isinstance(thresholds, dict):
        raise ValueError("evaluation report is missing release thresholds")
    if any(
        key not in thresholds
        or isinstance(thresholds[key], bool)
        or not isinstance(thresholds[key], (int, float))
        or not math.isfinite(float(thresholds[key]))
        for key in RELEASE_THRESHOLD_KEYS
    ):
        raise ValueError("release report must declare finite acceptance thresholds")
    required_classes = thresholds.get("required_classes")
    if not isinstance(required_classes, list) or not required_classes or any(
        not isinstance(item, str) or not item.strip() for item in required_classes
    ):
        raise ValueError("release report must declare required classes")
    if thresholds.get("strict_disjoint") is not True:
        raise ValueError("release report must require strict subject/camera disjointness")
    split = report.get("split")
    if not isinstance(split, dict) or split.get("subject_overlap") or split.get("camera_overlap"):
        raise ValueError("release report must contain a disjoint held-out split")
    metrics = report.get("metrics")
    if not isinstance(metrics, dict) or isinstance(metrics.get("sample_count"), bool) or not isinstance(metrics.get("sample_count"), int) or metrics["sample_count"] <= 0:
        raise ValueError("evaluation report is missing metrics")
    for section, metric in (
        ("classification", "macro_f1"),
        ("reps", "mae"),
        ("active_seconds", "mae"),
        ("load_kg", "within_tolerance_rate"),
        ("calories", "mae"),
    ):
        value = metrics.get(section, {}).get(metric) if isinstance(metrics.get(section), dict) else None
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
            raise ValueError(f"evaluation report is missing finite metric {section}.{metric}")
    per_class = metrics.get("classification", {}).get("per_class", {})
    if not isinstance(per_class, dict) or any(item not in per_class for item in required_classes):
        raise ValueError("evaluation report is missing a required class metric")
    class_coverage = metrics.get("class_coverage")
    if not isinstance(class_coverage, dict):
        raise ValueError("evaluation report is missing class coverage metrics")
    min_class_support = int(thresholds["min_class_support"])
    min_subjects_per_class = int(thresholds["min_subjects_per_class"])
    if min_class_support < 1 or min_subjects_per_class < 1:
        raise ValueError("release report must require positive class coverage thresholds")
    training = model.get("training")
    if not isinstance(training, dict):
        raise ValueError("candidate model is missing training diversity metadata")
    for exercise_id in required_classes:
        class_profile = model["classes"].get(exercise_id)
        if not isinstance(class_profile, dict):
            raise ValueError(f"candidate model is missing required class {exercise_id}")
        trained_subjects = class_profile.get("subject_count")
        if not isinstance(trained_subjects, int) or trained_subjects < min_subjects_per_class:
            raise ValueError(f"training subject coverage for {exercise_id} is below the release threshold")
        coverage = class_coverage.get(exercise_id)
        if not isinstance(coverage, dict):
            raise ValueError(f"evaluation report is missing class coverage for {exercise_id}")
        support = coverage.get("support")
        subject_count = coverage.get("subject_count")
        if not isinstance(support, int) or support < min_class_support:
            raise ValueError(f"class coverage for {exercise_id} is below the release threshold")
        if not isinstance(subject_count, int) or subject_count < min_subjects_per_class:
            raise ValueError(f"subject coverage for {exercise_id} is below the release threshold")

    promoted = dict(model)
    promoted["status"] = "validated"
    promoted["release_gate"] = {
        "report_sha256": sha256_report(report),
        "evaluator_version": report["evaluator_version"],
        "promoted_at": datetime.now(timezone.utc).isoformat(),
        "metrics": report["metrics"],
        "report": report,
    }
    return promoted


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", type=Path)
    parser.add_argument("report", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        promoted = promote_model(args.model, args.report)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(promoted, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({
            "schema_version": MODEL_SCHEMA_VERSION,
            "status": promoted["status"],
            "output": str(args.output),
        }, ensure_ascii=False))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"profile model promotion failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
