"""Train an auditable exercise-profile model from GymLab audit traces.

This trainer intentionally uses only normalized pose-feature traces exported by
GymLab. It does not read video frames, upload data, or claim production
accuracy. The output is a compact centroid/scaling artifact that can be
reviewed and evaluated before a future app release consumes it.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any, Iterable

from evaluate_benchmark import validate_analysis_scope


MODEL_SCHEMA_VERSION = "gymlab.exercise-profile-model.v1"
AUDIT_SCHEMA_VERSION = "gymlab.video-analysis.v1"
TRACE_SCHEMA_VERSION = "gymlab.pose-feature-trace.v1"
RUNTIME_PROFILE_SIGNALS = {"knee_angle", "elbow_angle", "ankle_angle", "hip_angle", "wrist_height"}

FEATURE_ORDER = (
    "knee_angle_range",
    "elbow_angle_range",
    "hip_angle_range",
    "wrist_height_range",
    "wrist_span_range",
    "torso_ratio_mean",
    "torso_ratio_median",
    "horizontal_pose_ratio",
    "vertical_pose_ratio",
    "overhead_pose_ratio",
    "motion_energy",
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _values(trace: list[dict[str, Any]], key: str) -> list[float]:
    return [number for number in (_number(item.get(key)) for item in trace) if number is not None]


def _mean(values: Iterable[float]) -> float:
    values = list(values)
    return sum(values) / len(values) if values else 0.0


def _percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def _median(values: list[float]) -> float:
    return _percentile(values, 0.5)


def _range(values: list[float]) -> float:
    return _percentile(values, 0.9) - _percentile(values, 0.1)


def summarize_trace(trace: list[dict[str, Any]]) -> dict[str, float]:
    if len(trace) < 8:
        raise ValueError("an audit feature trace must contain at least 8 samples")
    knee = _values(trace, "knee_angle")
    elbow = _values(trace, "elbow_angle")
    hip = _values(trace, "hip_angle")
    wrist_height = _values(trace, "wrist_height")
    wrist_span = _values(trace, "wrist_span")
    torso = _values(trace, "torso_ratio")
    if not all((knee, elbow, hip, wrist_height, wrist_span, torso)):
        raise ValueError("an audit feature trace is missing required numeric features")

    horizontal_ratio = sum(value < 0.45 for value in torso) / len(torso)
    vertical_ratio = sum(value > 0.72 for value in torso) / len(torso)
    overhead_ratio = sum(value > 0.02 for value in wrist_height) / len(wrist_height)
    motion_values: list[float] = []
    previous: dict[str, float] | None = None
    for item in trace:
        current = {key: value for key in ("knee_angle", "elbow_angle", "hip_angle")
                   if (value := _number(item.get(key))) is not None}
        for key, multiplier in (("wrist_height", 180.0), ("hip_height", 180.0)):
            value = _number(item.get(key))
            if value is not None:
                current[key] = value * multiplier
        if previous is not None:
            differences = [abs(current[key] - previous[key]) for key in current.keys() & previous.keys()]
            if differences:
                motion_values.append(max(differences))
        previous = current

    summary = {
        "knee_angle_range": _range(knee),
        "elbow_angle_range": _range(elbow),
        "hip_angle_range": _range(hip),
        "wrist_height_range": _range(wrist_height),
        "wrist_span_range": _range(wrist_span),
        "torso_ratio_mean": _mean(torso),
        "torso_ratio_median": _median(torso),
        "horizontal_pose_ratio": horizontal_ratio,
        "vertical_pose_ratio": vertical_ratio,
        "overhead_pose_ratio": overhead_ratio,
        "motion_energy": _mean(motion_values),
    }
    return {key: summary[key] for key in FEATURE_ORDER}


def _load_labels(path: Path) -> list[dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    labels = raw.get("samples") if isinstance(raw, dict) else raw
    if not isinstance(labels, list) or not labels:
        raise ValueError("labels must be a non-empty JSON array or object with samples[]")
    return [item for item in labels if isinstance(item, dict)]


def _safe_audit_path(root: Path, value: Any) -> Path:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("each label must contain audit_file")
    path = (root / value).resolve()
    try:
        path.relative_to(root.resolve())
    except ValueError as error:
        raise ValueError(f"audit path escapes audits directory: {value!r}") from error
    if not path.is_file():
        raise ValueError(f"audit does not exist: {value!r}")
    return path


def _load_trace(path: Path) -> list[dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or raw.get("schema_version") != AUDIT_SCHEMA_VERSION:
        raise ValueError(f"audit {path} must declare {AUDIT_SCHEMA_VERSION}")
    result = raw.get("result")
    if not isinstance(result, dict) or result.get("featureTraceSchema") != TRACE_SCHEMA_VERSION:
        raise ValueError(f"audit {path} is missing {TRACE_SCHEMA_VERSION}")
    input_hash = result.get("inputFileSha256")
    if not isinstance(input_hash, str) or len(input_hash) != 64:
        raise ValueError(f"audit {path} is missing inputFileSha256 provenance")
    if not str(result.get("analysisAlgorithm", "")).strip():
        raise ValueError(f"audit {path} is missing analysisAlgorithm provenance")
    if result.get("poseDelegate") not in {"GPU", "CPU"}:
        raise ValueError(f"audit {path} is missing GPU/CPU pose delegate provenance")
    if result.get("poseModelIntegrity") != "verified":
        raise ValueError(f"audit {path} does not have verified pose-model integrity")
    if result.get("qualityGatePassed") is not True:
        raise ValueError(f"audit {path} did not pass the pose quality gate")
    validate_analysis_scope(result.get("analysisScope"), path)
    trace = result.get("featureTrace")
    if not isinstance(trace, list) or not all(isinstance(item, dict) for item in trace):
        raise ValueError(f"audit {path} has an invalid featureTrace")
    return trace


def _runtime_profile(label: dict[str, Any]) -> dict[str, Any] | None:
    profile = label.get("runtime_profile")
    if profile is None:
        return None
    if not isinstance(profile, dict):
        raise ValueError("runtime_profile must be an object")
    duration_only = profile.get("duration_only") is True
    signal = profile.get("signal")
    direction = profile.get("direction")
    if duration_only:
        if signal is not None or direction is not None:
            raise ValueError("duration-only runtime_profile cannot declare signal or direction")
    elif signal not in RUNTIME_PROFILE_SIGNALS or direction not in {"low", "high"}:
        raise ValueError("runtime_profile requires a supported signal and direction")
    return {
        "signal": None if duration_only else signal,
        "direction": None if duration_only else direction,
        "duration_only": duration_only,
    }


def _mean_vector(vectors: list[dict[str, float]]) -> dict[str, float]:
    return {key: _mean(vector[key] for vector in vectors) for key in FEATURE_ORDER}


def _std_vector(vectors: list[dict[str, float]], centroid: dict[str, float]) -> dict[str, float]:
    result: dict[str, float] = {}
    for key in FEATURE_ORDER:
        variance = _mean((vector[key] - centroid[key]) ** 2 for vector in vectors)
        result[key] = max(math.sqrt(variance), 1e-6)
    return result


def build_model(
    labels: list[dict[str, Any]],
    audits_dir: Path,
    *,
    name: str,
    revision: str,
    license_name: str,
    consent_policy: str,
    annotation_revision: str,
    min_samples_per_class: int = 2,
    min_subjects_per_class: int = 2,
    min_cameras_per_class: int = 1,
) -> dict[str, Any]:
    if min_samples_per_class < 1:
        raise ValueError("min_samples_per_class must be positive")
    if min_subjects_per_class < 1:
        raise ValueError("min_subjects_per_class must be positive")
    if min_cameras_per_class < 1:
        raise ValueError("min_cameras_per_class must be positive")
    grouped: dict[str, list[dict[str, float]]] = {}
    subjects: dict[str, set[str]] = {}
    cameras: dict[str, set[str]] = {}
    audit_hashes: dict[str, str] = {}
    runtime_profiles: dict[str, dict[str, Any]] = {}
    seen_ids: set[str] = set()
    for index, label in enumerate(labels):
        sample_id = str(label.get("id", "")).strip()
        exercise = str(label.get("exercise", "")).strip().lower()
        subject = str(label.get("subject_id", "")).strip()
        camera = str(label.get("camera_id", "")).strip()
        if not sample_id or not exercise or not subject or not camera:
            raise ValueError(f"label {index} requires id, exercise, subject_id and camera_id")
        if sample_id in seen_ids:
            raise ValueError(f"duplicate sample id: {sample_id!r}")
        seen_ids.add(sample_id)
        audit = _safe_audit_path(audits_dir, label.get("audit_file", f"{sample_id}.json"))
        grouped.setdefault(exercise, []).append(summarize_trace(_load_trace(audit)))
        runtime_profile = _runtime_profile(label)
        if runtime_profile is not None:
            previous_profile = runtime_profiles.setdefault(exercise, runtime_profile)
            if previous_profile != runtime_profile:
                raise ValueError(f"runtime_profile metadata differs within class: {exercise}")
        subjects.setdefault(exercise, set()).add(subject)
        cameras.setdefault(exercise, set()).add(camera)
        audit_hashes[sample_id] = sha256_file(audit)

    insufficient = sorted(key for key, values in grouped.items() if len(values) < min_samples_per_class)
    if insufficient:
        raise ValueError(
            f"classes need at least {min_samples_per_class} samples: {', '.join(insufficient)}"
        )
    insufficient_subjects = sorted(
        exercise for exercise in grouped
        if len(subjects[exercise]) < min_subjects_per_class
    )
    if insufficient_subjects:
        raise ValueError(
            f"classes need at least {min_subjects_per_class} subjects: {', '.join(insufficient_subjects)}"
        )
    insufficient_cameras = sorted(
        exercise for exercise in grouped
        if len(cameras[exercise]) < min_cameras_per_class
    )
    if insufficient_cameras:
        raise ValueError(
            f"classes need at least {min_cameras_per_class} cameras: {', '.join(insufficient_cameras)}"
        )

    classes: dict[str, Any] = {}
    for exercise in sorted(grouped):
        vectors = grouped[exercise]
        centroid = _mean_vector(vectors)
        classes[exercise] = {
            "sample_count": len(vectors),
            "subject_count": len(subjects[exercise]),
            "camera_count": len(cameras[exercise]),
            "centroid": centroid,
            "scale": _std_vector(vectors, centroid),
        }
        if exercise in runtime_profiles:
            classes[exercise]["runtime_profile"] = runtime_profiles[exercise]

    return {
        "schema_version": MODEL_SCHEMA_VERSION,
        "feature_order": list(FEATURE_ORDER),
        "algorithm": "audited-feature-centroid-v2",
        "dataset": {
            "name": name,
            "revision": revision,
            "license": license_name,
            "consent_policy": consent_policy,
            "annotation_revision": annotation_revision,
            "split": "train",
        },
        "training": {
            "sample_count": len(labels),
            "class_count": len(classes),
            "subject_count": len({str(item.get("subject_id")) for item in labels}),
            "camera_count": len({str(item.get("camera_id")) for item in labels}),
            "audit_sha256": audit_hashes,
            "min_samples_per_class": min_samples_per_class,
            "min_subjects_per_class": min_subjects_per_class,
            "min_cameras_per_class": min_cameras_per_class,
        },
        "classes": classes,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("labels", type=Path)
    parser.add_argument("audits_dir", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--name", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--license", dest="license_name", required=True)
    parser.add_argument("--consent-policy", required=True)
    parser.add_argument("--annotation-revision", required=True)
    parser.add_argument("--min-samples-per-class", type=int, default=2)
    parser.add_argument("--min-subjects-per-class", type=int, default=2)
    parser.add_argument("--min-cameras-per-class", type=int, default=1)
    args = parser.parse_args()
    try:
        model = build_model(
            _load_labels(args.labels),
            args.audits_dir,
            name=args.name,
            revision=args.revision,
            license_name=args.license_name,
            consent_policy=args.consent_policy,
            annotation_revision=args.annotation_revision,
            min_samples_per_class=args.min_samples_per_class,
            min_subjects_per_class=args.min_subjects_per_class,
            min_cameras_per_class=args.min_cameras_per_class,
        )
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(model, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({
            "schema_version": MODEL_SCHEMA_VERSION,
            "sample_count": model["training"]["sample_count"],
            "class_count": model["training"]["class_count"],
            "output": str(args.output),
        }, ensure_ascii=False))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"profile model training failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
