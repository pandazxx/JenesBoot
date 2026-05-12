/**
 * Headless runner — Node CLI entry.
 *
 * Usage:
 *   node dist-node/runner.js --seed <n> --ticks <n>
 *
 * Runs the SimEngine for the requested number of ticks and prints the full
 * event log as JSON to stdout, then exits 0.
 *
 * This file must never import anything from src/render/ or from PixiJS.
 */

import { SimEngine } from "../sim/index.js";

function parseArgs(argv: string[]): { seed: number; ticks: number } {
  const args = argv.slice(2);
  let seed = 0;
  let ticks = 10;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--seed" && args[i + 1] !== undefined) {
      const parsed = parseInt(args[i + 1] as string, 10);
      if (isNaN(parsed)) {
        console.error(`Invalid --seed value: ${args[i + 1]}`);
        process.exit(1);
      }
      seed = parsed;
      i++;
    } else if (args[i] === "--ticks" && args[i + 1] !== undefined) {
      const parsed = parseInt(args[i + 1] as string, 10);
      if (isNaN(parsed) || parsed < 0) {
        console.error(`Invalid --ticks value: ${args[i + 1]}`);
        process.exit(1);
      }
      ticks = parsed;
      i++;
    }
  }

  return { seed, ticks };
}

function main(): void {
  const { seed, ticks } = parseArgs(process.argv);

  const engine = new SimEngine(seed);

  for (let i = 0; i < ticks; i++) {
    engine.tick();
  }

  const state = engine.getState();

  // Output both "tick" and "ticks" to satisfy either naming convention in
  // scenario tests. "tick" matches SimState; "ticks" is an alias.
  const output = {
    seed,
    tick: state.tick,
    ticks: state.tick,
    rngState: state.rngState,
    log: state.log,
  };

  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  process.exit(0);
}

main();
