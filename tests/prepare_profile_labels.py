"""Create a reviewable profile-label template from collected GymLab audits.

The collector owns deterministic inference and writes one audit per clip. This
tool joins those audits with the human-only metadata required by the trainer;
it never guesses an exercise label, subject identity or runtime repetition
signal. Empty exercise labels are intentional review tasks and must be filled
before ``train_profile_model.py`` is run.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


AUDIT_SCHEMA_VERSION = "gymlab.video-analysis.v1"
LABEL_SCHEMA_VERSION = "gymlab.profile-labels.v1"


def _samples(path: Path) -> list[dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    samples = raw.get("samples") if isinstance(raw, dict) else raw
    if not isinstance(samples, list) or not samples:
        raise ValueError("collection manifest must contain a non-empty samples[]")
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, sample in enumerate(samples):
        if not isinstance(sample, dict):
            raise ValueError(f"sample {index} must be an object")
        sample_id = str(sample.get("id", "")).strip()
        if not sample_id or sample_id in seen:
            raise ValueError(f"sample {index} has a missing or duplicate id")
        subject_id = str(sample.get("subject_id", "")).strip()
        camera_id = str(sample.get("camera_id", "")).strip()
        if not subject_id or not camera_id:
            raise ValueError(f"sample {sample_id!r} requires subject_id and camera_id")
        seen.add(sample_id)
        result.append(sample)
    return result


def _audit_path(audits_dir: Path, sample_id: str) -> Path:
    path = (audits_dir / f"{sample_id}.json").resolve()
    root = audits_dir.resolve()
    try:
        path.relative_to(root)
    except ValueError as error:
        raise ValueError(f"audit path escapes audits directory: {sample_id!r}") from error
    if not path.is_file():
        raise ValueError(f"audit does not exist for sample {sample_id!r}: {path.name}")
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or raw.get("schema_version") != AUDIT_SCHEMA_VERSION:
        raise ValueError(f"audit {path.name} must declare {AUDIT_SCHEMA_VERSION}")
    return path


def build_label_template(samples: list[dict[str, Any]], audits_dir: Path) -> dict[str, Any]:
    labels: list[dict[str, Any]] = []
    for sample in samples:
        sample_id = str(sample["id"]).strip()
        _audit_path(audits_dir, sample_id)
        subject_id = str(sample.get("subject_id", "")).strip()
        camera_id = str(sample.get("camera_id", "")).strip()
        if not subject_id or not camera_id:
            raise ValueError(f"sample {sample_id!r} requires subject_id and camera_id")
        label: dict[str, Any] = {
            "id": sample_id,
            "exercise": str(sample.get("exercise", "")).strip(),
            "subject_id": subject_id,
            "camera_id": camera_id,
            "audit_file": f"{sample_id}.json",
        }
        if isinstance(sample.get("runtime_profile"), dict):
            label["runtime_profile"] = sample["runtime_profile"]
        labels.append(label)
    return {
        "schema_version": LABEL_SCHEMA_VERSION,
        "review_status": "needs_human_exercise_labels",
        "samples": labels,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("collection_manifest", type=Path)
    parser.add_argument("audits_dir", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        template = build_label_template(_samples(args.collection_manifest), args.audits_dir)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(template, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({
            "schema_version": LABEL_SCHEMA_VERSION,
            "sample_count": len(template["samples"]),
            "output": str(args.output),
        }, ensure_ascii=False))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"profile-label preparation failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
