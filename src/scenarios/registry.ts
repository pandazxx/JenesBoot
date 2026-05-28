/**
 * Scenario registry — enumerates all *.scenario.ts files at build time via
 * import.meta.glob. Used by the QA viewer picker and playback viewer.
 *
 * Only imports the default export (the Scenario object). Legacy scenario files
 * that export describe/it blocks directly (no default export) are excluded.
 *
 * No PixiJS, no DOM, no Math.random(), no wall-clock reads.
 */

import type { Scenario } from "./types.js";

type ScenarioModule = { default?: Scenario };

const modules = import.meta.glob<ScenarioModule>("../../tests/scenarios/*.scenario.ts", {
  eager: true,
});

const allScenarios: Scenario[] = [];
const failedPaths: string[] = [];

for (const [path, mod] of Object.entries(modules)) {
  try {
    if (mod.default !== undefined) {
      allScenarios.push(mod.default);
    }
  } catch (err) {
    console.warn(`[scenario-registry] Failed to load scenario from ${path}:`, err);
    failedPaths.push(path);
  }
}

allScenarios.sort((a, b) => a.id.localeCompare(b.id));

export function getScenarios(): Scenario[] {
  return allScenarios;
}

export function getScenarioById(id: string): Scenario | undefined {
  return allScenarios.find((s) => s.id === id);
}

/** Returns paths of scenario modules that threw on import, for UI display. */
export function getFailedScenarioPaths(): readonly string[] {
  return failedPaths;
}
