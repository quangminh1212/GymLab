import { FilesetResolver, PoseLandmarker } from "../vendor/mediapipe/vision_bundle.mjs";
import {
    applyExerciseConfidenceGate,
    applyPersonCountGate,
    applyPoseQualityGate,
    canSaveAnalysis,
    canonicalizeJson,
    classifyExercise,
    detectRepetitionEvents,
    estimateActiveDuration,
    estimateSetCount,
    extractWeightCandidates,
    hasValidProfileReleaseGate,
    PROFILE_EVALUATOR_VERSION,
    resolveValidatedProfile,
    selectWeightCandidate,
} from "./video-analysis-core.js";

// Local assets keep the analysis private and usable without a model download.
const MODEL_URL = new URL("../models/pose_landmarker_lite.task", import.meta.url).href;
const WASM_URL = new URL("../vendor/mediapipe/wasm/", import.meta.url).href;
const OCR_MODEL_URL = new URL("../models/tessdata/eng.traineddata.gz", import.meta.url).href;
const PROFILE_MODEL_URL = new URL("../models/exercise_profile_model.json", import.meta.url).href;
const MAX_SAMPLES = 720;
const MAX_OCR_SAMPLES = 10;
const MIN_VIDEO_DURATION_SECONDS = 2;
const MIN_POSE_COVERAGE = 0.5;
const MIN_EXERCISE_CONFIDENCE = 0.55;
const MAX_MULTIPLE_PERSON_FRAME_RATIO = 0.05;
const MAX_INPUT_HASH_BYTES = 512 * 1024 * 1024;
const ANALYSIS_ALGORITHM_VERSION = "heuristic-profile-v16";
const CONFIDENCE_METHOD = "uncalibrated_coverage_score_v1";
const CALORIE_METHOD = "MET × body_weight_kg × active_duration_hours";
const CALORIE_SOURCE = "ACSM Compendium 2024";
const POSE_MODEL_SHA256 = "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a";
const OCR_MODEL_SHA256 = "ed350f3752f81ee8f38769edc14d92d997dababe23b565c59879372cc46a2468";
const PROFILE_MODEL_SHA256 = "a4bbc0c62c83846c9a29db5ea602f859dbe466a305d5e0a1dd8704fde8dbcc5f";
const DURATION_BASED_CATEGORIES = new Set(["cardio", "flexibility"]);

function isDurationOnlyExercise(exercise) {
    return Boolean(exercise?.durationOnly)
        || DURATION_BASED_CATEGORIES.has(exercise?.category)
        || exercise?.id === "plank";
}

const EXERCISE_PROFILES = {
    squat: { name: "Squat", met: 6, category: "strength", evaluationStatus: "baseline", signal: "knee_angle", direction: "low" },
    push_up: { name: "Hít đất", met: 8, category: "strength", evaluationStatus: "baseline", signal: "elbow_angle", direction: "low" },
    bicep_curl: { name: "Cuốn tay", met: 3.5, category: "strength", evaluationStatus: "baseline", signal: "elbow_angle", direction: "low" },
    overhead_press: { name: "Đẩy tạ vai", met: 5, category: "strength", evaluationStatus: "baseline", signal: "wrist_height", direction: "high" },
    deadlift: { name: "Deadlift", met: 6, category: "strength", evaluationStatus: "baseline", signal: "hip_angle", direction: "low" },
    barbell_row: { name: "Kéo tạ", met: 5, category: "strength", evaluationStatus: "candidate", signal: "elbow_angle", direction: "low" },
    pull_up: { name: "Kéo xà", met: 8, category: "strength", evaluationStatus: "candidate", signal: "elbow_angle", direction: "low" },
    tricep_dip: { name: "Chùn tay", met: 5, category: "strength", evaluationStatus: "candidate", signal: "elbow_angle", direction: "low" },
    lateral_raise: { name: "Nâng ngang", met: 3.5, category: "strength", evaluationStatus: "candidate", signal: "wrist_height", direction: "high" },
    calf_raise: { name: "Nâng gót", met: 3.5, category: "strength", evaluationStatus: "candidate", signal: "ankle_angle", direction: "low" },
    plank: { name: "Plank", met: 4, category: "strength", evaluationStatus: "candidate", durationOnly: true },
    mountain_climbers: { name: "Leo núi", met: 8, category: "hiit", evaluationStatus: "candidate", signal: "knee_angle", direction: "low" },
    burpees: { name: "Burpees", met: 12.5, category: "hiit", evaluationStatus: "candidate", signal: "knee_angle", direction: "low" },
};

function resolveAnalysisProfile(exerciseId, validatedModel = null) {
    return EXERCISE_PROFILES[exerciseId]
        || resolveValidatedProfile(exerciseId, validatedModel, exerciseCatalog);
}

// Keeps the review control useful during a transient IPC/catalog failure. The
// authoritative catalog still comes from Rust when available.
const FALLBACK_EXERCISES = [
    ["bench_press", "Ép ngực", 6], ["squat", "Squat", 6], ["deadlift", "Cuốn đất", 6],
    ["overhead_press", "Đẩy tạ", 5], ["barbell_row", "Kéo tạ", 5], ["bicep_curl", "Cuốn tay", 3.5],
    ["tricep_dip", "Chùn tay", 5], ["lateral_raise", "Nâng ngang", 3.5], ["leg_press", "Đạp chân", 5],
    ["calf_raise", "Nâng gót", 3.5], ["pull_up", "Kéo xô", 8], ["push_up", "Hít đất", 8],
    ["plank", "Plank", 4], ["running", "Chạy bộ", 9.8], ["cycling", "Đạp xe", 7.5],
    ["swimming", "Bơi lội", 8], ["jumping_rope", "Nhảy dây", 12.3], ["rowing_machine", "Máy chèo", 7],
    ["stair_climbing", "Leo cầu thang", 9], ["elliptical", "Máy elip", 5], ["walking", "Đi bộ", 3.5],
    ["burpees", "Burpees", 12.5], ["mountain_climbers", "Leo núi", 8], ["box_jumps", "Nhảy hộp", 10],
    ["yoga", "Yoga", 3], ["stretching", "Giãn cơ", 2.5],
].map(([id, name_vi, met]) => ({
    id,
    name_vi,
    name: name_vi,
    met,
    category: ["running", "cycling", "swimming", "jumping_rope", "rowing_machine", "stair_climbing", "elliptical", "walking"].includes(id)
        ? "cardio"
        : ["yoga", "stretching"].includes(id) ? "flexibility" : "strength",
}));

