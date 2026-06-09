"use strict";

const fs = require("fs");

function percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const idx = Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
    );
    return sorted[idx];
}

function round(n) {
    return Math.round(n * 100) / 100;
}

function stats(samples) {
    if (!samples.length) return { count: 0 };
    const s = [...samples].sort((a, b) => a - b);
    const sum = s.reduce((a, b) => a + b, 0);
    return {
        count: s.length,
        min: round(s[0]),
        mean: round(sum / s.length),
        p50: round(percentile(s, 50)),
        p90: round(percentile(s, 90)),
        p99: round(percentile(s, 99)),
        max: round(s[s.length - 1]),
    };
}

// Emit a result both as a human summary (stdout) and as machine-readable JSON
// (to --out file and a RESULT_JSON= line for the orchestrator to capture).
function writeResult(result, outPath) {
    if (outPath) {
        try {
            fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
        } catch (e) {
            /* ignore */
        }
    }
    console.log(result.summary);
    console.log("RESULT_JSON=" + JSON.stringify(result));
}

module.exports = { percentile, round, stats, writeResult };
