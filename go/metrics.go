package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"time"
)

// ms converts a duration to milliseconds with 0.01ms precision.
func ms(d time.Duration) float64 {
	return float64(d.Microseconds()) / 1000.0
}

func round2(f float64) float64 {
	return float64(int64(f*100+0.5)) / 100
}

type Stats struct {
	Count int     `json:"count"`
	Min   float64 `json:"min"`
	Mean  float64 `json:"mean"`
	P50   float64 `json:"p50"`
	P90   float64 `json:"p90"`
	P99   float64 `json:"p99"`
	Max   float64 `json:"max"`
}

func percentile(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	idx := int(p/100*float64(len(sorted))+0.9999) - 1
	if idx < 0 {
		idx = 0
	}
	if idx >= len(sorted) {
		idx = len(sorted) - 1
	}
	return sorted[idx]
}

func computeStats(samples []float64) Stats {
	if len(samples) == 0 {
		return Stats{}
	}
	s := make([]float64, len(samples))
	copy(s, samples)
	sort.Float64s(s)
	sum := 0.0
	for _, v := range s {
		sum += v
	}
	return Stats{
		Count: len(s),
		Min:   round2(s[0]),
		Mean:  round2(sum / float64(len(s))),
		P50:   round2(percentile(s, 50)),
		P90:   round2(percentile(s, 90)),
		P99:   round2(percentile(s, 99)),
		Max:   round2(s[len(s)-1]),
	}
}

type Result struct {
	Lang     string                 `json:"lang"`
	Scenario string                 `json:"scenario"`
	Params   map[string]interface{} `json:"params"`
	Metrics  map[string]interface{} `json:"metrics"`
	Summary  string                 `json:"summary"`
}

// writeResult mirrors the Node side: human summary + RESULT_JSON line + optional file.
func writeResult(r Result, out string) {
	b, _ := json.Marshal(r)
	if out != "" {
		pretty, _ := json.MarshalIndent(r, "", "  ")
		_ = os.WriteFile(out, pretty, 0644)
	}
	fmt.Println(r.Summary)
	fmt.Println("RESULT_JSON=" + string(b))
}