let poseLandmarker = null;
let modelPromise = null;
let ocrWorker = null;
let ocrWorkerPromise = null;
let profileModelPromise = null;
const verifiedAssets = new Map();
let selectedFile = null;
let videoUrl = null;
let lastResult = null;
let poseDelegate = "unavailable";
let exerciseCatalog = [];
let exerciseCatalogPromise = null;
let bodyWeightInputTouched = false;
let bodyWeightLoadPromise = null;

function byId(id) {
    return document.getElementById(id);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function average(values) {
    const clean = values.filter(Number.isFinite);
    return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

async function sha256File(file) {
    if (!file || !window.crypto?.subtle || file.size > MAX_INPUT_HASH_BYTES) return null;
    const digest = await window.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyBundledAsset(url, expectedHash, label) {
    if (verifiedAssets.has(url)) return verifiedAssets.get(url);
    const verification = (async () => {
        if (!window.crypto?.subtle) throw new Error(`Không thể kiểm tra integrity của ${label}.`);
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`Không tải được ${label} để kiểm tra integrity.`);
        const digest = await window.crypto.subtle.digest("SHA-256", await response.arrayBuffer());
        const actualHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        if (actualHash !== expectedHash) {
            throw new Error(`${label} không khớp SHA-256; đã từ chối chạy model.`);
        }
        return actualHash;
    })();
    verifiedAssets.set(url, verification);
    return verification;
}

async function sha256Text(text) {
    if (!window.crypto?.subtle) throw new Error("Không thể kiểm tra hash report evaluator.");
    const digest = await window.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(text),
    );
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function point(landmarks, index) {
    const p = landmarks[index];
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility === undefined || p.visibility >= 0.2) ? p : null;
}

function midpoint(a, b) {
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
}

function distance(a, b) {
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}

function angle(a, b, c) {
    if (!a || !b || !c) return null;
    const ab = { x: a.x - b.x, y: a.y - b.y };
    const cb = { x: c.x - b.x, y: c.y - b.y };
    const denominator = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
    if (!denominator) return null;
    return Math.acos(clamp((ab.x * cb.x + ab.y * cb.y) / denominator, -1, 1)) * 180 / Math.PI;
}

function meanPair(left, right) {
    const values = [left, right].filter(Number.isFinite);
    return values.length ? average(values) : null;
}

function extractFeatures(landmarks) {
    const nose = point(landmarks, 0);
    const leftShoulder = point(landmarks, 11);
    const rightShoulder = point(landmarks, 12);
    const leftElbow = point(landmarks, 13);
    const rightElbow = point(landmarks, 14);
    const leftWrist = point(landmarks, 15);
    const rightWrist = point(landmarks, 16);
    const leftHip = point(landmarks, 23);
    const rightHip = point(landmarks, 24);
    const leftKnee = point(landmarks, 25);
    const rightKnee = point(landmarks, 26);
    const leftAnkle = point(landmarks, 27);
    const rightAnkle = point(landmarks, 28);
    const leftFoot = point(landmarks, 31);
    const rightFoot = point(landmarks, 32);
    const shoulder = midpoint(leftShoulder, rightShoulder);
    const hip = midpoint(leftHip, rightHip);
    const torsoLength = distance(shoulder, hip);
    const shoulderWidth = distance(leftShoulder, rightShoulder);

    if (!shoulder || !hip || !torsoLength) return null;

    const wristHeight = meanPair(
        shoulder.y - (leftWrist?.y ?? NaN),
        shoulder.y - (rightWrist?.y ?? NaN),
    );
    const noseHeight = nose ? shoulder.y - nose.y : 0;

    return {
        knee_angle: meanPair(
            angle(leftHip, leftKnee, leftAnkle),
            angle(rightHip, rightKnee, rightAnkle),
        ),
        elbow_angle: meanPair(
            angle(leftShoulder, leftElbow, leftWrist),
            angle(rightShoulder, rightElbow, rightWrist),
        ),
        ankle_angle: meanPair(
            angle(leftKnee, leftAnkle, leftFoot),
            angle(rightKnee, rightAnkle, rightFoot),
        ),
        hip_angle: meanPair(
            angle(leftShoulder, leftHip, leftKnee),
            angle(rightShoulder, rightHip, rightKnee),
        ),
        wrist_height: wristHeight,
        nose_height: noseHeight,
        hip_height: hip?.y ?? null,
        wrist_span: shoulderWidth && leftWrist && rightWrist
            ? distance(leftWrist, rightWrist) / shoulderWidth
            : null,
        torso_ratio: Math.abs(shoulder.y - hip.y) / torsoLength,
        pose_scale: torsoLength,
    };
}

async function createPoseLandmarker() {
    await verifyBundledAsset(MODEL_URL, POSE_MODEL_SHA256, "pose model");
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    try {
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
            runningMode: "VIDEO",
            numPoses: 2,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });
        poseDelegate = "GPU";
        return landmarker;
    } catch (gpuError) {
        console.warn("GymLab: GPU pose delegate unavailable, using CPU", gpuError);
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
            runningMode: "VIDEO",
            numPoses: 2,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });
        poseDelegate = "CPU";
        return landmarker;
    }
}

