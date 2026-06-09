"use strict";

// Worker-thread entry. Two shapes via workerData:
//   { durationMs, work, taskLimit, blockMs } -> run units until duration elapses
//        work=cpu   -> countPrimes(taskLimit)         (busy computing)
//        work=block -> Atomics.wait(...) for blockMs   (parked, 0% CPU; mimics
//                      execSync / readFileSync waiting on a syscall)
//   { iterations, limit }                     -> fixed CPU tasks (cpu scenario)
const { workerData, parentPort } = require("worker_threads");
const { countPrimes } = require("./lib/cpu");

function blockSync(ms) {
    const ia = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(ia, 0, 0, ms);
}

if (workerData && workerData.durationMs != null) {
    const start = performance.now();
    let tasks = 0;
    while (performance.now() - start < workerData.durationMs) {
        if (workerData.work === "block") blockSync(workerData.blockMs);
        else countPrimes(workerData.taskLimit);
        tasks++;
    }
    parentPort.postMessage({ done: true, tasks });
} else {
    let count = 0;
    for (let i = 0; i < workerData.iterations; i++) {
        count += countPrimes(workerData.limit);
    }
    parentPort.postMessage({ done: true, count });
}
