package main

import (
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

// I/O-bound benchmark: a local HTTP server that responds after `delayMs` of pure
// wait (time.Sleep, no CPU), and a client firing `requests` total with a pool of
// `concurrency` goroutines. Go uses goroutines for concurrency; Node uses its
// event loop. Both should handle this well -- I/O is not where Node loses.
func runIO(requests, concurrency, delayMs, port int, out string) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(time.Duration(delayMs) * time.Millisecond)
		w.WriteHeader(200)
		_, _ = w.Write([]byte("ok"))
	})
	srv := &http.Server{Addr: fmt.Sprintf("127.0.0.1:%d", port), Handler: mux}
	go func() { _ = srv.ListenAndServe() }()
	time.Sleep(150 * time.Millisecond) // let the server come up

	client := &http.Client{
		Transport: &http.Transport{
			MaxIdleConns:        concurrency + 10,
			MaxIdleConnsPerHost: concurrency + 10,
			MaxConnsPerHost:     concurrency + 10,
		},
	}
	url := fmt.Sprintf("http://127.0.0.1:%d/", port)

	jobs := make(chan int, requests)
	for i := 0; i < requests; i++ {
		jobs <- i
	}
	close(jobs)

	latencies := make([]float64, 0, requests)
	var mu sync.Mutex
	var wg sync.WaitGroup
	start := time.Now()

	for c := 0; c < concurrency; c++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range jobs {
				t0 := time.Now()
				resp, err := client.Get(url)
				if err == nil {
					_, _ = io.Copy(io.Discard, resp.Body)
					_ = resp.Body.Close()
				}
				d := ms(time.Since(t0))
				mu.Lock()
				latencies = append(latencies, d)
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	wallMs := round2(ms(time.Since(start)))
	_ = srv.Close()
	s := computeStats(latencies)
	throughput := round2(float64(requests) / (wallMs / 1000))
	writeResult(Result{
		Lang:     "go",
		Scenario: "io",
		Params:   map[string]interface{}{"requests": requests, "concurrency": concurrency, "delayMs": delayMs},
		Metrics: map[string]interface{}{
			"wallMs":         wallMs,
			"requestsPerSec": throughput,
			"latencyMeanMs":  s.Mean,
			"latencyP99Ms":   s.P99,
			"latencyMaxMs":   s.Max,
		},
		Summary: fmt.Sprintf("[go][io] requests=%d concurrency=%d delay=%dms -> wall=%.2fms throughput=%.2f req/s p99=%.2fms",
			requests, concurrency, delayMs, wallMs, throughput, s.P99),
	}, out)
}
