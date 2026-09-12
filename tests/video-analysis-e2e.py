"""Browser/WebView-style end-to-end check for the local video analyzer.

This test exercises the shipped JavaScript runtime and local assets through a
real Chromium page: video file -> pose inference -> manual weight confirmation
-> calories/result rendering. It intentionally uses the public squat fixture
and does not upload data to a remote service.
"""

from __future__ import annotations

import json
import argparse
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests" / "fixtures" / "pose_squats.mp4"


class QuietHandler(SimpleHTTPRequestHandler):
    """Serve the source tree without polluting test output with access logs."""

    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".mjs": "application/javascript",
        ".wasm": "application/wasm",
        ".task": "application/octet-stream",
        ".gz": "application/gzip",
    }

    def log_message(self, *_args):
        return


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", type=Path, default=FIXTURE)
    parser.add_argument(
        "--auto-weight",
        action="store_true",
        help="leave the load field empty and require a positive OCR result",
    )
    parser.add_argument(
        "--expect-unknown-weight",
        action="store_true",
        help="leave the load field empty and require an explicit unknown-load result",
    )
    parser.add_argument("--review-exercise", help="exercise id to confirm after AI analysis")
    parser.add_argument("--review-reps", type=int, help="reps to confirm after AI analysis")
    parser.add_argument("--configured-body-weight", type=float, help="seed the local settings weight and verify it is loaded into video analysis")
    parser.add_argument("--verify-default-weight-confirmation", action="store_true", help="require an explicit confirmation before saving with the 70 kg default")
    args = parser.parse_args()
    fixture = args.fixture if args.fixture.is_absolute() else ROOT / args.fixture

    handler = lambda *args, **kwargs: QuietHandler(*args, directory=str(ROOT / "src"), **kwargs)
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    console_errors: list[str] = []
    console_messages: list[str] = []
    page_errors: list[str] = []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 1000})
            def record_console(message):
                console_messages.append(f"{message.type}: {message.text}")
                benign_runtime_message = (
                    message.text.startswith("Estimating resolution as ")
                    or message.text.startswith("INFO: Created TensorFlow Lite XNNPACK delegate")
                )
                if message.type == "error" and not benign_runtime_message:
                    console_errors.append(message.text)

            page.on("console", record_console)
            page.on("pageerror", lambda error: page_errors.append(str(error)))

            page.goto(
                f"http://127.0.0.1:{server.server_port}/diagnostics/inference-smoke.html",
                wait_until="networkidle",
            )
            page.wait_for_function(
                """() => document.querySelector('#result')?.textContent.includes('done')""",
                timeout=120_000,
            )
            diagnostic_report = page.locator("#result").text_content() or ""
            if "pose_model: OK" not in diagnostic_report or "ocr: OK" not in diagnostic_report:
                raise SystemExit(f"local inference smoke failed: {diagnostic_report!r}")

            page.goto(f"http://127.0.0.1:{server.server_port}/index.html", wait_until="networkidle")
            if args.configured_body_weight is not None and not args.verify_default_weight_confirmation:
                page.evaluate(
                    """(value) => localStorage.setItem('gymlab_settings', JSON.stringify({ body_weight: value }))""",
                    args.configured_body_weight,
                )
                page.reload(wait_until="networkidle")
            page.locator('li[data-page="video"]').click()
            page.wait_for_function(
                """() => document.querySelectorAll('#analysis-exercise-review option').length >= 27""",
                timeout=10_000,
            )
            capability_labels = page.locator("#analysis-exercise-review option").all_text_contents()
            if (
                not any("AI tự nhận diện · kiểm thử mẫu" in label for label in capability_labels)
                or not any("AI tự nhận diện · cần review" in label for label in capability_labels)
                or not any("Cần xác nhận" in label for label in capability_labels)
            ):
                raise SystemExit(f"exercise capability boundary is not visible: {capability_labels!r}")
            page.locator("#analysis-video-input").set_input_files(str(fixture))
            page.locator("#analysis-video").wait_for(state="visible")
            page.locator("#btn-analyze-video").wait_for(state="visible")
            page.locator("#btn-analyze-video").wait_for(state="attached")
            try:
                page.wait_for_function(
                    """() => {
                        const video = document.querySelector('#analysis-video');
                        const button = document.querySelector('#btn-analyze-video');
                        return video && Number.isFinite(video.duration) && video.duration > 0 && !button.disabled;
                    }""",
                    timeout=60_000,
                )
            except PlaywrightTimeoutError:
                diagnostic = page.evaluate(
                    """() => {
                        const video = document.querySelector('#analysis-video');
                        const button = document.querySelector('#btn-analyze-video');
                        return {
                            readyState: video?.readyState,
                            networkState: video?.networkState,
                            duration: video?.duration,
                            error: video?.error ? { code: video.error.code, message: video.error.message } : null,
                            meta: document.querySelector('#analysis-video-meta')?.textContent,
                            status: document.querySelector('#analysis-status')?.textContent,
                            disabled: button?.disabled,
                            resources: performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.includes('video-analysis') || name.includes('mediapipe') || name.includes('tesseract')),
                            hasTesseract: Boolean(window.Tesseract),
                        };
                    }"""
                )
                raise SystemExit(f"video metadata did not load: {diagnostic}; console={console_errors}; page={page_errors}")
            if args.configured_body_weight is None and not args.verify_default_weight_confirmation:
                page.fill("#analysis-body-weight", "82.5")
            if not args.auto_weight and not args.expect_unknown_weight:
                page.fill("#analysis-weight", "60")
            else:
                page.evaluate(
                    """() => {
                        window.__ocrResults = [];
                        const originalCreateWorker = window.Tesseract.createWorker;
                        window.Tesseract.createWorker = async (...workerArgs) => {
                            const worker = await originalCreateWorker(...workerArgs);
                            const originalRecognize = worker.recognize.bind(worker);
                            worker.recognize = async (...recognizeArgs) => {
                                const result = await originalRecognize(...recognizeArgs);
                                window.__ocrResults.push({
                                    text: result?.data?.text || '',
                                    confidence: result?.data?.confidence ?? null,
                                });
                                return result;
                            };
                            return worker;
                        };
                    }"""
                )
            page.locator("#btn-analyze-video").click()

            page.wait_for_function(
                """() => {
                    const results = document.querySelector('#analysis-results');
                    const name = document.querySelector('#analysis-exercise-name');
                    return results && !results.hidden && name && name.textContent.trim() !== 'Chưa có kết quả';
                }""",
                timeout=180_000,
            )
            if args.review_exercise:
                page.locator("#analysis-exercise-review").select_option(args.review_exercise)
            if args.auto_weight:
                page.locator("#analysis-load-confirm").check()
            if args.review_reps:
                reps_review = page.locator("#analysis-reps-review")
                reps_review.fill(str(args.review_reps))
                reps_review.dispatch_event("change")
            with page.expect_download(timeout=15_000) as download_info:
                page.locator("#btn-export-analysis").click()
            export_download = download_info.value
            output = page.evaluate(
                """() => ({
                    exercise: document.querySelector('#analysis-exercise-name')?.textContent.trim(),
                    reps: document.querySelector('#analysis-reps')?.textContent.trim(),
                    sets: document.querySelector('#analysis-sets')?.textContent.trim(),
                    weight: document.querySelector('#analysis-weight-result')?.textContent.trim(),
                    calories: document.querySelector('#analysis-calories')?.textContent.trim(),
                    weightSource: document.querySelector('#analysis-weight-source')?.textContent.trim(),
                    activeTime: document.querySelector('#analysis-active-time')?.textContent.trim(),
                    displayedCalories: document.querySelector('#analysis-calories')?.textContent.trim(),
                    coverage: document.querySelector('#analysis-pose-coverage')?.textContent.trim(),
                    weightConfidence: document.querySelector('#analysis-weight-confidence')?.textContent.trim(),
                    bodyWeightSource: document.querySelector('#analysis-body-weight-source')?.textContent.trim(),
                    status: document.querySelector('#analysis-status')?.textContent.trim(),
                })"""
            )
            output["exportFile"] = export_download.suggested_filename
            save_button = page.locator("#btn-save-analysis")
            if not args.review_exercise and not args.verify_default_weight_confirmation and save_button.is_disabled():
                raise SystemExit(
                    "non-validated exercise profiles require --review-exercise before save"
                )
            if args.verify_default_weight_confirmation:
                if not save_button.is_disabled():
                    raise SystemExit("default body weight should require explicit confirmation before save")
                page.locator("#analysis-body-weight-confirm").check()
                page.wait_for_function("() => !document.querySelector('#btn-save-analysis')?.disabled", timeout=10_000)
            save_button.click()
            page.wait_for_function(
                """() => {
                    const entries = JSON.parse(localStorage.getItem('gymlab_workouts') || '[]');
                    return entries.length > 0;
                }""",
                timeout=10_000,
            )
            saved = page.evaluate(
                """() => {
                    const entries = JSON.parse(localStorage.getItem('gymlab_workouts') || '[]');
                    const entry = entries[entries.length - 1];
                    return entry ? {
                        exercise: entry.exercise_id,
                        sets: entry.sets,
                        reps: entry.reps,
                        weightKg: entry.weight_kg,
                        weightKnown: entry.weight_known,
                        bodyWeightKg: entry.notes?.match(/body_weight_kg=([0-9.]+)/)?.[1] || null,
                        bodyWeightSource: entry.notes?.match(/body_weight_source=([^·]+)/)?.[1]?.trim() || null,
                        bodyWeightConfirmed: entry.notes?.match(/body_weight_confirmed=([^·]+)/)?.[1]?.trim() || null,
                        calorieMethod: entry.notes?.match(/calorie_method=([^·]+)/)?.[1]?.trim() || null,
                        calorieSource: entry.notes?.match(/calorie_source=([^·]+)/)?.[1]?.trim() || null,
                        weightConfirmed: entry.notes?.match(/weight_confirmed=([^·]+)/)?.[1]?.trim() || null,
                        poseModelIntegrity: entry.notes?.match(/pose_model_integrity=([^·]+)/)?.[1]?.trim() || null,
                        ocrModelIntegrity: entry.notes?.match(/ocr_model_integrity=([^·]+)/)?.[1]?.trim() || null,
                        exerciseSource: entry.notes?.match(/exercise_source=([^·]+)/)?.[1]?.trim() || null,
                        profileEvaluationStatus: entry.notes?.match(/profile_evaluation_status=([^·]+)/)?.[1]?.trim() || null,
                        detectedExercise: entry.notes?.match(/detected_exercise=([^·]+)/)?.[1]?.trim() || null,
                        qualityGate: entry.notes?.match(/quality_gate=([^·]+)/)?.[1]?.trim() || null,
                        inputFileSha256: entry.notes?.match(/input_file_sha256=([^·]+)/)?.[1]?.trim() || null,
                        analysisAlgorithm: entry.notes?.match(/analysis_algorithm=([^·]+)/)?.[1]?.trim() || null,
                        analysisScope: entry.notes?.match(/analysis_scope=([^·]+)/)?.[1]?.trim() || null,
                        profileEvaluatorVersion: entry.notes?.match(/profile_evaluator_version=([^·]+)/)?.[1]?.trim() || null,
                        poseDelegate: entry.notes?.match(/pose_delegate=([^·]+)/)?.[1]?.trim() || null,
                        poseModelSha256: entry.notes?.match(/pose_model_sha256=([^·]+)/)?.[1]?.trim() || null,
                        ocrModelSha256: entry.notes?.match(/ocr_model_sha256=([^·]+)/)?.[1]?.trim() || null,
                        sampleCount: entry.notes?.match(/sample_count=([0-9]+)/)?.[1] || null,
                        poseSampleCount: entry.notes?.match(/pose_sample_count=([0-9]+)/)?.[1] || null,
                        durationMinutes: entry.duration_minutes,
                        calories: entry.calories_burned,
                    } : null;
                }"""
            )
            output["saved"] = saved
            output["ocrResults"] = page.evaluate("() => window.__ocrResults || []")
            output["diagnostic"] = diagnostic_report.splitlines()
            if args.expect_unknown_weight:
                page.locator('li[data-page="history"]').click()
                page.wait_for_function(
                    "() => document.querySelector('#history-list')?.textContent.includes('Chưa xác định')",
                    timeout=10_000,
                )
            browser.close()

        if not args.review_exercise and output["exercise"] != "Squat":
            raise SystemExit(f"unexpected exercise: {output['exercise']!r}")
        if not (args.review_exercise == "running") and int(output["reps"]) < 1:
            raise SystemExit(f"unexpected reps: {output['reps']!r}")
        if not args.review_exercise and output["sets"] != "1":
            raise SystemExit(f"unexpected set estimate: {output['sets']!r}")
        if args.auto_weight and not output["weightSource"].startswith("OCR"):
            raise SystemExit(
                f"weight was not read by OCR: {output['weightSource']!r}; ocr={output['ocrResults']!r}; console={console_messages}"
            )
        if args.auto_weight and not output["weightConfidence"].endswith("frame"):
            raise SystemExit(f"OCR evidence summary missing: {output!r}")
        if args.expect_unknown_weight and output["weight"] != "Chưa biết":
            raise SystemExit(f"unknown load was not preserved: {output['weight']!r}")
        if args.expect_unknown_weight and not output["weightSource"].startswith("Chưa xác định"):
            raise SystemExit(f"unknown load source was not explicit: {output['weightSource']!r}")
        if not args.expect_unknown_weight and output["weight"] != "60.0 kg":
            raise SystemExit(f"expected 60.0 kg in result: {output['weight']!r}")
        if not output["calories"].endswith(" kcal") or output["calories"] == "--":
            raise SystemExit(f"calories were not calculated: {output['calories']!r}")
        if not output["exportFile"].startswith("gymlab-analysis-") or not output["exportFile"].endswith(".json"):
            raise SystemExit(f"audit report was not exported: {output['exportFile']!r}")
        displayed_calories = float(output["displayedCalories"].removesuffix(" kcal"))
        if abs(output["saved"]["calories"] - displayed_calories) > 0.05:
            raise SystemExit(f"displayed/persisted calories diverged: {output!r}")
        expected_met = 9.8 if args.review_exercise == "running" else 6.0
        expected_calories = expected_met * float(output["saved"]["bodyWeightKg"]) * output["saved"]["durationMinutes"] / 60.0
        if abs(output["saved"]["calories"] - expected_calories) > 1e-9:
            raise SystemExit(f"persisted calories do not match MET formula: {output['saved']!r}")
        expected_exercise = args.review_exercise or "squat"
        if not output["saved"] or output["saved"]["exercise"] != expected_exercise:
            raise SystemExit(f"analysis was not persisted: {output['saved']!r}")
        expected_reps = args.review_reps if args.review_reps is not None else (0 if args.review_exercise == "running" else 2)
        expected_sets = 1
        expected_weight = 0 if args.expect_unknown_weight else 60
        expected_weight_known = not args.expect_unknown_weight
        if (
            output["saved"]["sets"] != expected_sets
            or output["saved"]["reps"] != expected_reps
            or output["saved"]["weightKg"] != expected_weight
            or output["saved"]["weightKnown"] != expected_weight_known
        ):
            raise SystemExit(f"saved reps/weight mismatch: {output['saved']!r}")
        expected_body_weight = "70" if args.verify_default_weight_confirmation else (str(args.configured_body_weight) if args.configured_body_weight is not None else "82.5")
        if output["saved"]["bodyWeightKg"] != expected_body_weight or output["saved"]["calories"] <= 0:
            raise SystemExit(f"saved body weight/calories mismatch: {output['saved']!r}")
        expected_body_weight_source = "Mặc định 70 kg" if args.verify_default_weight_confirmation else ("Cài đặt người dùng" if args.configured_body_weight is not None else "Người dùng nhập")
        if output["saved"]["bodyWeightSource"] != expected_body_weight_source:
            raise SystemExit(f"body weight provenance missing: {output['saved']!r}")
        if output["saved"]["bodyWeightConfirmed"] != "true":
            raise SystemExit(f"body weight confirmation missing: {output['saved']!r}")
        if output["saved"]["calorieMethod"] != "MET*body_weight_kg*active_duration_hours" or output["saved"]["calorieSource"] != "ACSM_Compendium_2024":
            raise SystemExit(f"calorie provenance missing: {output['saved']!r}")
        if output["saved"]["poseModelIntegrity"] != "verified" or (args.auto_weight and output["saved"]["ocrModelIntegrity"] != "verified"):
            raise SystemExit(f"model integrity provenance missing: {output['saved']!r}")
        if args.auto_weight and output["saved"]["weightConfirmed"] != "true":
            raise SystemExit(f"OCR load confirmation provenance missing: {output['saved']!r}")
        if output["saved"]["analysisAlgorithm"] != "heuristic-profile-v16":
            raise SystemExit(f"analysis provenance missing: {output['saved']!r}")
        if output["saved"].get("analysisScope") != "13/26":
            raise SystemExit(f"analysis scope provenance missing: {output['saved']!r}")
        if output["saved"].get("profileEvaluatorVersion") != "unavailable":
            raise SystemExit(f"profile evaluator provenance missing: {output['saved']!r}")
        if output["saved"]["poseDelegate"] not in {"GPU", "CPU"}:
            raise SystemExit(f"pose delegate provenance missing: {output['saved']!r}")
        if output["saved"]["qualityGate"] != "true":
            raise SystemExit(f"quality gate provenance missing: {output['saved']!r}")
        if len(output["saved"]["inputFileSha256"] or "") != 64:
            raise SystemExit(f"input video fingerprint missing: {output['saved']!r}")
        if len(output["saved"]["poseModelSha256"] or "") != 64 or len(output["saved"]["ocrModelSha256"] or "") != 64:
            raise SystemExit(f"model hashes missing from provenance: {output['saved']!r}")
        if int(output["saved"]["sampleCount"] or 0) < int(output["saved"]["poseSampleCount"] or 0):
            raise SystemExit(f"sample provenance mismatch: {output['saved']!r}")
        expected_source = "Người dùng xác nhận" if args.review_exercise else "AI"
        if output["saved"]["exerciseSource"] != expected_source:
            raise SystemExit(f"exercise provenance mismatch: {output['saved']!r}")
        if output["saved"]["profileEvaluationStatus"] != "baseline":
            raise SystemExit(f"profile evaluation status missing: {output['saved']!r}")
        if page_errors or console_errors:
            raise SystemExit(f"browser errors: page={page_errors}, console={console_errors}")
        print(json.dumps(output, ensure_ascii=True, indent=2))
    finally:
        server.shutdown()
        thread.join(timeout=5)


if __name__ == "__main__":
    main()