async function createWeightOcrWorker() {
    if (!window.Tesseract?.createWorker) {
        throw new Error("OCR runtime chưa được đóng gói");
    }
    const workerPath = new URL("../vendor/tesseract/worker.min.js", import.meta.url).href;
    const corePath = new URL("../vendor/tesseract/", import.meta.url).href;
    await verifyBundledAsset(OCR_MODEL_URL, OCR_MODEL_SHA256, "OCR model");
    const langPath = new URL("../models/tessdata/", import.meta.url).href;
    const worker = await window.Tesseract.createWorker("eng", 1, {
        workerPath,
        corePath,
        langPath,
        workerBlobURL: false,
        logger: (message) => {
            if (message.status === "recognizing text" && Number.isFinite(message.progress)) {
                setProgress(0.85 + message.progress * 0.12, "Đang đọc chữ kg trên frame...");
            }
        },
    });
    await worker.setParameters({
        tessedit_pageseg_mode: "11",
        tessedit_char_whitelist: "0123456789.,KGkgLBlb",
    });
    return worker;
}

async function loadProfileModel() {
    if (!profileModelPromise) {
        profileModelPromise = (async () => {
            try {
                const integrityHash = await verifyBundledAsset(
                    PROFILE_MODEL_URL,
                    PROFILE_MODEL_SHA256,
                    "exercise profile model",
                );
                const response = await fetch(PROFILE_MODEL_URL, { cache: "no-store" });
                if (!response.ok) throw new Error("exercise profile model unavailable");
                const model = await response.json();
                if (model?.schema_version !== "gymlab.exercise-profile-model.v1") {
                    return { model: null, status: "invalid", integrity: "verified", sha256: integrityHash };
                }
                if (
                    !hasValidProfileReleaseGate(model, PROFILE_EVALUATOR_VERSION)
                    || !Object.keys(model.classes || {}).length
                ) {
                    return {
                        model: null,
                        status: model.status === "candidate" ? "candidate" : "invalid",
                        integrity: "verified",
                        sha256: integrityHash,
                    };
                }
                const reportHash = await sha256Text(JSON.stringify(canonicalizeJson(model.release_gate.report)));
                if (reportHash.toLowerCase() !== model.release_gate.report_sha256.toLowerCase()) {
                    throw new Error("evaluator report không khớp SHA-256 trong profile model.");
                }
                return { model, status: "validated", integrity: "verified", sha256: integrityHash };
            } catch (error) {
                console.warn("GymLab profile model unavailable; using heuristic classifier", error);
                return { model: null, status: "unavailable", integrity: "not_run", sha256: null };
            }
        })();
    }
    return profileModelPromise;
}

function frameToBlob(video) {
    const maxWidth = 1280;
    const scale = Math.min(1, maxWidth / Math.max(1, video.videoWidth));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: false });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Không tạo được frame OCR")), "image/jpeg", 0.86);
    });
}

async function readWeightFromVideo(video, duration) {
    if (!ocrWorkerPromise) ocrWorkerPromise = createWeightOcrWorker();
    ocrWorker = await ocrWorkerPromise;
    const sampleCount = Math.min(MAX_OCR_SAMPLES, Math.max(4, Math.ceil(duration / 4)));
    const candidates = [];
    for (let index = 0; index < sampleCount; index += 1) {
        const time = duration * (index + 0.5) / sampleCount;
        await seekVideo(video, time);
        const result = await ocrWorker.recognize(await frameToBlob(video));
        candidates.push(...extractWeightCandidates(
            result?.data?.text,
            result?.data?.confidence,
            index,
        ));
        setProgress(0.85 + ((index + 1) / sampleCount) * 0.12, `Đang đọc nhãn kg ${index + 1}/${sampleCount}...`);
    }
    return selectWeightCandidate(candidates);
}

function setProgress(value, label) {
    const progress = byId("analysis-progress");
    const bar = byId("analysis-progress-bar");
    const text = byId("analysis-progress-label");
    if (progress) progress.hidden = false;
    if (bar) bar.style.width = `${Math.round(clamp(value, 0, 1) * 100)}%`;
    if (text) text.textContent = label;
}

