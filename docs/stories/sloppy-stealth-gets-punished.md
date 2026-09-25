---
id: sloppy-stealth-gets-punished
status: draft
spec: docs/design/battle-v1-counter-stealth.md (PR #41)
scenarios: []
---

# Sloppy Stealth Gets Punished

*Worked example of the story format, derived from tuning target T2 of the v1 counter-stealth spec. Stays `draft` until the user enriches and merges it.*

## Premise

The boat slips under on first contact and the destroyer's screws fade to a search pattern overhead. One torpedo away — and then the captain freezes. No dive, no turn, just silence and hope. The pinging starts. Hope is not a depth band.

## Setup

| | |
|---|---|
| Preset | `destroyer_encounter` |
| Seeds | sweep 1–10 (until `runSweep()` lands: pin seed 3 as the representative loss, sweep criterion pending) |
| Player | SURFACE, DEAD_SLOW, x=0 |
| Destroyer | SURFACE, FULL_AHEAD closing, x=700 (LONG) |

## Beats

1. **Tick 1–2:** player crash-dives to PERISCOPE and sets DEAD_SLOW. Within a few ticks of the visibility dropping to NONE, the destroyer enters HUNTING and its first `sonar_ping_windup` is scheduled.
2. **~Tick 40:** player, having crept inside SHORT, fires one torpedo. The launch reveals the boat: destroyer-on-player visibility floors at SILHOUETTE for 15 ticks and the destroyer latches the launch position.
3. **The mistake:** the player issues no further commands. No band change, no relocation. This is the sloppy part.
4. The destroyer closes on the latched position. Its next ping resolves against a PERISCOPE-depth boat at close range — `sonar_ping_result` at IDENTIFIED or better.
5. Depth-charge run: within the pursuit that follows, at least one depth-charge hit lands on the player.
6. The fight ends badly more often than not: across the sweep, the player wins at most 4 of 10 seeds.

## Acceptance criteria

- After the tick-2 dive settles, destroyer-on-player visibility reaches NONE at least once before tick 40 (stealth genuinely worked first).
- ≥ 1 `sonar_ping_windup` event between contact loss and tick 40.
- Torpedo launch at ~tick 40 is followed within 15 ticks by destroyer visibility ≥ SILHOUETTE (`atTick` window predicate).
- ≥ 1 `sonar_ping_result` with visibility ≥ IDENTIFIED after the launch (`eventCounts` min 1).
- ≥ 1 depth-charge hit on the player logged *after* the first qualifying `sonar_ping_result` (ordering predicate).
- Sweep (pending `runSweep()`): `player_win` on ≤ 4 of seeds 1–10. Pinned interim: seed 3 ends `player_lose`.

## Out of scope

- The reactive counterpart (dodging the ping by diving a band) — that is the `optimal-stealth-hunt` story.
- Air-clock pressure — the fight ends before `submergedTicks` matters here.
- UI telegraph checks (ping ring, DETECTED flash) — render-layer, not assertable headless.
