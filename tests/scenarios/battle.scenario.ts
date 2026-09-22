// Scenario: battle — exercises the new combat system with a Destroyer enemy.
//
// Seed: 42. Ticks: 300 (enough for destroyer to close from LONG to CONTACT_RANGE).
//
// Assertions:
//   1. Headless binary runs and exits 0.
//   2. range_change events are emitted as destroyer closes.
//   3. combat_end event is eventually emitted (player_win, player_lose, or escaped).
//   4. Determinism: two runs with seed 42 produce identical log lengths and final rngState.

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
const TICKS = 300;

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const RUNNER_PATH = resolve(REPO_ROOT, "dist-node/runner.js");

function runHeadless(
  seed: number,
  ticks: number,
  enemy: string,
): { exitCode: number; stdout: string; stderr: string; parsed: HeadlessOutput | null } {
  if (!existsSync(RUNNER_PATH)) {
    throw new Error(
      `Headless runner not found at ${RUNNER_PATH}. Run \`npm run headless:build\` first.`,
    );
  }

  const result = spawnSync(
    process.execPath,
    [RUNNER_PATH, "--seed", String(seed), "--ticks", String(ticks), "--enemy", enemy],
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
    // parse failure is a test assertion below
  }

  return { exitCode, stdout, stderr, parsed };
}

let runResult: ReturnType<typeof runHeadless> | null = null;
let runResult2: ReturnType<typeof runHeadless> | null = null;
let runError: string | null = null;

try {
  runResult = runHeadless(SEED, TICKS, "DESTROYER");
  runResult2 = runHeadless(SEED, TICKS, "DESTROYER");
} catch (err: unknown) {
  runError = err instanceof Error ? err.message : String(err);
}

describe(`battle scenario — destroyer, seed ${SEED}, ${TICKS} ticks`, () => {
  it("headless binary must be present", () => {
    if (runError !== null) expect.fail(runError);
    expect(runResult).not.toBeNull();
  });

  it("exits with code 0", () => {
    if (runResult === null) return;
    if (runResult.exitCode !== 0) {
      console.error("stderr:", runResult.stderr);
    }
    expect(runResult.exitCode).toBe(0);
  });

  it("stdout is valid JSON", () => {
    if (runResult === null) return;
    expect(runResult.parsed).not.toBeNull();
  });

  it("ticks field equals requested ticks", () => {
    if (runResult?.parsed == null) return;
    expect(runResult.parsed.ticks).toBe(TICKS);
  });

  it("log contains at least one range_change event", () => {
    if (runResult?.parsed == null) return;
    const rangeChanges = runResult.parsed.log.filter((e) => e.type === "range_change");
    expect(rangeChanges.length).toBeGreaterThan(0);
  });

  it("log contains a combat_start event", () => {
    if (runResult?.parsed == null) return;
    const starts = runResult.parsed.log.filter((e) => e.type === "combat_start");
    expect(starts.length).toBe(1);
  });

  it("log contains a combat_end event within 300 ticks", () => {
    if (runResult?.parsed == null) return;
    const ends = runResult.parsed.log.filter((e) => e.type === "combat_end");
    expect(ends.length).toBeGreaterThanOrEqual(1);
  });

  it("determinism: two runs with seed 42 produce identical log lengths", () => {
    if (runResult?.parsed == null || runResult2?.parsed == null) return;
    expect(runResult.parsed.log.length).toBe(runResult2.parsed.log.length);
  });

  it("determinism: two runs with seed 42 produce identical rngState", () => {
    if (runResult?.parsed == null || runResult2?.parsed == null) return;
    expect(runResult.parsed.rngState).toBe(runResult2.parsed.rngState);
  });
});
