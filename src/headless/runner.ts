/**
 * Headless runner — Node CLI entry.
 *
 * Usage:
 *   node dist-node/runner.js --seed <n> --ticks <n> [--enemy <type>]
 *
 * Runs the SimEngine for the requested number of ticks and prints the full
 * event log as JSON to stdout, then exits 0.
 *
 * This file must never import anything from src/render/ or from PixiJS.
 */

import { SimEngine } from "../sim/index.js";
import { VesselType } from "../sim/combat/enums.js";
import { DiveSpeed } from "../sim/combat/enums.js";

function parseArgs(argv: string[]): {
  seed: number;
  ticks: number;
  enemy: string | null;
} {
  const args = argv.slice(2);
  let seed = 0;
  let ticks = 10;
  let enemy: string | null = null;

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
    } else if (args[i] === "--enemy" && args[i + 1] !== undefined) {
      enemy = args[i + 1] as string;
      i++;
    } else if (args[i] === "--scenario" && args[i + 1] !== undefined) {
      // backward-compat alias
      enemy = args[i + 1] as string;
      i++;
    }
  }

  return { seed, ticks, enemy };
}

function resolveEnemyType(enemyArg: string | null): VesselType | null {
  if (enemyArg === null) return null;
  const upper = enemyArg.toUpperCase();
  if (upper === "DESTROYER" || upper === "DESTROYER_BATTLE" || upper === "DESTROYER_DIVE") {
    return VesselType.DESTROYER;
  }
  if (upper === "MERCHANT" || upper === "SURFACE_BATTLE") {
    return VesselType.MERCHANT;
  }
  if (upper === "GUNBOAT" || upper === "GUNBOAT_HUNT") {
    return VesselType.GUNBOAT;
  }
  if (upper === "SUBMARINE" || upper === "SUBMERGED_AMBUSH") {
    return VesselType.SUBMARINE;
  }
  return null;
}

function main(): void {
  const { seed, ticks, enemy } = parseArgs(process.argv);

  const engine = new SimEngine(seed);

  const enemyType = resolveEnemyType(enemy);
  if (enemyType !== null) {
    engine.startCombat(enemyType);
    engine.queueCommand({ type: "SET_DEPTH", target: 1, diveSpeed: DiveSpeed.STANDARD });
  } else if (enemy !== null) {
    console.error(`Unknown enemy type: ${enemy}`);
    process.exit(1);
  }

  for (let i = 0; i < ticks; i++) {
    engine.tick();
  }

  const state = engine.getState();

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
