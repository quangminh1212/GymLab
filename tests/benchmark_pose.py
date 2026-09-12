"""Offline pose benchmark for the bundled squat fixture and Lite model.

Optional developer check; the desktop app itself runs the equivalent model in
the WebView and does not depend on Python.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import cv2
import mediapipe as mp


ROOT = Path(__file__).resolve().parents[1]
VIDEO = ROOT / "tests" / "fixtures" / "pose_squats.mp4"
MODEL = ROOT / "src" / "models" / "pose_landmarker_lite.task"


def angle(a, b, c):
    ab = (a.x - b.x, a.y - b.y)
    cb = (c.x - b.x, c.y - b.y)
    denominator = math.hypot(*ab) * math.hypot(*cb)
    if denominator == 0:
        return None
    cosine = max(-1.0, min(1.0, (ab[0] * cb[0] + ab[1] * cb[1]) / denominator))
    return math.degrees(math.acos(cosine))


def count_low_cycles(values):
    low = sorted(values)[max(0, int(len(values) * 0.1))]
    high = sorted(values)[min(len(values) - 1, int(len(values) * 0.9))]
    if high - low < 12:
        return 0
    enter = low + (high - low) * 0.35
    exit_value = high - (high - low) * 0.35
    active = False
    reps = 0
    for value in values:
        if not active and value <= enter:
            active = True
        elif active and value >= exit_value:
            active = False
            reps += 1
    return reps


def main():
    options = mp.tasks.vision.PoseLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(MODEL)),
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    cap = cv2.VideoCapture(str(VIDEO))
    frame_count = 0
    detections = 0
    knee_angles = []

    with mp.tasks.vision.PoseLandmarker.create_from_options(options) as landmarker:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = landmarker.detect_for_video(image, frame_count * 200)
            frame_count += 1
            if not result.pose_landmarks:
                continue
            detections += 1
            landmarks = result.pose_landmarks[0]
            left = angle(landmarks[23], landmarks[25], landmarks[27])
            right = angle(landmarks[24], landmarks[26], landmarks[28])
            values = [value for value in (left, right) if value is not None]
            if values:
                knee_angles.append(sum(values) / len(values))
    cap.release()

    output = {
        "video": str(VIDEO.relative_to(ROOT)),
        "model": str(MODEL.relative_to(ROOT)),
        "frames": frame_count,
        "detections": detections,
        "coverage": detections / frame_count if frame_count else 0,
        "knee_angle_min": min(knee_angles) if knee_angles else None,
        "knee_angle_max": max(knee_angles) if knee_angles else None,
        "squat_reps_baseline": count_low_cycles(knee_angles) if knee_angles else 0,
    }
    if output["coverage"] < 0.9:
        raise SystemExit(f"pose coverage below acceptance threshold: {output['coverage']:.3f}")
    if not 1 <= output["squat_reps_baseline"] <= 4:
        raise SystemExit(f"unexpected squat rep count: {output['squat_reps_baseline']}")
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
