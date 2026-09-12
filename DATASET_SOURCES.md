# GymLab benchmark data-source registry

This registry keeps external datasets separate from the shipped application.
No external exercise dataset is bundled in GymLab, and no dataset below is an
automatic substitute for the project's own consented, subject-disjoint test
set.

## Approved use categories

| Source | Useful coverage | Default status | Release rule |
| --- | --- | --- | --- |
| Project-owned consented clips | Exact exercises, camera/device matrix, visible load labels and rep boundaries | Preferred production gate | May be used only under the documented consent, retention and access controls in `DATASET_CARD.md`. |
| [MM-Fit](https://mmfit.github.io/) / [Zenodo record](https://zenodo.org/records/7672767) | Multi-view RGB-D exercise sessions, pose data, squats, push-ups, shoulder presses, rows and lunges | Research candidate | Verify the current record's rights and any download terms before use; keep the original dataset outside this repository. |
| [RepCount](https://svip-lab.github.io/dataset/RepCount_dataset) | Repetition counts and cycle locations across in-the-wild and recorded exercise videos | Research candidate | Audit the rights of every source video before processing or redistributing clips; source URLs alone are not a commercial license. |
| [Qualcomm QEVD](https://www.qualcomm.com/developer/software/qevd-dataset) | Large exercise-recognition and coaching benchmark, including held-out participants | Research-only candidate | The current Qualcomm data agreement grants Research Use and excludes Commercial Use. Do not train, validate or ship a commercial GymLab release from it without written permission. |
| [PushUpBench](https://huggingface.co/datasets/anonymousatom/pushupbench) / [project page](https://pushupbench.com/) | Long-form repetition-count clips with exercise names and acceptable count ranges | Research-only repetition audit | The hosted card declares CC BY 4.0, but the benchmark does not provide load or body-weight labels and does not replace GymLab's consented product dataset. Keep imported clips outside the repository and verify attribution/source-media rights before any redistribution or training use. |

## Required provenance for any imported benchmark

Before a clip enters `tests/prepare_benchmark_manifest.py`, record:

- source name, version/DOI or URL, and the exact license or permission;
- subject and camera identifiers without names or biometric identifiers;
- consent/redistribution status and retention expiry;
- source file size and SHA-256;
- annotation revision, label policy and split assignment.

If any of those fields cannot be verified, keep the clip out of the release
manifest. The evaluator's `--require-provenance` mode is intentionally strict.

## What external data cannot prove

Public research data may test exercise recognition and repetition counting, but
it does not by itself prove that GymLab can read an unlabeled load in kg or
measure physiological calories. Load is only accepted from repeated visible
`kg`/`lb` evidence or an explicit user confirmation. Calories remain a MET
estimate using body weight and active time, not an indirect calorimetry result.
