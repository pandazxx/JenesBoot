# JenesBoot — Test Architecture

Three test layers. All run via `npm test` (`just test`).

---

## Layer 1 — Unit tests

**Location:** `src/sim/__tests__/`

Import `SimEngine` directly as a TypeScript module and assert on its public API. Fast, no subprocess, no build step. Cover determinism, tick counting, event structure, log immutability, and state snapshot isolation.

Add a unit test when a sim invariant can be verified without running a multi-tick scenario.

---

## Layer 2 — Scenario playthrough tests

**Location:** `tests/scenarios/`

Each `*.scenario.ts` file covers one named gameplay situation. Two formats co-exist in this codebase:

**Declarative (new, preferred):** A file exports a `Scenario` object as `default`. `tests/scenarios/scenario.test.ts` imports it, calls `runScenario()`, and emits one `describe` block per scenario with one `it()` per assertion. Per-assertion granularity flows into the JUnit XML consumed by PR #3.

**Legacy (describe-block style):** Older files (`destroyer-battle.scenario.ts`, `destroyer-dive.scenario.ts`, `gunboat-hunt.scenario.ts`) contain `describe` / `it` blocks directly. Vitest picks them up via the `tests/scenarios/**/*.scenario.ts` glob. These will be converted to the declarative format in later PRs.

Converted scenario files (`hello-world.scenario.ts`, `surface-battle.scenario.ts`) are excluded from the direct glob in `vitest.config.ts` because they have no describe blocks — `scenario.test.ts` runs them.

