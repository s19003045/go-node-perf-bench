"use strict";

// Pure CPU workload, identical algorithm to the Go side (go/cpu.go) for a fair
// comparison: count primes in [2, limit) by trial division. No library calls,
// just integer arithmetic, so we measure the language/runtime, not a native lib.

function isPrime(n) {
    if (n < 2) return false;
    if (n % 2 === 0) return n === 2;
    for (let i = 3; i * i <= n; i += 2) {
        if (n % i === 0) return false;
    }
    return true;
}

function countPrimes(limit) {
    let count = 0;
    for (let n = 2; n < limit; n++) {
        if (isPrime(n)) count++;
    }
    return count;
}

module.exports = { isPrime, countPrimes };
