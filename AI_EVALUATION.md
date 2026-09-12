# GymLab vision evaluation contract

This document defines what the current video feature proves, what it does not
prove, and the gates required before calling a future model production-ready.
It is intentionally separate from the app's user-facing confidence label:
confidence is a decision aid, not a scientific accuracy claim.

## Output contract

| Output | Current source | Provenance shown/saved |
| --- | --- | --- |
| Exercise | MediaPipe pose landmarks + conservative heuristic profiles | AI result, original detected id, or user confirmation |
| Automatic scope | Validated runtime profiles resolved against the 26-exercise catalog | `catalogCount`, `automaticProfileCount`, automatic ids and manual-review ids in the result/audit; current release is `13/26` |
| Reps | Signal-specific hysteresis over sampled landmarks | Rendered count, saved reps and boundary events (`gymlab.repetition-events.v1`) in the audit export |
| Load (kg) | OCR of visible `kg`/`lb` labels across distinct frames, or user confirmation | OCR/manual source, confidence, evidence-frame count, explicit OCR-load confirmation and `weight_known` state |
| Active time | Landmark movement intervals | Rendered active seconds |
| Calories | `MET × body_weight_kg × active_duration_hours` | Saved calorie value, body-weight provenance, formula key and `ACSM Compendium 2024` source |
| Run provenance | Local model assets, deterministic sampling and input fingerprint | Algorithm version, actual pose delegate (`GPU`/`CPU`), heuristic/validated classifier source, explicit uncalibrated confidence method, profile-model status/integrity/SHA-256, input/video/model SHA-256 values, runtime model-integrity decisions, sample count, pose-sample count and normalized pose-feature trace (`gymlab.pose-feature-trace.v1`) |

The analyzer applies a minimum 50% pose-coverage quality gate and a minimum
55% exercise-confidence decision gate. It does not invent active time when the
movement signal is absent: measured active time can be zero, and an automatic
result below either gate cannot be saved as an AI analysis without explicit
user exercise confirmation. Pose inference requests up to two people and
abstains when multiple-person frames exceed 5% of the sampled clip, avoiding a
silent choice of the wrong participant.
Profiles that have not passed the held-out release gate are suggestions only:
the result can be exported, but saving requires explicit exercise confirmation
in the review control. Only a `validated` profile model may save an automatic
exercise label without that confirmation.
An OCR-derived load remains visible in the result, but saving requires an
explicit confirmation that the label belongs to the exercise load rather than
body weight or another display. The confirmation is saved in the audit and
journal provenance. The input video SHA-256 is included in the exported report and journal note
when the browser can hash files up to the configured local memory-safe limit.
The exported audit JSON also carries normalized feature samples (angles,
relative heights and timing) without raw frames or landmark coordinates, so a
reviewer can reproduce signal-level checks without copying the source video.

## Current automated acceptance evidence

- The bundled squat video has 65/65 pose detections, 100% coverage and 2
  baseline squat cycles.
- The local inference smoke page initializes the bundled MediaPipe model and
  Tesseract worker, and recognizes a controlled `DUMBBELL 60 kg` image at 96
  OCR confidence.
- Browser/WebView-style E2E runs the actual local JavaScript assets and saves a
  result: Squat, 2 reps, 60 kg, 82.5 kg body weight, positive calories and
  100% pose coverage.
- A deterministic video with a visible `60 kg` overlay is read by the actual
  local Tesseract worker on four frames and saved as `OCR nhãn video (90%)`.
- The review E2E changes the detected squat to `bench_press`, changes reps to
  3, and verifies `exercise_source=Người dùng xác nhận` plus the original
  `detected_exercise=squat` in the journal note.
- Rust calorie persistence and body-weight override tests pass, including the
  invariant that displayed and persisted calories use the same body weight.
- The analyzer records a SHA-256 fingerprint for the input fixture and stores
  the pose-coverage quality-gate decision with the journal provenance.
- The audit and journal provenance record whether the actual pose runtime used
  the GPU or CPU delegate, so WebView2/Chromium metric drift can be split by
  runtime instead of being misclassified as a model change.
- The exact Windows release executable has passed the packaged WebView2 smoke:
  local pose/OCR diagnostics, video upload, automatic OCR load, analysis,
  audit JSON export, native IPC save and isolated `workouts.json` persistence
  all succeed without touching the normal user journal.
- Core regression tests cover canonical posture/motion probes for all ten
  automatic profiles plus an ambiguous sequence that must abstain as
  `unknown`; these probes are deterministic guardrails, not real-world
  accuracy evidence.
- The dependency-free benchmark evaluator has a passing smoke test and emits
  machine-readable metrics with explicit abstention and split-overlap fields.

These are integration gates for the shipped path. They are not a claim that
the heuristic classifier is accurate for every exercise, person, camera or
environment.

## Required production dataset and metrics

Before expanding the automatic label set, collect a consented, licensed,
subject-disjoint dataset with labels for exercise id, repetition boundaries,
visible load label, body weight, camera angle, occlusion and lighting. Keep a
held-out subject and camera split; do not tune thresholds on the test split.

