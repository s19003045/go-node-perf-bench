"use strict";

// CLI dispatcher: node src/index.js <cpu|io|heartbeat> [--flags]
const cpu = require("./scenarios/cpu");
const io = require("./scenarios/io");
const heartbeat = require("./scenarios/heartbeat");

function parseArgs(argv) {
    const a = {};
    for (let i = 0; i < argv.length; i++) {
        const t = argv[i];
        if (!t.startsWith("--")) continue;
        const key = t.slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("--")) {
            a[key] = true;
        } else {
            a[key] = next;
            i++;
        }
    }
    return a;
}

const num = (v, d) => (v === undefined ? d : Number(v));

async function main() {
    const scenario = process.argv[2];
    const args = parseArgs(process.argv.slice(3));

    switch (scenario) {
        case "cpu":
            await cpu.run({
                limit: num(args.limit, 1000000),
                iterations: num(args.iterations, 8),
                workers: num(args.workers, 1),
                out: args.out,
            });
            break;
        case "io":
            await io.run({
                requests: num(args.requests, 5000),
                concurrency: num(args.concurrency, 200),
                delayMs: num(args.delay, 20),
                port: num(args.port, 8101),
                out: args.out,
            });
            break;
        case "heartbeat":
            await heartbeat.run({
                intervalMs: num(args.interval, 50),
                durationMs: num(args.duration, 5000),
                taskLimit: num(args.taskLimit, 5000000),
                blockMs: num(args.blockMs, 300),
                mode: args.mode || "main",
                work: args.work || "cpu",
                out: args.out,
            });
            break;
        default:
            console.error(
                "usage: node src/index.js <cpu|io|heartbeat> [--flags]"
            );
            process.exit(1);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
