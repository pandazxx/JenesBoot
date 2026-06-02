// Scenario: hello-world — verify the sim starts, runs 10 ticks,
// emits exactly one "hello" event on tick 1, and produces no unexpected
// event types during a passive (no-input) run.
//
// Seed: 42. Ticks: 10. No user inputs — purely passive observation.
// This is the smoke-test baseline. If this fails, no other scenario result
// is trustworthy.

import type { SimState } from "../../src/sim/index.js";
import { defineScenario } from "./types.js";

const ALLOWED_EVENT_TYPES = new Set(["hello"]);

export default defineScenario({
  id: "hello-world",
  title: "Smoke — runner emits hello on tick 1, 10-tick passive run",
  seed: 42,
  maxTicks: 10,
  script: [],
  expect: {
    atTick: [
      {
        tick: 1,
        label: "hello event emitted at tick 1",
        predicate: (s: SimState): boolean => s.log.some((e) => e.type === "hello" && e.tick === 1),
      },
    ],
    eventCounts: {
      hello: { exact: 1 },
    },
    finalState: (s: SimState): boolean => {
      const hasOnlyAllowed = s.log.every((e) => ALLOWED_EVENT_TYPES.has(e.type));
      return s.tick === 10 && hasOnlyAllowed && s.log.length > 0;
    },
  },
});
