"""Regression tests for the release-quality benchmark evaluator."""

import json
from argparse import Namespace
from pathlib import Path
from tempfile import TemporaryDirectory

from evaluate_benchmark import (
    EVALUATOR_VERSION,
    MANIFEST_SCHEMA_VERSION,
    validate_prediction_audit,
    _check_thresholds,
    evaluate_records,
    sha256_file,
    validate_analysis_scope,
    validate_disjoint,
    validate_manifest_provenance,
    validate_samples,
)


def test_metrics_keep_abstentions_separate() -> None:
    records = [
        {
            "id": "squat-1",
            "subject_id": "subject-a",
            "camera_id": "camera-a",
            "ground_truth": {
                "exercise": "squat",
                "reps": 10,
                "load_kg": 60,
                "active_seconds": 30,
                "met": 6,
                "body_weight_kg": 82.5,
            },
            "prediction": {
                "exercise": "squat",
                "reps": 9,
                "load_kg": 60,
                "active_seconds": 31,
                "calories": 6 * 82.5 * 30 / 3600,
                "pose_coverage": 1,
            },
        },
        {
            "id": "push-1",
            "subject_id": "subject-b",
            "camera_id": "camera-b",
            "ground_truth": {"exercise": "push_up", "reps": 8},
            "prediction": {"exercise": "unknown", "reps": None, "load_kg": None},
        },
    ]
    metrics = evaluate_records(records)
    assert metrics["sample_count"] == 2
    assert metrics["reps"]["mae"] == 1
    assert metrics["reps"]["abstention_rate"] == 0.5
    assert metrics["load_kg"]["within_tolerance_rate"] == 1
    assert metrics["load_kg"]["abstention_rate"] == 0
    assert metrics["classification"]["prediction_abstention_rate"] == 0.5
    assert metrics["calories"]["mae"] == 0


def test_class_coverage_reports_support_and_subject_diversity() -> None:
    records = [
        {"id": "a", "subject_id": "s1", "camera_id": "c1", "ground_truth": {"exercise": "squat"}, "prediction": {"exercise": "squat"}},
        {"id": "b", "subject_id": "s2", "camera_id": "c2", "ground_truth": {"exercise": "squat"}, "prediction": {"exercise": "squat"}},
    ]
    from evaluate_benchmark import class_coverage_metrics

    assert class_coverage_metrics(records, {"squat"}) == {
        "squat": {"support": 2, "subject_count": 2, "camera_count": 2},
    }


def test_disjoint_split_reports_subject_and_camera_overlap() -> None:
    train = [{"subject_id": "a", "camera_id": "one"}]
    test = [{"subject_id": "a", "camera_id": "two"}, {"subject_id": "b", "camera_id": "one"}]
    assert validate_disjoint(train, test) == {
        "subject_overlap": ["a"],
        "camera_overlap": ["one"],
    }


def test_active_duration_threshold_is_enforced() -> None:
    metrics = evaluate_records([{
        "id": "clip-1",
        "subject_id": "subject-a",
        "camera_id": "camera-a",
        "ground_truth": {"exercise": "squat", "active_seconds": 10},
        "prediction": {"exercise": "squat", "active_seconds": 12},
    }])
    args = Namespace(
        min_macro_f1=None,
        max_rep_mae=None,
        max_active_duration_mae=1.0,
        min_load_accuracy=None,
        max_load_abstention=None,
        max_calorie_mae=None,
    )
    failures = _check_thresholds(metrics, args)
    assert any("active_duration_mae" in failure for failure in failures)


def test_manifest_validation_rejects_duplicates_and_bad_ranges() -> None:
    sample = {
        "id": "same",
        "subject_id": "a",
        "camera_id": "one",
        "ground_truth": {"exercise": "squat", "reps": 10},
        "prediction": {"exercise": "squat", "reps": 10},
    }
    try:
        validate_samples([sample, dict(sample)], "test")
    except ValueError as error:
        assert "duplicate sample id" in str(error)
    else:
        raise AssertionError("duplicate IDs must be rejected")

    bad = dict(sample)
    bad["ground_truth"] = {"exercise": "squat", "load_kg": 501}
    try:
        validate_samples([bad], "test")
    except ValueError as error:
        assert "load_kg" in str(error)
    else:
        raise AssertionError("out-of-range load must be rejected")


def test_evaluator_version_is_pinned() -> None:
    assert EVALUATOR_VERSION == "1.7.0"


def test_analysis_scope_must_partition_catalog() -> None:
    valid = {
        "catalogCount": 2,
        "automaticProfileCount": 1,
        "automaticProfileIds": ["squat"],
        "manualReviewCount": 1,
        "manualReviewExerciseIds": ["bench_press"],
    }
    validate_analysis_scope(valid, Path("scope.json"))
    invalid = {**valid, "manualReviewCount": 0}
    try:
        validate_analysis_scope(invalid, Path("invalid-scope.json"))
    except ValueError as error:
        assert "partition" in str(error)
    else:
        raise AssertionError("analysis scope must partition the catalog")


