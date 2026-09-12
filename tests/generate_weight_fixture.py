"""Create a deterministic OCR fixture derived from the public squat video.

The overlay is deliberately high-contrast and represents a visible gym label,
so the browser E2E test can exercise the real Tesseract worker without relying
on an uncontrolled external video.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tests" / "fixtures" / "pose_squats.mp4"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output if args.output.is_absolute() else ROOT / args.output

    capture = cv2.VideoCapture(str(SOURCE))
    if not capture.isOpened():
        raise SystemExit(f"cannot open source fixture: {SOURCE}")
    fps = capture.get(cv2.CAP_PROP_FPS) or 5.0
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    output.parent.mkdir(parents=True, exist_ok=True)

    # VP8/WebM is broadly decodable in Chromium without proprietary codecs.
    writer = cv2.VideoWriter(
        str(output),
        cv2.VideoWriter_fourcc(*"VP80"),
        fps,
        (width, height),
    )
    if not writer.isOpened():
        capture.release()
        raise SystemExit("OpenCV could not create a VP8/WebM writer")

    while True:
        ok, frame = capture.read()
        if not ok:
            break
        cv2.rectangle(frame, (24, 24), (390, 170), (255, 255, 255), thickness=-1)
        cv2.putText(
            frame,
            "60 kg",
            (54, 130),
            cv2.FONT_HERSHEY_SIMPLEX,
            2.7,
            (0, 0, 0),
            6,
            cv2.LINE_AA,
        )
        writer.write(frame)

    capture.release()
    writer.release()
    if not output.exists() or output.stat().st_size == 0:
        raise SystemExit(f"writer produced no fixture: {output}")
    print(f"created {output} ({output.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
