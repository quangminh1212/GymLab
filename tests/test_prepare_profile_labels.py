"""Regression tests for the audit-to-label review bridge."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory

from prepare_profile_labels import LABEL_SCHEMA_VERSION, build_label_template


def _audit(path: Path) -> None:
    path.write_text(json.dumps({
        "schema_version": "gymlab.video-analysis.v1",
        "result": {"featureTraceSchema": "gymlab.pose-feature-trace.v1"},
    }), encoding="utf-8")


def test_builds_reviewable_labels_without_guessing_empty_labels() -> None:
    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        audits = root / "audits"
        audits.mkdir()
        _audit(audits / "clip-1.json")
        template = build_label_template([{
            "id": "clip-1",
            "subject_id": "subject-1",
            "camera_id": "camera-a",
        }], audits)
        assert template["schema_version"] == LABEL_SCHEMA_VERSION
        assert template["review_status"] == "needs_human_exercise_labels"
        assert template["samples"] == [{
            "id": "clip-1",
            "exercise": "",
            "subject_id": "subject-1",
            "camera_id": "camera-a",
            "audit_file": "clip-1.json",
        }]


def test_requires_subject_and_camera_metadata() -> None:
    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        audits = root / "audits"
        audits.mkdir()
        _audit(audits / "clip-1.json")
        try:
            build_label_template([{"id": "clip-1", "subject_id": "subject-1"}], audits)
        except KeyError:
            raise AssertionError("metadata validation should happen before label building")
        except ValueError as error:
            assert "camera_id" in str(error)
        else:
            raise AssertionError("camera metadata must be required")


if __name__ == "__main__":
    test_builds_reviewable_labels_without_guessing_empty_labels()
    test_requires_subject_and_camera_metadata()
    print("profile-label-preparation: OK")
