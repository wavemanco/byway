// Busy loop for N seconds (CPU contention for the load runs), as D4's checker ran it.
const end = Date.now() + Number(process.argv[2]) * 1000; let x = 0; while (Date.now() < end) { x = (x * 31 + 7) % 1000003; }
