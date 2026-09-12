import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
    applyExerciseConfidenceGate,
    applyPersonCountGate,
    applyPoseQualityGate,
    canSaveAnalysis,
    canonicalizeJson,
    classifyExercise,
    countRepetitions,
    detectRepetitionEvents,
    estimateActiveDuration,
    estimateSetCount,
    extractWeightCandidates,
    hasValidProfileReleaseGate,
    scoreProfileModel,
    resolveValidatedProfile,
    summarizeExerciseFeatures,
    selectWeightCandidate,
} from "../src/js/video-analysis-core.js";

const squatAngles = [170, 150, 110, 75, 70, 120, 165, 172, 150, 105, 72, 70, 115, 160, 173];
assert.equal(countRepetitions(squatAngles, "low"), 2);
assert.equal(detectRepetitionEvents(squatAngles, "low").length, 2);
assert.ok(detectRepetitionEvents(squatAngles, "low").every((event) => event.endIndex > event.startIndex));
const isolatedPoseSpike = [170, 170, 170, 75, 170, 170, 170, 170, 170, 170, 170];
assert.equal(countRepetitions(isolatedPoseSpike, "low"), 0);
assert.deepEqual(detectRepetitionEvents(isolatedPoseSpike, "low"), []);

const activeSamples = [
    { time: 0, knee_angle: 170, elbow_angle: 170, hip_angle: 165, wrist_height: 0, hip_height: 0.55 },
    { time: 1, knee_angle: 120, elbow_angle: 170, hip_angle: 145, wrist_height: 0, hip_height: 0.65 },
    { time: 2, knee_angle: 80, elbow_angle: 170, hip_angle: 110, wrist_height: 0, hip_height: 0.75 },
    { time: 3, knee_angle: 170, elbow_angle: 170, hip_angle: 165, wrist_height: 0, hip_height: 0.55 },
    { time: 4, knee_angle: 170, elbow_angle: 170, hip_angle: 165, wrist_height: 0, hip_height: 0.55 },
];
assert.equal(estimateActiveDuration(activeSamples, 4), 3);
assert.equal(estimateActiveDuration([
    { time: 0, knee_angle: 170, elbow_angle: 170, hip_angle: 165, wrist_height: 0, hip_height: 0.55 },
    { time: 1, knee_angle: 170, elbow_angle: 170, hip_angle: 165, wrist_height: 0, hip_height: 0.55 },
    { time: 2, knee_angle: 170, elbow_angle: 170, hip_angle: 165, wrist_height: 0, hip_height: 0.55 },
], 2), 0);

const twoSetSamples = [
    { time: 0, knee_angle: 170, elbow_angle: 170, hip_angle: 165 },
    { time: 1, knee_angle: 120, elbow_angle: 170, hip_angle: 145 },
    { time: 2, knee_angle: 80, elbow_angle: 170, hip_angle: 110 },
    { time: 3, knee_angle: 80, elbow_angle: 170, hip_angle: 110 },
    { time: 4, knee_angle: 80, elbow_angle: 170, hip_angle: 110 },
    { time: 8, knee_angle: 170, elbow_angle: 170, hip_angle: 165 },
    { time: 9, knee_angle: 120, elbow_angle: 170, hip_angle: 145 },
    { time: 10, knee_angle: 80, elbow_angle: 170, hip_angle: 110 },
];
assert.equal(estimateSetCount(twoSetSamples), 2);
const sparseLongClip = [
    { time: 0, knee_angle: 170, elbow_angle: 170, hip_angle: 165 },
    { time: 10, knee_angle: 120, elbow_angle: 170, hip_angle: 145 },
    { time: 20, knee_angle: 80, elbow_angle: 170, hip_angle: 110 },
    { time: 30, knee_angle: 170, elbow_angle: 170, hip_angle: 165 },
];
assert.equal(estimateSetCount(sparseLongClip), 1);

const firstRead = extractWeightCandidates("DUMBBELL 60 kg", 96, 0);
const secondRead = extractWeightCandidates("plate 59.8kg", 92, 1);
const selected = selectWeightCandidate([...firstRead, ...secondRead]);
assert.ok(selected);
assert.ok(Math.abs(selected.valueKg - 60) < 0.5);
assert.ok(selected.confidence > 0.7);

