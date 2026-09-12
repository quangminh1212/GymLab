// Pure analysis helpers. Kept DOM-free so they can be regression-tested in Node.

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function percentile(values, p) {
    const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!clean.length) return 0;
    const index = (clean.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return clean[lower];
    return clean[lower] + (clean[upper] - clean[lower]) * (index - lower);
}

function range(values) {
    return percentile(values, 0.9) - percentile(values, 0.1);
}

function average(values) {
    const clean = values.filter(Number.isFinite);
    return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

const PROFILE_FEATURE_ORDER = [
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
];

// The runtime must not silently consume a profile promoted under an older
// evaluator contract. Bumping this value is a release decision tied to the
// audit schema and promotion gate.
export const PROFILE_EVALUATOR_VERSION = "1.7.0";

function median(values) {
    const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!clean.length) return 0;
    const middle = Math.floor(clean.length / 2);
    return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function medianFilter(values, radius = 1) {
    return values.map((_value, index) => median(values.slice(
        Math.max(0, index - radius),
        Math.min(values.length, index + radius + 1),
    )));
}

function featureRange(values) {
    return percentile(values, 0.9) - percentile(values, 0.1);
}

// Keep evaluator-report hashing deterministic across the browser and the
// Python promotion tool. JSON.parse turns integral values into the same JS
// Number representation that JSON.stringify emits without a decimal suffix.
export function canonicalizeJson(value) {
    if (Array.isArray(value)) return value.map(canonicalizeJson);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.keys(value).sort().map((key) => [key, canonicalizeJson(value[key])]),
        );
    }
    return value;
}

export function summarizeExerciseFeatures(samples) {
    const finiteValues = (key) => samples.map((sample) => sample?.[key]).filter(Number.isFinite);
    const knee = finiteValues("knee_angle");
    const elbow = finiteValues("elbow_angle");
    const hip = finiteValues("hip_angle");
    const wristHeight = finiteValues("wrist_height");
    const wristSpan = finiteValues("wrist_span");
    const torso = finiteValues("torso_ratio");
    if (!knee.length || !elbow.length || !hip.length || !wristHeight.length || !wristSpan.length || !torso.length) {
        return null;
    }
    const motion = [];
    let previous = null;
    for (const sample of samples) {
        const current = {};
        for (const key of ["knee_angle", "elbow_angle", "hip_angle"]) {
            if (Number.isFinite(sample?.[key])) current[key] = sample[key];
        }
        for (const [key, multiplier] of [["wrist_height", 180], ["hip_height", 180]]) {
            if (Number.isFinite(sample?.[key])) current[key] = sample[key] * multiplier;
        }
        if (previous) {
            const differences = Object.keys(current)
                .filter((key) => Number.isFinite(previous[key]))
                .map((key) => Math.abs(current[key] - previous[key]));
            if (differences.length) motion.push(Math.max(...differences));
        }
        previous = current;
    }
    return {
        knee_angle_range: featureRange(knee),
        elbow_angle_range: featureRange(elbow),
        hip_angle_range: featureRange(hip),
        wrist_height_range: featureRange(wristHeight),
        wrist_span_range: featureRange(wristSpan),
        torso_ratio_mean: average(torso),
        torso_ratio_median: percentile(torso, 0.5),
        horizontal_pose_ratio: torso.filter((value) => value < 0.45).length / torso.length,
        vertical_pose_ratio: torso.filter((value) => value > 0.72).length / torso.length,
        overhead_pose_ratio: wristHeight.filter((value) => value > 0.02).length / wristHeight.length,
        motion_energy: average(motion),
    };
}

const RUNTIME_PROFILE_SIGNALS = new Set([
    "knee_angle",
    "elbow_angle",
    "ankle_angle",
    "hip_angle",
    "wrist_height",
]);

