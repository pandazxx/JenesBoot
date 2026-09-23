# v1 Battle Enrichment: Destroyer Counter-Stealth

**Status:** build spec for the v1 battle milestone. Tuned against `src/sim/combat/config.ts` as it stands. Uses the sim's real `VisibilityLevel` enum (NONE=0, CONTACT=1, SILHOUETTE=2, IDENTIFIED=3, LOCKED_ON=4), not the aspirational 0-10 `contactQuality` scale in `battle-loop.md`. Where those docs and the code disagree, the code wins. For v1 this spec supersedes `battle-loop.md` §2.6 (depth fix) and §5.2 (destroyer AI).

**Problem being solved:** dive to PERISCOPE, go DEAD_SLOW, and the destroyer loses passive contact past CONTACT_RANGE with no recovery move. The player torpedoes from SHORT and wins in ~200 ticks taking zero return fire. Stealth is not a *play*, it's an *off switch*.

**Design thesis:** keep dive-and-strike as the winning line, but make "going silent" a bet that starts a clock and hands the destroyer a search tool. The player wins by striking cleanly and relocating before the destroyer's search converges — not by becoming permanently invisible.

**Guardrails:** no new detection axis. No continuous math the player can't see. Everything is a discrete state, a tick counter, or a table cell shaped like the ones already in `config.ts`. FTL-readable telegraphs on every threat.

---

## 1. Destroyer counter-stealth kit

The destroyer gets **one new capability and one new AI state**: an active sonar ping, plus a HUNTING state that reuses the existing `lastKnownX` search. The ping directly answers "player went silent," telegraphs itself (fair), and slots into the already-declared but unused `SONAR_ACTIVE` detection method. Spiral search and alerted-table swaps are out of scope (§6).

### 1.1 New AI state machine

Add a state field to `AiState`:

- **PURSUING** — current visibility > NONE. Behaves exactly as today: chase at FULL_AHEAD toward the player, fire available weapons.
- **HUNTING** — visibility dropped to NONE while the player was submerged and within CONTACT/SHORT at the moment of loss. The destroyer commits to a search of the last-known position and starts pinging.
- **DISENGAGING** — hunt patience exhausted; the destroyer breaks off (§4.2).

| From | Event | To |
|---|---|---|
| PURSUING | visibility → NONE | HUNTING (latch `lastKnownX = player.x`, reset `pingCooldown = PING_INTERVAL`) |
| HUNTING | visibility > NONE (re-acquired, by ping or passive) | PURSUING |
| HUNTING | `huntTimer` ≥ `HUNT_TIMEOUT` | DISENGAGING |
| DISENGAGING | visibility > NONE | PURSUING (reset `huntTimer`) |

`huntTimer` increments each tick in HUNTING, resets to 0 on entering HUNTING.

### 1.2 Active sonar ping

A periodic pulse that reveals silent submerged subs inside a radius, and — crucially — **telegraphs itself before it resolves** so the player can react (dive a band, or accept the hit).

| Constant | Value | Notes |
|---|---|---|
| `PING_INTERVAL` | 40 ticks | One ping per 8s at 5 ticks/s — enough to feel hunted, slow enough to dodge. |
| `PING_WINDUP` | 5 ticks | Between windup emit and resolve. This is the telegraph. |
| `PING_RANGE_MAX` | SHORT | Ping resolves contact only at CONTACT_RANGE or SHORT. Beyond SHORT it returns nothing. |

**Ping result table** — a new `SONAR_ACTIVE` `DetectionTable`; indexed by range band at resolve tick and player depth band. Populate only these cells, everything else NONE:

| Player depth ↓ / Range → | CONTACT_RANGE | SHORT |
|---|---|---|
| PERISCOPE | LOCKED_ON | IDENTIFIED |
| SHALLOW | IDENTIFIED | SILHOUETTE |
| DEEP | SILHOUETTE | CONTACT |
| ABYSSAL | CONTACT | NONE |

The ping **ignores speed** (active sonar bounces off the hull regardless of how quiet the engines are). That's what makes DEAD_SLOW no longer a free pass.

**Resolution sequence** (slots into the existing tick order — windup at the enemy-AI step, resolve alongside detection):

