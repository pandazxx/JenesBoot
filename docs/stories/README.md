# Gameplay Stories

One file per story. A story is a concrete, playable narrative of one gameplay situation — detailed enough that `gameplay-qa` can turn it into a scripted test scenario without asking a single question. Process: `docs/process/story-driven-workflow.md`.

## The detail bar

A story is ready to leave `draft` only when all four hold:

1. **Setup is executable.** Seed(s), combat preset, and initial overrides map directly onto the `Scenario` type's `seed` / `scenario` / `initial` fields (`tests/README.md`).
2. **Every beat is observable.** Each numbered beat names a player command and/or a game response that the event log or state snapshot can show. "The player feels hunted" is tone; "a `sonar_ping_windup` event fires within 40 ticks of contact loss" is a beat.
3. **Every acceptance criterion is one assertion.** Each criterion maps to a single `ExpectClause` entry (`atTick` predicate, `eventCounts`, `finalCombatResult`) or one sweep aggregate. If it can't be phrased that way, either split it or flag the missing sim hook.
4. **Tolerances are explicit.** Single seed or seed sweep; exact tick or tick window; hard count or min/max.

## File format

```markdown
---
id: kebab-case-slug            # doubles as the scenario id
status: draft                  # draft → agreed → in-dev → verified
spec: docs/design/<file>.md    # spec(s) this story exercises, if any
scenarios: []                  # filled in at stage 3, e.g. [sloppy-stealth-gets-punished]
---

# <Title>

## Premise
Player-facing narrative, 2-4 sentences. Evocative, in-tone (fantasy WWII + aliens).

## Setup
Seed(s), preset, initial positions/depth/speed for every vessel. Table or list.

## Beats
Numbered. Each: what the player does (command + approximate tick) → what the game
must visibly do in response (event, state change, outcome). Approximate tick
budgets are fine; exact ticks get pinned during scenario authoring.

## Acceptance criteria
Bulleted, each one assertion. Statistical criteria state the seed range and threshold.

## Out of scope
What this story deliberately does not cover.
```

## Status lifecycle

| Status | Meaning | Flipped by |
|---|---|---|
| `draft` | being written / enriched with the user | — |
| `agreed` | user merged the story PR | story PR merge |
| `in-dev` | scenarios authored, feature branch in the dev loop | stage-3 start |
| `verified` | user watched the playthrough and merged the feature PR | feature PR merge |

## Rules

- Stories merge to `master` via docs-only PRs; the PR review thread is where the user enriches them. Merge = sign-off.
- Scenario assertions transcribe acceptance criteria verbatim in intent. Changing a criterion means changing the story first (another docs PR), never the scenario alone.
- One situation per story. If beats fork ("...but if the player instead surfaces"), that fork is a second story or a `--variant` scenario.
