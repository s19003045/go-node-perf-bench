"use strict";

// Worker-thread entry. Two modes via workerData:
//   { durationMs, taskLimit }   -> run CPU tasks until duration elapses (heartbeat scenario)
//   { iterations, limit }       -> run a fixed number of CPU tasks (cpu scenario, parallel)
const { workerData, parentPort } = require("worker_threads");
const { countPrimes } = require("./lib/cpu");

if (workerData && workerData.durationMs != null) {
    const start = performance.now();
    let tasks = 0;
    while (performance.now() - start < workerData.durationMs) {
        countPrimes(workerData.taskLimit);
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
