# Story-Driven Development Workflow

**Status:** adopted. This is the standard path for every gameplay feature from v1 onward. Process-only doc — the test machinery it rides on is documented in `tests/README.md`.

## Why

The user cannot watch the agent code. The two surfaces where the user actually steers the game are (1) the conversation and (2) reviewable artifacts on GitHub. This workflow makes both count: gameplay is designed as *stories* the user co-authors, stories become *executable scenarios*, and implementation is done when the scenarios pass and the user can watch the playthrough in a browser.

```
[1 Brainstorm] → [2 Stories] → [3 Scenarios (red)] → [4 Dev loop (to green)] → [5 Playthrough verify]
   chat            docs PR         feature branch        same branch               PR preview links
   user+designer   user merges     gameplay-qa           gameplay-engineer         user approves
```

## Stage 1 — Brainstorm

User and orchestrator discuss a gameplay idea in chat, with `game-designer` advising on fit, scope, and tone. Freeform. Output: a pitch — one paragraph on what the player should experience. No repo artifact required; the pitch goes into the story PR description.

## Stage 2 — Stories

`game-designer` turns the pitch into one or more **story files** in `docs/stories/` (format and detail bar: `docs/stories/README.md`). Each story is a concrete playthrough of one gameplay situation: fixed setup, numbered beats, and acceptance criteria that are already phrased as assertions.

Stories go to `master` in a **docs-only PR**. The PR review thread is the enrichment loop — the user comments, the designer revises, detail accumulates. **The user merging the story PR is the sign-off** that flips the story to `agreed`. Nothing downstream starts before that.

A story is detailed enough when `gameplay-qa` could author a scenario from it without asking a single question. If QA has to ask, the story goes back to stage 2.

## Stage 3 — Scenarios (red first)

On the feature branch, `gameplay-qa` translates each agreed story into layer-2 declarative scenarios (`tests/scenarios/*.scenario.ts`):

- Scenario `id` matches the story `id` (variants: `<story-id>--<variant>`).
- A header comment cites the story file path.
- Assertions transcribe the story's acceptance criteria — QA does not invent criteria the story doesn't state, and does not omit ones it does.
- **Red is the expected starting state.** The scenarios fail until the feature exists. They stay on the feature branch until stage 4 turns them green; only green code reaches `master`.

If an acceptance criterion cannot be expressed through the scenario surface (missing event type, missing state accessor), the hooks are part of the feature — `gameplay-engineer` builds the hooks first, per the agent-testable rule in `CLAUDE.md`.

## Stage 4 — Dev loop (until green)

`gameplay-engineer` implements against the red scenarios and iterates headless (`npx vitest tests/scenarios/<id>.scenario.ts --watch`) until every story scenario passes.

**Hard rule: the scenarios are the contract.** The engineer never edits a story-derived assertion to get green. If honest effort shows a criterion is unreachable (balance makes the beat impossible, timing can't work), the *story* is revised — a docs PR the user reviews — and only then the scenario. Weakened assertions without a story change are a red flag for `code-reviewer`.

When green: capture goldens (`UPDATE_GOLDENS=1`, then eyeball — see `tests/README.md`), run `code-reviewer`, open the PR.

## Stage 5 — Playthrough verification

The PR is the **preset playthrough simulator** handoff. CI already deploys per-PR artifacts to `pr-N/` on gh-pages; the PR description must list, per story:

- **Watch:** `pr-N/qa/?scenario=<story-id>` — read-only scripted playback of the story scenario, tick for tick.
- **Play:** `pr-N/?scenario=<player-scenario-id>` — when the story warrants a hands-on check, a layer-3 player scenario with the same setup so the user can drive it themselves.
- **Report:** `pr-N/test-report/` — assertion-level results with replay links.

The user watches the playthrough and judges the one thing tests can't: *is it fun, does it read, is this what I meant?* User approval + merge flips the story to `verified`. If the answer is "green but not what I meant," that is a story defect — back to stage 2, revise the story, and the delta becomes the next red scenario. No code hacks in response to taste feedback without a story change.

## Roles

| Stage | Driver | User's part |
|---|---|---|
| 1 Brainstorm | orchestrator + `game-designer` | source of the idea |
| 2 Stories | `game-designer` writes; docs PR | enrich in review; merge = sign-off |
| 3 Scenarios | `gameplay-qa` | — |
| 4 Dev loop | `gameplay-engineer`; `code-reviewer` gates | — |
| 5 Verify | orchestrator assembles links; `pr-sentinel` gates | watch/play; merge = verified |

## Traceability

Story frontmatter lists its scenario ids, spec links, and status (`draft → agreed → in-dev → verified`). Scenario files cite their story path. The test report's replay links close the loop from a failing assertion to the exact tick in the viewer. One glance at `docs/stories/` answers "what has the user actually signed off on, and is it proven?"

## Relation to design specs

Specs (`docs/design/*.md`) still exist and still own *numbers and systems* — detection tables, constants, state machines. Stories own *experiences* — what a player does and what must visibly happen. A story cites the spec it exercises; a spec change that breaks a verified story's acceptance criteria requires revisiting the story, not silently re-tuning the scenario.

## Known tooling gaps

Tracked as issues; neither blocks adopting the workflow:

1. **Multi-seed sweep assertions.** Stories with statistical acceptance ("wins on ≥ 9 of seeds 1–10") need a `runSweep()` helper that runs one script across a seed range and asserts on the aggregate. Until it lands, sweep stories pin one representative seed per outcome class and note the sweep criterion as pending.
2. **Story overlay in the QA viewer.** Showing the current story beat during playback would make stage-5 review easier. Nice-to-have.
