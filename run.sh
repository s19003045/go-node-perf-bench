#!/usr/bin/env bash
# Orchestrate the Go-vs-Node benchmark: run every scenario on both runtimes
# (Go is skipped gracefully if not installed) and print a comparison table.
#
# Tunables (override via env), e.g.  HB_TASK=8000000 ./run.sh
set -u

ROOT="$(cd "$(dirname "$0")" && pwd)"
RESULTS="$ROOT/results"
mkdir -p "$RESULTS"
rm -f "$RESULTS"/*.json

# --- parameters ---
CPU_LIMIT=${CPU_LIMIT:-1000000}
CPU_ITERS=${CPU_ITERS:-56}
IO_REQ=${IO_REQ:-5000}
IO_CONC=${IO_CONC:-200}
IO_DELAY=${IO_DELAY:-20}
HB_INTERVAL=${HB_INTERVAL:-50}
HB_DURATION=${HB_DURATION:-5000}
HB_TASK=${HB_TASK:-5000000}
WORKERS=${WORKERS:-$(nproc 2>/dev/null || echo 4)}
GO=${GO_BIN:-go}

NODE="node $ROOT/node/src/index.js"

echo "==================================================================="
echo " Go vs Node perf bench   (cores=$WORKERS, node=$(node --version))"
echo " params: cpu[limit=$CPU_LIMIT iters=$CPU_ITERS] io[req=$IO_REQ conc=$IO_CONC delay=$IO_DELAY]"
echo "         heartbeat[interval=$HB_INTERVAL dur=$HB_DURATION taskLimit=$HB_TASK]"
echo "==================================================================="

echo ""
echo "### Node ###"
$NODE cpu       --limit $CPU_LIMIT --iterations $CPU_ITERS --workers 1        --out "$RESULTS/node-cpu-1.json"        | grep -v RESULT_JSON
$NODE cpu       --limit $CPU_LIMIT --iterations $CPU_ITERS --workers $WORKERS --out "$RESULTS/node-cpu-N.json"        | grep -v RESULT_JSON
$NODE io        --requests $IO_REQ --concurrency $IO_CONC  --delay $IO_DELAY  --out "$RESULTS/node-io.json"           | grep -v RESULT_JSON
$NODE heartbeat --interval $HB_INTERVAL --duration $HB_DURATION --taskLimit $HB_TASK --mode main   --out "$RESULTS/node-hb-main.json"   | grep -v RESULT_JSON
$NODE heartbeat --interval $HB_INTERVAL --duration $HB_DURATION --taskLimit $HB_TASK --mode worker --out "$RESULTS/node-hb-worker.json" | grep -v RESULT_JSON

echo ""
if command -v "$GO" >/dev/null 2>&1; then
    echo "### Go ###"
    GOBIN_OUT="$RESULTS/.gobench"
    if ( cd "$ROOT/go" && "$GO" build -o "$GOBIN_OUT" . ); then
        "$GOBIN_OUT" cpu       --limit $CPU_LIMIT --iterations $CPU_ITERS --workers 1        --out "$RESULTS/go-cpu-1.json"  | grep -v RESULT_JSON
        "$GOBIN_OUT" cpu       --limit $CPU_LIMIT --iterations $CPU_ITERS --workers $WORKERS --out "$RESULTS/go-cpu-N.json"  | grep -v RESULT_JSON
        "$GOBIN_OUT" io        --requests $IO_REQ --concurrency $IO_CONC  --delay $IO_DELAY  --out "$RESULTS/go-io.json"     | grep -v RESULT_JSON
        "$GOBIN_OUT" heartbeat --interval $HB_INTERVAL --duration $HB_DURATION --taskLimit $HB_TASK --workers $WORKERS --out "$RESULTS/go-hb.json" | grep -v RESULT_JSON
    else
        echo "Go build failed; skipping Go benchmarks."
    fi
else
    echo "### Go 未安裝，略過 Go benchmark。 ###"
    echo "    安裝後重跑即可比較： https://go.dev/dl/  (或 GO_BIN=/path/to/go ./run.sh)"
fi

echo ""
echo "==================================================================="
echo " 比較報表 (Comparison)"
echo "==================================================================="
node "$ROOT/tools/report.js" "$RESULTS"