function hasValidRuntimeProfile(runtime) {
    if (!runtime || typeof runtime !== "object" || typeof runtime.duration_only !== "boolean") return false;
    if (runtime.duration_only) return runtime.signal === null && runtime.direction === null;
    return RUNTIME_PROFILE_SIGNALS.has(runtime.signal) && ["low", "high"].includes(runtime.direction);
}

export function hasValidProfileReleaseGate(model, expectedEvaluatorVersion = null) {
    const gate = model?.release_gate;
    const report = gate?.report;
    const classes = model?.classes;
    return model?.schema_version === "gymlab.exercise-profile-model.v1"
        && model.status === "validated"
        && typeof gate?.report_sha256 === "string"
        && /^[0-9a-f]{64}$/i.test(gate.report_sha256)
        && typeof gate?.evaluator_version === "string"
        && gate.evaluator_version.length > 0
        && (expectedEvaluatorVersion === null || gate.evaluator_version === expectedEvaluatorVersion)
        && report
        && typeof report === "object"
        && report.evaluator_version === gate.evaluator_version
        && report.provenance_required === true
        && Array.isArray(report.failures)
        && report.failures.length === 0
        && report.metrics
        && typeof report.metrics === "object"
        && classes
        && typeof classes === "object"
        && Object.keys(classes).length > 0
        && Object.values(classes).every((profile) => hasValidRuntimeProfile(profile?.runtime_profile));
}

export function scoreProfileModel(samples, model) {
    if (!hasValidProfileReleaseGate(model)) return null;
    const summary = summarizeExerciseFeatures(samples);
    if (!summary || !model.classes || typeof model.classes !== "object") return null;
    const scores = {};
    for (const [exerciseId, profile] of Object.entries(model.classes)) {
        const centroid = profile?.centroid;
        const scale = profile?.scale;
        if (!centroid || !scale) continue;
        const distances = PROFILE_FEATURE_ORDER
            .map((key) => (Number(summary[key]) - Number(centroid[key])) / Math.max(1e-6, Number(scale[key])))
            .filter(Number.isFinite);
        if (distances.length !== PROFILE_FEATURE_ORDER.length) continue;
        const rmsDistance = Math.sqrt(average(distances.map((value) => value * value)));
        scores[exerciseId] = clamp(1 / (1 + rmsDistance), 0, 1);
    }
    return Object.keys(scores).length ? scores : null;
}

/**
 * Resolve a validated learned class into the runtime contract used for
 * repetition counting and MET calculation. A centroid alone is not enough to
 * save a result: the release artifact must also declare how reps are measured
 * (or that the exercise is duration-only) and the id must exist in the app
 * catalog.
 */
export function resolveValidatedProfile(exerciseId, model, catalog = []) {
    if (!hasValidProfileReleaseGate(model) || !exerciseId || !Array.isArray(catalog)) return null;
    const learnedClass = model.classes?.[exerciseId];
    const runtime = learnedClass?.runtime_profile;
    const exercise = catalog.find((item) => item?.id === exerciseId);
    if (!runtime || !exercise || !Number.isFinite(Number(exercise.met))) return null;
    if (!hasValidRuntimeProfile(runtime)) return null;
    const durationOnly = runtime.duration_only;
    const signal = runtime.signal;
    const direction = runtime.direction;
    return {
        id: exerciseId,
        name: exercise.name_vi || exercise.name || exerciseId,
        met: Number(exercise.met),
        category: exercise.category || "unknown",
        evaluationStatus: "validated",
        signal: durationOnly ? null : signal,
        direction: durationOnly ? null : direction,
        durationOnly,
    };
}

