/**
 * Headless runner — Node CLI entry.
 *
 * Usage:
 *   node dist-node/runner.js --seed <n> --ticks <n> [--scenario <name>]
 *
 * Runs the SimEngine for the requested number of ticks and prints the full
 * event log as JSON to stdout, then exits 0.
 *
 * This file must never import anything from src/render/ or from PixiJS.
 */

import { SimEngine } from "../sim/index.js";

function parseArgs(argv: string[]): {
  seed: number;
  ticks: number;
  scenario: string | null;
} {
  const args = argv.slice(2);
  let seed = 0;
  let ticks = 10;
  let scenario: string | null = null;

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
    } else if (args[i] === "--scenario" && args[i + 1] !== undefined) {
      scenario = args[i + 1] as string;
      i++;
    }
  }

  return { seed, ticks, scenario };
}

function main(): void {
  const { seed, ticks, scenario } = parseArgs(process.argv);

  const engine = new SimEngine(seed);

  if (scenario === "surface_battle") {
    engine.startCombat("surface_battle");
    engine.queueCommand({ type: "ASSIGN_CREW", crewId: "mate", roomId: "deck_gun" });
  } else if (scenario === "destroyer_dive") {
    engine.startCombat("destroyer_dive");
    // Pre-assign engineer to torpedo room and order dive so combat resolves headlessly.
    engine.queueCommand({ type: "SET_DEPTH", target: 1 }); // DepthBand.PERISCOPE = 1
    engine.queueCommand({ type: "ASSIGN_CREW", crewId: "engineer", roomId: "torpedo" });
  } else if (scenario !== null) {
    console.error(`Unknown scenario: ${scenario}`);
    process.exit(1);
  }

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