const poundReads = extractWeightCandidates("135 lb", 96);
assert.ok(Math.abs(poundReads[0].valueKg - 61.235) < 0.01);
assert.equal(selectWeightCandidate(extractWeightCandidates("60 kg", 40, 0)), null);

const duplicateFrame = selectWeightCandidate([
    ...extractWeightCandidates("60 kg 60 kg", 98, 0),
]);
assert.equal(duplicateFrame, null);

const repeatedFrames = selectWeightCandidate([
    ...extractWeightCandidates("60 kg", 90, 0),
    ...extractWeightCandidates("60 kg", 90, 1),
]);
assert.ok(repeatedFrames && repeatedFrames.evidenceFrames === 2);
assert.equal(selectWeightCandidate([
    ...extractWeightCandidates("60 kg", 90),
    ...extractWeightCandidates("60 kg", 90),
]), null);

const repeatedLowRawConfidence = selectWeightCandidate([
    { valueKg: 60, confidence: 0, frameIndex: 0, textQuality: 1 },
    { valueKg: 60, confidence: 0, frameIndex: 1, textQuality: 1 },
    { valueKg: 60, confidence: 0.12, frameIndex: 2, textQuality: 1 },
]);
assert.equal(repeatedLowRawConfidence.evidenceFrames, 3);
assert.equal(Math.round(repeatedLowRawConfidence.valueKg), 60);
assert.ok(repeatedLowRawConfidence.confidence >= 0.65);