export function detectRepetitionEvents(values, direction) {
    const clean = values.filter(Number.isFinite);
    if (clean.length < 5) return [];
    const smoothed = medianFilter(clean);
    const low = percentile(smoothed, 0.1);
    const high = percentile(smoothed, 0.9);
    const amplitude = high - low;
    if (amplitude < (direction === "high" ? 0.05 : 12)) return [];

    const enter = direction === "high" ? high - amplitude * 0.35 : low + amplitude * 0.35;
    const exit = direction === "high" ? low + amplitude * 0.45 : high - amplitude * 0.35;
    let active = false;
    let startIndex = null;
    const events = [];

    for (let index = 0; index < smoothed.length; index += 1) {
        const value = smoothed[index];
        if (!active) {
            if (direction === "high" ? value >= enter : value <= enter) {
                active = true;
                startIndex = index;
            }
        } else if (direction === "high" ? value <= exit : value >= exit) {
            events.push({ startIndex, endIndex: index });
            active = false;
            startIndex = null;
        }
    }
    return events;
}

export function countRepetitions(values, direction) {
    return detectRepetitionEvents(values, direction).length;
}

export function classifyExercise(samples, profileModel = null) {
    const kneeAmplitude = range(samples.map((sample) => sample.knee_angle));
    const elbowAmplitude = range(samples.map((sample) => sample.elbow_angle));
    const ankleAmplitude = range(samples.map((sample) => sample.ankle_angle));
    const hipAmplitude = range(samples.map((sample) => sample.hip_angle));
    const wristAmplitude = range(samples.map((sample) => sample.wrist_height));
    const wristSpanAmplitude = range(samples.map((sample) => sample.wrist_span));
    const torsoRatio = average(samples.map((sample) => sample.torso_ratio));
    const overheadRatio = samples.filter((sample) => sample.wrist_height > 0.02).length / Math.max(1, samples.length);
    const verticalPoseRatio = samples.filter((sample) => sample.torso_ratio > 0.72).length / Math.max(1, samples.length);
    const horizontalPoseRatio = samples.filter((sample) => sample.torso_ratio < 0.45).length / Math.max(1, samples.length);
    const wristsBelowShoulderRatio = samples.filter((sample) => sample.wrist_height < -0.05).length / Math.max(1, samples.length);
    const postureClasses = samples.map((sample) => {
        if (sample.torso_ratio < 0.45) return "horizontal";
        if (sample.torso_ratio > 0.72) return "vertical";
        return "transition";
    });
    const postureTransitions = postureClasses.slice(1).reduce(
        (count, posture, index) => count + (posture !== postureClasses[index] ? 1 : 0),
        0,
    );
    const postureTransitionRatio = postureTransitions / Math.max(1, postureClasses.length - 1);
    const rowPosture = clamp((0.85 - torsoRatio) / 0.85, 0, 1);
    const horizontalStillness = 1 - clamp((kneeAmplitude + elbowAmplitude + hipAmplitude) / 240, 0, 1);
    const lowerBodyMotion = clamp((kneeAmplitude + hipAmplitude) / 110, 0, 1);

    // These are conservative motion/posture scores, not a trained classifier.
    // Explicitly separating horizontal from vertical elbow motion prevents a
    // push-up from being silently mislabeled as a bicep curl.
    const scores = {
        squat: clamp(kneeAmplitude / 55, 0, 1)
            * (0.7 + clamp(torsoRatio / 1.5, 0, 0.3))
            * (1 - horizontalPoseRatio * 0.75),
        push_up: clamp(elbowAmplitude / 70, 0, 1)
            * (0.6 + horizontalPoseRatio * 0.4),
        bicep_curl: clamp(elbowAmplitude / 75, 0, 1)
            * (0.65 + (1 - overheadRatio) * 0.35)
            * (0.35 + verticalPoseRatio * 0.65)
            * (1 - horizontalPoseRatio * 0.85)
            * (1 - wristsBelowShoulderRatio * 0.7)
            // A curl is an upper-limb isolation pattern. Squat-like lower
            // body motion should prevent arm swing from hijacking the label.
            * (1 - lowerBodyMotion * 0.75),
        overhead_press: clamp(wristAmplitude / 0.25, 0, 1)
            * (0.55 + overheadRatio * 0.45)
            * (1 - lowerBodyMotion * 0.75),
        deadlift: clamp(hipAmplitude / 55, 0, 1)
            * (0.55 + clamp(torsoRatio, 0, 1) * 0.45)
            * (1 - clamp(elbowAmplitude / 70, 0, 1) * 0.3),
        barbell_row: clamp(hipAmplitude / 55, 0, 1)
            * clamp(elbowAmplitude / 70, 0, 1)
            * (0.5 + rowPosture * 0.5)
            * (1 - overheadRatio),
        pull_up: clamp(elbowAmplitude / 75, 0, 1)
            * (0.45 + overheadRatio * 0.55)
            * verticalPoseRatio,
        tricep_dip: clamp(elbowAmplitude / 75, 0, 1)
            * verticalPoseRatio
            * (0.55 + wristsBelowShoulderRatio * 0.45)
            * (1 - lowerBodyMotion * 0.45),
        lateral_raise: clamp(wristSpanAmplitude / 0.8, 0, 1)
            * clamp(wristAmplitude / 0.25, 0, 1)
            * verticalPoseRatio
            * (1 - horizontalPoseRatio)
            * (1 - lowerBodyMotion * 0.75),
        calf_raise: clamp(ankleAmplitude / 25, 0, 1)
            * verticalPoseRatio
            * (1 - clamp(kneeAmplitude / 45, 0, 1) * 0.8)
            * (1 - clamp(hipAmplitude / 45, 0, 1) * 0.8),
        plank: horizontalPoseRatio
            * (0.65 + horizontalStillness * 0.35)
            * (1 - clamp(wristAmplitude / 0.3, 0, 1) * 0.25),
        mountain_climbers: horizontalPoseRatio
            * clamp(kneeAmplitude / 55, 0, 1)
            * (0.55 + clamp(hipAmplitude / 55, 0, 1) * 0.45),
        burpees: clamp(postureTransitionRatio / 0.04, 0, 1)
            * clamp((kneeAmplitude + hipAmplitude) / 110, 0, 1)
            * (0.8 + verticalPoseRatio * 0.2),
    };
    const learnedScores = scoreProfileModel(samples, profileModel);
    const combinedScores = learnedScores
        ? Object.fromEntries([...new Set([...Object.keys(scores), ...Object.keys(learnedScores)])].map((exerciseId) => {
            const heuristicScore = Number.isFinite(scores[exerciseId]) ? scores[exerciseId] : 0;
            const learnedScore = Number.isFinite(learnedScores[exerciseId]) ? learnedScores[exerciseId] : heuristicScore;
            return [
                exerciseId,
                clamp(heuristicScore * 0.45 + learnedScore * 0.55, 0, 1),
            ];
        }))
        : scores;
    const ordered = Object.entries(combinedScores).sort((a, b) => b[1] - a[1]);
    const [exerciseId, score] = ordered[0] || ["unknown", 0];
    const margin = score - (ordered[1]?.[1] || 0);
    // A high raw score is not a calibrated probability. Require separation
    // from the runner-up as well, otherwise visually similar exercises can be
    // presented as certain instead of being sent through review/abstention.
    const accepted = score >= 0.18 && margin >= 0.08;
    return {
        exerciseId: accepted ? exerciseId : "unknown",
        score,
        margin,
        scores: combinedScores,
        classifierSource: learnedScores ? "validated_profile_model" : "heuristic",
    };
}

