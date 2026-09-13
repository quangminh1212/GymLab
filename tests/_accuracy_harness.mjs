/**
 * GymLab accuracy harness — drives the REAL production analysis core
 * (src/js/video-analysis-core.js) on a JSON suite of synthetic pose streams.
 *
 * Usage: node tests/_accuracy_harness.mjs <suite.json> <results.json>
 * Exit 0 on success; non-zero on harness failure.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, isAbsolute as isAbs, join } from "node:path";

const [suitePath, outPath] = process.argv.slice(2);
if (!suitePath || !outPath) {
    console.error("usage: _accuracy_harness.mjs <suite.json> <results.json>");
    process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const core = await import(pathToFileURL(join(here, "..", "src", "js", "video-analysis-core.js")).href);

const suiteFile = isAbs(suitePath) ? suitePath : join(here, suitePath);
const suite = JSON.parse(readFileSync(suiteFile, "utf-8"));

const results = [];
for (const c of suite.cases) {
    const classification = core.classifyExercise(c.samples, null);
    const gate = core.applyExerciseConfidenceGate(
        { ...classification, exerciseId: classification.exerciseId },
        classification.score,
        0.55,
    );
    const repLow = c.signal_values ? core.countRepetitions(c.signal_values, "low") : null;
    const repHigh = c.signal_values ? core.countRepetitions(c.signal_values, "high") : null;
    const activeDuration = core.estimateActiveDuration(c.samples, c.total_duration);
    results.push({
        exercise: c.exercise,
        variant: c.variant,
        predicted: classification.exerciseId,
        score: Number(classification.score.toFixed(4)),
        margin: Number(classification.margin.toFixed(4)),
        accepted: classification.exerciseId !== "unknown",
        reps_low: repLow,
        reps_high: repHigh,
        active_duration: activeDuration,
        gt_reps: c.gt_reps,
        gt_duration: c.gt_duration,
        duration_only: Boolean(c.duration_only),
        signal: c.signal_key,
        top3: Object.entries(classification.scores)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([k, v]) => `${k}=${Number(v).toFixed(3)}`),
    });
}

writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`harness: ${results.length} cases -> ${outPath}`);
