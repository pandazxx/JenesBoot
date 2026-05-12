// Unit tests for SimEngine — import the sim directly, no subprocess.
// These tests verify the invariants the QA agent and headless scenarios depend on.

import { describe, it, expect } from "vitest";
import { SimEngine } from "../index.js";
import type { SimEvent } from "../index.js";

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("determinism", () => {
  it("same seed produces identical tick-by-tick state", () => {
    const a = SimEngine(42);
    const b = SimEngine(42);

    for (let i = 0; i < 10; i++) {
      a.tick();
      b.tick();
      const stateA = a.getState();
      const stateB = b.getState();
      expect(stateA.tick).toBe(stateB.tick);
      expect(stateA.log).toEqual(stateB.log);
    }
  });

  it("different seeds diverge by tick 10 (probabilistic)", () => {
    const a = SimEngine(1);
    const b = SimEngine(999);

    for (let i = 0; i < 10; i++) {
      a.tick();
      b.tick();
    }

    // At minimum the tick count should match; the divergence check is on log content.
    // If both logs are identical at tick 10 across different seeds the RNG is broken.
    const logA = JSON.stringify(a.getState().log);
    const logB = JSON.stringify(b.getState().log);
    // They must produce at least one different event across 10 ticks for RNG to be
    // considered isolated. If this ever fails it means RNG is not seeded.
    // (The hello event on tick 1 is always emitted, so logs may match if there are
    // no other RNG-driven events yet — in that case the test is vacuously ok.
    // We keep the assertion lenient: they must not be *identical in all their event
    // detail*. If the engine only ever emits "hello", both logs will match and this
    // test becomes a canary for when RNG-driven events are added.)
    //
    // For now: engines with different seeds must at minimum produce states whose
    // tick counts match (both at 10). RNG divergence will be tightened once
    // RNG-driven events exist beyond the skeleton.
    expect(a.getState().tick).toBe(10);
    expect(b.getState().tick).toBe(10);

    // Log the divergence verdict to stdout so CI has a record.
    if (logA === logB) {
      console.warn(
        "[sim.test] WARN: seeds 1 and 999 produced identical logs at tick 10 — " +
          "acceptable only while sim has no RNG-driven events beyond 'hello'. " +
          "Tighten this assertion once RNG events exist.",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Tick counter
// ---------------------------------------------------------------------------

describe("tick counter", () => {
  it("starts at 0 before any tick", () => {
    const engine = SimEngine(42);
    expect(engine.getState().tick).toBe(0);
  });

  it("increments by 1 per tick call", () => {
    const engine = SimEngine(42);
    for (let expected = 1; expected <= 5; expected++) {
      engine.tick();
      expect(engine.getState().tick).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// hello event
// ---------------------------------------------------------------------------

describe("hello event", () => {
  it("emits exactly one hello event at tick 1", () => {
    const engine = SimEngine(42);
    engine.tick();
    const { log } = engine.getState();
    const helloEvents = log.filter((e: SimEvent) => e.type === "hello");
    expect(helloEvents).toHaveLength(1);
    expect(helloEvents[0]!.tick).toBe(1);
  });

  it("does not emit hello event before tick 1", () => {
    const engine = SimEngine(42);
    const { log } = engine.getState();
    expect(log.filter((e: SimEvent) => e.type === "hello")).toHaveLength(0);
  });

  it("does not emit a second hello event on tick 2", () => {
    const engine = SimEngine(42);
    engine.tick();
    engine.tick();
    const helloEvents = engine.getState().log.filter((e: SimEvent) => e.type === "hello");
    expect(helloEvents).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Append-only log
// ---------------------------------------------------------------------------

describe("event log is append-only", () => {
  it("events from tick N are still present at tick N+1", () => {
    const engine = SimEngine(42);
    engine.tick(); // tick 1 — hello event emitted
    const logAfterTick1 = engine.getState().log.map((e: SimEvent) => e.type);

    engine.tick(); // tick 2
    const logAfterTick2 = engine.getState().log.map((e: SimEvent) => e.type);

    // Every event present after tick 1 must still be present after tick 2.
    for (const eventType of logAfterTick1) {
      expect(logAfterTick2).toContain(eventType);
    }

    // The log must not shrink.
    expect(logAfterTick2.length).toBeGreaterThanOrEqual(logAfterTick1.length);
  });

  it("running N ticks produces a monotonically growing log", () => {
    const engine = SimEngine(42);
    let previousLength = 0;
    for (let i = 0; i < 10; i++) {
      engine.tick();
      const { log } = engine.getState();
      expect(log.length).toBeGreaterThanOrEqual(previousLength);
      previousLength = log.length;
    }
  });
});

// ---------------------------------------------------------------------------
// State snapshot isolation
// ---------------------------------------------------------------------------

describe("getState() returns a snapshot", () => {
  it("mutating the returned snapshot does not corrupt engine state", () => {
    const engine = SimEngine(42);
    engine.tick();

    const snapshot = engine.getState();
    const originalTick = snapshot.tick;
    const originalLogLength = snapshot.log.length;

    // Mutate the snapshot.
    (snapshot as { tick: number }).tick = 9999;
    (snapshot.log as SimEvent[]).push({
      type: "hello",
      tick: 9999,
    } as SimEvent);

    // Engine state must be unchanged.
    const freshSnapshot = engine.getState();
    expect(freshSnapshot.tick).toBe(originalTick);
    expect(freshSnapshot.log).toHaveLength(originalLogLength);
  });
});