export function applyPoseQualityGate(classification, coverage, minimumCoverage = 0.5) {
    const qualityGatePassed = Number.isFinite(coverage) && coverage >= minimumCoverage;
    const gatedClassification = qualityGatePassed
        ? classification
        : { ...classification, exerciseId: "unknown" };
    return {
        classification: gatedClassification,
        qualityGatePassed,
        abstentionReason: qualityGatePassed
            ? (gatedClassification.exerciseId === "unknown" ? "ambiguous_motion" : null)
            : "pose_coverage_below_threshold",
    };
}

export function applyExerciseConfidenceGate(classification, confidence, minimumConfidence = 0.55) {
    const confidenceGatePassed = classification?.exerciseId !== "unknown"
        && Number.isFinite(confidence)
        && confidence >= minimumConfidence;
    const gatedClassification = confidenceGatePassed
        ? classification
        : { ...classification, exerciseId: "unknown" };
    return {
        classification: gatedClassification,
        confidenceGatePassed,
        abstentionReason: confidenceGatePassed
            ? null
            : classification?.exerciseId === "unknown"
                ? "ambiguous_motion"
                : "exercise_confidence_below_threshold",
    };
}

export function canSaveAnalysis(result) {
    if (!result || result.exerciseId === "unknown") return false;
    if (result.qualityGatePassed !== true) return false;
    if (!result.manualExerciseId && result.confidenceGatePassed !== true) return false;
    if (result.activeSeconds <= 0) return false;
    if (!result.durationOnly && result.reps <= 0) return false;
    if (result.bodyWeightConfirmed !== true) return false;
    if (result.weightKg !== null
        && typeof result.weightSource === "string"
        && result.weightSource.startsWith("OCR")
        && result.weightConfirmed !== true) return false;
    // Any profile without a held-out, consented validation is a suggestion,
    // not an automatically saveable exercise label. The user may still keep
    // the result after explicitly confirming the exercise in the review UI.
    if (result.profileEvaluationStatus !== "validated" && !result.manualExerciseId) return false;
    return true;
}

