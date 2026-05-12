# JenesBoot — Battle Loop Design v0.1

**Status:** Authoritative spec for combat implementation. Pre-balance numbers — all integers. Reading order for engineers: §0 (tick sequence), §1 (detection), §2 (depth), §3 (weapons), §4 (enemies), §5 (crew in combat), §6 (escape).

---

## §0. Tick sequence (deterministic, ordered)

**Target tick rate: 10 ticks per real-time second at 1× speed.**

Every combat tick runs these 12 steps in strict order. No step may skip ahead or reorder.

| Step | Action |
|---|---|
| 1 | Resolve in-flight projectiles (apply hits from last tick's fire) |
| 2 | Apply resource costs (battery drain, O2 burn, fuel if surfaced) |
| 3 | Process player input queue (depth commands, weapon commands, crew moves) |
| 4 | Process enemy AI |
| 5 | Apply depth transitions (advance band timer; apply vulnerability if mid-transition) |
| 6 | Fire weapons (player and enemy, subject to depth constraints) |
| 7 | Apply damage to rooms and crew |
| 8 | Update room state (fire spread, flood spread, O2 loss in breached rooms) |
| 9 | Update crew state (move 1 tile toward assignment, apply morale/panic ticks) |
| 10 | Check win/lose/escape conditions |
| 11 | Emit structured event log entries |
| 12 | Advance tick counter |

**Headless note:** A torpedo fired on tick N resolves on tick N+1 (step 1 of the next tick). A depth transition started on tick N and an incoming torpedo on tick N both resolve depth first (step 5), then damage (step 7) — so the evasion bonus from a completed band transition applies to shots on the same tick.

---

## §1. Detection phase

Combat does not begin at first contact. Both sides close in on the map. Detection is a comparison resolved each tick before weapons range.

| Variable | Description |
|---|---|
| Player Sonar Range | Ship stat (see core-reference §1). Increases with depth at `DEEP`+ via Hydrophone Bonus. |
| Enemy Acoustic Signature | Per-enemy value (see §4). Stealthy enemies have low acoustic signature. |
| Enemy Sensor Range | Per-enemy value. |
| Player Acoustic Signature | Ship stat. Increases +2 at full engine power; +3 while firing. |

**Spotter rule:** Whichever side's sensor range first exceeds the other side's acoustic signature becomes the *spotter* for that encounter.

**Spotter grace window:** 10 ticks. During this window the spotting side may: engage (fire first), reposition (attempt map movement), or flee (begin an escape sequence). The spotted side is unaware and cannot act. After 10 ticks, both sides are mutually aware and active combat begins.

**Design intent:** Hydrophone upgrades and quiet-engine investment buy the right to decide whether a fight happens at all — not just a statistical bonus.

---

## §2. Depth as a live combat tool

Depth band transitions take **6 ticks per band**. The sub is *vulnerable* (−20 Evasion) for the full duration of any mid-transition. Depth is a commitment, not a spam button.

| Band | Combat effects |
|---|---|
| `SURFACE` | Diesel runs; max sensor range; +0 Evasion; fully hittable by all weapons |
| `PERISCOPE` | Diesel off; −5 Evasion from surface; hittable by surface weapons and torpedoes |
| `SHALLOW` | Standard cruise; +10 Evasion; hides from surface gun fire |
| `DEEP` | +20 Evasion; immune to surface weapons; Hydrophone Bonus active; −1 O2/tick extra; hull stress if Depth Rating < 3 |
| `ABYSSAL` | +30 Evasion; immune to all standard weapons; −3 O2/tick extra; hard hull stress if Depth Rating < 4; **ABYSSAL escape available** |

Evasion bonuses here are additive on top of the base Evasion stat from core-reference §1.

---

## §3. Weapon depth constraints

Each weapon has a depth band range `[min, max]` within which it can fire. Outside that range, the fire command is silently queued and executes when depth re-enters the valid range, or can be cancelled by the player.

| Weapon | Type | Depth range | Notes |
|---|---|---|---|
| Deck Gun | Conventional; projectile; 1-tick travel | `SURFACE` only | High damage, no ammo cost for basic shells; vulnerable placement |
| Torpedo | Conventional; projectile; 2-tick travel | `PERISCOPE`–`DEEP` | Standard offensive weapon; ammo-limited |
| Arc-Lance | Alien; instant hit; no travel time | `SURFACE`–`SHALLOW` | Cannot miss; fixed damage; high electricity cost per shot |
| Harmonic Charge | Alien; area; 1-tick travel; depth-seeking | `SHALLOW`–`ABYSSAL` | Hits the target's current band ±1; very high O2 cost |

**Loadout commits depth strategy.** Equipping Arc-Lance means staying near the surface to use it; equipping Harmonic Charge means going deep. Changing strategy mid-combat requires surfacing into danger or diving into O2 risk.

---

## §4. Enemy archetypes

### Enemy room layout

Enemy rooms are **visible from combat start** (Option A). The detection-phase fog already provides enough early uncertainty; FTL follows this pattern and it keeps QA scenario assertions clean. Revealed-on-hit is a second-pass feature if warranted by playtesting.

### Archetype table

| Archetype | Depth range | Weapons | Acoustic Sig | Design role |
|---|---|---|---|---|
| Patrol Destroyer | `SURFACE` only; drops depth charges to `SHALLOW`–`DEEP` | Surface guns + depth charges (miss `ABYSSAL`) | High (8) | Easiest to escape by going deep; dangerous to linger at `SHALLOW` |
| Wolfpack Hunter | `SURFACE`–`SHALLOW` | Torpedoes | Medium (5) | Follows to `SHALLOW`; symmetric torpedo fight; cannot be escaped by diving past `SHALLOW` |
| Cult-craft | `DEEP`–`ABYSSAL`; fires from any depth | Harmonic Charges + unknown alien weapon | Very low (2) | Late-game enemy; `ABYSSAL` is not shelter against it; punishes the deep-sea build's assumed safe zone |

### Enemy stat template

Each archetype has: `hullHP`, `roomCount`, `sensorRange`, `acousticSig`, `weapons[]`, `depthRange[min,max]`, `aiPattern`. AI pattern is an enum: `PURSUE`, `DEPTH_CHARGE`, `ORBIT`. Specific values are in the balance sheet (TBD pre-playtest).

---

## §5. Crew during combat

Crew mechanics follow the FTL model: click crew → click destination room → crew walks at **1 tile per tick** toward assignment.

### Room damage

| Event | Effect |
|---|---|
| Room takes a hit | All crew inside lose `hitDamage` HP; room HP decreases |
| Room HP < 25% | Room function offline; crew in room gain +1 stress/tick |
| Room HP = 0 | Room inoperable; fire or flood may spread |

### Panic (MP = 0)

When a crew member's Morale Points reach 0:
- Crew abandons their post and refuses orders for **20 ticks**
- Manifests as a *system failure*, not a raw number: sonar goes dark, weapon stalls, engine loses output
- After 20 ticks, MP resets to 1 and crew can be reassigned

**Design intent:** Panic should feel like a subsystem crisis, not a UI debuff.

---

## §6. Escape

Two escape paths exist. Both leave the node marked `EVADED` with **no XP and no loot**. A failed attempt does not lock the player in — they may try again.

| Escape type | Requirement | Cost | Condition |
|---|---|---|---|
| Surface flee | Stay at `SURFACE` for **15 ticks** while under enemy fire | 2 Fuel | Enemy must be unable to reach `SURFACE` combat range, or player accepts hits during the 15 ticks |
| Abyssal escape | Stay at `ABYSSAL` for **5 ticks** | O2 burn (−5/tick during hold) + pressure damage if Depth Rating < 4 | Fails against Cult-craft (which operates at `ABYSSAL`) |

---

## §7. RNG streams used in combat

| Stream name | Used for |
|---|---|
| `combat.hit` | Evasion roll per incoming shot |
| `combat.spread` | Fire and flood spread direction per tick |
| `combat.crew_panic` | Panic check on stress threshold |
| `enemy.ai` | Enemy AI choice at each decision point |

All streams are sub-streams of the run seed. Replay requires recording the seed only, not individual rolls.
