"""Smoke-test the exact Windows release executable through its WebView2.

The test launches the packaged binary with private WebView2 and application
data profiles and a loopback-only DevTools port, then exercises the real
bundled HTML/JS/model assets. The native journal is written only inside the
temporary application-data profile and is inspected before cleanup.
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
RELEASE_EXE = ROOT / "src-tauri" / "target" / "release" / "gym-lab.exe"
FIXTURE = ROOT / "tests" / "fixtures" / "pose_squats_60kg.webm"


def wait_for_devtools(port: int, process: subprocess.Popen[bytes], timeout: float = 30.0) -> None:
    deadline = time.monotonic() + timeout
    url = f"http://127.0.0.1:{port}/json/version"
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"GymLab exited before WebView2 DevTools became ready: {process.returncode}")
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except Exception as error:  # noqa: BLE001 - bounded readiness polling
            last_error = error
        time.sleep(0.25)
    raise TimeoutError(f"WebView2 DevTools did not become ready: {last_error}")


def find_page(browser):
    for context in browser.contexts:
        for page in context.pages:
            if page.url and "devtools" not in page.url:
                return page
    raise RuntimeError("No GymLab WebView page was exposed by WebView2 DevTools")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=9337)
    parser.add_argument("--exe", type=Path, default=RELEASE_EXE)
    parser.add_argument("--fixture", type=Path, default=FIXTURE)
    parser.add_argument(
        "--manual-weight",
        action="store_true",
        help="skip packaged OCR and enter 60 kg manually",
    )
    args = parser.parse_args()
    exe = args.exe if args.exe.is_absolute() else ROOT / args.exe
    fixture = args.fixture if args.fixture.is_absolute() else ROOT / args.fixture
    if not exe.is_file():
        raise SystemExit(f"release executable not found: {exe}")
    if not fixture.is_file():
        raise SystemExit(f"fixture not found: {fixture}")

    # Fail early with a clear message instead of colliding with another local
    # service. The app itself is still launched only after this check.
    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", args.port))
        except OSError as error:
            raise SystemExit(f"DevTools port {args.port} is unavailable: {error}") from error

    with tempfile.TemporaryDirectory(prefix="gymlab-webview2-", ignore_cleanup_errors=True) as profile:
        app_data = Path(profile) / "app-data"
        app_data.mkdir()
        environment = os.environ.copy()
        environment["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = f"--remote-debugging-port={args.port}"
        environment["WEBVIEW2_USER_DATA_FOLDER"] = profile
        environment["APPDATA"] = str(app_data)
        environment["LOCALAPPDATA"] = str(app_data)
        environment["GYMLAB_DATA_DIR"] = str(app_data)
        process = subprocess.Popen(
            [str(exe)],
            cwd=str(ROOT),
            env=environment,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            wait_for_devtools(args.port, process)
            with sync_playwright() as playwright:
                browser = playwright.chromium.connect_over_cdp(f"http://127.0.0.1:{args.port}")
                page = find_page(browser)
                console_errors: list[str] = []
                page_errors: list[str] = []
                page.on("pageerror", lambda error: page_errors.append(str(error)))
                page.on(
                    "console",
                    lambda message: console_errors.append(f"{message.type}: {message.text}")
                    if message.type == "error" else None,
                )
                page.wait_for_selector("#page-home", timeout=30_000)
                app_url = page.url
                data_path = Path(page.evaluate("() => window.gymLabInvoke('get_data_path')"))
                isolated_root = app_data.resolve()
                try:
                    data_path.resolve().relative_to(isolated_root)
                except ValueError as error:
                    raise RuntimeError(
                        f"refusing native persistence outside isolated APPDATA: {data_path}"
                    ) from error

                # Exact packaged diagnostics: both local model runtimes must
                # initialize inside the shipped WebView.
                page.locator('li[data-page="settings"]').click()
                page.wait_for_function(
                    "() => document.querySelector('#page-settings')?.classList.contains('active')",
                    timeout=30_000,
                )
                # loadSettings() is intentionally asynchronous; wait for its
                # initial native value before replacing it, otherwise the
                # late read can overwrite the test input with the default.
                page.wait_for_function(
                    "() => document.querySelector('#input-bodyweight')?.value === '70'",
                    timeout=10_000,
                )
                page.locator("#input-bodyweight").fill("82.5")
                page.locator("#btn-save-settings").click()
                page.wait_for_function(
                    "async () => Number(await window.gymLabInvoke('get_body_weight')) === 82.5",
                    timeout=10_000,
                )
                stored_body_weight = page.evaluate("() => window.gymLabInvoke('get_body_weight')")
                if float(stored_body_weight) != 82.5:
                    raise RuntimeError(f"native body-weight setting was not persisted: {stored_body_weight!r}")
                body_weight_metadata = page.evaluate("() => window.gymLabInvoke('get_body_weight_metadata')")
                if body_weight_metadata.get("value") != 82.5 or body_weight_metadata.get("source") != "settings":
                    raise RuntimeError(f"native body-weight provenance was not persisted: {body_weight_metadata!r}")
                page.locator("#btn-ai-diagnostics").click()
                page.wait_for_function(
                    "() => document.querySelector('#result')?.textContent.includes('done')",
                    timeout=120_000,
                )
                diagnostic = page.locator("#result").text_content() or ""
                if "pose_model: OK" not in diagnostic or "ocr: OK" not in diagnostic:
                    raise RuntimeError(f"packaged local inference smoke failed: {diagnostic!r}")
                # Exact packaged video path: upload a local fixture into the
                # WebView, run pose analysis, and verify reviewable output.
                page.goto(app_url, wait_until="domcontentloaded")
                page.wait_for_selector('li[data-page="video"]', timeout=30_000)
                page.locator('li[data-page="video"]').click()
                page.wait_for_function(
                    "() => document.querySelector('#page-video')?.classList.contains('active')",
                    timeout=30_000,
                )
                page.locator("#analysis-video-input").set_input_files(str(fixture))
                page.wait_for_function(
                    """() => {
                        const video = document.querySelector('#analysis-video');
                        const button = document.querySelector('#btn-analyze-video');
                        return video && Number.isFinite(video.duration) && video.duration > 0 && !button.disabled;
                    }""",
                    timeout=60_000,
                )
                if args.manual_weight:
                    page.locator("#analysis-weight").fill("60")
                page.locator("#btn-analyze-video").click()
                page.wait_for_function(
                    """() => {
                        const result = document.querySelector('#analysis-results');
                        const name = document.querySelector('#analysis-exercise-name');
                        return result && !result.hidden && name && name.textContent.trim() !== 'Chưa có kết quả';
                    }""",
                    timeout=180_000,
                )
                output = page.evaluate(
                    """() => ({
                        exercise: document.querySelector('#analysis-exercise-name')?.textContent.trim(),
                        confidence: document.querySelector('#analysis-confidence')?.textContent.trim(),
                        reps: document.querySelector('#analysis-reps')?.textContent.trim(),
                        sets: document.querySelector('#analysis-sets')?.textContent.trim(),
                        weight: document.querySelector('#analysis-weight-result')?.textContent.trim(),
                        weightSource: document.querySelector('#analysis-weight-source')?.textContent.trim(),
                        bodyWeightSource: document.querySelector('#analysis-body-weight-source')?.textContent.trim(),
                        calories: document.querySelector('#analysis-calories')?.textContent.trim(),
                        coverage: document.querySelector('#analysis-pose-coverage')?.textContent.trim(),
                        status: document.querySelector('#analysis-status')?.textContent.trim(),
                    })"""
                )
                if output["exercise"] != "Squat" or int(output["reps"]) < 1 or output["sets"] != "1":
                    raise RuntimeError(f"packaged pose result unexpected: {output!r}")
                if output["weight"] != "60.0 kg" or output["calories"] == "--":
                    raise RuntimeError(f"packaged result kg/calories unexpected: {output!r}")
                if output["bodyWeightSource"] != "Cài đặt người dùng":
                    raise RuntimeError(f"packaged Settings weight was not loaded into analysis: {output!r}")
                if not args.manual_weight and not output["weightSource"].startswith("OCR"):
                    raise RuntimeError(f"packaged OCR did not provide the load: {output!r}")
                if output["coverage"] != "100% frame":
                    raise RuntimeError(f"packaged pose coverage unexpected: {output!r}")
                if not output["confidence"].startswith("Điểm AI (ước tính) "):
                    raise RuntimeError(f"packaged confidence label is not explicitly uncalibrated: {output!r}")
                # The bundled profiles are guardrails/candidates, not held-out
                # production labels. Saving must therefore pass through the
                # same explicit exercise-review action a user sees.
                page.wait_for_function(
                    "() => document.querySelector('#analysis-exercise-review option[value=\"squat\"]')",
                    timeout=30_000,
                )
                page.locator("#analysis-exercise-review").select_option("squat")
                if output["weightSource"].startswith("OCR"):
                    page.locator("#analysis-load-confirm").check()
                if page.locator("#btn-save-analysis").is_disabled():
                    raise RuntimeError("packaged review confirmation did not enable save")
                with page.expect_download(timeout=15_000) as download_info:
                    page.locator("#btn-export-analysis").click()
                export_download = download_info.value
                export_filename = export_download.suggested_filename
                if not export_filename.startswith("gymlab-analysis-") or not export_filename.endswith(".json"):
                    raise RuntimeError(f"packaged audit export unexpected: {export_filename!r}")
                export_path = export_download.path()
                if export_path is None:
                    raise RuntimeError("packaged audit export did not expose a completed local file")
                export_report = json.loads(Path(export_path).read_text(encoding="utf-8"))
                exported_result = export_report.get("result") or {}
                if (
                    export_report.get("schema_version") != "gymlab.video-analysis.v1"
                    or exported_result.get("exerciseId") != "squat"
                    or exported_result.get("weightKg") != 60
                    or exported_result.get("manualExerciseId") != "squat"
                    or exported_result.get("bodyWeightSource") != "Cài đặt người dùng"
                    or exported_result.get("qualityGatePassed") is not True
                    or len(exported_result.get("inputFileSha256") or "") != 64
                    or exported_result.get("featureTraceSchema") != "gymlab.pose-feature-trace.v1"
                    or len(exported_result.get("featureTrace") or []) < 8
                    or exported_result.get("repetitionEventSchema") != "gymlab.repetition-events.v1"
                    or len(exported_result.get("repetitionEvents") or []) != 2
                    or exported_result.get("profileModelStatus") != "candidate"
                    or exported_result.get("classifierSource") != "heuristic"
                    or exported_result.get("confidenceMethod") != "uncalibrated_coverage_score_v1"
                    or exported_result.get("profileModelIntegrity") != "verified"
                    or len(exported_result.get("profileModelSha256") or "") != 64
                    or exported_result.get("poseDelegate") not in {"GPU", "CPU"}
                    or exported_result.get("analysisAlgorithm") != "heuristic-profile-v16"
                    or exported_result.get("analysisScope", {}).get("catalogCount") != 26
                    or exported_result.get("analysisScope", {}).get("automaticProfileCount") != 13
                    or exported_result.get("weightConfirmed") is not True
                    or exported_result.get("calories", 0) <= 0
                ):
                    raise RuntimeError(f"packaged audit JSON contract failed: {export_report!r}")
                save_button = page.locator("#btn-save-analysis")
                if save_button.is_disabled():
                    raise RuntimeError("packaged save button is disabled after a valid analysis")
                save_button.click()
                deadline = time.monotonic() + 30
                journal_files: list[Path] = []
                while time.monotonic() < deadline:
                    journal_files = [data_path]
                    if data_path.is_file():
                        break
                    time.sleep(0.25)
                if not data_path.is_file():
                    status = page.locator("#analysis-status").text_content()
                    raise RuntimeError(
                        "native journal was not created under isolated APPDATA: "
                        f"{data_path}; status={status!r}; page_errors={page_errors!r}; console_errors={console_errors!r}"
                    )
                if any("Fetch API cannot load http://ipc.localhost" in message for message in console_errors):
                    raise RuntimeError(f"packaged IPC was blocked by CSP: {console_errors!r}")
                journal = json.loads(data_path.read_text(encoding="utf-8"))
                if not isinstance(journal, list) or not journal:
                    raise RuntimeError(f"native journal is empty or invalid: {journal!r}")
                saved = journal[-1]
                if (
                    saved.get("exercise_id") != "squat"
                    or saved.get("reps") != 2
                    or saved.get("weight_kg") != 60
                    or saved.get("weight_known") is not True
                    or saved.get("calories_burned", 0) <= 0
                ):
                    raise RuntimeError(f"native journal entry unexpected: {saved!r}")
                notes = saved.get("notes") or ""
                fingerprint = ""
                if "input_file_sha256=" in notes:
                    fingerprint = notes.split("input_file_sha256=", 1)[1].split(" · ", 1)[0]
                if (
                    "quality_gate=true" not in notes
                    or "profile_evaluation_status=baseline" not in notes
                    or "body_weight_source=Cài đặt người dùng" not in notes
                    or "body_weight_confirmed=true" not in notes
                    or "profile_model_status=candidate" not in notes
                    or "classifier_source=heuristic" not in notes
                    or "profile_model_integrity=verified" not in notes
                    or "calorie_method=MET*body_weight_kg*active_duration_hours" not in notes
                    or "calorie_source=ACSM_Compendium_2024" not in notes
                    or not any(marker in notes for marker in ("pose_delegate=GPU", "pose_delegate=CPU"))
                    or "analysis_algorithm=heuristic-profile-v16" not in notes
                    or "analysis_scope=13/26" not in notes
                    or "profile_evaluator_version=unavailable" not in notes
                    or "weight_confirmed=true" not in notes
                    or "pose_model_integrity=verified" not in notes
                    or "ocr_model_integrity=verified" not in notes
                    or len(fingerprint) != 64
                ):
                    raise RuntimeError(f"packaged provenance missing quality gate, profile status or input fingerprint: {saved!r}")
                print(
                    json.dumps(
                        {
                            "diagnostic": diagnostic.splitlines(),
                            "analysis": output,
                            "exportFile": export_filename,
                            "exportSchema": export_report.get("schema_version"),
                            "exportInputSha256": exported_result.get("inputFileSha256"),
                            "saved": saved,
                            "dataPath": str(data_path),
                            "consoleErrors": console_errors,
                        },
                        ensure_ascii=True,
                        indent=2,
                    )
                )
        finally:
            # WebView2 runs child processes that can outlive the Tauri parent.
            # Always issue the tree kill, even if the parent exited after the
            # CDP connection closed.
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
            time.sleep(0.5)


if __name__ == "__main__":
    main()
