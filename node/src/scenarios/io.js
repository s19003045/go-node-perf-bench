"use strict";

// I/O-bound benchmark: a local HTTP server that responds after `delayMs` of pure
// wait (simulating downstream/DB latency, no CPU), and a client firing `requests`
// total with `concurrency` in flight. This isolates I/O concurrency -- where
// Node's event loop is at its best -- so it should NOT be where Node loses.
const http = require("http");
const { writeResult, stats, round } = require("../lib/metrics");

function run({ requests, concurrency, delayMs, port, out }) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            setTimeout(() => {
                res.writeHead(200);
                res.end("ok");
            }, delayMs);
        });

        server.listen(port, "127.0.0.1", () => {
            const latencies = [];
            let dispatched = 0;
            let completed = 0;
            let inFlight = 0;
            const start = performance.now();

            const finish = () => {
                const wallMs = round(performance.now() - start);
                server.close();
                const s = stats(latencies);
                const throughput = round(requests / (wallMs / 1000));
                const result = {
                    lang: "node",
                    scenario: "io",
                    params: { requests, concurrency, delayMs },
                    metrics: {
                        wallMs,
                        requestsPerSec: throughput,
                        latencyMeanMs: s.mean,
                        latencyP99Ms: s.p99,
                        latencyMaxMs: s.max,
                    },
                    summary: `[node][io] requests=${requests} concurrency=${concurrency} delay=${delayMs}ms -> wall=${wallMs}ms throughput=${throughput} req/s p99=${s.p99}ms`,
                };
                writeResult(result, out);
                resolve();
            };

            const pump = () => {
                while (inFlight < concurrency && dispatched < requests) {
                    dispatched++;
                    inFlight++;
                    const t0 = performance.now();
                    const req = http.get(
                        {
                            host: "127.0.0.1",
                            port,
                            path: "/",
                            agent: false,
                        },
                        (res) => {
                            res.resume();
                            res.on("end", () => {
                                latencies.push(performance.now() - t0);
                                inFlight--;
                                completed++;
                                if (completed === requests) finish();
                                else pump();
                            });
                        }
                    );
                    req.on("error", () => {
                        inFlight--;
                        completed++;
                        if (completed === requests) finish();
                        else pump();
                    });
                }
            };

            pump();
        });
    });
}

module.exports = { run };