def test_provenance_gate_requires_governance_and_clip_fingerprint() -> None:
    valid = {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "dataset": {
            "name": "consented-pilot",
            "revision": "r1",
            "license": "internal-consented",
            "consent_policy": "written-consent-v1",
            "annotation_revision": "ann-1",
            "split": "test",
        },
        "samples": [{
            "source_file": "clip.mp4",
            "file_size_bytes": 1,
            "file_sha256": "a" * 64,
        }],
    }
    validate_manifest_provenance(valid, "test")
    invalid = {**valid, "dataset": {**valid["dataset"], "consent_policy": ""}}
    try:
        validate_manifest_provenance(invalid, "test")
    except ValueError as error:
        assert "consent_policy" in str(error)
    else:
        raise AssertionError("provenance gate must require consent metadata")


def test_provenance_gate_verifies_prediction_audit_chain() -> None:
    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        audit = root / "clip-001.json"
        audit.write_text(json.dumps({
            "schema_version": "gymlab.video-analysis.v1",
            "result": {
                "exerciseId": "squat",
                "inputFileSha256": "a" * 64,
                "analysisAlgorithm": "heuristic-profile-v7",
                "poseDelegate": "GPU",
                "poseModelIntegrity": "verified",
                "ocrModelIntegrity": "not_run",
                "profileModelStatus": "candidate",
                "profileModelIntegrity": "verified",
                "profileModelSha256": "b" * 64,
                "profileEvaluatorVersion": None,
                "featureTraceSchema": "gymlab.pose-feature-trace.v1",
                "repetitionEventSchema": "gymlab.repetition-events.v1",
                "qualityGatePassed": True,
                "bodyWeightConfirmed": True,
                "weightConfirmed": False,
                "analysisScope": {
                    "catalogCount": 1,
                    "automaticProfileCount": 1,
                    "automaticProfileIds": ["squat"],
                    "manualReviewCount": 0,
                    "manualReviewExerciseIds": [],
                },
            },
        }), encoding="utf-8")
        valid = {
            "schema_version": MANIFEST_SCHEMA_VERSION,
            "dataset": {
                "name": "consented-pilot",
                "revision": "r1",
                "license": "internal-consented",
                "consent_policy": "written-consent-v1",
                "annotation_revision": "ann-1",
                "split": "test",
            },
            "samples": [{
                "source_file": "clip.mp4",
                "file_size_bytes": 1,
                "file_sha256": "a" * 64,
                "prediction_audit_file": "clip-001.json",
                "prediction_audit_sha256": sha256_file(audit),
            }],
        }
        validate_manifest_provenance(valid, "test", audits_dir=root)
        audit.write_text("tampered", encoding="utf-8")
        try:
            validate_manifest_provenance(valid, "test", audits_dir=root)
        except ValueError as error:
            assert "prediction audit fingerprint mismatch" in str(error)
        else:
            raise AssertionError("tampered prediction audits must be rejected")


def test_prediction_audit_requires_runtime_provenance() -> None:
    valid = {
        "schema_version": "gymlab.video-analysis.v1",
        "result": {
            "inputFileSha256": "a" * 64,
            "analysisAlgorithm": "heuristic-profile-v7",
            "poseDelegate": "GPU",
            "poseModelIntegrity": "verified",
            "ocrModelIntegrity": "not_run",
            "profileModelStatus": "candidate",
            "profileModelIntegrity": "verified",
            "profileModelSha256": "b" * 64,
            "profileEvaluatorVersion": None,
            "featureTraceSchema": "gymlab.pose-feature-trace.v1",
            "repetitionEventSchema": "gymlab.repetition-events.v1",
            "qualityGatePassed": True,
            "bodyWeightConfirmed": True,
            "weightConfirmed": False,
            "analysisScope": {
                "catalogCount": 1,
                "automaticProfileCount": 1,
                "automaticProfileIds": ["squat"],
                "manualReviewCount": 0,
                "manualReviewExerciseIds": [],
            },
        },
    }
    validate_prediction_audit(valid, Path("valid-audit.json"))
    stale_profile = {
        **valid,
        "result": {
            **valid["result"],
            "profileModelStatus": "validated",
            "profileEvaluatorVersion": "1.6.0",
        },
    }
    try:
        validate_prediction_audit(stale_profile, Path("stale-profile.json"))
    except ValueError as error:
        assert "evaluator 1.7.0" in str(error)
    else:
        raise AssertionError("validated profile models must be tied to the current evaluator")
    invalid = {**valid, "result": {**valid["result"], "poseDelegate": "unknown"}}
    try:
        validate_prediction_audit(invalid, Path("invalid-audit.json"))
    except ValueError as error:
        assert "poseDelegate" in str(error)
    else:
        raise AssertionError("release audits must declare the actual pose delegate")


if __name__ == "__main__":
    test_metrics_keep_abstentions_separate()
    test_disjoint_split_reports_subject_and_camera_overlap()
    test_active_duration_threshold_is_enforced()
    test_manifest_validation_rejects_duplicates_and_bad_ranges()
    test_analysis_scope_must_partition_catalog()
    test_provenance_gate_requires_governance_and_clip_fingerprint()
    test_provenance_gate_verifies_prediction_audit_chain()
    test_prediction_audit_requires_runtime_provenance()
    print("benchmark-evaluator: OK")
