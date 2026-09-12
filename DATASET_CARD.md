# GymLab Video Dataset Card

Status: collection and evaluation protocol. This repository does not claim to
contain a production-accuracy dataset.

## Intended use

The dataset is for evaluating local video analysis of exercise identity,
repetition boundaries, active duration and visible load labels. It is not for
medical diagnosis, physiological calorie measurement, identity recognition or
estimating an unlabeled person's physical weight or load from appearance.

## Collection requirements

- Obtain written consent and confirm that every clip is licensed for model
  evaluation and redistribution within the project.
- Record a random subject identifier, camera identifier, clip identifier,
  exercise label, repetition boundaries, visible load text/unit, body weight
  only when voluntarily provided, camera angle, lighting and occlusion.
- Keep the test subjects and cameras disjoint from training/development data.
- Do not store names, faces, audio, contact details or other unnecessary
  identifiers. Retain the minimum video resolution needed for pose labeling.
- Keep a manifest revision, annotator revision and checksum for every clip.

## Annotation contract

Each JSON sample contains:

```json
{
  "id": "clip-001",
  "subject_id": "subject-07",
  "camera_id": "camera-a",
  "ground_truth": {
    "exercise": "squat",
    "reps": 10,
    "load_kg": 60,
    "active_seconds": 31,
    "met": 6,
    "body_weight_kg": 82.5
  },
  "prediction": {
    "exercise": "squat",
    "reps": 9,
    "load_kg": 60,
    "active_seconds": 30,
    "calories": 4.125,
    "pose_coverage": 0.98
  }
}
```

`load_kg`, `body_weight_kg`, `met`, `calories` and `pose_coverage` may be
`null` when not observed or not applicable. A prediction of `unknown` or a
missing numeric value is an explicit abstention, not a zero.

## Quality assurance

Use two independent annotators for exercise identity and rep boundaries;
resolve disagreements before freezing the test split. The release evaluator
rejects duplicate IDs, non-finite values and out-of-range numeric annotations,
then reports macro-F1, per-class precision/recall, rep MAE, load tolerance and
abstention, active-duration MAE, calorie formula error and subject/camera
overlap.

Run the evaluator from [AI_EVALUATION.md](C:/Dev/GymLab/AI_EVALUATION.md) and
attach the immutable manifest checksum and JSON report to each model release.
