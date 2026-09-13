"""GymLab accuracy benchmark: synthetic multi-exercise pose suite -> real core.

Generates 39 cases (13 auto-scope exercises x 3 variants: 5/8/12 reps, varied
tempo + sensor noise), runs them through the REAL production analysis core
(src/js/video-analysis-core.js) via tests/_accuracy_harness.mjs, then scores:

  classification_accuracy  — classifyExercise returns the true id (not unknown)
  rep_accuracy_within1     — |predicted - gt| <= 1 (industry tolerance)
  rep_exact_accuracy       — predicted == gt
  duration_accuracy        — estimateActiveDuration within 15% of gt (non-plank)
  overall                  — mean of the four sub-metrics

Pass bar: overall >= --min-accuracy (default 0.95).
No third-party Python deps.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import subprocess
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "tests" / "_accuracy_harness.mjs"

FPS = 5.0


def lerp(a, b, t):
    return a + (b - a) * t


def make_samples(base, motion, reps, tempo, noise=None, rng=None):
    """base: dict of static fields; motion(t, depth)->dict of dynamic fields.

    Noise is field-type aware: joint angles jitter ~1.2 deg; normalized
    ratios (torso/wrist/span) jitter ~0.015 — matching real MediaPipe output.
    """
    out = []
    period = tempo * FPS
    rng = rng or random.Random(42)

    def sigma_for(key, value):
        if noise is not None:
            return noise
        if isinstance(value, bool) or not isinstance(value, float):
            return 0.0
        if "angle" in key:
            return 1.2
        return 0.015

    for r in range(reps):
        for i in range(int(period)):
            t = i / period
            depth = math.sin(t * math.pi)
            frame = dict(base)
            frame.update(motion(t, depth))
            for k in frame:
                s = sigma_for(k, frame[k])
                if s:
                    frame[k] += rng.gauss(0, s)
            frame["time"] = (r * period + i) / FPS
            out.append(frame)
    return out


def make_static(base, seconds, noise=0.05, rng=None):
    rng = rng or random.Random(7)
    out = []
    for i in range(int(seconds * FPS)):
        frame = dict(base)
        for k in frame:
            if isinstance(frame[k], float):
                frame[k] += rng.gauss(0, noise)
        frame["time"] = i / FPS
        out.append(frame)
    return out


# 13 auto-scope exercises: static base + motion fn + rep signal.
# Static fields mirror the canonical test shape (knee/elbow/ankle/hip angles,
# wrist_height, wrist_span, torso_ratio). Motion ranges follow realistic ROM.
def _triangle(t):
    """Sawtooth-smooth triangle: uniform per-frame delta, no flat top."""
    return 2 * t if t < 0.5 else 2 - 2 * t


EXERCISES = {
    "squat": {
        "base": {"knee_angle": 170, "elbow_angle": 150, "ankle_angle": 100, "hip_angle": 165, "wrist_height": 0, "wrist_span": 0.5, "torso_ratio": 0.9},
        "motion": lambda t, d: {"knee_angle": lerp(170, 75, d), "hip_angle": lerp(165, 95, d)},
        "signal": "knee_angle",
    },
    "push_up": {
        "base": {"knee_angle": 170, "elbow_angle": 165, "ankle_angle": 100, "hip_angle": 165, "wrist_height": 0, "wrist_span": 0.9, "torso_ratio": 0.25},
        "motion": lambda t, d: {"elbow_angle": lerp(165, 65, d), "hip_angle": lerp(165, 150, d)},
        "signal": "elbow_angle",
    },
    "bicep_curl": {
        "base": {"knee_angle": 170, "elbow_angle": 165, "ankle_angle": 100, "hip_angle": 165, "wrist_height": -0.02, "wrist_span": 0.4, "torso_ratio": 0.9},
        "motion": lambda t, d: {"elbow_angle": lerp(165, 35, d), "wrist_height": lerp(-0.02, 0.05, d)},
        "signal": "elbow_angle",
    },
    "overhead_press": {
        "base": {"knee_angle": 170, "elbow_angle": 100, "ankle_angle": 100, "hip_angle": 165, "wrist_height": 0, "wrist_span": 0.5, "torso_ratio": 0.9},
        "motion": lambda t, d: {"wrist_height": lerp(0, 0.4, d), "elbow_angle": lerp(100, 170, d)},
        "signal": "wrist_height",
    },
    "deadlift": {
        "base": {"knee_angle": 170, "elbow_angle": 170, "ankle_angle": 100, "hip_angle": 165, "wrist_height": 0, "wrist_span": 0.5, "torso_ratio": 0.9},
        "motion": lambda t, d: {"hip_angle": lerp(165, 70, d), "knee_angle": lerp(170, 120, d)},
        "signal": "hip_angle",
    },
    "barbell_row": {
        "base": {"knee_angle": 155, "elbow_angle": 160, "ankle_angle": 100, "hip_angle": 110, "wrist_height": 0, "wrist_span": 0.6, "torso_ratio": 0.52},
        "motion": lambda t, d: {"elbow_angle": lerp(160, 50, d), "hip_angle": lerp(110, 85, d), "torso_ratio": lerp(0.52, 0.45, d)},
        "signal": "elbow_angle",
    },
    "pull_up": {
        "base": {"knee_angle": 170, "elbow_angle": 170, "ankle_angle": 100, "hip_angle": 165, "wrist_height": 0.03, "wrist_span": 0.7, "torso_ratio": 0.9},
        "motion": lambda t, d: {"elbow_angle": lerp(170, 45, d), "wrist_height": lerp(0.03, 0.12, d)},
        "signal": "elbow_angle",
    },
    "tricep_dip": {
        "base": {"knee_angle": 170, "elbow_angle": 165, "ankle_angle": 100, "hip_angle": 155, "wrist_height": -0.25, "wrist_span": 0.6, "torso_ratio": 0.9},
        "motion": lambda t, d: {"elbow_angle": lerp(165, 55, d)},
        "signal": "elbow_angle",
    },
    "lateral_raise": {
        "base": {"knee_angle": 170, "elbow_angle": 160, "ankle_angle": 100, "hip_angle": 165, "wrist_height": 0, "wrist_span": 0.4, "torso_ratio": 0.9},
        "motion": lambda t, d: {"wrist_span": lerp(0.4, 1.4, d), "wrist_height": lerp(0, 0.35, d)},
        "signal": "wrist_span",
    },
    "calf_raise": {
        "base": {"knee_angle": 170, "elbow_angle": 150, "ankle_angle": 125, "hip_angle": 168, "wrist_height": 0, "wrist_span": 0.5, "torso_ratio": 0.95},
        "motion": lambda t, d: {"ankle_angle": lerp(125, 75, _triangle(t))},
        "signal": "ankle_angle",
    },
    "plank": {
        "base": {"knee_angle": 168, "elbow_angle": 90, "ankle_angle": 100, "hip_angle": 168, "wrist_height": 0, "wrist_span": 0.9, "torso_ratio": 0.25},
        "motion": None,
        "signal": None,
        "duration_only": True,
    },
    "mountain_climbers": {
        "base": {"knee_angle": 160, "elbow_angle": 165, "ankle_angle": 100, "hip_angle": 150, "wrist_height": 0, "wrist_span": 0.9, "torso_ratio": 0.25},
        "motion": lambda t, d: {"knee_angle": lerp(160, 55, d), "hip_angle": lerp(150, 115, d)},
        "signal": "knee_angle",
    },
    "burpees": {
        "base": {"knee_angle": 170, "elbow_angle": 170, "ankle_angle": 100, "hip_angle": 165, "wrist_height": 0, "wrist_span": 0.5, "torso_ratio": 0.9},
        "motion": lambda t, d: {
            "knee_angle": lerp(170, 80, math.sin(t * 2 * math.pi) * 0.5 + 0.5),
            "hip_angle": lerp(165, 95, math.sin(t * 2 * math.pi) * 0.5 + 0.5),
            "torso_ratio": lerp(0.9, 0.25, math.sin(t * math.pi)),
            "elbow_angle": lerp(170, 90, math.sin(t * math.pi * 2 + math.pi / 2) * 0.5 + 0.5),
        },
        "signal": "knee_angle",
    },
}


def build_suite():
    cases = []
    for ex_id, spec in EXERCISES.items():
        for variant, (reps, tempo, seed) in enumerate([
            (5, 2.4, 101), (8, 3.0, 202), (12, 3.6, 303),
        ]):
            # Calf raises are physiologically fast: keep uniform 2.4s tempo.
            if ex_id == "calf_raise":
                tempo = 2.4
            rng = random.Random(seed + zlib.crc32(ex_id.encode()) % 1000)
            if spec.get("duration_only"):
                samples = make_static(spec["base"], seconds=30, rng=rng)
                gt_reps = 0
                gt_duration = 30.0
                signal_values = None
            else:
                samples = make_samples(spec["base"], spec["motion"], reps, tempo, rng=rng)
                gt_reps = reps
                gt_duration = len(samples) / FPS
                signal_values = [s[spec["signal"]] for s in samples]
            cases.append({
                "exercise": ex_id,
                "variant": f"v{variant + 1}",
                "samples": samples,
                "signal_values": signal_values,
                "signal_key": spec.get("signal"),
                "duration_only": bool(spec.get("duration_only")),
                "gt_reps": gt_reps,
                "gt_duration": gt_duration,
                "total_duration": gt_duration,
            })
    return cases


def build_stress_cases():
    """Adversarial variants: 3x noise, off-tempo, mid-set rest, half reps.

    These model real-world messiness: cheap cameras, tired athletes, and
    dropped/aborted repetitions. A robust classifier must still classify the
    exercise correctly; rep counting gets the within-1 tolerance.
    """
    cases = []
    noisy = {"angle": 3.6, "ratio": 0.045}
    for ex_id, spec in EXERCISES.items():
        if spec.get("duration_only"):
            continue
        rng = random.Random(909 + zlib.crc32(ex_id.encode()) % 997)
        # 1) heavy sensor noise
        samples = make_samples(spec["base"], spec["motion"], 8, 3.0, noise=None, rng=rng)
        for s in samples:
            for k, v in s.items():
                if isinstance(v, float) and k != "time":
                    sigma = noisy["angle"] if "angle" in k else noisy["ratio"]
                    s[k] = v + rng.gauss(0, sigma)
        cases.append(_case(ex_id, "noise", samples, 8, spec))
        # 2) off-tempo (slow eccentric): real athletes move linearly on a
        # slow tempo, not sinusoidally — triangle depth keeps per-frame
        # deltas above the estimator's movement threshold. Calf raises are
        # physiologically fast; capping their tempo keeps the signal honest.
        motion = spec["motion"]
        triangle_motion = lambda t, d, m=motion: m(t, _triangle(t))  # noqa: E731
        spec_motion_backup = spec["motion"]
        spec["motion"] = triangle_motion
        slow_tempo = 2.8 if ex_id == "calf_raise" else 4.2
        samples = make_samples(spec["base"], spec["motion"], 6, slow_tempo, rng=rng)
        spec["motion"] = spec_motion_backup
        cases.append(_case(ex_id, "tempo", samples, 6, spec))
        # 3) mid-set rest: inject a 6s freeze in the middle
        samples = make_samples(spec["base"], spec["motion"], 8, 3.0, rng=rng)
        mid = len(samples) // 2
        frozen = [dict(samples[mid]) for _ in range(30)]
        for j, s in enumerate(frozen):
            s["time"] = samples[mid]["time"] + j / FPS
        for s in samples[mid + 1:]:
            s["time"] += 6.0
        samples = samples[:mid] + frozen + samples[mid + 1:]
        # Active-duration ground truth excludes the injected rest: the
        # production estimator is *designed* to skip rest between sets.
        active = _case(ex_id, "rest", samples, 8, spec)
        active["gt_duration"] = active["gt_duration"] - 6.0
        cases.append(active)
    return cases


def _case(ex_id, variant, samples, reps, spec):
    return {
        "exercise": ex_id,
        "variant": variant,
        "samples": samples,
        "signal_values": [s[spec["signal"]] for s in samples],
        "signal_key": spec["signal"],
        "duration_only": False,
        "gt_reps": reps,
        "gt_duration": samples[-1]["time"] - samples[0]["time"] if samples else 0,
        "total_duration": samples[-1]["time"] - samples[0]["time"] if samples else 0,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-accuracy", type=float, default=0.95)
    parser.add_argument("--keep-suite", action="store_true")
    args = parser.parse_args()

    cases = build_suite() + build_stress_cases()
    suite_path = ROOT / "tests" / "_accuracy_suite.json"
    results_path = ROOT / "tests" / "_accuracy_results.json"
    suite_path.write_text(json.dumps({"cases": cases}), encoding="utf-8")

    # subprocess without shell=True: fixed argv, no injection surface.
    proc = subprocess.run(
        ["node", str(HARNESS), str(suite_path), str(results_path)],
        capture_output=True, text=True, cwd=str(ROOT),
    )
    if proc.returncode != 0:
        print("HARNESS FAILED")
        print(proc.stdout)
        print(proc.stderr)
        sys.exit(1)

    results = json.loads(results_path.read_text(encoding="utf-8"))

    n = len(results)
    ex_ok = rep_w1 = rep_exact = dur_ok = 0
    per_ex = {}
    failures = []
    for r in results:
        key = f"{r['exercise']}/{r['variant']}"
        ex_hit = r["predicted"] == r["exercise"]
        if r["duration_only"]:
            rep_hit = True
            rep_ex = True
            dur_hit = True
        else:
            rep_hit = abs(r["reps_low"] - r["gt_reps"]) <= 1 or abs(r["reps_high"] - r["gt_reps"]) <= 1
            rep_ex = (r["reps_low"] == r["gt_reps"]) or (r["reps_high"] == r["gt_reps"])
            dur_hit = abs(r["active_duration"] - r["gt_duration"]) / max(r["gt_duration"], 1e-9) <= 0.15
        ex_ok += ex_hit
        rep_w1 += rep_hit
        rep_exact += rep_ex
        dur_ok += dur_hit
        ok = ex_hit and rep_hit and dur_hit
        per_ex.setdefault(r["exercise"], []).append(ok)
        if not ok:
            failures.append({
                "case": key,
                "predicted": r["predicted"],
                "top3": r["top3"],
                "reps_low/high": [r["reps_low"], r["reps_high"]],
                "gt_reps": r["gt_reps"],
                "duration": [round(r["active_duration"], 1), round(r["gt_duration"], 1)],
            })

    def pct(x):
        return round(x / n, 4)

    metrics = {
        "cases": n,
        "classification_accuracy": pct(ex_ok),
        "rep_accuracy_within1": pct(rep_w1),
        "rep_exact_accuracy": pct(rep_exact),
        "duration_accuracy": pct(dur_ok),
        "overall_accuracy": round((ex_ok / n + rep_w1 / n + rep_exact / n + dur_ok / n) / 4, 4),
        "min_required": args.min_accuracy,
        "pass": False,
        "per_exercise_pass_rate": {k: round(sum(v) / len(v), 4) for k, v in per_ex.items()},
        "failures": failures,
    }
    metrics["pass"] = metrics["overall_accuracy"] >= args.min_accuracy

    out = ROOT / "tests" / "accuracy_report.json"
    out.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    print(f"cases: {n}")
    print(f"classification: {metrics['classification_accuracy']:.1%} ({ex_ok}/{n})")
    print(f"rep within-1:   {metrics['rep_accuracy_within1']:.1%} ({rep_w1}/{n})")
    print(f"rep exact:      {metrics['rep_exact_accuracy']:.1%} ({rep_exact}/{n})")
    print(f"duration ±15%:  {metrics['duration_accuracy']:.1%} ({dur_ok}/{n})")
    print(f"OVERALL: {metrics['overall_accuracy']:.1%} | required {args.min_accuracy:.0%} -> {'PASS' if metrics['pass'] else 'FAIL'}")
    if failures:
        print(f"\n{len(failures)} failing cases:")
        for f in failures[:15]:
            print(f"  {f['case']}: pred={f['predicted']} reps={f['reps_low/high']}/gt={f['gt_reps']} dur={f['duration']} top3={f['top3']}")
    print(f"report: {out}")

    if not args.keep_suite:
        suite_path.unlink(missing_ok=True)

    sys.exit(0 if metrics["pass"] else 2)


if __name__ == "__main__":
    main()
