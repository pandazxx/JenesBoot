import { describe, it, expect } from "vitest";
import { SimEngine } from "../index.js";

describe("SimEngine", () => {
  it("starts at tick 0", () => {
    const engine = new SimEngine(42);
    expect(engine.getState().tick).toBe(0);
  });

  it("increments tick on each call to tick()", () => {
    const engine = new SimEngine(42);
    engine.tick();
    engine.tick();
    expect(engine.getState().tick).toBe(2);
  });

  it("emits a hello event on tick 1", () => {
    const engine = new SimEngine(42);
    engine.tick();
    const state = engine.getState();
    expect(state.log).toHaveLength(1);
    expect(state.log[0]).toEqual({
      tick: 1,
      type: "hello",
      payload: { message: "sim running" },
    });
  });

  it("does not emit additional hello events on subsequent ticks", () => {
    const engine = new SimEngine(42);
    engine.tick();
    engine.tick();
    engine.tick();
    const helloEvents = engine.getState().log.filter((e) => e.type === "hello");
    expect(helloEvents).toHaveLength(1);
  });

  it("is deterministic: same seed produces same rngState after N ticks", () => {
    const runEngine = (seed: number, ticks: number): number => {
      const engine = new SimEngine(seed);
      for (let i = 0; i < ticks; i++) engine.tick();
      return engine.getState().rngState;
    };

    expect(runEngine(1337, 10)).toBe(runEngine(1337, 10));
    expect(runEngine(9999, 5)).toBe(runEngine(9999, 5));
  });

  it("different seeds produce different rngState", () => {
    const engineA = new SimEngine(1);
    engineA.tick();
    const stateA = engineA.getState().rngState;

    const engineB = new SimEngine(2);
    engineB.tick();
    const stateB = engineB.getState().rngState;

    expect(stateA).not.toBe(stateB);
  });

  it("getState returns a copy — mutating it does not affect engine", () => {
    const engine = new SimEngine(42);
    engine.tick();
    const state = engine.getState();
    state.log.push({ tick: 99, type: "injected", payload: null });
    expect(engine.getState().log).toHaveLength(1);
  });
});
