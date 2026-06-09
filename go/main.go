package main

import (
	"flag"
	"fmt"
	"os"
	"runtime"
)

// CLI dispatcher: perfbench <cpu|io|heartbeat> [--flags]
// Flag names match the Node side so run.sh can pass identical arguments.
func main() {
	if len(os.Args) < 2 {
		fmt.Println("usage: perfbench <cpu|io|heartbeat> [--flags]")
		os.Exit(1)
	}
	cmd := os.Args[1]
	args := os.Args[2:]

	switch cmd {
	case "cpu":
		fs := flag.NewFlagSet("cpu", flag.ExitOnError)
		limit := fs.Int("limit", 1000000, "")
		iterations := fs.Int("iterations", 8, "")
		workers := fs.Int("workers", 1, "")
		out := fs.String("out", "", "")
		_ = fs.Parse(args)
		runCPU(*limit, *iterations, *workers, *out)
	case "io":
		fs := flag.NewFlagSet("io", flag.ExitOnError)
		requests := fs.Int("requests", 5000, "")
		concurrency := fs.Int("concurrency", 200, "")
		delay := fs.Int("delay", 20, "")
		port := fs.Int("port", 8201, "")
		out := fs.String("out", "", "")
		_ = fs.Parse(args)
		runIO(*requests, *concurrency, *delay, *port, *out)
	case "heartbeat":
		fs := flag.NewFlagSet("heartbeat", flag.ExitOnError)
		interval := fs.Int("interval", 50, "")
		duration := fs.Int("duration", 5000, "")
		taskLimit := fs.Int("taskLimit", 5000000, "")
		workers := fs.Int("workers", 0, "")
		out := fs.String("out", "", "")
		_ = fs.Parse(args)
		if *workers <= 0 {
			*workers = runtime.NumCPU()
		}
		runHeartbeat(*interval, *duration, *taskLimit, *workers, *out)
	default:
		fmt.Println("unknown scenario:", cmd)
		os.Exit(1)
	}
}