**Where player scenarios live:** `src/scenarios/player/*.ts` — player-facing starting positions exposed via the landing page Scenarios picker (PR #5). They use the `PlayerScenario` type, not `Scenario` — no script, no assertions.

---

## Layer 3 — Player scenarios

**Location:** `src/scenarios/player/`

Player scenarios are *starting positions for the human player*, not automated test runs. Think of them as chess puzzles: the board is set up, the player makes the moves. There is no script and no assertions — the player has full control after the scenario boots.

This is distinct from layer-2 scenario playthrough tests (`tests/scenarios/`), which pair a starting position with a scripted command sequence and assertions. Layer-2 files live in `tests/` and are never imported into the player bundle. Layer-3 files live in `src/scenarios/player/` and ship in the player bundle only.

**Authoring a player scenario:**
1. Pick a seed and, optionally, a `scenario` (combat preset) and `initial` overrides.
2. Write a one-sentence `description` (evocative, not technical — "A calm morning. A lone merchant on the horizon." beats "VesselType.MERCHANT hullHP=8").
3. No `script`, no `expect`, no goldens. That's the whole file.

```ts
export default definePlayerScenario({
  id: "calm-merchant",
  title: "Calm Merchant",
  description: "A calm morning. A lone merchant on the horizon. Sink it.",
  seed: 1,
  scenario: "surface_battle",
  initial: { playerDepth: DepthBand.SURFACE, enemyX: 450 },
});
```

**URL deep-link:** `?scenario=<id>` on the main game URL boots directly into the scenario, skipping the landing screen. Example: `/JenesBoot/?scenario=calm-merchant`. Share this link to let the user jump straight into a specific setup.

**Launching from the game:** the landing page exposes a "Scenarios" button that opens a picker listing all registered player scenarios. Selecting one starts the game from that setup. The regular "quick-start" combat buttons remain available and unchanged.

---

## The `Scenario` type

Defined in `tests/scenarios/types.ts`. Key fields:

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Stable slug; used in URLs and golden filenames (lowercase-kebab) |
| `title` | `string` | Human label for reports and the scenario picker |
| `seed` | `number` | Seeds `SimEngine`; same seed + same script = same outcome tick-for-tick |
| `scenario` | `CombatScenario?` | If set, calls `engine.startCombat(scenario)` before tick 1 |
| `initial` | `ScenarioInitial?` | State overrides applied after `startCombat()`, before tick 1 |
| `script` | `ScriptEntry[]` | Commands queued at specific ticks |
| `expect` | `ExpectClause` | Assertions evaluated during and after the run |
| `maxTicks` | `number?` | Safety ceiling; default 1000 |

`ScenarioInitial` fields: `playerDepth`, `playerSpeed`, `playerDirection`, `enemyX`, `enemyY`, `enemySpeed`, `enemyDirection`. Extend only when a scenario genuinely needs it.

`ExpectClause` fields:
- `atTick` — array of `{ tick, predicate, label }` evaluated immediately after that tick
- `finalState` — predicate over the terminal `SimState`
- `eventCounts` — per-event-type `{ min?, max?, exact? }` constraints on the full log
- `finalCombatResult` — asserts the `combat.result` field in the terminal state

---

## 6-step authoring procedure

### Step 1 — Set the scene

Pick seed, enemy, and initial overrides. The seed determines all RNG outcomes for the run; the same seed + same script produces the same result every time. Choose a seed before writing any assertions.

```ts
export default defineScenario({
  id: "fuel-exhausted",
  title: "Fuel runs out mid-escape",
  seed: 42,
  scenario: "gunboat_hunt",
  initial: { playerDepth: DepthBand.SHALLOW, enemyX: 600 },
  script: [],
  expect: {},
});
```

### Step 2 — Write the intent

State what the scenario is supposed to prove in plain terms before coding predicates. Example: "The player escapes when silent at LONG range for 20 ticks." Then translate each claim into an `ExpectClause` entry.

### Step 3 — Draft the script

Use the timing tables in `docs/design/battle-loop.md` to estimate when events should occur. Depth transitions take 6 ticks per band. Deck gun reloads in 12 ticks. Torpedo reloads in 30.

```ts
script: [
  { atTick: 1,  cmd: { type: "SET_SPEED", speed: SpeedSetting.AHEAD_FULL, direction: SpeedDirection.OPEN } },
  { atTick: 20, cmd: { type: "SET_DEPTH", target: DepthBand.SHALLOW } },
],
```

### Step 4 — Iterate headless

```
npx vitest tests/scenarios/foo.scenario.ts --watch
```

Read the event log from `result.log` in a failing assertion's `detail` field. Add `console.log(result.log)` temporarily in a failing predicate. Adjust tick numbers, commands, or assertions until green.

Do not adjust assertions to match broken behavior. If a predicate fails and the design doc says it should pass, the sim has a bug — file it separately.

### Step 5 — Visual sanity-check in the QA viewer

*After assertions are green.* PR #4 will implement the browser-side viewer at `dist/qa/index.html?scenario=<id>`. Use it to confirm the scenario plays out as intended visually. This step is optional for purely mechanical scenarios (resource exhaustion, detection math) and mandatory for any scenario with visible combat flow.

### Step 6 — Capture the golden

*Last step, only when the scenario is stable.* Run `UPDATE_GOLDENS=1 npm test` to write `tests/scenarios/<id>.golden.json`. Eyeball the generated file for sanity (no NaN, no undefined-as-null, event count looks right). Commit it. Subsequent runs diff against the golden; a divergence in the event log is an additional failing test. See the [Goldens](#goldens) section for details.

---

## Reading scenario failures

*Convergence in one iteration is a warning sign* — it usually means your assertions are too loose to enforce the scenario's narrative. A real story-driven scenario should take 3–10 iterations to settle.

When a scenario fails, `runScenario()` populates `assertionResults` with per-assertion `{ label, passed, detail }` entries. The Vitest output shows the `detail` string. Typical workflow:

1. Find the first failing assertion — assertions run in order.
2. Add a temporary `console.log(result.log)` to see the event stream up to that tick.
3. Find the tick where behavior diverges from the expected script.
4. Decide: wrong script timing, wrong assertion, or sim bug?

Common mistake: asserting on tick N when the relevant game event fires on tick N+1 (e.g., queuing a fire command on tick 10 but the shot doesn't resolve until tick 11).

---

## Split RNG streams

`docs/design/battle-loop.md §11` documents four named RNG streams: `combat.hit`, `combat.spread`, `combat.crew_panic`, `enemy.ai`. Each stream will be a separate sub-PRNG seeded from the run seed.

**Why this matters for scenarios:** when a balance change alters the hit-probability table, it should only shift `combat.hit` outputs — not cascade into crew panic checks or AI tie-breaking. Stream isolation means a golden for "destroyer closes gap" remains valid even after a weapon-damage tuning pass.

**Current state:** the sim uses a single `combatRng` for all combat randomness. Per-stream split is a planned sim-side change with its own PR. When that lands, re-seed scenarios using the new stream-aware API — do not hand-predict RNG values from the old merged stream.

---

## Goldens

A golden file (`tests/scenarios/<id>.golden.json`) records the full event log and a minimal state snapshot from a known-good run. Subsequent test runs diff against it. A divergence emits an additional failing test named `golden mismatch: see <id>.golden.json` with a short description of the first divergence.

**Goldens are opt-in.** Scenarios without a golden file pass on story assertions alone. Do not add goldens to existing scenarios unless you are specifically hardening them against regression.

**Golden format:**

```json
{
  "scenarioId": "merchant-hunt",
  "scenarioSeed": 42,
  "finalTick": 28,
  "finalCombatResult": "player_win",
  "finalState": {
    "playerHP": 15, "enemyHP": 0,
    "range": 1, "playerDepth": 0, "enemyDepth": 0,
    "playerSpeed": 2, "enemySpeed": 2
  },
  "eventLog": [ … full log … ]
}
```

**Writing or updating a golden:**

```
UPDATE_GOLDENS=1 npm test
```

When `UPDATE_GOLDENS=1`, the runner writes the golden file instead of comparing. After writing, eyeball the JSON — if `finalTick` or event counts look wrong, the scenario has a bug, not the golden. Only commit a golden you have actually inspected.

**Do not set `UPDATE_GOLDENS=1` during iteration.** The golden is a regression fence. Capturing it while the run is still being debugged locks in bugs instead of catching them.

---

## What NOT to do

- **No `Math.random()`.** Every source of randomness must flow through `SimEngine`'s seeded PRNG. A scenario with `Math.random()` is not reproducible.
- **No wall-clock reads.** `Date.now()`, `performance.now()`, `setTimeout` — none of these belong in a scenario or in the sim.
- **No hand-predicted RNG values.** Do not assert `rngState === 12345`. The RNG state is an implementation detail; assert on observable outcomes instead (events, HP, range).
- **No enabling `UPDATE_GOLDENS=1` during iteration.** Goldens are a regression fence, not a scratch pad.
- **No spawnSync.** The old scenario style spawned `dist-node/runner.js` as a child process. That pattern is retired. All new scenarios use `runScenario()` directly.

---

## Test report and replay links

After `just test` completes, `just report` (or `npm run report`) reads `test-results/junit.xml` and `test-results/scenario-results.json` and emits a self-contained `test-results/index.html`. In CI this runs automatically and the resulting directory is deployed to `pr-N/test-report/` on gh-pages; a link appears in the PR comment alongside the game preview and QA viewer URLs.

Every scenario row in the report carries a "Replay" link that targets the QA viewer at `../qa/?scenario=<id>`. When a scenario has a `firstFailingTick`, the link appends `&pauseAt=<tick>` so the viewer opens at the moment the assertion failed.

**QA viewer URL contract:**

- `qa/` — scenario picker; lists all registered scenarios as clickable links.
- `qa/?scenario=<id>` — loads the named scenario, runs it from tick 0, starts playing immediately.
- `qa/?scenario=<id>&pauseAt=<N>` — fast-forwards to tick N silently (no rendering during fast-forward), then renders once and starts paused. Use this form to inspect the exact tick a failing assertion fires.

The viewer is read-only. No keyboard or mouse input is accepted — the scenario's `script` array is the only source of commands. Scrubbing backward is not supported; reload the page to restart.

**When to use the QA viewer (step 5 of the 6-step authoring procedure):**

Open the viewer only after headless assertions are green. It is the visual sanity check that the scenario plays out as intended — confirming range transitions, visible combat flow, and crew placement look correct. Do not use it during iteration; the headless runner with `console.log(result.log)` is faster for debugging logic. The viewer is mandatory for any scenario with visible combat flow and optional for purely mechanical scenarios (resource exhaustion, detection math).

Local dev: `just dev` serves the QA viewer at `http://localhost:5173/JenesBoot/qa/` alongside the main game at `http://localhost:5173/JenesBoot/`.

---

## The headless binary (`just smoke`)

`src/headless/runner.ts` → `dist-node/runner.js` is still built and used by `just smoke` (CI "does the binary start" check) and for local `node dist-node/runner.js --seed 42 --ticks 10` debugging. It is not involved in scenario test execution. If you change `SimEngine`'s public API, update the runner to match.
