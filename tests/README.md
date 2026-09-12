# Vision benchmark

The benchmark uses the public TensorFlow.js Pose Detection squat fixture at
`tests/fixtures/pose_squats.mp4` to verify that the bundled Lite pose model can
track a real person across a short video. It is an offline developer check;
the production app remains WebView-only.

Run on a machine with the optional Python vision dependencies installed:

```powershell
$env:PYTHONPATH = "<mediapipe-target>"
python tests/benchmark_pose.py
```

Acceptance thresholds are at least 90% pose coverage and 1–4 baseline squat
cycles. These thresholds validate the model/integration path, not the final
accuracy claim for every camera angle or body type.

## Browser/WebView end-to-end check

Install the optional Playwright browser once, then run the real JavaScript
video flow through Chromium:

```powershell
python -m playwright install chromium
python tests/video-analysis-e2e.py --review-exercise squat
python tests/generate_weight_fixture.py --output tests/fixtures/pose_squats_60kg.webm
python tests/video-analysis-e2e.py --fixture tests/fixtures/pose_squats_60kg.webm --auto-weight --review-exercise squat
```

The check first runs `src/diagnostics/inference-smoke.html` and requires local
MediaPipe and Tesseract initialization, then loads the video fixture, waits for
video metadata, runs the bundled pose model, confirms a manual 60 kg load and
82.5 kg body weight, and requires Squat, reps, kg, calories, active time, and
100% pose coverage in the rendered result. The browser harness serves `.mjs`,
`.wasm`, model, and gzip assets with their production MIME types so module
loading is tested faithfully.

The second command uses a deterministic high-contrast `60 kg` overlay and
requires the real local Tesseract worker to report an OCR-sourced load.

The saved journal provenance must also contain a 64-character SHA-256
fingerprint of the input video, `quality_gate=true` and, for OCR loads,
`weight_confirmed=true`; this prevents a green
integration test from hiding an untraceable or low-coverage result. A static
or low-coverage sequence is expected to abstain rather than receive invented
active time or calories.

The review path is required for the current non-validated profiles and can be
checked with `--review-exercise bench_press --review-reps 3`; it verifies that
a user-confirmed exercise and rep count are persisted with provenance instead
of silently replacing the AI result.

## Exact packaged Windows smoke test

After `npm run build`, the exact release executable can be exercised through a
private loopback WebView2 DevTools port:

```powershell
python tests/packaged-video-smoke.py
```

This test uses temporary WebView2 and application-data profiles, verifies the
packaged pose/OCR diagnostic page, uploads only the local fixture into the
local app, checks the analysis result, saves into the isolated native journal,
exports an audit JSON report, and verifies the persisted JSON entry before
cleanup.

## Benchmark evaluator

For a labeled dataset, first prepare an auditable manifest from a private clip
directory and labels file:

```powershell
python tests/prepare_benchmark_manifest.py data/labels.json data/clips data/test.json `
  --name gymlab-pilot --revision r1 --license internal-consented `
  --consent-policy written-consent-v1 --annotation-revision ann-1 --split test
```

When the app has exported one audit JSON per sample, pass `--audits-dir` to
derive the prediction fields directly and record each audit fingerprint:

```powershell
python tests/prepare_benchmark_manifest.py data/labels.json data/clips data/test.json `
  --audits-dir data/audits --name gymlab-pilot --revision r1 `
  --license internal-consented --consent-policy written-consent-v1 `
  --annotation-revision ann-1 --split test
```

Then require the governance metadata and re-hash every source clip:

```powershell
python tests/evaluate_benchmark.py data/test.json `
  --train-manifest data/train.json --strict-disjoint --audits-dir data/audits `
  --require-provenance --clips-dir data/clips --classes squat,push_up `
  --min-class-support 10 --min-subjects-per-class 5 `
  --max-active-duration-mae 2
