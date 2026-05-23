/**
 * localStorage persistence for CombatConfig — render layer only.
 * Never import from src/sim/.
 */

import { defaultCombatConfig } from "../sim/combat/config.js";
import type { CombatConfig } from "../sim/combat/config.js";

const LS_KEY = "jenesboot-combat-config";

export function loadSimConfig(): CombatConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultCombatConfig();
    return defaultCombatConfig();
  } catch {
    return defaultCombatConfig();
  }
}

export function saveSimConfig(_config: CombatConfig): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(_config));
  } catch {
    // ignore — storage may be unavailable
  }
}

export function resetSimConfig(): CombatConfig {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
  return defaultCombatConfig();
}
