/**
 * localStorage persistence for SimConfig — render layer only.
 * Never import from src/sim/.
 */

import { defaultSimConfig } from "../sim/combat/config.js";
import type { SimConfig } from "../sim/combat/config.js";

const LS_KEY = "jenesboot-sim-config";

export function loadSimConfig(): SimConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultSimConfig();
    return { ...defaultSimConfig(), ...(JSON.parse(raw) as Partial<SimConfig>) };
  } catch {
    return defaultSimConfig();
  }
}

export function saveSimConfig(config: SimConfig): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(config));
  } catch {
    // ignore — storage may be unavailable
  }
}

export function resetSimConfig(): SimConfig {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
  return defaultSimConfig();
}