export function applyPersonCountGate(multiplePersonRatio, maximumRatio = 0.05) {
    const passed = Number.isFinite(multiplePersonRatio) && multiplePersonRatio <= maximumRatio;
    return {
        passed,
        reason: passed ? null : "multiple_people_detected",
    };
}

export function estimateSetCount(samples, movementThreshold = 7, restGapSeconds = 5) {
    if (!Array.isArray(samples) || samples.length < 2) return 0;
    const sampleIntervals = [];
    for (let index = 1; index < samples.length; index += 1) {
        const interval = Number(samples[index]?.time) - Number(samples[index - 1]?.time);
        if (Number.isFinite(interval) && interval > 0) sampleIntervals.push(interval);
    }
    // When a long clip reaches MAX_SAMPLES, adjacent observations can be
    // several seconds apart. Treating that sampling gap as a rest period would
    // manufacture sets, so scale the rest threshold by the typical interval.
    const effectiveRestGap = Math.max(restGapSeconds, percentile(sampleIntervals, 0.5) * 3);
    const activeTimes = [];
    for (let index = 1; index < samples.length; index += 1) {
        const previous = samples[index - 1];
        const current = samples[index];
        const movements = [
            [current?.knee_angle, previous?.knee_angle],
            [current?.elbow_angle, previous?.elbow_angle],
            [current?.hip_angle, previous?.hip_angle],
        ]
            .filter(([left, right]) => Number.isFinite(left) && Number.isFinite(right))
            .map(([left, right]) => Math.abs(left - right));
        const movement = movements.length ? Math.max(...movements) : 0;
        if (movement >= movementThreshold && Number.isFinite(Number(current?.time))) {
            activeTimes.push(Number(current.time));
        }
    }
    if (!activeTimes.length) return 1;
    let sets = 1;
    for (let index = 1; index < activeTimes.length; index += 1) {
        if (activeTimes[index] - activeTimes[index - 1] > effectiveRestGap) sets += 1;
    }
    return clamp(sets, 1, 20);
}