// Canonical motion/posture probes guard the conservative classifier's main
// separation boundaries. They are not a substitute for a labeled real-world
// dataset, but they prevent future threshold changes from collapsing distinct
// profile paths into one label.
const canonical = (base, motion) => Array.from({ length: 20 }, (_, index) => ({
    knee_angle: 150,
    elbow_angle: 150,
    ankle_angle: 100,
    hip_angle: 150,
    wrist_height: 0,
    wrist_span: 0.5,
    torso_ratio: 0.9,
    ...base,
    ...motion(index),
}));
const classifierCases = {
    squat: canonical({ torso_ratio: 0.9 }, (i) => ({ knee_angle: i % 4 < 2 ? 70 : 170 })),
    push_up: canonical({ torso_ratio: 0.3 }, (i) => ({ elbow_angle: i % 4 < 2 ? 65 : 165 })),
    bicep_curl: canonical({ torso_ratio: 0.9 }, (i) => ({ elbow_angle: i % 4 < 2 ? 45 : 165 })),
    overhead_press: canonical({ torso_ratio: 0.9 }, (i) => ({ wrist_height: i % 4 < 2 ? 0.35 : 0 })),
    deadlift: canonical({ torso_ratio: 0.9 }, (i) => ({ hip_angle: i % 4 < 2 ? 70 : 170 })),
    barbell_row: canonical({ torso_ratio: 0.5 }, (i) => ({
        hip_angle: i % 4 < 2 ? 80 : 160,
        elbow_angle: i % 4 < 2 ? 60 : 160,
    })),
    pull_up: canonical({ torso_ratio: 0.9 }, (i) => ({
        elbow_angle: i % 4 < 2 ? 50 : 170,
        wrist_height: i % 4 < 2 ? 0.1 : 0.03,
    })),
    tricep_dip: canonical({ torso_ratio: 0.9 }, (i) => ({
        elbow_angle: i % 4 < 2 ? 55 : 165,
        wrist_height: -0.25,
    })),
    lateral_raise: canonical({ torso_ratio: 0.9 }, (i) => ({
        wrist_height: i % 4 < 2 ? 0.35 : 0,
        wrist_span: i % 4 < 2 ? 1.4 : 0.4,
    })),
    calf_raise: canonical({ torso_ratio: 0.9 }, (i) => ({
        ankle_angle: i % 4 < 2 ? 75 : 125,
    })),
    plank: canonical({ torso_ratio: 0.3 }, () => ({})),
    mountain_climbers: canonical({ torso_ratio: 0.3 }, (i) => ({
        knee_angle: i % 4 < 2 ? 70 : 160,
        hip_angle: i % 4 < 2 ? 80 : 160,
    })),
    burpees: Array.from({ length: 20 }, (_, i) => ({
        knee_angle: i % 2 ? 165 : 65,
        elbow_angle: i % 2 ? 165 : 70,
        ankle_angle: 100,
        hip_angle: i % 2 ? 165 : 80,
        wrist_height: i % 2 ? 0 : -0.1,
        wrist_span: 0.6,
        torso_ratio: i % 2 ? 0.9 : 0.3,
    })),
};
for (const [expected, samples] of Object.entries(classifierCases)) {
    const result = classifyExercise(samples);
    assert.equal(result.exerciseId, expected, `${expected} canonical profile`);
    assert.ok(result.score >= 0.18, `${expected} score should pass the floor`);
}
const squatWithArmSwing = canonical({ torso_ratio: 0.9 }, (i) => ({
    knee_angle: i % 4 < 2 ? 128 : 175,
    hip_angle: i % 4 < 2 ? 123 : 171,
    elbow_angle: i % 4 < 2 ? 13 : 179,
}));
assert.equal(
    classifyExercise(squatWithArmSwing).exerciseId,
    "squat",
    "lower-body motion must prevent arm swing from becoming a bicep-curl label",
);
const summarized = summarizeExerciseFeatures(classifierCases.squat);
assert.ok(summarized && Number.isFinite(summarized.knee_angle_range));
const evaluatorReport = {
    evaluator_version: "1.7.0",
    provenance_required: true,
    metrics: { classification: { macro_f1: 1.0 } },
    failures: [],
};
assert.equal(
    createHash("sha256")
        .update(JSON.stringify(canonicalizeJson(evaluatorReport)))
        .digest("hex"),
    "70a14542755f1032d81cca7cffb0e3a86cecbdbe4affd49f0f4eeeb3287f6b83",
);
assert.equal(scoreProfileModel(classifierCases.squat, {
    schema_version: "gymlab.exercise-profile-model.v1",
    status: "candidate",
    classes: {},
}), null);
assert.equal(scoreProfileModel(classifierCases.squat, {
    schema_version: "gymlab.exercise-profile-model.v1",
    status: "validated",
    release_gate: { report_sha256: "a".repeat(64) },
    classes: {},
}), null);
assert.equal(scoreProfileModel(classifierCases.squat, {
    schema_version: "gymlab.exercise-profile-model.v1",
    status: "validated",
    release_gate: {
        report_sha256: "a".repeat(64),
        evaluator_version: "1.7.0",
        report: {
            evaluator_version: "1.7.0",
            provenance_required: true,
            failures: [],
            metrics: {},
        },
    },
    classes: {
        squat: {
            centroid: summarized,
            scale: Object.fromEntries(Object.keys(summarized).map((key) => [key, 1])),
            runtime_profile: { signal: "knee_angle", direction: "low", duration_only: false },
        },
    },
})?.squat > 0, true);
const validatedLearnedProfile = {
    schema_version: "gymlab.exercise-profile-model.v1",
    status: "validated",
    release_gate: {
        report_sha256: "c".repeat(64),
        evaluator_version: "1.7.0",
        report: {
            evaluator_version: "1.7.0",
            provenance_required: true,
            failures: [],
            metrics: {},
        },
    },
    classes: {
        bench_press: {
            runtime_profile: { signal: "elbow_angle", direction: "low", duration_only: false },
        },
    },
};
assert.equal(hasValidProfileReleaseGate(validatedLearnedProfile, "1.7.0"), true);
assert.equal(hasValidProfileReleaseGate(validatedLearnedProfile, "1.8.0"), false);
assert.deepEqual(
    resolveValidatedProfile("bench_press", validatedLearnedProfile, [{
        id: "bench_press", name_vi: "Ép ngực", met: 6, category: "strength",
    }]),
    {
        id: "bench_press",
        name: "Ép ngực",
        met: 6,
        category: "strength",
        evaluationStatus: "validated",
        signal: "elbow_angle",
        direction: "low",
        durationOnly: false,
    },
);
assert.equal(resolveValidatedProfile("bench_press", validatedLearnedProfile, []), null);
assert.equal(resolveValidatedProfile("bench_press", {
    ...validatedLearnedProfile,
    classes: { bench_press: { runtime_profile: { signal: "not-a-signal", direction: "low" } } },
}, [{ id: "bench_press", name_vi: "Ép ngực", met: 6, category: "strength" }]), null);
const ambiguous = canonical({ torso_ratio: 0.65 }, () => ({}));
assert.equal(classifyExercise(ambiguous).exerciseId, "unknown");
const closeCompetingProfiles = canonical({ torso_ratio: 0.9 }, (i) => ({
    elbow_angle: i % 4 < 2 ? 45 : 165,
    wrist_height: i % 4 < 2 ? 0.35 : 0,
}));
assert.equal(
    classifyExercise(closeCompetingProfiles).exerciseId,
    "unknown",
    "close competing profiles must abstain instead of using a high-score override",
);
const learnedOnlyModel = {
    schema_version: "gymlab.exercise-profile-model.v1",
    status: "validated",
    release_gate: {
        report_sha256: "b".repeat(64),
        evaluator_version: "1.7.0",
        report: {
            evaluator_version: "1.7.0",
            provenance_required: true,
            failures: [],
            metrics: {},
        },
    },
    classes: {
        future_exercise: {
            centroid: summarizeExerciseFeatures(ambiguous),
            scale: Object.fromEntries(Object.keys(summarizeExerciseFeatures(ambiguous)).map((key) => [key, 1])),
            runtime_profile: { signal: "hip_angle", direction: "low", duration_only: false },
        },
    },
};
assert.equal(classifyExercise(ambiguous, learnedOnlyModel).exerciseId, "future_exercise");
const qualityRejected = applyPoseQualityGate({ exerciseId: "squat", score: 0.9, margin: 0.4 }, 0.49);
assert.equal(qualityRejected.classification.exerciseId, "unknown");
assert.equal(qualityRejected.qualityGatePassed, false);
assert.equal(qualityRejected.abstentionReason, "pose_coverage_below_threshold");
const qualityAccepted = applyPoseQualityGate({ exerciseId: "squat", score: 0.9, margin: 0.4 }, 0.5);
assert.equal(qualityAccepted.classification.exerciseId, "squat");
assert.equal(qualityAccepted.qualityGatePassed, true);
assert.equal(qualityAccepted.abstentionReason, null);
const confidenceRejected = applyExerciseConfidenceGate({ exerciseId: "squat", score: 0.2, margin: 0.05 }, 0.54);
assert.equal(confidenceRejected.classification.exerciseId, "unknown");
assert.equal(confidenceRejected.confidenceGatePassed, false);
assert.equal(confidenceRejected.abstentionReason, "exercise_confidence_below_threshold");
const confidenceAccepted = applyExerciseConfidenceGate({ exerciseId: "squat", score: 0.8, margin: 0.4 }, 0.55);
assert.equal(confidenceAccepted.classification.exerciseId, "squat");
assert.equal(confidenceAccepted.confidenceGatePassed, true);
const saveableResult = {
    exerciseId: "squat",
    qualityGatePassed: true,
    confidenceGatePassed: true,
    activeSeconds: 12,
    reps: 3,
    durationOnly: false,
    bodyWeightConfirmed: true,
    profileEvaluationStatus: "baseline",
};
assert.equal(canSaveAnalysis(saveableResult), false);
assert.equal(canSaveAnalysis({ ...saveableResult, manualExerciseId: "squat" }), true);
assert.equal(canSaveAnalysis({ ...saveableResult, profileEvaluationStatus: "validated" }), true);
assert.equal(canSaveAnalysis({ ...saveableResult, profileEvaluationStatus: "candidate" }), false);
assert.equal(canSaveAnalysis({ ...saveableResult, profileEvaluationStatus: "candidate", manualExerciseId: "pull_up" }), true);
assert.equal(canSaveAnalysis({
    ...saveableResult,
    manualExerciseId: "squat",
    weightKg: 60,
    weightSource: "OCR nhãn video (90%)",
    weightConfirmed: false,
}), false);
assert.equal(canSaveAnalysis({
    ...saveableResult,
    manualExerciseId: "squat",
    weightKg: 60,
    weightSource: "OCR nhãn video (90%)",
    weightConfirmed: true,
}), true);
assert.equal(applyPersonCountGate(0.05).passed, true);
assert.equal(applyPersonCountGate(0.051).passed, false);
assert.equal(applyPersonCountGate(0.051).reason, "multiple_people_detected");

console.log("video-analysis-core: OK");
