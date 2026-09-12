"""Evaluate a GymLab video benchmark manifest without third-party packages.

The manifest is deliberately small and auditable.  It may be either a JSON
array or an object with a ``samples`` array.  Each sample has this shape::

    {
      "id": "clip-001",
      "subject_id": "subject-07",
      "camera_id": "camera-a",
      "ground_truth": {
        "exercise": "squat",
        "reps": 10,
        "load_kg": 60,
        "active_seconds": 31,
        "met": 6,
        "body_weight_kg": 82.5
      },
      "prediction": {
        "exercise": "squat",
        "reps": 9,
        "load_kg": 60,
        "active_seconds": 30,
        "calories": 4.125,
        "pose_coverage": 0.98
      }
    }

Missing predictions are treated as abstentions and reported separately; they
are never silently converted into a correct or incorrect numeric value.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any, Iterable


EVALUATOR_VERSION = "1.7.0"
MANIFEST_SCHEMA_VERSION = "gymlab.video-benchmark.v1"
AUDIT_SCHEMA_VERSION = "gymlab.video-analysis.v1"


def validate_analysis_scope(scope: Any, source: Path) -> None:
    """Require an auditable partition of the catalog and runtime profiles."""

    if not isinstance(scope, dict):
        raise ValueError(f"{source}: audit is missing analysisScope")
    catalog_count = scope.get("catalogCount")
    automatic_count = scope.get("automaticProfileCount")
    manual_count = scope.get("manualReviewCount")
    automatic_ids = scope.get("automaticProfileIds")
    manual_ids = scope.get("manualReviewExerciseIds")
    counts = (catalog_count, automatic_count, manual_count)
    if any(isinstance(value, bool) or not isinstance(value, int) for value in counts):
        raise ValueError(f"{source}: analysisScope counts must be integers")
    if catalog_count <= 0 or automatic_count < 0 or manual_count < 0:
        raise ValueError(f"{source}: analysisScope counts are out of range")
    if automatic_count + manual_count != catalog_count:
        raise ValueError(f"{source}: analysisScope counts do not partition the catalog")
    if not isinstance(automatic_ids, list) or not isinstance(manual_ids, list):
        raise ValueError(f"{source}: analysisScope id lists are missing")
    if len(automatic_ids) != automatic_count or len(manual_ids) != manual_count:
        raise ValueError(f"{source}: analysisScope id counts do not match")
    if any(not isinstance(item, str) or not item.strip() for item in [*automatic_ids, *manual_ids]):
        raise ValueError(f"{source}: analysisScope ids must be non-empty strings")
    all_ids = [*automatic_ids, *manual_ids]
    if len(set(all_ids)) != len(all_ids):
        raise ValueError(f"{source}: analysisScope ids must be unique")


def validate_prediction_audit(raw: Any, source: Path) -> None:
    """Require the runtime provenance needed for a release benchmark."""

    if not isinstance(raw, dict) or raw.get("schema_version") != AUDIT_SCHEMA_VERSION:
        raise ValueError(f"{source}: audit must declare {AUDIT_SCHEMA_VERSION}")
    result = raw.get("result")
    if not isinstance(result, dict):
        raise ValueError(f"{source}: audit is missing result")
    input_hash = result.get("inputFileSha256")
    if not isinstance(input_hash, str) or len(input_hash) != 64 or any(
        char not in "0123456789abcdef" for char in input_hash.lower()
    ):
        raise ValueError(f"{source}: audit is missing a valid inputFileSha256")
    algorithm = result.get("analysisAlgorithm")
    if not isinstance(algorithm, str) or not algorithm.strip():
        raise ValueError(f"{source}: audit is missing analysisAlgorithm")
    if result.get("poseDelegate") not in {"GPU", "CPU"}:
        raise ValueError(f"{source}: audit must record poseDelegate as GPU or CPU")
    if result.get("poseModelIntegrity") != "verified":
        raise ValueError(f"{source}: pose model integrity is not verified")
    if result.get("ocrModelIntegrity") not in {"verified", "not_run"}:
        raise ValueError(f"{source}: audit is missing an explicit OCR integrity decision")
    profile_status = result.get("profileModelStatus")
    if not isinstance(profile_status, str) or not profile_status.strip():
        raise ValueError(f"{source}: audit is missing profileModelStatus")
    if result.get("profileModelIntegrity") not in {"verified", "not_run"}:
        raise ValueError(f"{source}: audit is missing profile-model integrity decision")
    profile_hash = result.get("profileModelSha256")
    if profile_hash is not None and (
        not isinstance(profile_hash, str)
        or len(profile_hash) != 64
        or any(char not in "0123456789abcdef" for char in profile_hash.lower())
    ):
        raise ValueError(f"{source}: profileModelSha256 is invalid")
    profile_evaluator = result.get("profileEvaluatorVersion")
    if profile_evaluator is not None and (not isinstance(profile_evaluator, str) or not profile_evaluator.strip()):
        raise ValueError(f"{source}: profileEvaluatorVersion is invalid")
    if profile_status == "validated" and profile_evaluator != EVALUATOR_VERSION:
        raise ValueError(f"{source}: validated profile model is not tied to evaluator {EVALUATOR_VERSION}")
    if result.get("featureTraceSchema") != "gymlab.pose-feature-trace.v1":
        raise ValueError(f"{source}: audit is missing the pose feature trace schema")
    if result.get("repetitionEventSchema") != "gymlab.repetition-events.v1":
        raise ValueError(f"{source}: audit is missing the repetition event schema")
    for field in ("qualityGatePassed", "bodyWeightConfirmed", "weightConfirmed"):
        if not isinstance(result.get(field), bool):
            raise ValueError(f"{source}: audit is missing {field}")
    validate_analysis_scope(result.get("analysisScope"), source)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_manifest_provenance(
    raw: Any,
    source: Path,
    clips_dir: Path | None = None,
    audits_dir: Path | None = None,
) -> None:
    """Require dataset governance metadata and immutable clip fingerprints."""

    if not isinstance(raw, dict) or raw.get("schema_version") != MANIFEST_SCHEMA_VERSION:
        raise ValueError(f"{source}: production manifest must declare {MANIFEST_SCHEMA_VERSION}")
    dataset = raw.get("dataset")
    if not isinstance(dataset, dict):
        raise ValueError(f"{source}: production manifest is missing dataset metadata")
    for field in ("name", "revision", "license", "consent_policy", "annotation_revision", "split"):
        if not str(dataset.get(field, "")).strip():
            raise ValueError(f"{source}: dataset metadata is missing {field}")
    if dataset["split"] not in {"train", "validation", "test"}:
        raise ValueError(f"{source}: dataset.split must be train, validation or test")

    root = clips_dir.resolve() if clips_dir else None
    audits_root = audits_dir.resolve() if audits_dir else None
    for index, sample in enumerate(raw.get("samples", [])):
        source_file = sample.get("source_file")
        digest = sample.get("file_sha256")
        if not isinstance(source_file, str) or not source_file.strip():
            raise ValueError(f"{source}: sample {index} is missing source_file")
        if Path(source_file).is_absolute() or ".." in Path(source_file).parts:
            raise ValueError(f"{source}: sample {index} source_file escapes the clip root")
        if not isinstance(digest, str) or len(digest) != 64 or any(char not in "0123456789abcdef" for char in digest.lower()):
            raise ValueError(f"{source}: sample {index} has an invalid file_sha256")
        file_size = sample.get("file_size_bytes")
        if isinstance(file_size, bool) or not isinstance(file_size, int) or file_size < 0:
            raise ValueError(f"{source}: sample {index} has an invalid file_size_bytes")
        if root is not None:
            clip = (root / source_file).resolve()
            try:
                clip.relative_to(root)
            except ValueError as error:
                raise ValueError(f"{source}: sample {index} source_file escapes clips_dir") from error
            if not clip.is_file():
                raise ValueError(f"{source}: clip not found: {source_file}")
            if clip.stat().st_size != file_size or sha256_file(clip) != digest.lower():
                raise ValueError(f"{source}: clip fingerprint mismatch: {source_file}")
        if audits_root is not None:
            audit_file = sample.get("prediction_audit_file")
            audit_digest = sample.get("prediction_audit_sha256")
            if not isinstance(audit_file, str) or not audit_file.strip():
                raise ValueError(f"{source}: sample {index} is missing prediction_audit_file")
            if Path(audit_file).is_absolute() or ".." in Path(audit_file).parts:
                raise ValueError(f"{source}: sample {index} prediction_audit_file escapes the audit root")
            if not isinstance(audit_digest, str) or len(audit_digest) != 64 or any(
                char not in "0123456789abcdef" for char in audit_digest.lower()
            ):
                raise ValueError(f"{source}: sample {index} has an invalid prediction_audit_sha256")
            audit = (audits_root / audit_file).resolve()
            try:
                audit.relative_to(audits_root)
            except ValueError as error:
                raise ValueError(f"{source}: sample {index} prediction_audit_file escapes audits_dir") from error
            if not audit.is_file():
                raise ValueError(f"{source}: audit not found: {audit_file}")
            if sha256_file(audit) != audit_digest.lower():
                raise ValueError(f"{source}: prediction audit fingerprint mismatch: {audit_file}")
            audit_raw = json.loads(audit.read_text(encoding="utf-8"))
            source_path = Path(str(source))
            validate_prediction_audit(
                audit_raw,
                source_path.with_name(f"{source_path.name}__{audit_file}"),
            )


def load_manifest(
    path: Path,
    *,
    require_provenance: bool = False,
    clips_dir: Path | None = None,
    audits_dir: Path | None = None,
) -> list[dict[str, Any]]:
    """Load and minimally validate a JSON benchmark manifest."""

    raw = json.loads(path.read_text(encoding="utf-8"))
    samples = raw.get("samples") if isinstance(raw, dict) else raw
    if not isinstance(samples, list):
        raise ValueError(f"{path}: expected a JSON array or an object with samples[]")
    if not samples:
        raise ValueError(f"{path}: samples[] must not be empty")
    if require_provenance:
        validate_manifest_provenance(raw, path, clips_dir, audits_dir)
    result: list[dict[str, Any]] = []
    for index, sample in enumerate(samples):
        if not isinstance(sample, dict):
            raise ValueError(f"{path}: sample {index} is not an object")
        for field in ("id", "subject_id", "camera_id"):
            if not str(sample.get(field, "")).strip():
                raise ValueError(f"{path}: sample {index} is missing {field}")
        if not isinstance(sample.get("ground_truth"), dict):
            raise ValueError(f"{path}: sample {index} is missing ground_truth")
        if not isinstance(sample.get("prediction"), dict):
            raise ValueError(f"{path}: sample {index} is missing prediction")
        result.append(sample)
    return validate_samples(result, path)


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    return value if math.isfinite(value) else None


def validate_samples(samples: list[dict[str, Any]], source: Any = "<manifest>") -> list[dict[str, Any]]:
    """Validate IDs and annotation ranges before calculating any metric."""

    seen_ids: set[str] = set()
    numeric_ranges = {
        "reps": (0.0, 1000.0),
        "load_kg": (0.0, 500.0),
        "active_seconds": (0.0, 86400.0),
        "met": (0.0, 30.0),
        "body_weight_kg": (20.0, 300.0),
        "calories": (0.0, None),
        "pose_coverage": (0.0, 1.0),
    }
    for index, sample in enumerate(samples):
        sample_id = str(sample.get("id", "")).strip()
        if sample_id in seen_ids:
            raise ValueError(f"{source}: duplicate sample id {sample_id!r}")
        seen_ids.add(sample_id)
        for section_name in ("ground_truth", "prediction"):
            section = sample[section_name]
            exercise = section.get("exercise")
            if exercise is not None and not isinstance(exercise, str):
                raise ValueError(f"{source}: sample {index} {section_name}.exercise must be a string")
            for field, (lower, upper) in numeric_ranges.items():
                value = section.get(field)
                if value is None:
                    continue
                number = _number(value)
                if number is None or number < lower or (upper is not None and number > upper):
                    raise ValueError(
                        f"{source}: sample {index} {section_name}.{field} is outside [{lower}, {upper}]"
                    )
    return samples


def _label(value: Any) -> str:
    value = str(value or "unknown").strip().lower()
    return value or "unknown"


def _mean(values: Iterable[float]) -> float | None:
    values = list(values)
    return sum(values) / len(values) if values else None


def _rate(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def classification_metrics(samples: list[dict[str, Any]]) -> dict[str, Any]:
    truth = [_label(sample["ground_truth"].get("exercise")) for sample in samples]
    prediction = [_label(sample["prediction"].get("exercise")) for sample in samples]
    # Macro-F1 is over labeled ground-truth classes.  A model's ``unknown``
    # abstention is reported separately; adding a prediction-only pseudo-class
    # would lower macro-F1 twice for the same abstention.
    labels = sorted(set(truth))
    per_class: dict[str, dict[str, float | int | None]] = {}
    f1_values: list[float] = []
    for label in labels:
        tp = sum(actual == label and predicted == label for actual, predicted in zip(truth, prediction))
        fp = sum(actual != label and predicted == label for actual, predicted in zip(truth, prediction))
        fn = sum(actual == label and predicted != label for actual, predicted in zip(truth, prediction))
        precision = _rate(tp, tp + fp)
        recall = _rate(tp, tp + fn)
        f1 = (2 * precision * recall / (precision + recall)) if precision and recall else 0.0
        f1_values.append(f1)
        per_class[label] = {
            "support": tp + fn,
            "precision": precision,
            "recall": recall,
            "f1": f1,
        }
    unknown_count = sum(item == "unknown" for item in prediction)
    return {
        "macro_f1": _mean(f1_values),
        "accuracy": _rate(sum(a == b for a, b in zip(truth, prediction)), len(samples)),
        "prediction_abstention_rate": _rate(unknown_count, len(samples)),
        "per_class": per_class,
    }


def numeric_metrics(
    samples: list[dict[str, Any]],
    truth_key: str,
    prediction_key: str,
    *,
    tolerance: Any = None,
) -> dict[str, Any]:
    truth_values: list[float] = []
    paired_errors: list[float] = []
    within_tolerance = 0
    abstentions = 0
    for sample in samples:
        truth = _number(sample["ground_truth"].get(truth_key))
        if truth is None:
            continue
        truth_values.append(truth)
        prediction = _number(sample["prediction"].get(prediction_key))
        if prediction is None:
            abstentions += 1
            continue
        error = abs(prediction - truth)
        paired_errors.append(error)
        if tolerance is not None:
            allowed_error = tolerance(truth) if callable(tolerance) else tolerance
            if error <= allowed_error:
                within_tolerance += 1
    labeled = len(truth_values)
    paired = len(paired_errors)
    return {
        "labeled_count": labeled,
        "paired_count": paired,
        "abstention_rate": _rate(abstentions, labeled),
        "mae": _mean(paired_errors),
        "within_tolerance_rate": _rate(within_tolerance, paired) if tolerance is not None else None,
    }


def calorie_metrics(samples: list[dict[str, Any]]) -> dict[str, Any]:
    truth_values: list[float] = []
    prediction_values: list[float] = []
    for sample in samples:
        truth = _number(sample["ground_truth"].get("calories"))
        if truth is None:
            ground_truth = sample["ground_truth"]
            met = _number(ground_truth.get("met"))
            body_weight = _number(ground_truth.get("body_weight_kg"))
            active_seconds = _number(ground_truth.get("active_seconds"))
            if met is not None and body_weight is not None and active_seconds is not None:
                truth = met * body_weight * active_seconds / 3600
        prediction = _number(sample["prediction"].get("calories"))
        if truth is not None and prediction is not None:
            truth_values.append(truth)
            prediction_values.append(prediction)
    errors = [abs(predicted - actual) for actual, predicted in zip(truth_values, prediction_values)]
    relative_errors = [error / actual for actual, error in zip(truth_values, errors) if actual > 0]
    return {
        "paired_count": len(errors),
        "mae": _mean(errors),
        "mean_relative_error": _mean(relative_errors),
    }


def evaluate_records(samples: list[dict[str, Any]]) -> dict[str, Any]:
    """Return all release metrics for validated samples."""

    return {
        "sample_count": len(samples),
        "classification": classification_metrics(samples),
        "reps": numeric_metrics(samples, "reps", "reps", tolerance=1),
        "load_kg": numeric_metrics(
            samples,
            "load_kg",
            "load_kg",
            tolerance=lambda actual: max(0.5, actual * 0.02),
        ),
        "active_seconds": numeric_metrics(samples, "active_seconds", "active_seconds"),
        "calories": calorie_metrics(samples),
        "pose_coverage_mean": _mean(
            value
            for value in (_number(sample["prediction"].get("pose_coverage")) for sample in samples)
            if value is not None
        ),
    }


def class_coverage_metrics(samples: list[dict[str, Any]], classes: set[str]) -> dict[str, dict[str, Any]]:
    """Report support and identity diversity for every required class."""

    coverage: dict[str, dict[str, Any]] = {}
    for label in sorted(classes):
        matching = [
            sample for sample in samples
            if _label(sample["ground_truth"].get("exercise")) == label
        ]
        coverage[label] = {
            "support": len(matching),
            "subject_count": len({str(sample["subject_id"]) for sample in matching}),
            "camera_count": len({str(sample["camera_id"]) for sample in matching}),
        }
    return coverage


def validate_disjoint(train: list[dict[str, Any]], test: list[dict[str, Any]]) -> dict[str, list[str]]:
    """Report subject/camera overlap; a valid held-out split has none."""

    train_subjects = {str(sample["subject_id"]) for sample in train}
    test_subjects = {str(sample["subject_id"]) for sample in test}
    train_cameras = {str(sample["camera_id"]) for sample in train}
    test_cameras = {str(sample["camera_id"]) for sample in test}
    return {
        "subject_overlap": sorted(train_subjects & test_subjects),
        "camera_overlap": sorted(train_cameras & test_cameras),
    }


def _check_thresholds(metrics: dict[str, Any], args: argparse.Namespace) -> list[str]:
    failures: list[str] = []
    checks = (
        (args.min_macro_f1, metrics["classification"]["macro_f1"], "macro_f1", lambda actual, limit: actual >= limit),
        (args.max_rep_mae, metrics["reps"]["mae"], "rep_mae", lambda actual, limit: actual <= limit),
        (args.max_active_duration_mae, metrics["active_seconds"]["mae"], "active_duration_mae", lambda actual, limit: actual <= limit),
        (args.min_load_accuracy, metrics["load_kg"]["within_tolerance_rate"], "load_accuracy", lambda actual, limit: actual >= limit),
        (args.max_load_abstention, metrics["load_kg"]["abstention_rate"], "load_abstention", lambda actual, limit: actual <= limit),
        (args.max_calorie_mae, metrics["calories"]["mae"], "calorie_mae", lambda actual, limit: actual <= limit),
    )
    for limit, actual, name, predicate in checks:
        if limit is not None and (actual is None or not predicate(actual, limit)):
            failures.append(f"{name}={actual!r} violates threshold {limit}")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--train-manifest", type=Path)
    parser.add_argument("--classes", help="comma-separated classes that must occur in ground truth")
    parser.add_argument("--min-macro-f1", type=float)
    parser.add_argument("--max-rep-mae", type=float)
    parser.add_argument("--max-active-duration-mae", type=float)
    parser.add_argument("--min-load-accuracy", type=float)
    parser.add_argument("--max-load-abstention", type=float)
    parser.add_argument("--max-calorie-mae", type=float)
    parser.add_argument(
        "--min-class-support",
        type=int,
        help="minimum held-out clips per required ground-truth class",
    )
    parser.add_argument(
        "--min-subjects-per-class",
        type=int,
        help="minimum distinct held-out subjects per required ground-truth class",
    )
    parser.add_argument("--strict-disjoint", action="store_true")
    parser.add_argument(
        "--require-provenance",
        action="store_true",
        help="require consent/license metadata and per-clip SHA-256 fingerprints",
    )
    parser.add_argument(
        "--clips-dir",
        type=Path,
        help="optionally re-hash source_file entries under this directory",
    )
    parser.add_argument(
        "--audits-dir",
        type=Path,
        help="optionally re-hash and validate prediction_audit_file entries",
    )
    args = parser.parse_args()

    try:
        samples = load_manifest(
            args.manifest,
            require_provenance=args.require_provenance,
            clips_dir=args.clips_dir,
            audits_dir=args.audits_dir,
        )
        metrics = evaluate_records(samples)
        failures = _check_thresholds(metrics, args)
        required_classes = {_label(item) for item in (args.classes or "").split(",") if item.strip()}
        present_classes = {_label(sample["ground_truth"].get("exercise")) for sample in samples}
        missing_classes = sorted(required_classes - present_classes)
        if missing_classes:
            failures.append(f"missing ground-truth classes: {', '.join(missing_classes)}")
        class_coverage = class_coverage_metrics(samples, required_classes)
        if args.min_class_support is not None:
            if args.min_class_support < 1:
                failures.append(f"min_class_support={args.min_class_support!r} must be positive")
            for exercise, coverage in class_coverage.items():
                if coverage["support"] < args.min_class_support:
                    failures.append(
                        f"class_support[{exercise}]={coverage['support']!r} below threshold {args.min_class_support}"
                    )
        if args.min_subjects_per_class is not None:
            if args.min_subjects_per_class < 1:
                failures.append(f"min_subjects_per_class={args.min_subjects_per_class!r} must be positive")
            for exercise, coverage in class_coverage.items():
                if coverage["subject_count"] < args.min_subjects_per_class:
                    failures.append(
                        f"subject_support[{exercise}]={coverage['subject_count']!r} below threshold {args.min_subjects_per_class}"
                    )
        metrics["class_coverage"] = class_coverage
        split_report = None
        if args.train_manifest:
            train = load_manifest(
                args.train_manifest,
                require_provenance=args.require_provenance,
                clips_dir=args.clips_dir,
                audits_dir=args.audits_dir,
            )
            split_report = validate_disjoint(train, samples)
            if args.strict_disjoint and any(split_report.values()):
                failures.append(f"held-out split is not disjoint: {split_report}")
        report = {
            "evaluator_version": EVALUATOR_VERSION,
            "provenance_required": args.require_provenance,
            "manifest_sha256": sha256_file(args.manifest),
            "metrics": metrics,
            "thresholds": {
                "min_macro_f1": args.min_macro_f1,
                "max_rep_mae": args.max_rep_mae,
                "max_active_duration_mae": args.max_active_duration_mae,
                "min_load_accuracy": args.min_load_accuracy,
                "max_load_abstention": args.max_load_abstention,
                "max_calorie_mae": args.max_calorie_mae,
                "min_class_support": args.min_class_support,
                "min_subjects_per_class": args.min_subjects_per_class,
                "required_classes": sorted(required_classes),
                "strict_disjoint": args.strict_disjoint,
            },
            "split": split_report,
            "failures": failures,
        }
        if args.train_manifest:
            report["train_manifest_sha256"] = sha256_file(args.train_manifest)
        print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
        return 1 if failures else 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"benchmark evaluation failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
