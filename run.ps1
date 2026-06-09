# Windows (PowerShell) orchestrator — native equivalent of run.sh.
# Runs every scenario on Node (and Go if installed) and prints a comparison table.
#
# Usage:   .\run.ps1
# Tunables (env vars):   $env:HB_TASK=8000000; .\run.ps1
# Custom Go path:        $env:GO_BIN="C:\Go\bin\go.exe"; .\run.ps1

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Results = Join-Path $Root "results"
New-Item -ItemType Directory -Force -Path $Results | Out-Null
Get-ChildItem -Path $Results -Filter *.json -ErrorAction SilentlyContinue | Remove-Item -Force

function EnvOr($name, $default) {
    $v = [Environment]::GetEnvironmentVariable($name)
    if ($v) { return $v } else { return $default }
}

$CpuLimit   = EnvOr "CPU_LIMIT"   1000000
$CpuIters   = EnvOr "CPU_ITERS"   56
$IoReq      = EnvOr "IO_REQ"      5000
$IoConc     = EnvOr "IO_CONC"     200
$IoDelay    = EnvOr "IO_DELAY"    20
$HbInterval = EnvOr "HB_INTERVAL" 50
$HbDuration = EnvOr "HB_DURATION" 5000
$HbTask     = EnvOr "HB_TASK"     5000000
$HbBlock    = EnvOr "HB_BLOCK"    300
$Workers    = EnvOr "WORKERS"     ([Environment]::ProcessorCount)
$Go         = EnvOr "GO_BIN"      "go"

$NodeEntry = Join-Path $Root "node/src/index.js"

# drop the machine-readable RESULT_JSON= line, keep the human summary
filter NoJson { if ($_ -notmatch '^RESULT_JSON=') { $_ } }

Write-Host "==================================================================="
Write-Host " Go vs Node perf bench   (cores=$Workers, node=$(node --version))"
Write-Host " params: cpu[limit=$CpuLimit iters=$CpuIters] io[req=$IoReq conc=$IoConc delay=$IoDelay]"
Write-Host "         heartbeat[interval=$HbInterval dur=$HbDuration taskLimit=$HbTask]"
Write-Host "==================================================================="

Write-Host "`n### Node ###"
node $NodeEntry cpu       --limit $CpuLimit --iterations $CpuIters --workers 1        --out "$Results/node-cpu-1.json"        | NoJson
node $NodeEntry cpu       --limit $CpuLimit --iterations $CpuIters --workers $Workers --out "$Results/node-cpu-N.json"        | NoJson
node $NodeEntry io        --requests $IoReq --concurrency $IoConc  --delay $IoDelay   --out "$Results/node-io.json"           | NoJson
node $NodeEntry heartbeat --interval $HbInterval --duration $HbDuration --taskLimit $HbTask --work cpu   --mode main   --out "$Results/node-hb-cpu-main.json"     | NoJson
node $NodeEntry heartbeat --interval $HbInterval --duration $HbDuration --taskLimit $HbTask --work cpu   --mode worker --out "$Results/node-hb-cpu-worker.json"   | NoJson
node $NodeEntry heartbeat --interval $HbInterval --duration $HbDuration --blockMs $HbBlock  --work block --mode main   --out "$Results/node-hb-block-main.json"   | NoJson
node $NodeEntry heartbeat --interval $HbInterval --duration $HbDuration --blockMs $HbBlock  --work block --mode async  --out "$Results/node-hb-block-async.json"  | NoJson
node $NodeEntry heartbeat --interval $HbInterval --duration $HbDuration --blockMs $HbBlock  --work block --mode worker --out "$Results/node-hb-block-worker.json" | NoJson

Write-Host "`n"
$goCmd = Get-Command $Go -ErrorAction SilentlyContinue
if ($goCmd) {
    Write-Host "### Go ###"
    $goBin = Join-Path $Results "gobench.exe"
    Push-Location (Join-Path $Root "go")
    & $Go build -o $goBin .
    $buildOk = $?
    Pop-Location
    if ($buildOk) {
        & $goBin cpu       --limit $CpuLimit --iterations $CpuIters --workers 1        --out "$Results/go-cpu-1.json"  | NoJson
        & $goBin cpu       --limit $CpuLimit --iterations $CpuIters --workers $Workers --out "$Results/go-cpu-N.json"  | NoJson
        & $goBin io        --requests $IoReq --concurrency $IoConc  --delay $IoDelay   --out "$Results/go-io.json"     | NoJson
        & $goBin heartbeat --interval $HbInterval --duration $HbDuration --taskLimit $HbTask --work cpu   --workers $Workers --out "$Results/go-hb-cpu.json"   | NoJson
        & $goBin heartbeat --interval $HbInterval --duration $HbDuration --blockMs $HbBlock  --work block --workers $Workers --out "$Results/go-hb-block.json" | NoJson
    } else {
        Write-Host "Go build failed; skipping Go benchmarks."
    }
} else {
    Write-Host "### Go 未安裝，略過 Go benchmark。 ###"
    Write-Host "    安裝後重跑即可比較： https://go.dev/dl/  (或 `$env:GO_BIN='C:\Go\bin\go.exe'`)"
}

Write-Host "`n==================================================================="
Write-Host " 比較報表 (Comparison)"
Write-Host "==================================================================="
node (Join-Path $Root "tools/report.js") $Results
