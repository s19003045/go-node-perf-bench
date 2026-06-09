# go-node-perf-bench

比較 **Go** 與 **Node.js** 在三種情境下的效能，用來支撐 `tsgc-ipc-api` 的
「OPC heartbeat ~40s gap」調查決策：**到底該不該為了效能把專案改寫成 Go？**

不與任何 OPC server 溝通；用一個純 CPU 工作負載 + 一個模擬 I/O 的 HTTP 服務，
重現本調查的核心現象。

---

## 三個情境（對映調查論點）

| 情境 | 量什麼 | 對映的論點 |
|---|---|---|
| **cpu** | 純整數運算（質數計算）的吞吐 | Node 是不是「CPU 很慢」？單執行緒 vs `worker_threads` vs Go goroutines |
| **io** | 高併發 HTTP（下游延遲、無 CPU）的吞吐/延遲 | I/O 併發**不是** Node 的弱點 |
| **heartbeat** ⭐ | 一個該每 50ms 跳的 ticker，在 CPU 重負載下的 gap | **重現 40s gap**：單一 event loop 被阻塞 → 心跳餓死；把重活移走 → 健康 |

兩語言的 CPU 演算法**完全相同**（trial-division 質數計算，純整數、無函式庫差異），
確保比的是 runtime 而非某個原生庫。

---

## 怎麼跑

需求：Node.js（18+）。Go 為選用——沒裝會自動略過 Go、只跑 Node。

```bash
# 全部跑一遍並印出對照表（Go 沒裝就只有 Node）
./run.sh

# 指定本機 Go（例如裝在非 PATH 的位置）
GO_BIN=/path/to/go ./run.sh

# 調參數（環境變數）
HB_TASK=8000000 HB_INTERVAL=20 CPU_ITERS=56 ./run.sh
```

單獨跑某情境：
```bash
node node/src/index.js cpu       --limit 1000000 --iterations 56 --workers 28
node node/src/index.js io        --requests 5000 --concurrency 200 --delay 20
node node/src/index.js heartbeat --interval 50 --duration 5000 --taskLimit 5000000 --mode main
node node/src/index.js heartbeat --interval 50 --duration 5000 --taskLimit 5000000 --mode worker

(cd go && go run . heartbeat --interval 50 --duration 5000 --taskLimit 5000000)
```

### 安裝 Go（若要比較 Go）
- 系統安裝：https://go.dev/dl/ ，或 `apt install golang` 等。
- 免 sudo 本機安裝（本 repo 用過的方式）：下載 tarball 解壓到 `.toolchain/`（已被 gitignore），
  再 `GO_BIN=$PWD/.toolchain/go/bin/go ./run.sh`。

---

## 範例結果（28 核機器, node v18.20.7, go 1.26.4）

> 微基準會因機器/版本/負載而異，數字僅供「量級」與「趨勢」參考，別當絕對值。

```
## CPU-bound  (count primes; lower wall = faster)
  lang  workers  wall(ms)  it/s
  go    1        3577.1    15.66
  go    28       214.83    260.67
  node  1        2185.03   25.63     <- 單執行緒 Node 比 Go 還快 (V8 JIT 對熱數值迴圈很強)
  node  28       229.19    244.34    <- worker_threads 並行後與 Go 相當

## I/O-bound  (higher req/s = better)
  lang  req/s    p99(ms)  max(ms)
  go    9005.6   52.75    56.06
  node  5236.31  72.79    74.69     <- Node 也輕鬆扛住高併發，無病態現象

## ⭐ Heartbeat under CPU load  (lower maxGap / lateTicks = healthier)
  lang  mode            expected(ms)  maxGap(ms)  lateTicks
  go    goroutines x28  50            50.00       0/99      <- 28 核全滿載，心跳仍準
  node  main            50            375.58      13/13     <- 心跳被餓死 (== 40s gap 的縮影)
  node  worker          50            50.28       0/102     <- 把重活丟 worker → 立刻healthy
```

---

## 怎麼解讀（這正是調查的結論）

