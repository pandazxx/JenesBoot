# JenesBoot — Test Architecture

Two layers. Both run via `npm test`.

**Layer 1 — Unit tests** (`src/sim/__tests__/`): import `SimEngine` directly as a TypeScript module and assert on its public API. Fast, no subprocess. Cover determinism, tick counting, event structure, log immutability, and state snapshot isolation. Add a unit test whenever a sim invariant can be checked without the full headless binary.

**Layer 2 — Scenario tests** (`tests/scenarios/`): spawn the compiled headless binary (`dist-node/runner.js`) as a child process, capture its JSON stdout, and assert on the structured event log. Each scenario file names one scripted gameplay situation (e.g. `hello-world`, `fire-extinguished`, `fuel-exhausted-mid-jump`). Scenarios are deterministic: seed, tick count, and any inputs are explicit in the file. Never introduce `Math.random()`, wall-clock reads, or interactive prompts in a scenario.

**Before running scenario tests** build the headless binary: `npm run headless:build`. CI does this automatically before `npm test`.

**Adding a new scenario**: create `tests/scenarios/<name>.scenario.ts`, state the intent in the first comment line, run the binary via `spawnSync`, and assert against the JSON output. Update `ALLOWED_EVENT_TYPES` in `hello-world.scenario.ts` (or the relevant scenario) when new event types are added to the sim.