1. HUNTING, `pingCooldown` hits 0 → emit `sonar_ping_windup` event, set `pingResolvesOnTick = tick + PING_WINDUP`, reset `pingCooldown = PING_INTERVAL`.
2. On `pingResolvesOnTick`: compute ping visibility from the table at the *current* range/depth. Emit `sonar_ping_result` with the resulting VisibilityLevel. If > NONE, it feeds the normal visibility max in `computeVisibility` for this tick and transitions HUNTING → PURSUING.

**Why the windup matters:** a player paying attention hears the windup and can HARD/CRASH-dive one band in the 5-tick window. Dropping PERISCOPE→SHALLOW turns a LOCKED_ON into an IDENTIFIED; SHALLOW→DEEP turns IDENTIFIED into CONTACT. That's the skill expression: clean stealth reacts to pings, sloppy stealth eats them.

### 1.3 What the destroyer does with a ping hit

Re-acquisition flips it to PURSUING. On the same tick it re-latches `lastKnownX = player.x` and, per the existing AI rule, if the player is PERISCOPE–DEEP and range ≤ SHORT it drops a depth charge. **The ping is the setup; the depth charge is the punish.** No new weapon needed.

---

## 2. Torpedo launch consequences

Firing must break stealth. Cheap discrete version, no acoustic-signature math:

**On player `FIRE_WEAPON` while submerged: set `revealTimer = 15` ticks on the player.** While `revealTimer > 0`, the destroyer's effective visibility on the player is floored at **SILHOUETTE (2)** regardless of the passive-sonar result, and the destroyer immediately latches `lastKnownX = player.x` (entering/refreshing PURSUING if it was HUNTING).

Implementation: in `computeVisibility`, after the table max — `if target is player and player.revealTimer > 0: best = max(best, SILHOUETTE)`. One clamp. Decrement `revealTimer` each tick.

**Consequence for play:** a shot from SHORT reveals you for 15 ticks — long enough for the destroyer to close from SHORT to CONTACT_RANGE and drop a depth charge. Fire, then immediately relocate (dive a band and open range) inside that window; don't fire again from the same spot. Missing your first torpedo is now genuinely dangerous. SILHOUETTE (not LOCKED_ON) is deliberate: it localizes you but doesn't give a depth fix, so a smart dive still degrades the follow-up depth charge.

---

## 3. Pressure on the player clock: submerged air counter

The cheapest soft timer that requires zero new resource pool — a single integer, not the full O2 system:

**`submergedTicks`** increments every tick the player is at PERISCOPE or deeper; resets to 0 at SURFACE.

| Threshold | Effect | Telegraph |
|---|---|---|
| `submergedTicks ≥ 400` (80s) | **STALE_AIR** warning; no mechanical effect yet | `air_warning` event; UI flashes the O2 gauge |
| `submergedTicks ≥ 500` (100s) | Player takes **1 hull HP per 20 ticks** until surfaced | `air_critical` event each time damage ticks |

Tuning: an optimal stealth kill runs ~150–250 ticks, so a clean fighter never touches the warning. A camper crosses 400 at 80s and bleeds from 500 — on a 20-HP hull that's ~80 more seconds of foul air before it kills you, forcing a surface (which the deck gun punishes) or a decisive strike. **You cannot out-wait the destroyer; you must beat it.**

This is not "realistic O2." It's a legible submerged clock reskinned as air (the alien algae scrubber falling behind — `core-reference.md` §8), upgradeable later into the real O2 pool without changing the fight's shape. Hull-stress-at-DEEP was considered and rejected: the destroyer fight is a PERISCOPE/SHALLOW fight, so that timer would rarely fire; the air counter bites in exactly the band the player camps in.

---

## 4. Escape as a real outcome

`escapeAccumulator` + `escapeTicks: 30` already exist in state/config. Make escape genuine and symmetric.

### 4.1 Player escape

**Condition:** range ≥ MEDIUM **and** destroyer-on-player visibility == NONE, held continuously for `escapeTicks = 30`. Each qualifying tick increments `escapeAccumulator`; any failing tick resets it to 0. At 30, `result = "escaped"`.

Pings can reset the accumulator by re-acquiring you, so you must open range beyond `PING_RANGE_MAX` (SHORT) first. Clean geometric outcome, no RNG.

### 4.2 Destroyer disengage

| Constant | Value |
|---|---|
| `HUNT_TIMEOUT` | 240 ticks (48s) of continuous HUNTING with no re-acquisition |

On timeout: destroyer enters **DISENGAGING** — FULL_AHEAD away, stops pinging, stops firing. If it opens to LONG for 30 ticks, `result = "escaped"` (encounter marked EVADED, no loot). Re-acquisition before then flips it back to PURSUING.

