"use strict";

// ⭐ The headline scenario, mirroring this repo's OPC heartbeat investigation.
//
// A "heartbeat" ticker should fire every `intervalMs` for `durationMs`. Meanwhile
// heavy CPU work runs concurrently. We measure how late the heartbeat actually
// fires (gap between consecutive ticks). This reproduces the 40s-gap phenomenon:
//
//   mode=main   : CPU tasks run on the main thread (chunked back-to-back). Each
//                 task blocks the single event loop -> the ticker starves.
//                 == the bug in tsgc-ipc-api.
//   mode=worker : CPU tasks run in a worker_thread -> main thread free, ticker
//                 stays healthy. == the fix (move heavy work off the event loop).
const path = require("path");
const { Worker } = require("worker_threads");
const { countPrimes } = require("../lib/cpu");
const { writeResult, stats } = require("../lib/metrics");

// CPU work on the MAIN thread: run prime tasks until duration elapses, yielding
// one event-loop turn (setImmediate) between tasks. The ticker can only fire in
// those brief gaps, so its max gap ~= one task's blocking duration.
function cpuOnMain(taskLimit, durationMs) {
    return new Promise((resolve) => {
        const start = performance.now();
        let tasks = 0;
        function next() {
            if (performance.now() - start >= durationMs) return resolve(tasks);
            countPrimes(taskLimit);
            tasks++;
            setImmediate(next);
        }
        setImmediate(next);
    });
}

// CPU work in a WORKER thread: the main thread only runs the ticker.
function cpuInWorker(taskLimit, durationMs) {
    return new Promise((resolve, reject) => {
        const w = new Worker(path.join(__dirname, "..", "cpuWorker.js"), {
            workerData: { taskLimit, durationMs },
        });
        w.on("message", (m) => resolve(m.tasks || 0));
        w.on("error", reject);
    });
}

async function run({ intervalMs, durationMs, taskLimit, mode, out }) {
    const gaps = [];
    let last = performance.now();
    const timer = setInterval(() => {
        const now = performance.now();
        gaps.push(now - last);
        last = now;
    }, intervalMs);

    const tasks =
        mode === "worker"
            ? await cpuInWorker(taskLimit, durationMs)
            : await cpuOnMain(taskLimit, durationMs);

    clearInterval(timer);

    const measured = gaps.slice(1); // drop first (warmup) gap
    const s = stats(measured);
    const lateThreshold = intervalMs * 1.5;
    const lateTicks = measured.filter((g) => g > lateThreshold).length;

    const result = {
        lang: "node",
        scenario: "heartbeat",
        params: { intervalMs, durationMs, taskLimit, mode },
        metrics: {
            expectedIntervalMs: intervalMs,
            ticks: measured.length,
            lateTicks,
            gapMeanMs: s.mean,
            gapP99Ms: s.p99,
            gapMaxMs: s.max,
            cpuTasks: tasks,
        },
        summary: `[node][heartbeat][${mode}] interval=${intervalMs}ms dur=${durationMs}ms -> maxGap=${s.max}ms p99=${s.p99}ms lateTicks=${lateTicks}/${measured.length} (cpuTasks=${tasks})`,
    };
    writeResult(result, out);
}

module.exports = { run };