```

The report includes macro-F1, per-class precision/recall, repetition MAE,
load accuracy/abstention, active-duration MAE, calorie error and pose
coverage. Evaluator `1.7.0` additionally rejects exported audits that lack
the input fingerprint, algorithm version, actual GPU/CPU delegate, verified
pose-model integrity, quality-gate decision, body-weight/load confirmation or
trace schemas. Each runtime audit also records the catalog size and executable
profile scope; the current fixture release must report `analysis_scope=13/26`,
so benchmark results cannot be read as coverage of all 26 catalog entries.
The report also records every acceptance threshold. Profile promotion additionally
requires those thresholds, real metrics, and a strict subject/camera-disjoint
held-out split, plus explicit minimum held-out support and subject diversity
for each required class. A synthetic one-clip result must not satisfy a
production profile gate.
`python tests/test_evaluate_benchmark.py` and
`python tests/test_prepare_benchmark_manifest.py` check abstention,
subject/camera splits, consent metadata, path traversal and clip tampering.

`tests/fixtures/benchmark.example.json` is a synthetic smoke manifest for the
CLI only; it must not be used as a production accuracy report.

External research datasets and their license boundaries are listed in
`DATASET_SOURCES.md`. Do not copy them into this repository without verifying
the exact license and permission for the intended use.

## Audited profile-model training

After collecting consented audit exports, a future profile model can be built
from normalized traces without reopening source videos:

```powershell
python tests/train_profile_model.py data/profile-labels.json data/audits data/exercise-profile-model.json `
  --name gymlab-pilot --revision r1 --license internal-consented `
  --consent-policy written-consent-v1 --annotation-revision ann-1
```

Each label must provide `id`, `exercise`, `subject_id`, `camera_id` and an
`audit_file`. To make a learned class executable by the app, also provide a
consistent `runtime_profile`, for example:

```json
{"signal":"elbow_angle","direction":"low","duration_only":false}
```

Use `duration_only:true` with `signal:null` and `direction:null` for time-based
activities. The trainer requires at least two samples and two distinct subjects
per class by default, records camera diversity and audit SHA-256 values, and emits a reviewable
`gymlab.exercise-profile-model.v1` artifact. It is deliberately not consumed
by the app automatically until held-out evaluation passes.

Promote only after the strict evaluator emits a passing, provenance-required
report:

```powershell
python tests/promote_profile_model.py data/exercise-profile-model.json data/report.json data/exercise-profile-model.validated.json
```

The promoted artifact receives `status=validated`, a snapshot of the passing
report, and its canonical SHA-256. Runtime verifies that snapshot before use;
the profile evaluator version must also match the current `1.7.0` contract.
only a fully gated artifact is eligible for runtime use.

## Collecting real audit predictions

For a consented local clip set, create a collection manifest with `id`,
relative `file`, and optional `body_weight_kg` / `weight_kg`, then run the
packaged collector:

```powershell
python tests/collect_benchmark_audits.py data/collection.json data/clips data/audits
```

The collector drives the exact Windows release app through its local WebView2,
exports one `gymlab.video-analysis.v1` audit per sample, verifies the input
fingerprint, and never clicks the journal-save action. Feed the resulting
directory to `prepare_benchmark_manifest.py --audits-dir`; subject/camera
labels, consent and ground truth remain in the separate benchmark manifest.

For profile training, put the non-PII `subject_id` and `camera_id` in the
collection manifest, run the collector, then create a human-review template:

```powershell
python tests/prepare_profile_labels.py data/collection.json data/audits data/profile-labels.json
```

Fill each `exercise` label only after review; the script leaves it empty rather
than copying the model's prediction. The resulting `profile-labels.v1` file is
the input shape expected by `train_profile_model.py`, while audit hashes and
the exact inference provenance remain in the separate audit files.

The checked-in `fixtures/benchmark.labels.example.json` is synthetic smoke data
only. A complete local gate can be run with it by preparing a manifest with
`--audits-dir`, then invoking `evaluate_benchmark.py --require-provenance`; it
must not be presented as production accuracy evidence.

Example sequence:

```powershell
python tests/prepare_benchmark_manifest.py tests/fixtures/benchmark.labels.example.json tests/fixtures data/test.json `
  --name synthetic-fixture --revision 2026-09-12 --license internal-test-only `
  --consent-policy synthetic-no-human-data --annotation-revision fixture-v1 `
  --split test --audits-dir data/audits
python tests/evaluate_benchmark.py data/test.json --require-provenance `
  --clips-dir tests/fixtures --audits-dir data/audits --classes squat
```
