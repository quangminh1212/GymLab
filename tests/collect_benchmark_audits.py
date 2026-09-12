"""Collect GymLab audit predictions from a consented clip manifest.

The collector drives the exact packaged Windows application through its local
WebView2 page. It never uploads clips and never saves results to the user's
normal journal; each exported audit is written to the requested output
directory so ``prepare_benchmark_manifest.py --audits-dir`` can fingerprint it.

Input shape::

    {
      "samples": [
        {
          "id": "squat-subject-01-camera-a",
          "file": "squat-01.webm",
          "body_weight_kg": 82.5,
          "weight_kg": 60
        }
      ]
    }

The source clips must remain under ``--clips-dir``. Subject/camera labels and
ground truth stay in the separate benchmark labels manifest; this file only
controls deterministic collection inputs.
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
from typing import Any

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
RELEASE_EXE = ROOT / "src-tauri" / "target" / "release" / "gym-lab.exe"


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


def load_samples(path: Path) -> list[dict[str, Any]]:
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
        file_name = sample.get("file")
        if not sample_id or sample_id in seen:
            raise ValueError(f"sample {index} has a missing or duplicate id")
        if not isinstance(file_name, str) or not file_name.strip():
            raise ValueError(f"sample {sample_id!r} is missing file")
        for key, lower, upper in (("body_weight_kg", 20, 300), ("weight_kg", 0, 500)):
            value = sample.get(key)
            if value is None:
                continue
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not lower <= value <= upper:
                raise ValueError(f"sample {sample_id!r} has invalid {key}")
        seen.add(sample_id)
        result.append(sample)
    return result


def resolve_clip(clips_dir: Path, value: str) -> Path:
    candidate = (clips_dir / value).resolve()
    root = clips_dir.resolve()
    try:
        candidate.relative_to(root)
    except ValueError as error:
        raise ValueError(f"clip path escapes --clips-dir: {value!r}") from error
    if not candidate.is_file():
        raise ValueError(f"clip does not exist: {value!r}")
    return candidate


def collect(args: argparse.Namespace) -> list[dict[str, Any]]:
    exe = args.exe if args.exe.is_absolute() else ROOT / args.exe
    clips_dir = args.clips_dir.resolve()
    output_dir = args.output_dir.resolve()
    if not exe.is_file():
        raise ValueError(f"release executable not found: {exe}")
    output_dir.mkdir(parents=True, exist_ok=True)
    samples = load_samples(args.manifest)

    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", args.port))
        except OSError as error:
            raise ValueError(f"DevTools port {args.port} is unavailable: {error}") from error

    with tempfile.TemporaryDirectory(prefix="gymlab-collector-", ignore_cleanup_errors=True) as profile:
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
                page.wait_for_selector("#page-home", timeout=30_000)
                app_url = page.url
                collected: list[dict[str, Any]] = []
                for sample in samples:
                    sample_id = str(sample["id"])
                    clip = resolve_clip(clips_dir, str(sample["file"]))
                    page.goto(app_url, wait_until="domcontentloaded")
                    page.wait_for_selector('li[data-page="video"]', timeout=30_000)
                    page.locator('li[data-page="video"]').click()
                    page.wait_for_function(
                        "() => document.querySelector('#page-video')?.classList.contains('active')",
                        timeout=30_000,
                    )
                    if sample.get("body_weight_kg") is not None:
                        page.locator("#analysis-body-weight").fill(str(sample["body_weight_kg"]))
                    if sample.get("weight_kg") is not None:
                        page.locator("#analysis-weight").fill(str(sample["weight_kg"]))
                    page.locator("#analysis-video-input").set_input_files(str(clip))
                    page.wait_for_function(
                        """() => {
                            const video = document.querySelector('#analysis-video');
                            const button = document.querySelector('#btn-analyze-video');
                            return video && Number.isFinite(video.duration) && video.duration > 0 && !button.disabled;
                        }""",
                        timeout=60_000,
                    )
                    page.locator("#btn-analyze-video").click()
                    page.wait_for_function(
                        """() => {
                            const result = document.querySelector('#analysis-results');
                            const name = document.querySelector('#analysis-exercise-name');
                            return result && !result.hidden && name && name.textContent.trim() !== 'Chưa có kết quả';
                        }""",
                        timeout=180_000,
                    )
                    with page.expect_download(timeout=15_000) as download_info:
                        page.locator("#btn-export-analysis").click()
                    download = download_info.value
                    destination = output_dir / f"{sample_id}.json"
                    download.save_as(str(destination))
                    audit = json.loads(destination.read_text(encoding="utf-8"))
                    if audit.get("schema_version") != "gymlab.video-analysis.v1":
                        raise RuntimeError(f"audit schema mismatch for {sample_id!r}")
                    result = audit.get("result") or {}
                    if len(str(result.get("inputFileSha256") or "")) != 64:
                        raise RuntimeError(f"input fingerprint missing for {sample_id!r}")
                    collected.append({
                        "id": sample_id,
                        "audit_file": destination.name,
                        "exercise": result.get("exerciseId") or "unknown",
                        "weight_kg": result.get("weightKg"),
                        "active_seconds": result.get("activeSeconds"),
                    })
                return collected
        finally:
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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("clips_dir", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--exe", type=Path, default=RELEASE_EXE)
    parser.add_argument("--port", type=int, default=9363)
    args = parser.parse_args()
    try:
        print(json.dumps({"collected": collect(args)}, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
        print(f"benchmark audit collection failed: {error}", file=os.sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