Report at least:

1. macro-F1 and per-class precision/recall for exercise recognition;
2. repetition-count MAE and boundary tolerance (for example, ±1 rep);
3. load OCR exact/near-match accuracy, unit-conversion accuracy and abstention
   rate;
4. active-duration MAE and calorie error against the declared MET calculation;
5. coverage, latency, memory and failure/abstention rates for supported device
   classes.

The current automatic scope is `13/26`: five baseline profiles with deterministic
guardrails plus eight candidate profiles (`barbell_row`, `pull_up`, `tricep_dip`,
`lateral_raise`, `calf_raise`, `plank`, `mountain_climbers` and `burpees`). The remaining catalog entries are available for explicit user review
but are not silently presented as automatically recognized. A future validated
profile model may add catalog entries only when its class carries the runtime
profile metadata and held-out release evidence described above. A load without a
visible label or calibration target is deliberately reported as unknown rather
than inferred from appearance. Unknown load is persisted as
`weight_known=false`, distinct from a valid bodyweight/zero-load entry, so the
journal and volume views cannot silently display an unreadable load as `0 kg`.

### Reproducible benchmark gate

`tests/prepare_benchmark_manifest.py` builds an auditable manifest from a
labels file and a private clips directory. It records only relative source
paths, file sizes and SHA-256 fingerprints; it does not copy or upload clips.
When audit JSON exports are available, `--audits-dir` imports each
`<sample-id>.json` prediction after validating the
`gymlab.video-analysis.v1` schema and records the audit SHA-256 as a second
provenance link.
Use `--require-provenance` with `tests/evaluate_benchmark.py` for a production
gate. The current evaluator contract is `1.7.0`. When predictions came from
GymLab exports, also pass `--audits-dir` so the evaluator re-hashes and
schema-checks every prediction audit, including the input SHA-256, algorithm
version, actual GPU/CPU pose delegate, verified pose-model integrity, quality
gate and normalized trace schemas. Every sample must then carry `id`, `subject_id`, `camera_id`,
`source_file`, `file_size_bytes`, `file_sha256`, `ground_truth` and
`prediction`, while the dataset metadata must declare license, consent policy,
revision and split. The evaluator reports per-class precision,
recall and F1; rep MAE and +/-1-rep rate; load tolerance and abstention; active
duration MAE; calorie MAE against the declared MET formula; pose coverage; and
held-out subject/camera overlap. Missing predictions remain abstentions instead
of being silently scored as zero. Duplicate IDs, non-finite values and
out-of-range annotations are rejected before metrics are calculated.
Each report also includes the evaluator version and SHA-256 checksums of the
test and optional train manifests.

Example release gate:

```bash
python tests/evaluate_benchmark.py data/test.json \
  --train-manifest data/train.json \
  --require-provenance --clips-dir data/clips \
  --classes squat,push_up,deadlift \
  --strict-disjoint \
  --min-macro-f1 0.90 \
  --max-rep-mae 1.0 \
  --min-class-support 10 \
  --min-subjects-per-class 5 \
  --max-active-duration-mae 2.0 \
  --min-load-accuracy 0.95 \
  --max-load-abstention 0.10
```

The evaluator is a gate, not a substitute for collecting a consented,
licensed, subject-disjoint dataset. A release must attach its manifest,
thresholds and resulting JSON report before claiming production accuracy.
`tests/train_profile_model.py` can then create a reviewable centroid artifact
from the normalized audit traces; it requires runtime provenance, at least two
samples and two distinct subjects per class by default, plus explicit
`runtime_profile` metadata (rep signal and direction, or duration-only). The
app does not consume that artifact
automatically before the held-out gate passes. `tests/promote_profile_model.py` is the only
supported promotion path: it requires a passing provenance-required evaluator
report with explicit acceptance thresholds, non-empty held-out metrics and a
strict subject/camera-disjoint split, minimum support and subject diversity per
required class, embeds a snapshot of that report, and
records its canonical SHA-256 in the validated artifact. The runtime verifies the report schema, evaluator
version, empty failure list, runtime profile metadata and canonical hash before
it can use the profile model. The runtime also requires the profile's evaluator
version to match the current `1.7.0` contract; a status-only edit or stale
promotion is not accepted. This allows a
validated model to add a catalog exercise beyond the thirteen heuristic profiles
without silently inventing a repetition signal or calorie method.
The collection and annotation protocol is documented in
[DATASET_CARD.md](C:/Dev/GymLab/DATASET_CARD.md).
External benchmark options and their license boundaries are tracked in
[DATASET_SOURCES.md](C:/Dev/GymLab/DATASET_SOURCES.md); none is bundled or
treated as a commercial-production accuracy claim by default.

## Release gates

A release may be called production-ready only when the dataset report is
attached to the release, every advertised exercise has a held-out result, OCR
has both positive and negative labeled cases, and the exact packaged WebView
has passed the video → analysis → review → persistence flow. Calories must be
described as an estimate and the feature must not be marketed as a medical or
physiological measurement.
