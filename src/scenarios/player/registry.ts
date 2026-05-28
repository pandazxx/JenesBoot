/**
 * Player-scenario registry — enumerates all *.ts files in this directory at
 * build time via import.meta.glob. Used by the landing page Scenarios picker.
 *
 * Intentionally separate from src/scenarios/registry.ts (which serves the QA
 * viewer). Test scenarios in tests/scenarios/ are never imported here.
 *
 * No PixiJS, no DOM, no Math.random(), no wall-clock reads.
 */

import type { PlayerScenario } from "../types.js";

type PlayerScenarioModule = { default?: PlayerScenario };

const modules = import.meta.glob<PlayerScenarioModule>("./*.ts", { eager: true });

const allPlayerScenarios: PlayerScenario[] = [];
const failedPaths: string[] = [];

for (const [path, mod] of Object.entries(modules)) {
  try {
    if (mod.default !== undefined) {
      allPlayerScenarios.push(mod.default);
    }
  } catch (err) {
    console.warn(`[player-scenario-registry] Failed to load scenario from ${path}:`, err);
    failedPaths.push(path);
  }
}

allPlayerScenarios.sort((a, b) => a.id.localeCompare(b.id));

export function getPlayerScenarios(): PlayerScenario[] {
  return allPlayerScenarios;
}

export function getPlayerScenarioById(id: string): PlayerScenario | undefined {
  return allPlayerScenarios.find((s) => s.id === id);
}

/** Returns paths of player scenario modules that threw on import, for UI display. */
export function getFailedPlayerScenarioPaths(): readonly string[] {
  return failedPaths;
}
