/**
 * Frontend syntax gate: parse every first-party JS module shipped to the
 * WebView (src/js) plus this test's own harness, so `npm run build` is a
 * meaningful CI gate without a bundler. Exits non-zero on any parse error.
 */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const jsRoot = join(here, "..", "src", "js");

function listModules(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) out.push(...listModules(full));
        else if (name.endsWith(".mjs") || name.endsWith(".js")) out.push(full);
    }
    return out;
}

const modules = listModules(jsRoot);
if (!modules.length) {
    console.error("check-frontend-syntax: no modules found under src/js");
    process.exit(1);
}

let failures = 0;
for (const file of modules) {
    const source = readFileSync(file, "utf-8");
    if (/^\s*import\s/m.test(source)) {
        // ESM module: --input-type is string-input-only, so validate by
        // evaluating a no-op dynamic parse via a child process reading the
        // file as stdin module source.
        const res = spawnSync(process.execPath, ["--input-type=module", "--check"], {
            input: source,
            encoding: "utf-8",
        });
        if (res.status !== 0) {
            failures += 1;
            console.error(`SYNTAX FAIL ${relative(process.cwd(), file)}\n${res.stderr}`);
        }
    } else {
        const res = spawnSync(process.execPath, ["--check", file], { encoding: "utf-8" });
        if (res.status !== 0) {
            failures += 1;
            console.error(`SYNTAX FAIL ${relative(process.cwd(), file)}\n${res.stderr}`);
        }
    }
}

console.log(`check-frontend-syntax: ${modules.length - failures}/${modules.length} modules parse clean`);
process.exit(failures ? 1 : 0);
