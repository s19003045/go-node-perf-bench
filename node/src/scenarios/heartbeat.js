"use strict";

// ⭐ The headline scenario, mirroring this repo's OPC heartbeat investigation.
//
// A "heartbeat" ticker should fire every `intervalMs` for `durationMs`, while a
// load runs concurrently. We measure how late the heartbeat actually fires.
//
// Two kinds of load (--work):
//   cpu   : countPrimes() — CPU-bound work (busy computing). The event loop is
//           blocked because the thread is busy.
//   block : a SYNCHRONOUS blocking wait (Atomics.wait) — the thread is PARKED
//           doing nothing (0% CPU), exactly like execSync('ipfs ...') waiting on
//           a child process, or fs.readFileSync() waiting on a slow/busy disk.
//           This is the actual tsgc-ipc-api root-cause shape. Note: the loop
//           freezes even though the CPU is idle — proving it's not a "CPU too
//           slow" problem but a "single event loop parked on a sync call" problem.
//
// Three placements (--mode):
//   main   : load runs on the main thread -> ticker starves (== the bug)
//   worker : load runs in a worker_thread -> main free, ticker healthy (the fix
//            for CPU, or for blocking calls you can't avoid)
//   async  : (block only) use the async API instead of the sync one (modeled by
//            an async delay) -> event loop free between awaits, ticker healthy
//            (== the idiomatic fix: execSync->exec, readFileSync->fs.promises)
const path = require("path");
const { Worker } = require("worker_threads");
const { countPrimes } = require("../lib/cpu");
const { writeResult, stats } = require("../lib/metrics");

// Park the calling thread for ~ms WITHOUT using CPU. Node (unlike browsers)
// allows Atomics.wait on the main thread. This is our stand-in for a synchronous
// blocking syscall (execSync / readFileSync).
function blockSync(ms) {
    const ia = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(ia, 0, 0, ms);
}

function doUnit(work, taskLimit, blockMs) {
    if (work === "block") blockSync(blockMs);
    else countPrimes(taskLimit);
}

// Load on the MAIN thread, chunked back-to-back with a one-turn yield between
// units. The ticker can only fire in those gaps, so its max gap ~= one unit.
function workOnMain(work, taskLimit, blockMs, durationMs) {
    return new Promise((resolve) => {
        const start = performance.now();
        let tasks = 0;
        function next() {
            if (performance.now() - start >= durationMs) return resolve(tasks);
            doUnit(work, taskLimit, blockMs);
            tasks++;
            setImmediate(next);
        }
        setImmediate(next);
    });
}

// Async placement (block only): model the async I/O API with a non-blocking
// delay. The event loop stays free, so the ticker is unaffected.
function workAsync(blockMs, durationMs) {
    return new Promise((resolve) => {
        const start = performance.now();
        let tasks = 0;
        function next() {
            if (performance.now() - start >= durationMs) return resolve(tasks);
            setTimeout(() => {
                tasks++;
                next();
            }, blockMs);
        }
        next();
    });
}

// Load in a WORKER thread: the main thread only runs the ticker.
function workInWorker(work, taskLimit, blockMs, durationMs) {
    return new Promise((resolve, reject) => {
        const w = new Worker(path.join(__dirname, "..", "cpuWorker.js"), {
            workerData: { durationMs, taskLimit, work, blockMs },
        });
        w.on("message", (m) => resolve(m.tasks || 0));
        w.on("error", reject);
    });
}

async function run({ intervalMs, durationMs, taskLimit, blockMs, mode, work, out }) {
    const gaps = [];
    let last = performance.now();
    const timer = setInterval(() => {
        const now = performance.now();
        gaps.push(now - last);
        last = now;
    }, intervalMs);

    let tasks;
    if (mode === "worker") {
        tasks = await workInWorker(work, taskLimit, blockMs, durationMs);
    } else if (mode === "async") {
        tasks = await workAsync(blockMs, durationMs); // block-style only
    } else {
        tasks = await workOnMain(work, taskLimit, blockMs, durationMs);
    }

    clearInterval(timer);

    const measured = gaps.slice(1); // drop first (warmup) gap
    const s = stats(measured);
    const lateThreshold = intervalMs * 1.5;
    const lateTicks = measured.filter((g) => g > lateThreshold).length;

    const result = {
        lang: "node",
        scenario: "heartbeat",
        params: { intervalMs, durationMs, taskLimit, blockMs, mode, work },
        metrics: {
            expectedIntervalMs: intervalMs,
            ticks: measured.length,
            lateTicks,
            gapMeanMs: s.mean,
            gapP99Ms: s.p99,
            gapMaxMs: s.max,
            units: tasks,
        },
        summary: `[node][heartbeat][work=${work}][${mode}] interval=${intervalMs}ms dur=${durationMs}ms -> maxGap=${s.max}ms p99=${s.p99}ms lateTicks=${lateTicks}/${measured.length} (units=${tasks})`,
    };
    writeResult(result, out);
}

module.exports = { run };
