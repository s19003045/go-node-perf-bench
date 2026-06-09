"use strict";

// CPU-bound benchmark: run `iterations` calls to countPrimes(limit), optionally
// spread across `workers` worker_threads. Single-thread shows Node's inability to
// use multiple cores for one CPU task; workers>1 shows the worker_threads fix.
const path = require("path");
const { Worker } = require("worker_threads");
const { countPrimes } = require("../lib/cpu");
const { writeResult, round } = require("../lib/metrics");

function runWorker(limit, iterations) {
    return new Promise((resolve, reject) => {
        const w = new Worker(path.join(__dirname, "..", "cpuWorker.js"), {
            workerData: { limit, iterations },
        });
        w.on("message", (m) => resolve(m));
        w.on("error", reject);
    });
}

async function run({ limit, iterations, workers, out }) {
    const start = performance.now();
    let count = 0;

    if (workers <= 1) {
        for (let i = 0; i < iterations; i++) count += countPrimes(limit);
    } else {
        // distribute iterations as evenly as possible (first `rem` workers get +1)
        const base = Math.floor(iterations / workers);
        const rem = iterations % workers;
        const tasks = [];
        for (let w = 0; w < workers; w++) {
            const n = base + (w < rem ? 1 : 0);
            if (n > 0) tasks.push(runWorker(limit, n));
        }
        const res = await Promise.all(tasks);
        count = res.reduce((a, r) => a + (r.count || 0), 0);
    }

    const wallMs = round(performance.now() - start);
    const throughput = round(iterations / (wallMs / 1000));
    const result = {
        lang: "node",
        scenario: "cpu",
        params: { limit, iterations, workers },
        metrics: {
            wallMs,
            iterationsPerSec: throughput,
            primesCounted: count,
        },
        summary: `[node][cpu] workers=${workers} iterations=${iterations} limit=${limit} -> wall=${wallMs}ms throughput=${throughput} it/s`,
    };
    writeResult(result, out);
}

module.exports = { run };