export function estimateActiveDuration(samples, totalDuration, movementThreshold = 4) {
    if (!Array.isArray(samples) || samples.length < 2 || !Number.isFinite(totalDuration) || totalDuration <= 0) {
        return 0;
    }

    let activeSeconds = 0;
    for (let index = 1; index < samples.length; index += 1) {
        const previous = samples[index - 1];
        const current = samples[index];
        const previousTime = Number(previous?.time);
        const currentTime = Number(current?.time);
        const interval = currentTime - previousTime;
        if (!Number.isFinite(interval) || interval <= 0) continue;

        const difference = (left, right, multiplier = 1) => (
            Number.isFinite(left) && Number.isFinite(right)
                ? Math.abs(left - right) * multiplier
                : null
        );
        const movement = [
            difference(current?.knee_angle, previous?.knee_angle),
            difference(current?.elbow_angle, previous?.elbow_angle),
            difference(current?.hip_angle, previous?.hip_angle),
            difference(current?.wrist_height, previous?.wrist_height, 180),
            difference(current?.hip_height, previous?.hip_height, 180),
        ].filter(Number.isFinite);
        const movementScore = movement.length ? Math.max(...movement) : 0;
        if (movementScore >= movementThreshold) activeSeconds += interval;
    }

    return clamp(activeSeconds, 0, totalDuration);
}

export function extractWeightCandidates(text, recognitionConfidence, frameIndex = null) {
    const normalized = String(text || "").replace(/\s+/g, " ");
    const pattern = /([0-9OoIl]{1,3}(?:[.,][0-9OoIl]{1,2})?)\s*(kg|kgs|kilo|kilos|kilogram|kilograms|lb|lbs|pound|pounds)\b/gi;
    const candidates = [];
    for (const match of normalized.matchAll(pattern)) {
        const rawValue = Number(match[1].replace(/[Oo]/g, "0").replace(/[Il]/g, "1").replace(",", "."));
        if (!Number.isFinite(rawValue) || rawValue <= 0) continue;
        const unit = match[2].toLowerCase();
        const valueKg = unit.startsWith("lb") || unit.startsWith("pound") ? rawValue / 2.2046226218 : rawValue;
        if (valueKg >= 0.5 && valueKg <= 500) {
            candidates.push({
                valueKg,
                confidence: clamp((recognitionConfidence || 0) / 100, 0, 1),
                // A complete numeric + unit match is stronger than the raw
                // OCR aggregate confidence, which can be 0 for clean text
                // when the frame also contains a large amount of background.
                textQuality: 1,
                frameIndex,
            });
        }
    }
    return candidates;
}

export function selectWeightCandidate(candidates) {
    if (!candidates.length) return null;
    const clusters = [];
    for (const candidate of candidates) {
        let cluster = clusters.find((item) => Math.abs(item.valueKg - candidate.valueKg) <= 1);
        if (!cluster) {
            cluster = {
                valueKg: candidate.valueKg,
                count: 0,
                confidence: 0,
                textQuality: 0,
                frames: new Set(),
            };
            clusters.push(cluster);
        }
        cluster.count += 1;
        cluster.confidence += candidate.confidence;
        cluster.textQuality += candidate.textQuality ?? 0;
        if (candidate.frameIndex === null || candidate.frameIndex === undefined) {
            // Missing frame identity is not evidence from a distinct frame.
            // Production OCR always supplies an index, but the helper must
            // remain conservative for callers that omit it.
            cluster.frames.add("unknown-frame");
        } else {
            cluster.frames.add(candidate.frameIndex);
        }
        cluster.valueKg = (cluster.valueKg * (cluster.count - 1) + candidate.valueKg) / cluster.count;
    }
    clusters.sort((a, b) => (b.count - a.count) || (b.confidence - a.confidence));
    const best = clusters[0];
    const evidenceFrames = best.frames.size;
    const averageConfidence = best.confidence / best.count;
    const averageTextQuality = best.textQuality / best.count;
    const repeatedExactText = evidenceFrames >= 3 && averageTextQuality >= 0.9;
    if (evidenceFrames < 2 || (averageConfidence < 0.65 && !repeatedExactText)) return null;
    const repetitionScore = clamp(evidenceFrames / 3, 0, 1);
    const effectiveConfidence = averageConfidence >= 0.65
        ? averageConfidence
        : 0.5 + repetitionScore * 0.35;
    return {
        valueKg: best.valueKg,
        confidence: clamp(effectiveConfidence * 0.65 + repetitionScore * 0.35, 0, 0.99),
        evidenceFrames,
    };
}
