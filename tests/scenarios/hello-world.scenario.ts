// Scenario: hello-world — verify the headless runner starts, runs 10 ticks,
// emits exactly one "hello" event on tick 1, and exits cleanly.
//
// This is the smoke-test baseline. If this scenario fails, the headless binary
// is broken and no other scenario results are trustworthy.
//
// Seed: 42. Ticks: 10. No user inputs — purely passive observation.

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Types that mirror the headless runner's JSON output contract.
//
// The runner (src/headless/runner.ts) writes:
//   { seed: number; ticks: number; rngState: number; log: SimEvent[] }
//
// We redeclare this here rather than importing from src/ so that this file
// remains a pure black-box test: it drives the binary, not the source.
// ---------------------------------------------------------------------------

interface SimEvent {
  tick: number;
  type: string;
  payload: unknown;
}

interface HeadlessOutput {
  seed: number;
  ticks: number;       // equals state.tick — how many ticks elapsed
  rngState: number;
  log: SimEvent[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEED = 42;
const TICKS = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const RUNNER_PATH = resolve(REPO_ROOT, "dist-node/runner.js");

/**
 * Run the headless binary synchronously and return structured results.
 * Throws with a descriptive message if the binary cannot be found — that
 * means feature/skeleton has not been built yet.
 */
function runHeadless(
  seed: number,
  ticks: number,
): { exitCode: number; stdout: string; stderr: string; parsed: HeadlessOutput | null } {
  if (!existsSync(RUNNER_PATH)) {
    throw new Error(
      `Headless runner not found at ${RUNNER_PATH}. ` +
        "Run `npm run headless:build` before executing scenarios. " +
        "This scenario depends on feature/skeleton being merged and built.",
    );
  }

  const result = spawnSync(
    process.execPath, // current node binary
    [RUNNER_PATH, "--seed", String(seed), "--ticks", String(ticks)],
    {
      encoding: "utf-8",
      timeout: 30_000, // 30 s hard limit — headless runs must be fast
    },
  );

  const exitCode = result.status ?? 1;
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  let parsed: HeadlessOutput | null = null;
  try {
    parsed = JSON.parse(stdout) as HeadlessOutput;
  } catch {
    // Parsing failure surfaces as a test assertion below.
  }

  return { exitCode, stdout, stderr, parsed };
}

/**
 * Format a structured failure message for easy reading in CI output and
 * for copy-paste into a bug report.
 */
function failureReport(label: string, expected: unknown, actual: unknown): string {
  return (
    `[hello-world scenario | seed=${SEED} ticks=${TICKS}] ASSERTION FAILED: ${label}\n` +
    `  expected : ${JSON.stringify(expected)}\n` +
    `  actual   : ${JSON.stringify(actual)}`
  );
}

// ---------------------------------------------------------------------------
// Run the binary once. Vitest collects test cases at import time; spawnSync
// is synchronous so all assertions share the same run result without async
// coordination.
// ---------------------------------------------------------------------------

let runResult: ReturnType<typeof runHeadless> | null = null;
let runError: string | null = null;

try {
  runResult = runHeadless(SEED, TICKS);
} catch (err: unknown) {
  runError = err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Scenario assertions
// ---------------------------------------------------------------------------

describe(`hello-world scenario — headless runner, seed ${SEED}, ${TICKS} ticks`, () => {
  // Guard: if the binary was missing, all remaining tests fail with the reason.
  it("headless binary must be present and runnable", () => {
    if (runError !== null) {
      expect.fail(runError);
    }
    expect(runResult).not.toBeNull();
  });

  // 1. Exit code must be 0.
  it("exits with code 0", () => {
    if (runResult === null) return; // guarded above
    if (runResult.exitCode !== 0) {
      console.error(
        failureReport("exit code", 0, runResult.exitCode),
        "\nstderr:", runResult.stderr,
      );
    }
    expect(runResult.exitCode).toBe(0);
  });

  // 2. stdout must be valid JSON.
  it("stdout is valid JSON", () => {
    if (runResult === null) return;
    if (runResult.parsed === null) {
      console.error(
        failureReport(
          "stdout parse",
          "<valid JSON>",
          runResult.stdout.slice(0, 300),
        ),
      );
    }
    expect(runResult.parsed).not.toBeNull();
  });

  // 3. Final tick count in output equals requested TICKS.
  //    The runner key is "ticks" (mapped from state.tick by the runner).
  it(`"ticks" field in output equals ${TICKS}`, () => {
    if (runResult?.parsed === null || runResult?.parsed === undefined) return;
    const actual = runResult.parsed.ticks;
    if (actual !== TICKS) {
      console.error(failureReport("ticks", TICKS, actual));
    }
    expect(actual).toBe(TICKS);
  });

  // 4. Exactly one "hello" event, and it must be at tick 1.
  it('log contains exactly one "hello" event at tick 1', () => {
    if (runResult?.parsed === null || runResult?.parsed === undefined) return;
    const log = runResult.parsed.log;
    const helloEvents = log.filter((e) => e.type === "hello");

    if (helloEvents.length !== 1) {
      console.error(
        failureReport("hello event count", 1, helloEvents.length),
        "\nfull log:", JSON.stringify(log, null, 2),
      );
    }
    expect(helloEvents).toHaveLength(1);

    const helloTick = helloEvents[0]?.tick;
    if (helloTick !== 1) {
      console.error(
        failureReport("hello event tick", 1, helloTick),
        "\nevent:", JSON.stringify(helloEvents[0]),
      );
    }
    expect(helloTick).toBe(1);
  });

  // 5. No unexpected event types.
  //    The skeleton defines only "hello". When new event types are added to the
  //    sim, extend ALLOWED_EVENT_TYPES here and add a dedicated scenario for
  //    the new event.
  it("log contains only expected event types", () => {
    if (runResult?.parsed === null || runResult?.parsed === undefined) return;
    const ALLOWED_EVENT_TYPES = new Set(["hello"]);
    const log = runResult.parsed.log;
    const unexpected = log.filter((e) => !ALLOWED_EVENT_TYPES.has(e.type));

    if (unexpected.length > 0) {
      console.error(
        failureReport(
          "unexpected event types",
          [...ALLOWED_EVENT_TYPES],
          unexpected.map((e) => e.type),
        ),
        "\nUnexpected events:\n",
        JSON.stringify(unexpected, null, 2),
        "\nTo register a new event type, update ALLOWED_EVENT_TYPES in",
        "tests/scenarios/hello-world.scenario.ts and add a dedicated scenario.",
      );
    }
    expect(unexpected).toHaveLength(0);
  });

  // 6. Log is non-empty — sanity guard that the runner actually ran ticks.
  it("log is non-empty (runner executed at least one tick)", () => {
    if (runResult?.parsed === null || runResult?.parsed === undefined) return;
    expect(runResult.parsed.log.length).toBeGreaterThan(0);
  });

  // 7. seed field echoed back correctly.
  it("output echoes the requested seed", () => {
    if (runResult?.parsed === null || runResult?.parsed === undefined) return;
    expect(runResult.parsed.seed).toBe(SEED);
  });
});