1. **Node 不是「CPU 慢」**：單執行緒這個熱迴圈，Node(V8 JIT) 甚至比 Go 快。
   → 「為了算得更快而改寫成 Go」這個理由，**站不住腳**。
2. **真正的病灶是「單一 event loop 被阻塞」**：`node/main` 的心跳 gap 衝到 375ms（≈ 單一阻塞任務的長度），
   13/13 全部遲到。把 taskLimit 放大，gap 就跟著放大——這就是 `tsgc-ipc-api` 那個 29.5s / 40s gap 的縮影。
3. **解法是把重活移出 latency 敏感的執行緒，不是換語言**：`node/worker` 跟 Go 一樣健康（50ms、0 遲到）。
   Node 用 `worker_threads` 就能達到 Go 用 goroutines 的效果。
4. **I/O 併發兩者都行**：Node 5000+ req/s 毫無病態；Go 吞吐更高，但這不是 `tsgc-ipc-api` 的痛點。
5. **CPU 並行**：Node 要靠 `worker_threads` 才能吃滿多核（這同時也解了心跳餓死）；Go 天生並行。

**一句話**：換 Go 能換到的是「天生多核並行 + 排程器不會被單一任務餓死」；
但 Node 用 worker_threads / 拆進程**也能拿到同樣的隔離效果**，且 Node 單核 CPU 與 I/O 都不弱。
所以對 `tsgc-ipc-api` 而言，**先把阻塞孤島移出主執行緒**，比整包改寫 Go 划算得多。

---

## 專案結構

```
go-node-perf-bench/
├── run.sh                      # 一鍵跑兩語言全情境 + 對照表
├── tools/report.js             # 讀 results/*.json 產生對照表
├── node/
│   ├── package.json
│   └── src/
│       ├── index.js            # CLI dispatcher
│       ├── cpuWorker.js        # worker_threads entry
│       ├── lib/{cpu,metrics}.js
│       └── scenarios/{cpu,io,heartbeat}.js
├── go/
│   ├── go.mod
│   ├── main.go                 # CLI dispatcher
│   ├── cpu.go                  # 與 Node 相同的質數演算法
│   ├── {cpubench,iobench,heartbeatbench}.go
│   └── metrics.go
└── results/                    # 輸出 (gitignore)
```

兩語言 CLI 介面一致（`<cpu|io|heartbeat> --flags`），輸出 schema 相同（`RESULT_JSON=` 行 + `--out` 檔），
方便對照與擴充。

---

## 參數旋鈕

| 環境變數 | 預設 | 說明 |
|---|---|---|
| `CPU_LIMIT` | 1000000 | 每次質數計算的上限（越大每任務越久） |
| `CPU_ITERS` | 56 | CPU 情境總任務數（建議 ≥ 核心數才看得到並行加速） |
| `IO_REQ` / `IO_CONC` / `IO_DELAY` | 5000 / 200 / 20 | I/O 請求數 / 併發 / 模擬延遲(ms) |
| `HB_INTERVAL` | 50 | 心跳間隔(ms) |
| `HB_DURATION` | 5000 | 心跳情境總時長(ms) |
| `HB_TASK` | 5000000 | 心跳情境下每個 CPU 任務的大小（≈370ms/任務；放大可放大 gap） |
| `WORKERS` | nproc | 並行 worker/goroutine 數 |

> 想把 `node/main` 的餓死做得像真實的 29.5s？把 `HB_TASK` 調到 ~4 億（每任務數十秒），
> 心跳 maxGap 就會是數十秒——和 OPC server 看到的一模一樣。

## 注意事項（誠實揭露）
- 這是**微基準**，不是嚴謹的學術 benchmark：受 JIT 暖機、GC、CPU 排程、機器負載影響。
- I/O 情境兩語言的預設 HTTP 行為略有差異（Node `agent:false` 每請求新連線 vs Go `Transport` 連線池），
  屬「各自慣用預設」的比較，非極致調校。
- 目的是**呈現趨勢與量級、佐證架構決策**，不是宣稱某語言「贏多少 %」。
