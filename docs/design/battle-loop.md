# JenesBoot — Battle Loop Design v0.2

**Status:** Revision of v0.1. The room-to-room crew-in-combat layer (FTL's "click sailor, click room") is **rejected** for in-battle play. Crew matter between fights and gate certain systems, but moment-to-moment combat is steered by **range, depth, and speed**. Scope is locked to three MVP scenarios: surface-vs-surface gunfight, surface-contact-then-dive, and submerged ambush.

**Reading order for engineers:** §1 (tactical space), §2 (player actions), §3 (weapon resolution), §4 (enemy AI), §5 (win/lose/escape), §6 (crew contribution), §7 (tick sequence), §8 (tradeoffs), §9 (out of scope).

---

## §1. The tactical space

Three axes. Two are discrete, one is a small integer.

### 1.1 Range — discrete bands

Range is a single scalar between the player sub and the current engaged enemy (MVP: one enemy at a time).

| Band | Value | Description |
|---|---|---|
| `LONG` | 4 | Initial sonar/visual contact. Outside gun range. |
| `MEDIUM` | 3 | Torpedoes effective; deck gun ineffective. |
| `SHORT` | 2 | Deck gun effective; torpedoes accurate. |
| `POINT_BLANK` | 1 | Deck gun devastating; torpedoes risk under-running. |
| `RAMMING` | 0 | Collision tick; both ships take hull damage. End state. |

Storing range as an integer 0–4 keeps the sim deterministic, testable, and legible. A "close 1 band" command is a single integer delta in the event log.

### 1.2 Depth — discrete enum

`SURFACE`, `PERISCOPE`, `SHALLOW`, `DEEP`, `ABYSSAL` — five bands. Unchanged from core-reference §0.

### 1.3 Speed — three settings

| Setting | Range change rate | Resource cost | Acoustic Sig delta |
|---|---|---|---|
| `AHEAD_FULL` | 1 band per 8 ticks | High fuel (surface) / high battery (submerged) | +2 |
| `STANDARD` | 1 band per 15 ticks | Normal drain | +0 |
| `SILENT` | None (range holds) | Low drain | −3 |

Speed has a **direction**: `CLOSE`, `OPEN`, or `HOLD`. Full command form: `(setting, direction)`. `SILENT` ignores direction.

### 1.4 How the three axes interact

- Depth **gates weapons** (§3): deck gun requires `SURFACE`; torpedoes require `PERISCOPE`–`DEEP`.
- Depth **reduces enemy detection**: each band below `SURFACE` reduces enemy sensor accuracy.
- Speed **modifies range change rate** and **acoustic signature**.
- Range **gates weapon accuracy** (§3): a torpedo at `LONG` can be dodged; at `SHORT` it is hard to evade.
- Depth transitions take **6 ticks per band**. During transition: cannot fire, −20 Evasion.

---

## §2. Player actions each tick

Commands queue while paused; apply on unpause. Only one command per category may be queued (queuing a new one replaces the prior).

| Command | Parameters | Effect | Time-to-execute |
|---|---|---|---|
| `SET_SPEED` | `(AHEAD_FULL\|STANDARD\|SILENT, CLOSE\|OPEN\|HOLD)` | Changes throttle and direction | Applied next tick |
| `SET_DEPTH_TARGET` | One of the 5 depth bands | Starts transition toward target one band at a time | 6 ticks per band |
| `FIRE_DECK_GUN` | — | Fires at engaged enemy | Reload: 12 ticks; shot resolves next tick |
| `FIRE_TORPEDO` | `tube_index` | Launches torpedo from a loaded tube | Travel time varies by range (§3) |
| `LAUNCH_DECOY` | — | Defeats one incoming torpedo this tick | Ammo-limited; 1 per encounter in MVP |
| `BLOW_BALLAST_EMERGENCY` | — | Forces transition toward `SURFACE` at 3 ticks/band | +5 acoustic sig for 10 ticks; costs 1 fuel |
| `RIG_FOR_SILENT` | — | Shortcut: `SET_SPEED(SILENT, HOLD)` + pause all reloads | Immediate |

Eight commands. Resist adding a ninth before the first playable.

---

## §3. Weapon resolution

Hit chance formula: `base_accuracy × range_modifier × depth_modifier × evasion_modifier`, clamped to `[5, 95]`. All values are integers.

### 3.1 Deck Gun

**Depth required:** player at `SURFACE`. Target at `SURFACE` (full accuracy) or `PERISCOPE` (½ accuracy).

| Range | Hit chance vs surface target |
|---|---|
| `LONG` | 0 (out of range) |
| `MEDIUM` | 15 |
| `SHORT` | 60 |
| `POINT_BLANK` | 85 |

- **Damage:** 2 hull HP per hit.
- **Reload:** 12 ticks (modified by Gunnery crew — see §6).

### 3.2 Torpedo

Depth differential between player and target determines validity. A torpedo runs at the player's current depth ±1 band.

| Player depth | Hittable target depth bands |
|---|---|
| `PERISCOPE` | `SURFACE`, `PERISCOPE`, `SHALLOW` |
| `SHALLOW` | `PERISCOPE`, `SHALLOW`, `DEEP` |
| `DEEP` | `SHALLOW`, `DEEP`, `ABYSSAL` |

**Travel time by range at fire:**

| Range | Travel ticks |
|---|---|
| `LONG` | 12 |
| `MEDIUM` | 7 |
| `SHORT` | 3 |
| `POINT_BLANK` | 1 |

**Hit chance:**

| Range | Base accuracy |
|---|---|
| `LONG` | 20 |
| `MEDIUM` | 55 |
| `SHORT` | 80 |
| `POINT_BLANK` | 50 (under-run risk) |

Apply −20 if target depth differs by 1 band from the torpedo run depth (edge of the ±1 window).

- **Damage:** 5 hull HP per hit.
- **Reload:** 30 ticks (modified by Torpedo Room crew — see §6).

### 3.3 Depth Charges (enemy weapon — Patrol Destroyer only in MVP)

**Enemy depth required:** `SURFACE`. Target bands: `PERISCOPE`–`DEEP`.

Each charge is aimed at a depth band. Hit if player's current depth matches **and** range is `SHORT` or `POINT_BLANK`: **60% chance, 3 hull HP**.

Miss conditions: player at `SURFACE` (charges sink too slow), player at `ABYSSAL` (out of reach), or range `MEDIUM`+.

If the player has been rigged for silent for 10+ continuous ticks the destroyer loses depth fix — subsequent charges drop to a random band (low hit chance).

### 3.4 Range × depth quick-reference

| Player depth | Enemy depth | Available weapon |
|---|---|---|
| `SURFACE` | `SURFACE` | Deck gun |
| `SURFACE` | `PERISCOPE` | Deck gun (½ acc) |
| `PERISCOPE` | `SURFACE` | Torpedo |
| `PERISCOPE` | `PERISCOPE` | Torpedo |
| `SHALLOW` | `SURFACE` | Torpedo (−20) |
| `SHALLOW` | `PERISCOPE` | Torpedo |
| `DEEP` | `PERISCOPE` | Torpedo (−20) |

If neither side has a valid weapon vs the other's current depth, the encounter is a **stalemate** — resolved only by changing range, depth, or escaping.

---

## §4. Enemy AI

Each archetype is 2–3 priority rules evaluated in order each AI tick. First true rule fires.

### 4.1 Merchant / Small Boat (Scenario 1)

| Priority | Rule |
|---|---|
| 1 | If range ≤ `SHORT` and deck gun reloaded → fire deck gun. |
| 2 | If hull HP < 50% → `AHEAD_FULL, OPEN` (flee). |
| 3 | Otherwise → `STANDARD, HOLD`. |

Speed: 1 band per 20 ticks (slower than player). Cannot dive.

### 4.2 Patrol Destroyer (Scenario 2)

| Priority | Rule |
|---|---|
| 1 | If player at `PERISCOPE`–`DEEP` and range ≤ `SHORT` → drop depth charge at last known depth. |
| 2 | If player at `SURFACE` and range > `SHORT` → `AHEAD_FULL, CLOSE`. |
| 3 | If player at `SURFACE` and range ≤ `SHORT` → fire deck gun. |
| 4 | Otherwise → `STANDARD, CLOSE` and ping sonar. |

Loses depth fix after player rigs for silent 10+ continuous ticks; subsequent charges drop to random band.

### 4.3 Submerged Hostile (Scenario 3)

| Priority | Rule |
|---|---|
| 1 | If torpedoes loaded and range ≤ `MEDIUM` and depth differential ≤ 1 → fire torpedo. |
| 2 | If hit within last 20 ticks and not detected → change depth 1 band + `SILENT, HOLD`. |
| 3 | Otherwise → match player depth + `STANDARD, CLOSE`. |

Only attacks when it has a firing solution. A missed first shot from the player triggers rule 2 — the fight becomes a stealth chase.

---

## §5. Win, lose, escape

### 5.1 Common conditions

| Outcome | Condition |
|---|---|
| **Win** | Enemy `hullHP` reaches 0 |
| **Lose** | Player `hullHP` reaches 0, **or** O2 reaches 0 while submerged with no surface path, **or** all crew dead/panicked |
| **Escape** | Scenario-specific (below); node marked `EVADED` — no XP, no loot |

### 5.2 Scenario 1 — surface gunfight

- **Escape:** range reaches `LONG` for 10 continuous ticks with direction `OPEN`. No fuel cost.
- **Target:** winnable around tick 80 with default loadout. This is the tutorial fight.

### 5.3 Scenario 2 — surface contact, dive decision

- **Escape:** reach `DEEP` and hold for 15 ticks while range ≥ `MEDIUM`. Geometric — no RNG once conditions are met.
- **Key decision:** dive to fight with torpedoes vs stay on surface with deck gun. Loadout should make one option clearly better; the player should feel that consequence.

### 5.4 Scenario 3 — submerged ambush

- **Escape:** rig for silent for 30 continuous ticks while range ≥ `MEDIUM`. Hostile breaks contact.
- **Key decision:** first-shot accuracy. A missed opening salvo usually means breaking off.

---

## §6. Crew contribution during combat (passive only)

Crew are assigned to rooms **before** the encounter. They do not move during combat. Room effectiveness is a function of the assigned crew's skill and alive/panic status.

| Room | Effect during combat | Gate or multiplier? |
|---|---|---|
| Sonar | +1 detection range band per skill level; retains enemy depth fix longer while silent | Multiplier |
| Helm | −1 tick per skill level on per-band range change timer | Multiplier |
| Gunnery | −1 tick per level on deck gun reload; +5 accuracy per level | Multiplier |
| Torpedo Room | −2 ticks per level on torpedo reload | **Gate**: if crew dead, reload halts entirely |
| Engineering | Reduces battery/fuel drain per tick | **Gate**: if unmanned or destroyed, `AHEAD_FULL` locked |

**Panic (MP = 0):** crew refuses orders for 20 ticks. Manifests as the operated system going offline for those 20 ticks (reload stall, speed cap locked). No crew-walking UI required.

**Damage Control:** deferred from MVP. Repairs run between encounters.

---

## §7. Tick sequence

10 steps. Fires at 10 ticks per real-time second at 1× speed.

| Step | Action |
|---|---|
| 1 | Resolve in-flight projectiles (torpedoes whose travel timer expired) |
| 2 | Apply resource costs (fuel, battery, O2, ammo on fired shots) |
| 3 | Process player command queue |
| 4 | Process enemy AI |
| 5 | Advance range (speed × direction; clamp 0–4) |
| 6 | Advance depth transitions (tick timer; clamp on band arrival) |
| 7 | Fire weapons (player + enemy, gated by depth and range; spawn projectiles or instant-resolve) |
| 8 | Apply damage; trigger crew panic checks |
| 9 | Check win/lose/escape conditions |
| 10 | Emit event log entries; advance tick counter |

**Invariant:** steps 5 and 6 run after command intake (3, 4) and before weapon firing (7). A player who commands a depth change and fires on the same tick gets their new depth state at the moment of fire.

---

## §8. Design tradeoffs

1. **Discrete range bands vs continuous distance.** Bands are testable, pixel-art-displayable, and AI-legible. Cost: fights can feel snappy at transitions. Recommendation: take the bands. Revisit if MVP playtest shows fights feel binary.

2. **Single engaged enemy in MVP.** Multi-target means per-enemy range scalars and an AI coordination layer. Recommendation: 1v1 only for MVP. Model a "reinforcement arrives" beat as an environmental timer, not a second simulated unit.

3. **Gate vs multiplier for crew rooms.** Gates (Engineering → no `AHEAD_FULL`; Torpedo Room → reload halts) make crew loss narratable. Pure multipliers feel like a spreadsheet. At least one room per fight must be a gate.

---

## §9. Out of scope for MVP

The following are noted but not implemented for the three MVP scenarios:

- Multi-enemy battles and wolfpack encounters
- Bearing / facing / firing arcs
- Fire and flood spread inside rooms
- Crew movement during combat
- Damage Control room active during combat
- Alien weapons (Arc-Lance, Harmonic Charge) — kept as a future loadout layer
- Hydrophone Bonus and full acoustic-signature math beyond the speed modifier

Ship the three scenarios first. Balance them. Then expand.

---

## §10. RNG streams used in combat

| Stream name | Used for |
|---|---|
| `combat.hit` | Evasion roll per incoming shot |
| `combat.spread` | Depth charge band selection when depth fix is lost |
| `combat.crew_panic` | Panic check on stress threshold |
| `enemy.ai` | Enemy AI tie-breaking at decision points |

All streams are sub-streams of the run seed. Replay requires recording the seed only.
