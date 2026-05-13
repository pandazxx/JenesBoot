// Scenario: surface-battle — verify the surface engagement plays out correctly.
//
// Player (20 HP, AHEAD_FULL CLOSE) engages a merchant (8 HP, STANDARD HOLD)
// starting at LONG range. Player should close range, enter deck-gun range,
// and destroy the merchant before tick 150.
//
// Seed: 42. Ticks: 150. Scenario: surface_battle.

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

interface SimEvent {
  tick: number;
  type: string;
  payload: unknown;
}

interface HeadlessOutput {
  seed: number;
  ticks: number;
  rngState: number;
  log: SimEvent[];
}

const SEED = 42;
const TICKS = 150;
const SCENARIO = "surface_battle";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const RUNNER_PATH = resolve(REPO_ROOT, "dist-node/runner.js");

function runHeadless(
  seed: number,
  ticks: number,
  scenario: string,
): { exitCode: number; stdout: string; stderr: string; parsed: HeadlessOutput | null } {
  if (!existsSync(RUNNER_PATH)) {
    throw new Error(
      `Headless runner not found at ${RUNNER_PATH}. ` +
        "Run `npm run headless:build` before executing scenarios.",
    );
  }

  const result = spawnSync(
    process.execPath,
    [
      RUNNER_PATH,
      "--seed",
      String(seed),
      "--ticks",
      String(ticks),
      "--scenario",
      scenario,
    ],
    {
      encoding: "utf-8",
      timeout: 30_000,
    },
  );

  const exitCode = result.status ?? 1;
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  let parsed: HeadlessOutput | null = null;
  try {
    parsed = JSON.parse(stdout) as HeadlessOutput;
  } catch {
    // surfaces as assertion failure below
  }

  return { exitCode, stdout, stderr, parsed };
}

let runResult: ReturnType<typeof runHeadless> | null = null;
let runError: string | null = null;

try {
  runResult = runHeadless(SEED, TICKS, SCENARIO);
} catch (err: unknown) {
  runError = err instanceof Error ? err.message : String(err);
}

describe(`surface-battle scenario — seed ${SEED}, ${TICKS} ticks`, () => {
  it("headless binary must be present and runnable", () => {
    if (runError !== null) {
      expect.fail(runError);
    }
    expect(runResult).not.toBeNull();
  });

  // 1. Exit code 0
  it("exits with code 0", () => {
    if (runResult === null) return;
    if (runResult.exitCode !== 0) {
      console.error("stderr:", runResult.stderr);
    }
    expect(runResult.exitCode).toBe(0);
  });

  // stdout valid JSON
  it("stdout is valid JSON", () => {
    if (runResult === null) return;
    expect(runResult.parsed).not.toBeNull();
  });

  // 2. combat_start event exists
  it("log contains a combat_start event", () => {
    if (runResult?.parsed === null || runResult?.parsed === undefined) return;
    const log = runResult.parsed.log;
    const events = log.filter((e) => e.type === "combat_start");
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  // 3. At least one range_change event
  it("log contains at least one range_change event (range closes)", () => {
    if (runResult?.parsed === null || runResult?.parsed === undefined) return;
    const log = runResult.parsed.log;
    const events = log.filter((e) => e.type === "range_change");
    if (events.length === 0) {
      console.error(
        "No range_change events found. Full log:",
        JSON.stringify(log, null, 2),
      );
    }
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  // 4. At least one shot_fired by player with weapon: deck_gun
  it("log contains at least one player deck_gun shot_fired event", () => {
    if (runResult?.parsed === null || runResult?.parsed === undefined) return;
    const log = runResult.parsed.log;
    const events = log.filter((e) => {
      if (e.type !== "shot_fired") return false;
      const p = e.payload as Record<string, unknown>;
      return p["by"] === "player" && p["weapon"] === "deck_gun";
    });
    if (events.length === 0) {
      console.error(
        "No player deck_gun shot_fired events found. Full log:",
        JSON.stringify(log, null, 2),
      );
    }
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  // 5. combat_end with result: player_win
  it("log contains a combat_end event with result: player_win", () => {
    if (runResult?.parsed === null || runResult?.parsed === undefined) return;
    const log = runResult.parsed.log;
    const events = log.filter((e) => {
      if (e.type !== "combat_end") return false;
      const p = e.payload as Record<string, unknown>;
      return p["result"] === "player_win";
    });
    if (events.length === 0) {
      console.error(
        "No player_win combat_end event found. Full log:",
        JSON.stringify(log, null, 2),
      );
    }
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  // 6. combat_end tick <= 150
  it("combat_end occurs at or before tick 150", () => {
    if (runResult?.parsed === null || runResult?.parsed === undefined) return;
    const log = runResult.parsed.log;
    const endEvent = log.find((e) => e.type === "combat_end");
    if (endEvent === undefined) {
      expect.fail("No combat_end event found in log");
    }
    const p = endEvent.payload as Record<string, unknown>;
    const atTick = p["atTick"] as number;
    expect(atTick).toBeLessThanOrEqual(150);
  });

  // 7. No combat_end with result: player_lose
  it("log does not contain a player_lose combat_end event", () => {
    if (runResult?.parsed === null || runResult?.parsed === undefined) return;
    const log = runResult.parsed.log;
    const events = log.filter((e) => {
      if (e.type !== "combat_end") return false;
      const p = e.payload as Record<string, unknown>;
      return p["result"] === "player_lose";
    });
    expect(events).toHaveLength(0);
  });
});
