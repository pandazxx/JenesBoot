# JenesBoot — Battle Loop Design v0.2

**Status:** Revision of v0.1. The room-to-room crew-in-combat layer (FTL's "click sailor, click room") is **rejected** for in-battle play. Crew matter between fights and gate certain systems, but moment-to-moment combat is steered by **range, depth, and speed**. Scope is locked to three MVP scenarios: surface-vs-surface gunfight, surface-contact-then-dive, and submerged ambush.

**Reading order for engineers:** §1 (tactical space), §2 (detection), §3 (player actions), §4 (weapon resolution), §5 (enemy AI), §6 (win/lose/escape), §7 (crew contribution), §8 (tick sequence), §9 (tradeoffs), §10 (out of scope).

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

## §2. Detection and visibility

Submarine combat is **information warfare**. Before you choose a weapon, you choose what the enemy knows about you and what you know about them. This section defines how that information is computed each tick.

### 2.1 Contact quality — the 0–10 scale

Every potential target carries a per-observer integer `contactQuality` (0–10). Recomputed each tick from the base tables below plus modifiers, then clamped to `[0, 10]`.

| Tier | Range | What the observer can do |
|---|---|---|
| `NONE` | 0 | No contact. Target not on tac display. No weapons may fire. |
| `FAINT` | 1–3 | Blip only. Range ±1 band; depth unknown. Cannot fire torpedoes or depth charges. Deck gun fires at −30 accuracy if otherwise valid. |
| `TRACKING` | 4–7 | Range exact; depth ±1 band. All weapons valid at normal accuracy. |
| `LOCKED` | 8–10 | Range and depth exact. All weapons +10 accuracy. Depth-fix acquired (§2.6). |

Contact quality is **per-observer**: the destroyer's quality on you is independent of your quality on the destroyer. This asymmetry is the tactical core of the game.

### 2.2 Table A — Surface vessel detecting submarine

Surface vessels use visual lookout, radar, and active sonar.

| Sub depth ↓ / Range → | `LONG` | `MEDIUM` | `SHORT` | `POINT_BLANK` |
|---|---|---|---|---|
| `SURFACE` | 8 | 9 | 10 | 10 |
| `PERISCOPE` | 3 | 5 | 7 | 8 |
| `SHALLOW` | 2 | 4 | 6 | 7 |
| `DEEP` | 1 | 2 | 4 | 5 |
| `ABYSSAL` | 0 | 1 | 2 | 3 |

A `SURFACE` sub is always at least `TRACKING`. An `ABYSSAL` sub is undetectable at `LONG` and only ever `FAINT`. The destroyer's job is to push you to `SHORT` while you are shallow.

### 2.3 Table B — Submarine detecting surface vessel

Surface vessels are loud. The sub's hydrophone works **better when deep** — cooler, denser, more conductive water. Visual via periscope is only available at `PERISCOPE` depth + `SHORT`/`POINT_BLANK`.

| Sub depth ↓ / Range → | `LONG` | `MEDIUM` | `SHORT` | `POINT_BLANK` |
|---|---|---|---|---|
| `SURFACE` | 5 | 7 | 9 | 10 |
| `PERISCOPE` | 5 | 7 | 9 | 10 |
| `SHALLOW` | 4 | 6 | 8 | 9 |
| `DEEP` | 6 | 8 | 9 | 10 |
| `ABYSSAL` | 7 | 9 | 10 | 10 |

`SHALLOW` is the worst layer — surface noise reflects off the thermocline back upward. `DEEP` and `ABYSSAL` get a hydrophone bonus.

**Compare Table A row `DEEP` (1/2/4/5) against Table B row `DEEP` (6/8/9/10).** That gap is the submarine asymmetry. At `DEEP`/`MEDIUM`: the destroyer reads you at `FAINT` (2); you read the destroyer at `LOCKED` (8).

### 2.4 Table C — Submarine detecting submerged enemy (Scenario 3)

Pure passive acoustic. No active ping in MVP. Rows are the **absolute depth-band differential** between the two subs.

| Δ depth ↓ / Range → | `LONG` | `MEDIUM` | `SHORT` | `POINT_BLANK` |
|---|---|---|---|---|
| 0 (same depth) | 4 | 6 | 8 | 9 |
| 1 band apart | 2 | 4 | 6 | 7 |
| 2+ bands apart | 0 | 1 | 3 | 4 |

An enemy that ducks one band and goes silent drops you from `TRACKING` to `FAINT` at `LONG`. This is what makes Scenario 3 a stealth chase.

### 2.5 Acoustic signature modifier

The base tables assume the target is at `STANDARD` speed (acoustic sig = 4). Adjust each tick:

```
contactQuality = baseTableValue + (targetAcousticSig − 4)
```

Clamp to `[0, 10]`. All integer math.

**What changes `targetAcousticSig`** (additive on base of 4):

| Source | Δ sig | Duration |
|---|---|---|
| Speed `SILENT` | −3 | While set |
| Speed `STANDARD` | +0 | While set |
| Speed `AHEAD_FULL` | +2 | While set |
| Fired any weapon | +3 | 5 ticks after shot |
| `BLOW_BALLAST_EMERGENCY` | +5 | 10 ticks |
| Hull breach (room HP ≤ 25%) | +2 | Until repaired between encounters |
| `AHEAD_FULL` during depth transition (cavitation) | +2 | While both conditions hold |

Effects stack. A panicked crew under emergency blow with a hull breach: 4 + 2 + 5 + 2 = **sig 13** — `LOCKED` from any depth at `LONG`. Going `SILENT` from `STANDARD` with no recent firing: **sig 1** — drops the destroyer's quality by 3 across all range bands.

### 2.6 Depth fix

The surface vessel has a `depthFix` boolean per sub target. When set, depth charges are aimed at the sub's **actual** current depth band. When cleared, depth charges drop at a random band.

| Event | Effect |
|---|---|
| Observer quality reaches `LOCKED` (≥ 8) for 3 continuous ticks | Fix **acquired** |
| Sub changes depth band while observer quality < 8 | Fix **cleared** |
| Sub maintains quality < 6 on the observer for 10 continuous ticks | Fix **cleared** |
| Sub fires `BLOW_BALLAST_EMERGENCY` | Fix **acquired immediately** |

### 2.7 Key insight

The player sub can almost always hear surface ships before surface ships hear the sub — except when the sub is at `SURFACE`, which is the whole reason diving exists. The tactical lever is not "scan harder" but **"decide what they get to hear."** Every action that matters — speed setting, depth choice, weapon timing, emergency blow — is a choice about your own acoustic signature.

If a future mechanic does not interact with this asymmetry, it probably belongs in a different game.

---

## §3. Player actions each tick

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

## §4. Weapon resolution

Hit chance formula: `base_accuracy × range_modifier × depth_modifier × evasion_modifier`, clamped to `[5, 95]`. All values are integers.

### 4.1 Deck Gun

**Depth required:** player at `SURFACE`. Target at `SURFACE` (full accuracy) or `PERISCOPE` (½ accuracy).

| Range | Hit chance vs surface target |
|---|---|
| `LONG` | 0 (out of range) |
| `MEDIUM` | 15 |
| `SHORT` | 60 |
| `POINT_BLANK` | 85 |

- **Damage:** 2 hull HP per hit.
- **Reload:** 12 ticks (modified by Gunnery crew — see §6).

### 4.2 Torpedo

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

### 4.3 Depth Charges (enemy weapon — Patrol Destroyer only in MVP)

**Enemy depth required:** `SURFACE`. Target bands: `PERISCOPE`–`DEEP`.

Each charge is aimed at a depth band. Hit if player's current depth matches **and** range is `SHORT` or `POINT_BLANK`: **60% chance, 3 hull HP**.

Miss conditions: player at `SURFACE` (charges sink too slow), player at `ABYSSAL` (out of reach), or range `MEDIUM`+.

Depth fix is acquired and lost per §2.6. When fix is cleared, charges drop to a random band (low hit chance).

### 4.4 Range × depth quick-reference

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

## §5. Enemy AI

Each archetype is 2–3 priority rules evaluated in order each AI tick. First true rule fires.

### 5.1 Merchant / Small Boat (Scenario 1)

| Priority | Rule |
|---|---|
| 1 | If range ≤ `SHORT` and deck gun reloaded → fire deck gun. |
| 2 | If hull HP < 50% → `AHEAD_FULL, OPEN` (flee). |
| 3 | Otherwise → `STANDARD, HOLD`. |

Speed: 1 band per 20 ticks (slower than player). Cannot dive.

### 5.2 Patrol Destroyer (Scenario 2)

| Priority | Rule |
|---|---|
| 1 | If player at `PERISCOPE`–`DEEP` and range ≤ `SHORT` → drop depth charge at last known depth. |
| 2 | If player at `SURFACE` and range > `SHORT` → `AHEAD_FULL, CLOSE`. |
| 3 | If player at `SURFACE` and range ≤ `SHORT` → fire deck gun. |
| 4 | Otherwise → `STANDARD, CLOSE` and ping sonar. |

Acquires and loses depth fix per §2.6.

### 5.3 Submerged Hostile (Scenario 3)

| Priority | Rule |
|---|---|
| 1 | If torpedoes loaded and range ≤ `MEDIUM` and depth differential ≤ 1 → fire torpedo. |
| 2 | If hit within last 20 ticks and not detected → change depth 1 band + `SILENT, HOLD`. |
| 3 | Otherwise → match player depth + `STANDARD, CLOSE`. |

Only attacks when it has a firing solution. A missed first shot from the player triggers rule 2 — the fight becomes a stealth chase.

---

## §6. Win, lose, escape

### 6.1 Common conditions

| Outcome | Condition |
|---|---|
| **Win** | Enemy `hullHP` reaches 0 |
| **Lose** | Player `hullHP` reaches 0, **or** O2 reaches 0 while submerged with no surface path, **or** all crew dead/panicked |
| **Escape** | Scenario-specific (below); node marked `EVADED` — no XP, no loot |

### 6.2 Scenario 1 — surface gunfight

- **Escape:** range reaches `LONG` for 10 continuous ticks with direction `OPEN`. No fuel cost.
- **Target:** winnable around tick 80 with default loadout. This is the tutorial fight.

### 6.3 Scenario 2 — surface contact, dive decision

- **Escape:** reach `DEEP` and hold for 15 ticks while range ≥ `MEDIUM`. Geometric — no RNG once conditions are met.
- **Key decision:** dive to fight with torpedoes vs stay on surface with deck gun. Loadout should make one option clearly better; the player should feel that consequence.

### 6.4 Scenario 3 — submerged ambush

- **Escape:** rig for silent for 30 continuous ticks while range ≥ `MEDIUM`. Hostile breaks contact.
- **Key decision:** first-shot accuracy. A missed opening salvo usually means breaking off.

---

## §7. Crew contribution during combat (passive only)

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

## §8. Tick sequence

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

## §9. Design tradeoffs

1. **Discrete range bands vs continuous distance.** Bands are testable, pixel-art-displayable, and AI-legible. Cost: fights can feel snappy at transitions. Recommendation: take the bands. Revisit if MVP playtest shows fights feel binary.

2. **Single engaged enemy in MVP.** Multi-target means per-enemy range scalars and an AI coordination layer. Recommendation: 1v1 only for MVP. Model a "reinforcement arrives" beat as an environmental timer, not a second simulated unit.

3. **Gate vs multiplier for crew rooms.** Gates (Engineering → no `AHEAD_FULL`; Torpedo Room → reload halts) make crew loss narratable. Pure multipliers feel like a spreadsheet. At least one room per fight must be a gate.

---

## §10. Out of scope for MVP

The following are noted but not implemented for the three MVP scenarios:

- Multi-enemy battles and wolfpack encounters
- Bearing / facing / firing arcs
- Fire and flood spread inside rooms
- Crew movement during combat
- Damage Control room active during combat
- Alien weapons (Arc-Lance, Harmonic Charge) — kept as a future loadout layer

Ship the three scenarios first. Balance them. Then expand.

---

## §11. RNG streams used in combat

| Stream name | Used for |
|---|---|
| `combat.hit` | Evasion roll per incoming shot |
| `combat.spread` | Depth charge band selection when depth fix is lost |
| `combat.crew_panic` | Panic check on stress threshold |
| `enemy.ai` | Enemy AI tie-breaking at decision points |

All streams are sub-streams of the run seed. Replay requires recording the seed only.
