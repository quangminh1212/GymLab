"""Tests for auditable benchmark-manifest preparation."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory

from evaluate_benchmark import validate_manifest_provenance
from prepare_benchmark_manifest import build_manifest


def test_manifest_records_clip_fingerprint_and_governance() -> None:
    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        clip = root / "clip.bin"
        clip.write_bytes(b"local-consented-clip")
        manifest = build_manifest(
            [{
                "id": "clip-001",
                "file": "clip.bin",
                "subject_id": "subject-01",
                "camera_id": "camera-a",
                "ground_truth": {"exercise": "squat", "reps": 2},
            }],
            root,
            name="pilot",
            revision="r1",
            license_name="internal-consented",
            consent_policy="written-consent-v1",
            annotation_revision="ann-1",
            split="test",
        )
        sample = manifest["samples"][0]
        assert manifest["schema_version"] == "gymlab.video-benchmark.v1"
        assert manifest["dataset"]["split"] == "test"
        assert sample["source_file"] == "clip.bin"
        assert sample["file_size_bytes"] == len(b"local-consented-clip")
        assert len(sample["file_sha256"]) == 64
        validate_manifest_provenance(manifest, root / "manifest.json", root)
        clip.write_bytes(b"tampered")
        try:
            validate_manifest_provenance(manifest, root / "manifest.json", root)
        except ValueError as error:
            assert "fingerprint mismatch" in str(error)
        else:
            raise AssertionError("tampered source clips must be rejected")


def test_manifest_rejects_path_escape() -> None:
    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        try:
            build_manifest(
                [{
                    "id": "escape",
                    "file": "../outside.mp4",
                    "subject_id": "subject-01",
                    "camera_id": "camera-a",
                    "ground_truth": {"exercise": "squat"},
                }],
                root,
                name="pilot",
                revision="r1",
                license_name="internal-consented",
                consent_policy="written-consent-v1",
                annotation_revision="ann-1",
                split="test",
            )
        except ValueError as error:
            assert "escapes clips directory" in str(error)
        else:
            raise AssertionError("path traversal must be rejected")


def test_manifest_imports_audit_prediction_and_fingerprint() -> None:
    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        clips = root / "clips"
        audits = root / "audits"
        clips.mkdir()
        audits.mkdir()
        (clips / "clip.bin").write_bytes(b"clip")
        (audits / "clip-001.json").write_text(json.dumps({
            "schema_version": "gymlab.video-analysis.v1",
            "result": {
                "exerciseId": "squat",
                "reps": 2,
                "weightKg": 60,
                "activeSeconds": 12.5,
                "calories": 1.25,
                "coverage": 0.98,
                "inputFileSha256": "a" * 64,
                "analysisAlgorithm": "heuristic-profile-v7",
                "poseDelegate": "GPU",
                "poseModelIntegrity": "verified",
                "ocrModelIntegrity": "verified",
                "featureTraceSchema": "gymlab.pose-feature-trace.v1",
                "repetitionEventSchema": "gymlab.repetition-events.v1",
                "qualityGatePassed": True,
                "bodyWeightConfirmed": True,
                "weightConfirmed": True,
            },
        }), encoding="utf-8")
        manifest = build_manifest(
            [{
                "id": "clip-001",
                "file": "clip.bin",
                "subject_id": "subject-01",
                "camera_id": "camera-a",
                "ground_truth": {"exercise": "squat", "reps": 2},
            }],
            clips,
            name="pilot",
            revision="r1",
            license_name="internal-consented",
            consent_policy="written-consent-v1",
            annotation_revision="ann-1",
            split="test",
            audits_dir=audits,
        )
        sample = manifest["samples"][0]
        assert sample["prediction"]["exercise"] == "squat"
        assert sample["prediction"]["load_kg"] == 60
        assert sample["prediction"]["active_seconds"] == 12.5
        assert sample["prediction_audit_file"] == "clip-001.json"
        assert len(sample["prediction_audit_sha256"]) == 64


if __name__ == "__main__":
    test_manifest_records_clip_fingerprint_and_governance()
    test_manifest_rejects_path_escape()
    test_manifest_imports_audit_prediction_and_fingerprint()
    print("manifest-preparation: OK")
