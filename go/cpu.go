package main

// Pure CPU workload, identical algorithm to the Node side (node/src/lib/cpu.js):
// count primes in [2, limit) by trial division. Integer arithmetic only.

func isPrime(n int) bool {
	if n < 2 {
		return false
	}
	if n%2 == 0 {
		return n == 2
	}
	for i := 3; i*i <= n; i += 2 {
		if n%i == 0 {
			return false
		}
	}
	return true
}

func countPrimes(limit int) int {
	count := 0
	for n := 2; n < limit; n++ {
		if isPrime(n) {
			count++
		}
	}
	return count
}
