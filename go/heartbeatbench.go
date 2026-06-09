package main

import (
	"fmt"
	"sync"
	"time"
)

// ⭐ The headline scenario, the Go counterpart to node heartbeat.
//
// A heartbeat ticker should fire every `intervalMs` for `durationMs`, while
// `workers` goroutines hammer the CPU with the same prime workload. The question:
// does the heartbeat starve like Node's single-threaded main mode?
//
// Answer: no. Go's scheduler runs goroutines across GOMAXPROCS OS threads and
// preempts long-running ones, so the ticker goroutine keeps firing on time even
// while every core is busy. This is the structural difference from Node's single
// event loop -- and why "move heavy work off the event loop" (worker_threads) is
// the Node-side equivalent fix rather than a language rewrite.
func runHeartbeat(intervalMs, durationMs, taskLimit, workers int, out string) {
	duration := time.Duration(durationMs) * time.Millisecond
	interval := time.Duration(intervalMs) * time.Millisecond
	deadline := time.Now().Add(duration)

	// CPU load goroutines
	var wg sync.WaitGroup
	var taskMu sync.Mutex
	tasks := 0
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			local := 0
			for time.Now().Before(deadline) {
				countPrimes(taskLimit)
				local++
			}
			taskMu.Lock()
			tasks += local
			taskMu.Unlock()
		}()
	}

	// Heartbeat ticker goroutine owns `gaps` and returns it via a channel to
	// avoid data races.
	ticker := time.NewTicker(interval)
	gapsCh := make(chan []float64, 1)
	go func() {
		gaps := []float64{}
		last := time.Now()
		for now := range ticker.C {
			gaps = append(gaps, ms(now.Sub(last)))
			last = now
			if !now.Before(deadline) {
				break
			}
		}
		gapsCh <- gaps
	}()

	wg.Wait()
	gaps := <-gapsCh
	ticker.Stop()

	measured := gaps
	if len(measured) > 1 {
		measured = measured[1:] // drop first (warmup) gap
	}
	s := computeStats(measured)
	lateThreshold := float64(intervalMs) * 1.5
	late := 0
	for _, g := range measured {
		if g > lateThreshold {
			late++
		}
	}

	writeResult(Result{
		Lang:     "go",
		Scenario: "heartbeat",
		Params:   map[string]interface{}{"intervalMs": intervalMs, "durationMs": durationMs, "taskLimit": taskLimit, "mode": "goroutines", "workers": workers},
		Metrics: map[string]interface{}{
			"expectedIntervalMs": intervalMs,
			"ticks":              len(measured),
			"lateTicks":          late,
			"gapMeanMs":          s.Mean,
			"gapP99Ms":           s.P99,
			"gapMaxMs":           s.Max,
			"cpuTasks":           tasks,
		},
		Summary: fmt.Sprintf("[go][heartbeat][goroutines] interval=%dms dur=%dms workers=%d -> maxGap=%.2fms p99=%.2fms lateTicks=%d/%d (cpuTasks=%d)",
			intervalMs, durationMs, workers, s.Max, s.P99, late, len(measured), tasks),
	}, out)
}