function setStatus(message, type = "info") {
    const status = byId("analysis-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.type = type;
}

async function loadExerciseCatalog() {
    const select = byId("analysis-exercise-review");
    if (!select) return;

    let exercises = [];
    try {
        const result = await window.gymLabInvoke?.("get_exercises", {});
        if (Array.isArray(result)) exercises = result;
    } catch (error) {
        console.warn("GymLab exercise catalog unavailable", error);
    }
    if (!exercises.length) {
        exercises = FALLBACK_EXERCISES;
    }
    exerciseCatalog = exercises.filter((exercise) => exercise?.id && Number.isFinite(Number(exercise.met)));
    select.replaceChildren(new Option("Giữ kết quả AI", "__auto__"));
    updateExerciseReviewLabels();
}

function exerciseProfileLabel(profile) {
    if (profile?.evaluationStatus === "validated") return "AI tự nhận diện · validated held-out";
    if (profile?.evaluationStatus === "baseline") return "AI tự nhận diện · kiểm thử mẫu";
    if (profile?.evaluationStatus === "candidate") return "AI tự nhận diện · cần review";
    return "Cần xác nhận";
}

function updateExerciseReviewLabels(profileModel = null) {
    const select = byId("analysis-exercise-review");
    if (!select) return;
    for (const exercise of exerciseCatalog) {
        const option = [...select.options].find((item) => item.value === exercise.id)
            || (() => {
                const created = new Option("", exercise.id);
                select.add(created);
                return created;
            })();
        const profile = resolveAnalysisProfile(exercise.id, profileModel);
        option.textContent = `${exercise.name_vi || exercise.name || exercise.id} · ${Number(exercise.met).toFixed(1)} MET · ${exerciseProfileLabel(profile)}`;
    }
}

async function loadAnalysisBodyWeight() {
    const input = byId("analysis-body-weight");
    if (!input || bodyWeightInputTouched) return;
    try {
        const metadata = await window.gymLabInvoke?.("get_body_weight_metadata", {});
        const stored = Number(metadata?.value ?? await window.gymLabInvoke?.("get_body_weight", {}));
        if (!Number.isFinite(stored) || stored < 20 || stored > 300 || bodyWeightInputTouched) return;
        input.value = String(stored);
        input.dataset.bodyWeightSource = metadata?.source === "settings"
            ? "Cài đặt người dùng"
            : "Mặc định 70 kg";
    } catch (error) {
        console.warn("GymLab stored body weight unavailable", error);
        input.dataset.bodyWeightSource = "Mặc định 70 kg";
    }
}

function seekVideo(video, time) {
    return new Promise((resolve, reject) => {
        const onSeeked = () => {
            cleanup();
            resolve();
        };
        const onError = () => {
            cleanup();
            reject(video.error || new Error("Không thể đọc frame video"));
        };
        const cleanup = () => {
            video.removeEventListener("seeked", onSeeked);
            video.removeEventListener("error", onError);
        };
        if (Math.abs(video.currentTime - time) < 0.02) {
            resolve();
            return;
        }
        video.addEventListener("seeked", onSeeked, { once: true });
        video.addEventListener("error", onError, { once: true });
        video.currentTime = time;
    });
}

async function analyzeVideo() {
    const video = byId("analysis-video");
    const analyzeButton = byId("btn-analyze-video");
    if (!selectedFile || !video || !Number.isFinite(video.duration) || video.duration <= 0) return;

    analyzeButton.disabled = true;
    byId("btn-save-analysis").disabled = true;
    byId("analysis-results").hidden = true;
    setProgress(0, "Đang khởi tạo pose model local...");
    setStatus("Đang phân tích frame trên thiết bị...", "info");

    try {
        if (exerciseCatalogPromise) await exerciseCatalogPromise;
        if (bodyWeightLoadPromise) await bodyWeightLoadPromise;
        if (video.duration < MIN_VIDEO_DURATION_SECONDS) {
            throw new Error(`Video quá ngắn; cần ít nhất ${MIN_VIDEO_DURATION_SECONDS} giây để đánh giá chuyển động.`);
        }
        if (!modelPromise) modelPromise = createPoseLandmarker();
        poseLandmarker = await modelPromise;
        const profileModelInfo = await loadProfileModel();
        updateExerciseReviewLabels(profileModelInfo.model);
        const automaticProfileIds = exerciseCatalog
            .filter((exercise) => resolveAnalysisProfile(exercise.id, profileModelInfo.model))
            .map((exercise) => exercise.id);
        const manualReviewExerciseIds = exerciseCatalog
            .map((exercise) => exercise.id)
            .filter((exerciseId) => !automaticProfileIds.includes(exerciseId));
        const analysisScope = {
            catalogCount: exerciseCatalog.length,
            automaticProfileCount: automaticProfileIds.length,
            automaticProfileIds,
            manualReviewCount: manualReviewExerciseIds.length,
            manualReviewExerciseIds,
        };
        const inputFileSha256Promise = sha256File(selectedFile).catch((hashError) => {
            console.warn("GymLab input hash unavailable", hashError);
            return null;
        });
        const duration = video.duration;
        const sampleCount = Math.min(MAX_SAMPLES, Math.max(24, Math.ceil(duration * 6)));
        const samples = [];
        let multiplePersonFrames = 0;
        video.pause();

        for (let index = 0; index < sampleCount; index += 1) {
            const time = duration * index / Math.max(1, sampleCount - 1);
            await seekVideo(video, time);
            const result = poseLandmarker.detectForVideo(video, Math.round(time * 1000));
            if ((result.landmarks?.length || 0) > 1) multiplePersonFrames += 1;
            const landmarks = result.landmarks?.[0];
            const features = landmarks ? extractFeatures(landmarks) : null;
            if (features) samples.push({ time, ...features });
            setProgress((index + 1) / sampleCount, `Đang đọc frame ${index + 1}/${sampleCount}...`);
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        if (samples.length < 8) {
            throw new Error("Không nhận diện đủ cơ thể. Hãy quay thấy toàn thân, đủ sáng và không bị che khuất.");
        }
        const multiplePersonRatio = multiplePersonFrames / sampleCount;
        const personGate = applyPersonCountGate(multiplePersonRatio, MAX_MULTIPLE_PERSON_FRAME_RATIO);
        if (!personGate.passed) {
            throw new Error("Video có nhiều người xuất hiện cùng lúc. Hãy quay riêng một người để tránh gán nhầm reps và tải.");
        }

        const coverage = samples.length / sampleCount;
        const rawClassification = classifyExercise(samples, profileModelInfo.model);
        const quality = applyPoseQualityGate(rawClassification, coverage, MIN_POSE_COVERAGE);
        const rawConfidence = clamp(
            coverage * 0.55 + rawClassification.score * 0.3 + rawClassification.margin * 0.15,
            0,
            0.99,
        );
        const confidenceQuality = applyExerciseConfidenceGate(
            quality.classification,
            rawConfidence,
            MIN_EXERCISE_CONFIDENCE,
        );
        const classification = confidenceQuality.classification;
        const qualityGatePassed = quality.qualityGatePassed;
        const confidenceGatePassed = qualityGatePassed && confidenceQuality.confidenceGatePassed;
        const abstentionReason = !qualityGatePassed
            ? quality.abstentionReason
            : confidenceQuality.abstentionReason;
        const candidateProfile = resolveAnalysisProfile(rawClassification.exerciseId, profileModelInfo.model);
        const candidateExerciseName = candidateProfile?.name || "Chưa xác định bài tập";
        const profile = resolveAnalysisProfile(classification.exerciseId, profileModelInfo.model);
        const detectedExerciseId = profile ? classification.exerciseId : "unknown";
        const detectedExerciseName = profile ? profile.name : "Chưa xác định bài tập";
        const durationOnly = isDurationOnlyExercise(profile);
        const repetitionSignalSamples = profile && !durationOnly
            ? samples.filter((sample) => Number.isFinite(sample[profile.signal]))
            : [];
        const repetitionEvents = profile && !durationOnly
            ? detectRepetitionEvents(repetitionSignalSamples.map((sample) => sample[profile.signal]), profile.direction)
                .map((event) => ({
                    startSeconds: Number(repetitionSignalSamples[event.startIndex]?.time?.toFixed(3)),
                    endSeconds: Number(repetitionSignalSamples[event.endIndex]?.time?.toFixed(3)),
                }))
                .filter((event) => Number.isFinite(event.startSeconds) && Number.isFinite(event.endSeconds))
            : [];
        const reps = repetitionEvents.length;
        const sets = profile ? (durationOnly ? 1 : estimateSetCount(samples)) : 0;
        const measuredActiveSeconds = estimateActiveDuration(samples, duration);
        const activeSeconds = clamp(measuredActiveSeconds, 0, duration);
        const bodyWeightInput = byId("analysis-body-weight");
        const requestedBodyWeight = Number(bodyWeightInput.value);
        const bodyWeight = clamp(requestedBodyWeight || 70, 20, 300);
        const bodyWeightSource = bodyWeightInputTouched && Number.isFinite(requestedBodyWeight) && requestedBodyWeight > 0
            ? "Người dùng nhập"
            : bodyWeightInput.dataset.bodyWeightSource || "Mặc định 70 kg";
        const manualWeightText = byId("analysis-weight").value.trim();
        const manualWeight = Number(manualWeightText);
        const manualWeightKg = manualWeightText !== "" && Number.isFinite(manualWeight) && manualWeight >= 0
            ? clamp(manualWeight, 0, 500)
            : null;
        let ocrWeight = null;
        if (manualWeightKg === null) {
            try {
                setProgress(0.85, "Đang đọc nhãn kg bằng OCR local...");
                ocrWeight = await readWeightFromVideo(video, duration);
            } catch (ocrError) {
                console.warn("GymLab weight OCR unavailable", ocrError);
                setStatus("Không đọc được nhãn kg; kết quả bài tập vẫn dùng được, hãy xác nhận kg thủ công.", "info");
            }
        }
        const weightKg = manualWeightKg ?? ocrWeight?.valueKg ?? null;
        const weightSource = manualWeightKg !== null
            ? "Người dùng xác nhận"
            : ocrWeight
                ? `OCR nhãn video (${Math.round(ocrWeight.confidence * 100)}%)`
                : "Chưa xác định từ video";
        const confidence = rawConfidence;
        const calories = profile ? profile.met * bodyWeight * activeSeconds / 3600 : 0;
        const inputFileSha256 = await inputFileSha256Promise;
        const featureTrace = samples.map((sample) => ({
            time: sample.time,
            knee_angle: sample.knee_angle,
            elbow_angle: sample.elbow_angle,
            ankle_angle: sample.ankle_angle,
            hip_angle: sample.hip_angle,
            wrist_height: sample.wrist_height,
            wrist_span: sample.wrist_span,
            torso_ratio: sample.torso_ratio,
            hip_height: sample.hip_height,
            pose_scale: sample.pose_scale,
        }));

        lastResult = {
            exerciseId: detectedExerciseId,
            exerciseName: detectedExerciseName,
            detectedExerciseId,
            detectedExerciseName,
            candidateExerciseId: rawClassification.exerciseId,
            candidateExerciseName,
            detectedMet: profile?.met || 0,
            met: profile?.met || 0,
            profileEvaluationStatus: profile?.evaluationStatus || null,
            profileRuntime: profile?.evaluationStatus === "validated"
                ? {
                    signal: profile.signal || null,
                    direction: profile.direction || null,
                    durationOnly: profile.durationOnly === true,
                }
                : null,
            manualExerciseId: null,
            reps: Math.max(0, reps),
            sets: Math.max(0, sets),
            weightKg,
            weightSource,
            weightConfirmed: manualWeightKg !== null,
            weightConfidence: manualWeightKg !== null ? 1 : (ocrWeight?.confidence || 0),
            weightEvidenceFrames: ocrWeight?.evidenceFrames || 0,
            calories,
            calorieMethod: CALORIE_METHOD,
            calorieSource: CALORIE_SOURCE,
            activeSeconds,
            coverage,
            confidence,
            confidenceMethod: CONFIDENCE_METHOD,
            classifierSource: rawClassification.classifierSource || "heuristic",
            profileModelStatus: profileModelInfo.status,
            profileModelSha256: profileModelInfo.sha256,
            profileModelIntegrity: profileModelInfo.integrity,
            profileEvaluatorVersion: profileModelInfo.model?.release_gate?.evaluator_version || null,
            analysisScope,
            bodyWeight,
            bodyWeightSource,
            bodyWeightConfirmed: bodyWeightSource !== "Mặc định 70 kg",
            duration,
            durationOnly,
            qualityGatePassed,
            confidenceGatePassed,
            minPoseCoverage: MIN_POSE_COVERAGE,
            minExerciseConfidence: MIN_EXERCISE_CONFIDENCE,
            abstentionReason,
            inputFileSha256,
            sampleCount,
            poseSampleCount: samples.length,
            featureTraceSchema: "gymlab.pose-feature-trace.v1",
            featureTrace,
            repetitionEventSchema: "gymlab.repetition-events.v1",
            repetitionEvents,
            multiplePersonFrames,
            multiplePersonRatio,
            maxMultiplePersonFrameRatio: MAX_MULTIPLE_PERSON_FRAME_RATIO,
            personGatePassed: personGate.passed,
            analysisAlgorithm: ANALYSIS_ALGORITHM_VERSION,
            poseModelSha256: POSE_MODEL_SHA256,
            ocrModelSha256: OCR_MODEL_SHA256,
            poseDelegate,
            poseModelIntegrity: verifiedAssets.has(MODEL_URL) ? "verified" : "not_run",
            ocrModelIntegrity: verifiedAssets.has(OCR_MODEL_URL) ? "verified" : "not_run",
        };
        renderResult(lastResult);
        setProgress(1, "Phân tích hoàn tất");
        setStatus("Đã phân tích xong. Hãy kiểm tra kết quả trước khi lưu.", "success");
    } catch (error) {
        console.error("GymLab video analysis failed", error);
        setStatus(error?.message || "Phân tích video thất bại.", "error");
        byId("analysis-progress").hidden = true;
    } finally {
        analyzeButton.disabled = false;
    }
}

function renderResult(result) {
    byId("analysis-results").hidden = false;
    byId("analysis-exercise-name").textContent = result.exerciseName;
    byId("analysis-confidence").textContent = `Điểm AI (ước tính) ${Math.round(result.confidence * 100)}%`;
    byId("analysis-reps").textContent = result.reps || "--";
    byId("analysis-sets").textContent = result.sets || "--";
    byId("analysis-weight-result").textContent = result.weightKg === null ? "Chưa biết" : `${result.weightKg.toFixed(1)} kg`;
    byId("analysis-calories").textContent = result.calories ? `${result.calories.toFixed(1)} kcal` : "--";
    byId("analysis-active-time").textContent = `${Math.round(result.activeSeconds)} giây`;
    byId("analysis-pose-coverage").textContent = `${Math.round(result.coverage * 100)}% frame`;
    const scope = byId("analysis-scope");
    if (scope) {
        scope.textContent = result.analysisScope
            ? `${result.analysisScope.automaticProfileCount}/${result.analysisScope.catalogCount} bài tự động`
            : "--";
    }
    byId("analysis-weight-source").textContent = result.weightSource;
    const bodyWeightSource = byId("analysis-body-weight-source");
    if (bodyWeightSource) bodyWeightSource.textContent = result.bodyWeightSource || "Không rõ";
    const bodyWeightConfirm = byId("analysis-body-weight-confirm");
    const bodyWeightConfirmed = result.bodyWeightSource !== "Mặc định 70 kg"
        || Boolean(bodyWeightConfirm?.checked)
        || result.bodyWeightConfirmed === true;
    result.bodyWeightConfirmed = bodyWeightConfirmed;
    const calorieSource = byId("analysis-calorie-source");
    if (calorieSource) calorieSource.textContent = result.calorieSource || "MET estimate";
    const weightConfidence = byId("analysis-weight-confidence");
    if (weightConfidence) {
        weightConfidence.textContent = result.weightKg === null
            ? "Không đủ bằng chứng"
            : result.weightSource.startsWith("OCR")
                ? `${Math.round(result.weightConfidence * 100)}% · ${result.weightEvidenceFrames} frame`
                : "Người dùng xác nhận";
    }
    const loadConfirm = byId("analysis-load-confirm");
    const loadConfirmWrap = byId("analysis-load-confirm-wrap");
    const isOcrWeight = result.weightSource?.startsWith("OCR");
    if (loadConfirm && loadConfirmWrap) {
        loadConfirmWrap.hidden = !isOcrWeight;
        loadConfirm.disabled = !isOcrWeight;
        loadConfirm.checked = isOcrWeight && result.weightConfirmed === true;
    }
    const reviewSelect = byId("analysis-exercise-review");
    if (reviewSelect) reviewSelect.value = result.manualExerciseId || "__auto__";
    const repsInput = byId("analysis-reps-review");
    if (repsInput) repsInput.value = result.reps > 0 ? result.reps : "";
    const warnings = [];
    if (result.exerciseId === "unknown") {
        warnings.push("AI chưa đủ bằng chứng để xác định bài tập. Hãy chọn bài tập xác nhận và nhập reps nếu cần trước khi lưu.");
    }
    if (!result.qualityGatePassed) {
        warnings.push(`Độ phủ pose chỉ ${Math.round(result.coverage * 100)}%, dưới ngưỡng ${Math.round(result.minPoseCoverage * 100)}%; kết quả không được phép lưu cho đến khi phân tích lại với toàn thân rõ hơn.`);
    }
    if (!result.confidenceGatePassed && !result.manualExerciseId) {
        warnings.push(`Điểm AI nhận diện bài chỉ ${Math.round(result.confidence * 100)}%, dưới ngưỡng ${Math.round(result.minExerciseConfidence * 100)}%; hãy xác nhận bài thủ công trước khi lưu.`);
    }
    if (result.weightKg === null) {
        warnings.push("Không thấy nhãn kg hợp lệ trong video. Hãy nhập khối lượng thực tế để nhật ký volume có ngữ cảnh đầy đủ.");
    } else if (result.weightSource.startsWith("OCR")) {
        warnings.push(result.weightConfirmed
            ? `${result.weightSource}; đã xác nhận đây là tải của bài tập.`
            : `${result.weightSource}; hãy tích xác nhận đây là tải của bài tập, không phải cân nặng người tập, trước khi lưu.`);
    }
    if (result.durationOnly) {
        warnings.push("Bài tập này được lưu theo thời lượng vận động; reps không áp dụng và calories vẫn tính theo MET.");
    }
    if (result.profileEvaluationStatus === "baseline" && !result.manualExerciseId) {
        warnings.push("Profile này mới qua kiểm thử mẫu, chưa phải bằng chứng accuracy production; hãy xem lại kết quả trước khi lưu.");
    }
    if (result.profileEvaluationStatus === "candidate" && !result.manualExerciseId) {
        warnings.push("Profile candidate chưa có đánh giá held-out trên người thật; hãy chọn bài tập để xác nhận trước khi lưu.");
    }
    if (result.profileModelStatus !== "validated") {
        warnings.push("Profile model chưa được validated trên held-out dataset; kết quả hiện dùng heuristic local.");
    }
    if (result.analysisScope?.manualReviewCount > 0) {
        warnings.push(`Phạm vi tự động hiện là ${result.analysisScope.automaticProfileCount}/${result.analysisScope.catalogCount} bài; các bài còn lại cần xác nhận thủ công.`);
    }
    if (result.bodyWeightSource === "Mặc định 70 kg") {
        warnings.push(bodyWeightConfirmed
            ? "Calories đang dùng cân nặng mặc định 70 kg theo xác nhận của bạn; kết quả vẫn là ước tính MET."
            : "Calories đang dùng cân nặng mặc định 70 kg; hãy nhập cân nặng thực tế hoặc tích chọn xác nhận trước khi lưu.");
    }
    if (!warnings.length) {
        warnings.push("Kcal là ước tính theo MET và thời gian vận động; sai số thực tế phụ thuộc cường độ và sinh lý cá nhân.");
    }
    byId("analysis-warning").textContent = warnings.join(" ");
    byId("btn-save-analysis").disabled = !canSaveAnalysis(result);
    byId("btn-export-analysis").disabled = false;
}

function applyExerciseReview() {
    if (!lastResult) return;
    const selection = byId("analysis-exercise-review")?.value || "__auto__";
    if (selection === "__auto__") {
        lastResult.manualExerciseId = null;
        lastResult.exerciseId = lastResult.detectedExerciseId;
        lastResult.exerciseName = lastResult.detectedExerciseName;
        lastResult.met = lastResult.detectedMet;
        const detectedProfile = resolveAnalysisProfile(lastResult.detectedExerciseId)
            || (lastResult.profileRuntime ? {
                ...lastResult.profileRuntime,
                evaluationStatus: "validated",
            } : null);
        lastResult.profileEvaluationStatus = detectedProfile?.evaluationStatus || null;
        lastResult.durationOnly = isDurationOnlyExercise(detectedProfile);
    } else {
        const exercise = exerciseCatalog.find((item) => item.id === selection);
        if (!exercise) return;
        lastResult.manualExerciseId = exercise.id;
        lastResult.exerciseId = exercise.id;
        lastResult.exerciseName = exercise.name_vi || exercise.name || exercise.id;
        lastResult.met = Number(exercise.met);
        lastResult.profileEvaluationStatus = EXERCISE_PROFILES[exercise.id]?.evaluationStatus || "manual";
        lastResult.durationOnly = isDurationOnlyExercise(exercise);
        if (lastResult.durationOnly) {
            lastResult.reps = 0;
            lastResult.sets = 1;
        }
    }
    lastResult.calories = lastResult.exerciseId === "unknown"
        ? 0
        : lastResult.met * lastResult.bodyWeight * lastResult.activeSeconds / 3600;
    renderResult(lastResult);
}

function applyRepsReview() {
    if (!lastResult) return;
    const value = Number.parseInt(byId("analysis-reps-review")?.value || "", 10);
    lastResult.reps = Number.isFinite(value) && value > 0 ? clamp(value, 1, 1000) : 0;
    renderResult(lastResult);
}

function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.round(seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${remainder}`;
}

function exportAnalysisReport() {
    if (!lastResult) return;
    const report = {
        schema_version: "gymlab.video-analysis.v1",
        generated_at: new Date().toISOString(),
        input: {
            file_name: selectedFile?.name || null,
            file_size_bytes: selectedFile?.size || null,
            mime_type: selectedFile?.type || null,
            duration_seconds: lastResult.duration,
        },
        result: { ...lastResult },
        limitations: [
            "Load is automatic only when a visible kg/lb label is repeated across frames; otherwise it is unknown or manually confirmed.",
            "Calories are MET estimates using the supplied body weight and active duration, not physiological measurements.",
            "Exercise recognition is a conservative local heuristic and must be evaluated on a consented subject-disjoint dataset before broad accuracy claims.",
            `The exercise score uses ${CONFIDENCE_METHOD}; it is not a calibrated probability.`,
            "The audit feature trace contains normalized pose features only; it does not contain video frames or raw landmark coordinates.",
            "A profile model is used only when its artifact status is validated; otherwise the analyzer uses the heuristic fallback.",
            "Results with pose coverage below the quality gate are abstentions and cannot be saved as an AI analysis.",
            "The input SHA-256 is omitted when the browser cannot hash the file or the file exceeds the local memory-safe limit.",
        ],
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gymlab-analysis-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus("Đã xuất báo cáo JSON audit.", "success");
}

function handleFile(file) {
    const looksLikeVideo = file && (file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(file.name));
    if (!looksLikeVideo) {
        setStatus("Vui lòng chọn file video hợp lệ.", "error");
        return;
    }
    selectedFile = file;
    lastResult = null;
    const bodyWeightConfirm = byId("analysis-body-weight-confirm");
    if (bodyWeightConfirm) bodyWeightConfirm.checked = false;
    const loadConfirm = byId("analysis-load-confirm");
    if (loadConfirm) {
        loadConfirm.checked = false;
        loadConfirm.disabled = true;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(file);
    const video = byId("analysis-video");
    video.src = videoUrl;
    video.hidden = false;
    byId("video-dropzone").hidden = true;
    byId("analysis-video-meta").hidden = false;
    byId("analysis-video-meta").textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB · đang đọc metadata...`;
    byId("btn-analyze-video").disabled = true;
    byId("btn-save-analysis").disabled = true;
    byId("btn-export-analysis").disabled = true;
    byId("analysis-results").hidden = true;
    setStatus("Video đã sẵn sàng. Kiểm tra cân nặng người tập rồi bấm phân tích.", "success");
}

async function saveAnalysis() {
    if (!lastResult || !canSaveAnalysis(lastResult)) return;
    const result = await window.gymLabInvoke("add_workout", {
        exercise_id: lastResult.exerciseId,
        sets: lastResult.sets || 1,
        reps: lastResult.durationOnly ? 0 : lastResult.reps,
        weight_kg: lastResult.weightKg || 0,
        weight_known: lastResult.weightKg !== null,
        duration_minutes: lastResult.activeSeconds / 60,
        body_weight_kg: lastResult.bodyWeight,
        notes: `Phân tích video local · confidence=${Math.round(lastResult.confidence * 100)}% · confidence_method=${lastResult.confidenceMethod} · min_confidence=${Math.round(lastResult.minExerciseConfidence * 100)}% · confidence_gate=${lastResult.confidenceGatePassed} · coverage=${Math.round(lastResult.coverage * 100)}% · quality_gate=${lastResult.qualityGatePassed} · abstention_reason=${lastResult.abstentionReason || "none"} · body_weight_kg=${lastResult.bodyWeight} · body_weight_source=${lastResult.bodyWeightSource || "unknown"} · body_weight_confirmed=${lastResult.bodyWeightConfirmed} · calorie_method=MET*body_weight_kg*active_duration_hours · calorie_source=ACSM_Compendium_2024 · weight_source=${lastResult.weightSource} · weight_confirmed=${lastResult.weightConfirmed} · weight_evidence_frames=${lastResult.weightEvidenceFrames} · analysis_scope=${lastResult.analysisScope?.automaticProfileCount || 0}/${lastResult.analysisScope?.catalogCount || 0} · exercise_source=${lastResult.manualExerciseId ? "Người dùng xác nhận" : "AI"} · profile_evaluation_status=${lastResult.profileEvaluationStatus || "manual"} · classifier_source=${lastResult.classifierSource} · profile_model_status=${lastResult.profileModelStatus} · profile_evaluator_version=${lastResult.profileEvaluatorVersion || "unavailable"} · profile_model_sha256=${lastResult.profileModelSha256 || "unavailable"} · profile_model_integrity=${lastResult.profileModelIntegrity} · detected_exercise=${lastResult.detectedExerciseId} · candidate_exercise=${lastResult.candidateExerciseId} · duration_only=${lastResult.durationOnly} · analysis_algorithm=${lastResult.analysisAlgorithm} · input_file_sha256=${lastResult.inputFileSha256 || "unavailable"} · pose_model_sha256=${lastResult.poseModelSha256} · pose_delegate=${lastResult.poseDelegate} · ocr_model_sha256=${lastResult.ocrModelSha256} · pose_model_integrity=${lastResult.poseModelIntegrity} · ocr_model_integrity=${lastResult.ocrModelIntegrity} · sample_count=${lastResult.sampleCount} · pose_sample_count=${lastResult.poseSampleCount}`,
    });
    if (result) {
        window.showToast?.("Đã lưu kết quả phân tích vào nhật ký.", "success");
        setStatus("Đã lưu. Bạn có thể phân tích video tiếp theo.", "success");
    }
}

function setupVideoAnalysis() {
    const input = byId("analysis-video-input");
    const dropzone = byId("video-dropzone");
    if (!input || !dropzone) return;

    input.addEventListener("change", () => handleFile(input.files?.[0]));
    byId("analysis-video").addEventListener("loadedmetadata", (event) => {
        const duration = event.currentTarget.duration;
        byId("analysis-video-meta").textContent = `${selectedFile?.name || "video"} · ${(selectedFile?.size / 1024 / 1024 || 0).toFixed(1)} MB · ${formatDuration(duration)}`;
        byId("btn-analyze-video").disabled = false;
    });
    ["dragenter", "dragover"].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.classList.add("dragover");
    }));
    ["dragleave", "drop"].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.classList.remove("dragover");
    }));
    dropzone.addEventListener("drop", (event) => handleFile(event.dataTransfer?.files?.[0]));
    byId("btn-analyze-video").addEventListener("click", analyzeVideo);
    byId("btn-save-analysis").addEventListener("click", saveAnalysis);
    byId("btn-export-analysis").addEventListener("click", exportAnalysisReport);
    byId("analysis-exercise-review").addEventListener("change", applyExerciseReview);
    byId("analysis-reps-review").addEventListener("change", applyRepsReview);
    byId("analysis-weight").addEventListener("input", () => {
        if (!lastResult) return;
        const text = byId("analysis-weight").value.trim();
        const value = Number(text);
        lastResult.weightKg = text !== "" && Number.isFinite(value) && value >= 0 ? clamp(value, 0, 500) : null;
        lastResult.weightSource = lastResult.weightKg === null ? "Chưa xác định từ video" : "Người dùng xác nhận";
        lastResult.weightConfirmed = lastResult.weightKg !== null;
        renderResult(lastResult);
    });
    byId("analysis-load-confirm").addEventListener("change", () => {
        if (!lastResult || !lastResult.weightSource.startsWith("OCR")) return;
        lastResult.weightConfirmed = byId("analysis-load-confirm").checked;
        renderResult(lastResult);
    });
    byId("analysis-body-weight").addEventListener("input", () => {
        bodyWeightInputTouched = true;
        byId("analysis-body-weight").dataset.bodyWeightSource = "Người dùng nhập";
        if (!lastResult) return;
        const value = Number(byId("analysis-body-weight").value);
        if (Number.isFinite(value) && value >= 20 && value <= 300) {
            lastResult.bodyWeight = value;
            lastResult.bodyWeightSource = "Người dùng nhập";
            lastResult.bodyWeightConfirmed = true;
            lastResult.calories = lastResult.exerciseId === "unknown"
                ? 0
                : lastResult.met * lastResult.bodyWeight * lastResult.activeSeconds / 3600;
            renderResult(lastResult);
        } else {
            lastResult.bodyWeight = 70;
            lastResult.bodyWeightSource = "Mặc định 70 kg";
            lastResult.bodyWeightConfirmed = Boolean(byId("analysis-body-weight-confirm")?.checked);
            lastResult.calories = lastResult.exerciseId === "unknown"
                ? 0
                : lastResult.met * lastResult.bodyWeight * lastResult.activeSeconds / 3600;
            renderResult(lastResult);
        }
    });
    byId("analysis-body-weight-confirm").addEventListener("change", () => {
        if (!lastResult) return;
        lastResult.bodyWeightConfirmed = byId("analysis-body-weight-confirm").checked
            || lastResult.bodyWeightSource !== "Mặc định 70 kg";
        renderResult(lastResult);
    });
    bodyWeightLoadPromise = loadAnalysisBodyWeight();
    exerciseCatalogPromise = loadExerciseCatalog();
    window.injectIcons?.();
}

window.addEventListener("beforeunload", () => {
    if (ocrWorker) Promise.resolve(ocrWorker.terminate()).catch(() => {});
    if (poseLandmarker) poseLandmarker.close();
});

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupVideoAnalysis, { once: true });
} else {
    setupVideoAnalysis();
}
