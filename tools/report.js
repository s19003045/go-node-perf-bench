"use strict";

// Aggregate results/*.json into side-by-side comparison tables.
// Usage: node tools/report.js [resultsDir]
const fs = require("fs");
const path = require("path");

const dir = process.argv[2] || "results";
let files = [];
try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
} catch (e) {
    /* ignore */
}

const results = [];
for (const f of files) {
    try {
        results.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
    } catch (e) {
        /* ignore */
    }
}

if (!results.length) {
    console.log(`(no result JSON files in ${dir})`);
    process.exit(0);
}

function table(headers, rows) {
    const widths = headers.map((h, i) =>
        Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length))
    );
    const line = (cells) =>
        cells.map((c, i) => String(c ?? "").padEnd(widths[i])).join("  ");
    console.log("  " + line(headers));
    console.log("  " + widths.map((w) => "-".repeat(w)).join("  "));
    for (const r of rows) console.log("  " + line(r));
}

const get = (r, k) => (r.metrics && r.metrics[k] != null ? r.metrics[k] : "");

// ---- CPU ----
const cpu = results.filter((r) => r.scenario === "cpu");
if (cpu.length) {
    console.log("\n## CPU-bound  (count primes; lower wall = faster)");
    cpu.sort(
        (a, b) =>
            a.lang.localeCompare(b.lang) || a.params.workers - b.params.workers
    );
    table(
        ["lang", "workers", "wall(ms)", "it/s"],
        cpu.map((r) => [
            r.lang,
            r.params.workers,
            get(r, "wallMs"),
            get(r, "iterationsPerSec"),
        ])
    );
    console.log(
        "  → Node workers=1 can't use multiple cores for one CPU task; worker_threads / Go goroutines can."
    );
}

// ---- IO ----
const io = results.filter((r) => r.scenario === "io");
if (io.length) {
    console.log("\n## I/O-bound  (concurrent HTTP w/ simulated latency; higher req/s = better)");
    io.sort((a, b) => a.lang.localeCompare(b.lang));
    table(
        ["lang", "req/s", "p99(ms)", "max(ms)", "wall(ms)"],
        io.map((r) => [
            r.lang,
            get(r, "requestsPerSec"),
            get(r, "latencyP99Ms"),
            get(r, "latencyMaxMs"),
            get(r, "wallMs"),
        ])
    );
    console.log(
        "  → I/O concurrency is NOT where Node loses; both runtimes handle it well."
    );
}

// ---- Heartbeat ----
const hb = results.filter((r) => r.scenario === "heartbeat");
if (hb.length) {
    console.log("\n## ⭐ Heartbeat under CPU load  (lower maxGap / lateTicks = healthier)");
    hb.sort((a, b) => a.lang.localeCompare(b.lang));
    table(
        ["lang", "mode", "expected(ms)", "maxGap(ms)", "p99Gap(ms)", "lateTicks"],
        hb.map((r) => [
            r.lang,
            r.params.mode + (r.params.workers ? " x" + r.params.workers : ""),
            get(r, "expectedIntervalMs"),
            get(r, "gapMaxMs"),
            get(r, "gapP99Ms"),
            `${get(r, "lateTicks")}/${get(r, "ticks")}`,
        ])
    );
    console.log(
        "  → node/main starves (maxGap ≈ one blocking task). node/worker & go stay near the interval."
    );
    console.log(
        "  → This is the tsgc-ipc-api OPC heartbeat 40s-gap phenomenon, in miniature."
    );
}

console.log("");
