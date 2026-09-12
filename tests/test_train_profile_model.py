"""Regression tests for the audited pose-profile trainer."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory

from train_profile_model import MODEL_SCHEMA_VERSION, build_model


def _trace(offset: float) -> list[dict[str, float]]:
    return [{
        "time": float(index),
        "knee_angle": 80 + offset + (index % 2) * 80,
        "elbow_angle": 100 + offset + (index % 2) * 40,
        "hip_angle": 110 + offset + (index % 2) * 50,
        "wrist_height": 0.1 + offset / 100 + (index % 2) * 0.1,
        "wrist_span": 0.5 + (index % 2) * 0.1,
        "torso_ratio": 0.8,
        "hip_height": 0.5,
        "pose_scale": 0.4,
    } for index in range(10)]


def test_build_model_is_provenance_bound_and_deterministic() -> None:
    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        audits = root / "audits"
        audits.mkdir()
        labels = []
        for index, subject in enumerate(("subject-a", "subject-b"), start=1):
            sample_id = f"squat-{index}"
            (audits / f"{sample_id}.json").write_text(json.dumps({
                "schema_version": "gymlab.video-analysis.v1",
                "result": {
                    "inputFileSha256": "a" * 64,
                    "analysisAlgorithm": "heuristic-profile-v8",
                    "poseDelegate": "GPU",
                    "poseModelIntegrity": "verified",
                    "qualityGatePassed": True,
                    "featureTraceSchema": "gymlab.pose-feature-trace.v1",
                    "analysisScope": {
                        "catalogCount": 1,
                        "automaticProfileCount": 1,
                        "automaticProfileIds": ["squat"],
                        "manualReviewCount": 0,
                        "manualReviewExerciseIds": [],
                    },
                    "featureTrace": _trace(float(index)),
                },
            }), encoding="utf-8")
            labels.append({
                "id": sample_id,
                "exercise": "squat",
                "subject_id": subject,
                "camera_id": "camera-a" if index == 1 else "camera-b",
                "audit_file": f"{sample_id}.json",
                "runtime_profile": {
                    "signal": "knee_angle",
                    "direction": "low",
                    "duration_only": False,
                },
            })
        model = build_model(
            labels,
            audits,
            name="pilot",
            revision="r1",
            license_name="internal-consented",
            consent_policy="written-consent-v1",
            annotation_revision="ann-1",
        )
        assert model["schema_version"] == MODEL_SCHEMA_VERSION
        assert model["training"]["sample_count"] == 2
        assert model["training"]["subject_count"] == 2
        assert model["training"]["min_subjects_per_class"] == 2
        assert model["classes"]["squat"]["sample_count"] == 2
        assert model["classes"]["squat"]["runtime_profile"]["signal"] == "knee_angle"
        assert len(model["training"]["audit_sha256"]["squat-1"]) == 64


def test_build_model_rejects_insufficient_class_samples() -> None:
    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        audit = root / "one.json"
        audit.write_text(json.dumps({
            "schema_version": "gymlab.video-analysis.v1",
            "result": {
                "inputFileSha256": "a" * 64,
                "analysisAlgorithm": "heuristic-profile-v8",
                "poseDelegate": "GPU",
                "poseModelIntegrity": "verified",
                "qualityGatePassed": True,
                "featureTraceSchema": "gymlab.pose-feature-trace.v1",
                "analysisScope": {
                    "catalogCount": 1,
                    "automaticProfileCount": 1,
                    "automaticProfileIds": ["squat"],
                    "manualReviewCount": 0,
                    "manualReviewExerciseIds": [],
                },
                "featureTrace": _trace(0),
            },
        }), encoding="utf-8")
        try:
            build_model(
                [{"id": "one", "exercise": "squat", "subject_id": "s", "camera_id": "c"}],
                root,
                name="pilot",
                revision="r1",
                license_name="internal-consented",
                consent_policy="written-consent-v1",
                annotation_revision="ann-1",
            )
        except ValueError as error:
            assert "at least 2 samples" in str(error)
        else:
            raise AssertionError("single-sample classes must not become a production model")


def test_build_model_rejects_single_subject_class() -> None:
    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        audits = root / "audits"
        audits.mkdir()
        labels = []
        for index in (1, 2):
            sample_id = f"squat-{index}"
            (audits / f"{sample_id}.json").write_text(json.dumps({
                "schema_version": "gymlab.video-analysis.v1",
                "result": {
                    "inputFileSha256": "a" * 64,
                    "analysisAlgorithm": "heuristic-profile-v8",
                    "poseDelegate": "GPU",
                    "poseModelIntegrity": "verified",
                    "qualityGatePassed": True,
                    "featureTraceSchema": "gymlab.pose-feature-trace.v1",
                    "analysisScope": {
                        "catalogCount": 1,
                        "automaticProfileCount": 1,
                        "automaticProfileIds": ["squat"],
                        "manualReviewCount": 0,
                        "manualReviewExerciseIds": [],
                    },
                    "featureTrace": _trace(float(index)),
                },
            }), encoding="utf-8")
            labels.append({
                "id": sample_id,
                "exercise": "squat",
                "subject_id": "same-subject",
                "camera_id": f"camera-{index}",
                "audit_file": f"{sample_id}.json",
            })
        try:
            build_model(
                labels,
                audits,
                name="pilot",
                revision="r1",
                license_name="internal-consented",
                consent_policy="written-consent-v1",
                annotation_revision="ann-1",
            )
        except ValueError as error:
            assert "subjects" in str(error)
        else:
            raise AssertionError("single-subject classes must not become a production model")


if __name__ == "__main__":
    test_build_model_is_provenance_bound_and_deterministic()
    test_build_model_rejects_insufficient_class_samples()
    test_build_model_rejects_single_subject_class()
    print("profile-model-training: OK")