**Net:** three ways the fight ends besides a hull-zero kill — player escapes, destroyer disengages, or the air clock kills a camper. All discrete, all assertable.

---

## 5. Tuning targets (golden-scenario acceptance criteria)

Run each across seeds 1–10 via the headless runner; scripted-input sequences become golden scenarios. Hard pass/fail on the event log and end state.

| # | Scenario (scripted input) | Assertion |
|---|---|---|
| T1 | **Optimal stealth** — dive to PERISCOPE, DEAD_SLOW, close to SHORT, fire torpedo, dive+open on reveal, repeat | `player_win` on **≥ 9/10** seeds, ending hull **≥ 12/20 (60%)**. Tense but achievable. |
| T2 | **Sloppy stealth** — dive, fire, then sit still (no reaction to ping windup, no relocation) | Player wins on **≤ 4/10** seeds; on losses, ≥ 1 depth-charge hit logged after a `sonar_ping_result`. Punished. |
| T3 | **Surface slugfest** — stay SURFACE, trade deck-gun fire | Player loses on **≥ 7/10** seeds. Surface brawling vs a destroyer is a bad idea. |
| T4 | **Dive and sit** — dive to PERISCOPE, DEAD_SLOW, never fire, never surface | Run ends by air clock: `air_critical` fires and player hull hits 0 before tick 900 on **10/10** seeds. Can't out-wait it. |
| T5 | **Evasion line** — dive, open range to MEDIUM+, stay dark | `result == "escaped"` on **≥ 8/10** seeds with **0** torpedoes fired. Escape is real. |
| T6 | **Ping telegraph fairness** — on every `sonar_ping_windup`, queue a HARD dive of one band | Zero LOCKED_ON ping results; every ping resolves at ≤ IDENTIFIED. Proves the telegraph is dodgeable. |

If T1 and T2 both pass, the core thesis holds: the same opening (dive + strike) is a win for the reactive player and a loss for the passive one. **That gap is the difficulty.**

**Invariant assertions** (cheap regression fences):
- Every `sonar_ping_result` with visibility > NONE is preceded by a `sonar_ping_windup` exactly `PING_WINDUP` ticks earlier.
- `submergedTicks` resets to 0 within 1 tick of any depth change to SURFACE.
- No ping result > NONE is ever produced at range > SHORT.

---

## 6. Out of scope for v1

Explicitly **not** in this milestone:

- Spiral / zigzag search movement — HUNTING reuses straight-line move-to-`lastKnownX`.
- Alerted-state passive-sonar table swap — the ping is the counter-stealth tool; a second one is redundant for one enemy.
- Full acoustic-signature integer math — v1 uses the discrete `revealTimer` floor; the full model is a later refactor if a second enemy needs it.
- Real O2 / battery / fuel pools, generation rates, room damage — v1 ships the single `submergedTicks` integer only.
- Crew in combat (sonar-tech skill, engineering gating, panic) — stays deferred per `battle-loop.md` §7.
- Depth fix as a tracked boolean — depth charges hit on current-tick range/depth only; `battle-loop.md` §2.6 is a v2 enrichment.
- Multi-enemy / wolfpack, bearing/facing, rooms, ABYSSAL-band play against the destroyer.

---

## Summary of new constants

```
PING_INTERVAL   = 40   ticks
PING_WINDUP     = 5    ticks
PING_RANGE_MAX  = SHORT
revealTimer     = 15   ticks   (set on player fire while submerged; visibility floor SILHOUETTE)
STALE_AIR_AT    = 400  ticks submerged (warning)
AIR_CRITICAL_AT = 500  ticks submerged (1 hull HP / 20 ticks)
HUNT_TIMEOUT    = 240  ticks continuous HUNTING → DISENGAGING
escapeTicks     = 30   (already in config; reused for both escape directions)
```

New AI states: `PURSUING`, `HUNTING`, `DISENGAGING`. Detection method wired in: `SONAR_ACTIVE` (declared in `enums.ts`, currently unused). New event types: `sonar_ping_windup`, `sonar_ping_result`, `air_warning`, `air_critical`.

**Touch points:** `config.ts` (ping table + constants), `ai.ts` (state machine), `detection.ts` (reveal floor), `types.ts` (`AiState` + `VesselState` fields), `tick.ts` (air counter, escape accumulators).
