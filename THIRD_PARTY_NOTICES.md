# Third-party notices

## MediaPipe Tasks Vision

GymLab bundles the JavaScript/WASM runtime from `@mediapipe/tasks-vision` 1.0.1.
The runtime is distributed under the Apache License 2.0. See the upstream
license and notices in the MediaPipe project before redistributing a release.

## Pose Landmarker Lite model

The bundled `src/models/pose_landmarker_lite.task` is the MediaPipe Pose
Landmarker Lite model obtained from Google's MediaPipe model storage:

`https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task`

SHA-256: `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`

The model is used only for pose landmarks. GymLab's exercise labels, rep
counter and calorie estimate are application code and are not medical advice.

## Tesseract.js

GymLab bundles the Tesseract.js browser runtime 7.0.0 and Tesseract.js Core
7.0.0 for local OCR of visible `kg`/`lb` labels. These components are
distributed under the Apache License 2.0. The bundled English traineddata is
from the `tessdata` distribution and is used only for local text recognition.

English traineddata SHA-256: `ed350f3752f81ee8f38769edc14d92d997dababe23b565c59879372cc46a2468`.

## Benchmark fixture

`tests/fixtures/pose_squats.mp4` is the public squat fixture from the
TensorFlow.js Models repository, used only for local regression testing:

`https://github.com/tensorflow/tfjs-models/tree/master/pose-detection/test_data`

SHA-256: `ea9151e447b301985d5d65666551ef863b369a2e0f3a71ddd58abef2e722f96a`

`tests/fixtures/pose_squats_60kg.webm` is a deterministic local derivative
created by `tests/generate_weight_fixture.py`: it adds a high-contrast `60 kg`
label to the public fixture for OCR integration testing. It is not an
additional upstream work. SHA-256:
`011698463be5ce2d6063789bf41da3b88769127019f88758617321effa114996`.
