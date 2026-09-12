"""Build an auditable GymLab benchmark manifest from clip labels.

The input labels file is a JSON array (or an object with ``samples``) whose
samples contain ``id``, ``file``, ``subject_id``, ``camera_id`` and
``ground_truth``. The referenced clips stay outside the repository; this tool
records a relative path, size and SHA-256 without copying or uploading them.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "gymlab.video-benchmark.v1"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def prediction_from_audit(path: Path) -> tuple[dict[str, Any], str]:
    """Convert one exported GymLab audit report into benchmark fields."""

    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or raw.get("schema_version") != "gymlab.video-analysis.v1":
        raise ValueError(f"audit {path} must declare gymlab.video-analysis.v1")
    result = raw.get("result")
    if not isinstance(result, dict):
        raise ValueError(f"audit {path} is missing result")
    prediction = {
        "exercise": result.get("exerciseId") or "unknown",
        "reps": result.get("reps"),
        "load_kg": result.get("weightKg"),
        "active_seconds": result.get("activeSeconds"),
        "calories": result.get("calories"),
        "pose_coverage": result.get("coverage"),
    }
    return prediction, sha256_file(path)


def load_labels(path: Path) -> list[dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    samples = raw.get("samples") if isinstance(raw, dict) else raw
    if not isinstance(samples, list) or not samples:
        raise ValueError("labels must be a non-empty JSON array or object with samples[]")
    return [sample for sample in samples if isinstance(sample, dict)]


def _safe_relative_file(clips_dir: Path, value: Any) -> tuple[str, Path]:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("each label must contain a non-empty file path")
    candidate = (clips_dir / value).resolve()
    try:
        relative = candidate.relative_to(clips_dir.resolve())
    except ValueError as error:
        raise ValueError(f"clip path escapes clips directory: {value!r}") from error
    if not candidate.is_file():
        raise ValueError(f"clip does not exist: {value!r}")
    return relative.as_posix(), candidate


def build_manifest(
    labels: list[dict[str, Any]],
    clips_dir: Path,
    *,
    name: str,
    revision: str,
    license_name: str,
    consent_policy: str,
    annotation_revision: str,
    split: str,
    audits_dir: Path | None = None,
) -> dict[str, Any]:
    samples: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, label in enumerate(labels):
        sample_id = str(label.get("id", "")).strip()
        if not sample_id:
            raise ValueError(f"label {index} is missing id")
        if sample_id in seen_ids:
            raise ValueError(f"duplicate sample id: {sample_id!r}")
        seen_ids.add(sample_id)
        for field in ("subject_id", "camera_id"):
            if not str(label.get(field, "")).strip():
                raise ValueError(f"label {sample_id!r} is missing {field}")
        ground_truth = label.get("ground_truth")
        if not isinstance(ground_truth, dict):
            raise ValueError(f"label {sample_id!r} is missing ground_truth")
        relative_file, clip_path = _safe_relative_file(clips_dir, label.get("file"))
        prediction = label.get("prediction") if isinstance(label.get("prediction"), dict) else {}
        audit_sha256 = None
        if audits_dir is not None:
            audit_path = audits_dir / f"{sample_id}.json"
            if not audit_path.is_file():
                raise ValueError(f"audit does not exist for sample {sample_id!r}: {audit_path.name}")
            prediction, audit_sha256 = prediction_from_audit(audit_path)
        sample = {
            "id": sample_id,
            "subject_id": str(label["subject_id"]),
            "camera_id": str(label["camera_id"]),
            "source_file": relative_file,
            "file_size_bytes": clip_path.stat().st_size,
            "file_sha256": sha256_file(clip_path),
            "ground_truth": ground_truth,
            "prediction": prediction,
        }
        if audit_sha256:
            sample["prediction_audit_file"] = f"{sample_id}.json"
            sample["prediction_audit_sha256"] = audit_sha256
        samples.append(sample)

    return {
        "schema_version": SCHEMA_VERSION,
        "dataset": {
            "name": name,
            "revision": revision,
            "license": license_name,
            "consent_policy": consent_policy,
            "annotation_revision": annotation_revision,
            "split": split,
        },
        "samples": samples,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("labels", type=Path)
    parser.add_argument("clips_dir", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--name", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--license", dest="license_name", required=True)
    parser.add_argument("--consent-policy", required=True)
    parser.add_argument("--annotation-revision", required=True)
    parser.add_argument("--split", required=True, choices=("train", "validation", "test"))
    parser.add_argument(
        "--audits-dir",
        type=Path,
        help="optional directory of GymLab audit JSON files named <sample-id>.json",
    )
    args = parser.parse_args()
    try:
        manifest = build_manifest(
            load_labels(args.labels),
            args.clips_dir,
            name=args.name,
            revision=args.revision,
            license_name=args.license_name,
            consent_policy=args.consent_policy,
            annotation_revision=args.annotation_revision,
            split=args.split,
            audits_dir=args.audits_dir,
        )
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"schema_version": SCHEMA_VERSION, "sample_count": len(manifest["samples"]), "output": str(args.output)}, ensure_ascii=False))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"manifest preparation failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
