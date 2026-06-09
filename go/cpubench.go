package main

import (
	"fmt"
	"sync"
	"time"
)

// CPU-bound benchmark: run `iterations` calls to countPrimes(limit), optionally
// across `workers` goroutines. Unlike Node, Go parallelizes CPU across cores by
// default (GOMAXPROCS), so even the goroutine version needs no special machinery.
func runCPU(limit, iterations, workers int, out string) {
	start := time.Now()
	count := 0

	if workers <= 1 {
		for i := 0; i < iterations; i++ {
			count += countPrimes(limit)
		}
	} else {
		var wg sync.WaitGroup
		var mu sync.Mutex
		// distribute iterations as evenly as possible (first `rem` goroutines get +1)
		base := iterations / workers
		rem := iterations % workers
		for w := 0; w < workers; w++ {
			n := base
			if w < rem {
				n++
			}
			if n <= 0 {
				continue
			}
			wg.Add(1)
			go func(n int) {
				defer wg.Done()
				local := 0
				for i := 0; i < n; i++ {
					local += countPrimes(limit)
				}
				mu.Lock()
				count += local
				mu.Unlock()
			}(n)
		}
		wg.Wait()
	}

	wallMs := round2(ms(time.Since(start)))
	throughput := round2(float64(iterations) / (wallMs / 1000))
	writeResult(Result{
		Lang:     "go",
		Scenario: "cpu",
		Params:   map[string]interface{}{"limit": limit, "iterations": iterations, "workers": workers},
		Metrics: map[string]interface{}{
			"wallMs":           wallMs,
			"iterationsPerSec": throughput,
			"primesCounted":    count,
		},
		Summary: fmt.Sprintf("[go][cpu] workers=%d iterations=%d limit=%d -> wall=%.2fms throughput=%.2f it/s",
			workers, iterations, limit, wallMs, throughput),
	}, out)
}
