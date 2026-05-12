# JenesBoot — Core Design Reference v0.1

**Status:** Authoritative spec for prototype implementation. Pre-balance numbers — all integers chosen for legibility, expected to drift during playtest. Floats are forbidden; all values below are integers unless flagged otherwise.

**Reading order for engineers:** Section 1 (sub), Section 2 (crew), Section 4 (resources), Section 7 (interaction matrix), Section 3 (perks), Section 5 (upgrades), Section 6 (archetypes), Section 8 (tone). Section 7 is the wiring diagram — implement the systems it references first.

---

## 0. Foundational concepts (read first)

**Tick.** The sim advances in fixed integer ticks. Target: 5 ticks per real-time second at 1x speed. Combat and free-travel both tick. All consumption rates, cooldowns, and timers are expressed in ticks.

**Depth bands.** Depth is a discrete enum, not a float. Five bands. Every depth-aware mechanic switches on band, not on raw meters.

| Band | Enum | Meaning |
|---|---|---|
| 0 | `SURFACE` | Diesel runs, radio works, max sensor range, fully visible |
| 1 | `PERISCOPE` | Diesel off, periscope spotter, half visibility |
| 2 | `SHALLOW` | Standard cruise depth, balanced |
| 3 | `DEEP` | Hull stress begins, mental pressure on crew, sonar advantage |
| 4 | `ABYSSAL` | Endgame depth; only reachable with upgraded hull + perked crew |

Movement between adjacent bands costs a fixed dive/surface action time (e.g. 20 ticks per band) and electricity per band.

**Determinism.** Every stochastic outcome routes through a named RNG stream seeded from the run seed. Streams listed in §7.

**Room model.** Submarine is a grid of rooms (FTL-style). Each room has: type, level (1–3), HP (0–`maxHP`), oxygen level (0–100), fire (0–3), flood (0–3), and a list of crew currently inside. Stats below describe ship-wide aggregates derived from room state plus upgrade tier.

---

## 1. Submarine stats

All stats are integers. "Tier" means upgrade tier (see §5). Most stats are derived: `base + sum(roomLevel contributions) + sum(crewSkill contributions while operating)`.

| Stat | Range | Tiers | What it governs | Key interactions |
|---|---|---|---|---|
| **Depth Rating** | 0–4 (enum band) | T1=2, T2=3, T3=4 | Max depth band the hull can sustain indefinitely | Above rating: hull takes 1 dmg per 10 ticks per band over. Drives the deep-sea archetype. |
| **Hull Integrity** | 0–`maxHull` | T1=20, T2=30, T3=45 | Ship HP. Run ends at 0. | Reduced by enemy hits, depth overstress, untreated flooding. Repaired by Engineer crew in damaged rooms. |
| **Pressure Resistance** | 0–10 | T1=3, T2=6, T3=10 | Mitigates depth-induced hull damage and crew mental pressure | Each point reduces depth-stress damage by 10% (integer: pts × dmg / 10). |
| **Oxygen Capacity** | 0–`maxO2` units | T1=100, T2=160, T3=240 | Ship-wide oxygen pool | Consumed per tick by crew breathing (§4). Refilled by O2 Generator room while electricity flows. |
| **O2 Generation Rate** | 0–6 / tick | T1=2, T2=4, T3=6 | O2 added per tick when generator is powered and undamaged | Halved if generator HP < 50%. Zero at 0 HP. |
| **Battery Capacity** | 0–`maxBatt` | T1=200, T2=400, T3=700 | Electricity reserve when diesel off (submerged) | Drained by all powered systems each tick. |
| **Diesel Output** | 0–8 / tick | T1=4, T2=6, T3=8 | Electricity generated while `SURFACE` | Inactive at depth ≥ `PERISCOPE`. Consumes fuel. |
| **Surface Sensor Range** | 0–6 (grid cells) | T1=3, T2=4, T3=6 | Detection radius while surfaced | Spotter perks add +1. |
| **Sonar Range** | 0–6 | T1=2, T2=4, T3=6 | Detection radius while submerged | Boosted by Sensor Tech crew skill. Halved if enemy is also silent. |
| **Hydrophone Bonus (deep)** | 0 / +1 / +2 | T2 unlocks +1 at `DEEP`+ | Bonus to Sonar Range when at `DEEP` or `ABYSSAL` | Core to deep-sea archetype: deep boat sees first. |
| **Surface Speed** | 0–10 | T1=6, T2=8, T3=10 | Strategic-map travel speed while surfaced | Reduces encounter avoidance roll TTL. |
| **Submerged Speed** | 0–6 | T1=2, T2=4, T3=6 | Travel + maneuver speed when submerged | Lower than surface by design. |
| **Acoustic Signature** | 0–10 (lower = quieter) | T1=6, T2=4, T3=2 | How easily enemies detect you when submerged | +2 when engines at full power, +3 when firing weapons. Reduced 50% at `DEEP`+. |
| **Evasion** | 0–80 (% chance, integer) | Base 10 | Chance an incoming shot misses | +10 per band below `SHALLOW`. +5 per Navigator level. -20 when reactor offline. |
| **Weapon Hardpoints** | 1–4 slots | T1=2, T2=3, T3=4 | Number of weapons simultaneously mountable | Each weapon has its own ammo type and cooldown. |
| **Ammo Capacity (per type)** | 0–`maxAmmo` | T1=10, T2=20, T3=40 | Per-weapon ammo store | Reload happens at base. |
| **Crew Capacity** | 3–8 | T1=4, T2=6, T3=8 | Max berths. Recruiting above cap requires upgrade. | Larger crew = more O2 and food consumption. |
| **Room Count** | 4–10 | Grows with hull tier | Number of installable rooms | Fixed grid; expansion is an upgrade event. |

### Room types

Each room is a discrete entity with level 1–3 and its own HP.

| Room | Function | Crew slots |
|---|---|---|
| Bridge | Navigation, evasion bonuses, scripted orders | 1 |
| Engine | Provides Surface/Submerged Speed | 1–2 |
| Reactor / Battery | Battery capacity and discharge cap | 1 |
| O2 Generator | Ship oxygen | 1 |
| Sonar | Sonar Range; required for deep targeting | 1 |
| Weapon Mount (×N) | One per hardpoint | 1 |
| Medbay | Heals crew over time | 1 |
| Quarters | Restores fatigue, morale | 0 (passive) |
| Galley | Converts food into morale buffs | 1 |
| Dive Trim (deep-archetype unlock) | +1 Depth Rating while crewed | 1 |

Rooms have HP equal to `10 × level`. Damaged rooms suffer linear efficiency loss (HP/maxHP). Below 25% HP, function is offline.

---

## 2. Crew attributes

A crew member is a record of: identity, stats, skills, perks, status, assignment.

### 2.1 Core stats

| Stat | Range | What it does | Scales by |
|---|---|---|---|
| **Health (HP)** | 0–`maxHP` | Crew dies at 0. | Base 10, +2 per Body level. |
| **Mental (MP)** | 0–`maxMP` | Resistance to pressure, fear, alien exposure events. At 0: panic state (random movement, drops task). | Base 10, +2 per Mind level. |
| **Fatigue** | 0–100 | Rises while working, falls while in Quarters. >70: −1 to all skill checks. 100: forced sleep wherever they stand. | — |
| **Morale** | 0–100 | <30: refuses orders 25% of ticks. >70: +1 to skill checks. | Adjusted by events, Galley meals, deaths of crewmates. |
| **Oxygen Need** | 1 / tick | Constant per crew member while alive | — |
| **Food Need** | 1 / 600 ticks | Galley consumption | — |

### 2.2 Skills

Each skill is 0–5. Levels gained by performing the skill's action. Each level: −1 task tick or +1 effect.

| Skill | Action it speeds/improves | Room affinity |
|---|---|---|
| **Engineer** | Repairs HP, extinguishes fires, patches flooding | Any damaged room |
| **Navigator** | Evasion bonus, strategic map speed, dive/surface speed | Bridge |
| **Gunner** | Weapon reload speed, hit chance | Weapon Mount |
| **Sensor Tech** | Sonar/sensor range, target prediction | Sonar |
| **Medic** | Heal speed and amount; field stabilize | Medbay |
| **Diver** | EVA actions (sabotage, salvage, deep events) | Hatch (event-only) |

A crew member can carry **two skills at meaningful level** by design — the third skill develops slowly. This forces specialization.

### 2.3 Status flags (enum, exclusive where noted)

`HEALTHY` | `WOUNDED` (HP < 50%, −1 to skills) | `PANICKING` (MP at 0) | `EXHAUSTED` (Fatigue ≥ 100) | `SUFFOCATING` (room O2 < 20) | `DEAD`

Non-exclusive: `PRESSURE_SICK` (acquired at `DEEP`+ without protection), `IRRADIATED` (alien-tech accident), `ENLIGHTENED` (rare positive alien event).

---

## 3. Perk system

**Acquisition:**
- **Recruitment.** New crew at bases come with 1 perk from a weighted pool. Rare recruits roll 2.
- **Level-up.** Each skill level-up offers a choice of 2 perks gated by that skill.
- **Events.** Run events can grant or strip perks.

**Cap:** Max **4 perks** per crew.

**Categories:** `DEEP_SEA`, `COMBAT`, `OPERATIONS`, `SURVIVAL`, `ALIEN`

### Perk catalog (★ = central to deep-sea archetype)

| # | Name | Category | Effect |
|---|---|---|---|
| 1 | ★ **Pressure-Hardened** | DEEP_SEA | Immune to MP loss at `DEEP`. Half MP loss at `ABYSSAL`. |
| 2 | ★ **Abyssal Native** | DEEP_SEA | At `ABYSSAL`, +2 to all skill checks. Outside, −1. |
| 3 | ★ **Deep Sonar Affinity** | DEEP_SEA | +2 Sonar Range while operating Sonar at `DEEP`+. |
| 4 | ★ **Trim Diver** | DEEP_SEA | Dive Trim room dives/surfaces 50% faster when crewed by this member. |
| 5 | ★ **Cold Lung** | DEEP_SEA | Oxygen Need halved (1 per 2 ticks). |
| 6 | **Crack Shot** | COMBAT | Crit chance +15% (crits deal +50% damage). |
| 7 | **Quick Reload** | COMBAT | Weapon reload time −20%. |
| 8 | **Damage Control** | OPERATIONS | Repair speed +30%. Fires extinguished twice as fast. |
| 9 | **Wrench Monkey** | OPERATIONS | Engine room produces +1 speed when this crew operates it. |
| 10 | **Power Miser** | OPERATIONS | Room draws 1 less electricity per tick (min 0). |
| 11 | **Field Medic** | SURVIVAL | Stabilize a downed crewmate outside Medbay once per encounter. |
| 12 | **Iron Stomach** | SURVIVAL | Food Need halved. Immune to spoiled rations morale loss. |
| 13 | **Insomniac** | SURVIVAL | Fatigue rises 30% slower. |
| 14 | **Steel Nerves** | SURVIVAL | Never panics above 1 MP. Loses panic state in 5 ticks instead of 30. |
| 15 | ★ **Bioluminescent Eye** | ALIEN | At `DEEP`+, reveals one enemy room per scan (requires Alien Sensor upgrade). |
| 16 | **Voidspoken** | ALIEN | +2 Mental cap. 5% chance per encounter to predict the next enemy weapon fired. |
| 17 | ★ **Gillsworn** | ALIEN | Oxygen Need = 0. Cannot survive at `SURFACE` for more than 300 ticks. |
| 18 | **Lightning Hands** | ALIEN | Laser/alien weapons reload 25% faster. |
| 19 | **Drillmaster** | COMBAT | Adjacent crewmates gain +1 to skills while this crew is on Bridge. |
| 20 | **Salvager** | OPERATIONS | After winning an encounter, +25% scrap/loot. |

Deep-sea identity set: #1, #2, #3, #4, #5, #15, #17.

---

## 4. Resource system

| Resource | Storage cap | Consumption trigger | Scarcity effect | Depth synergy |
|---|---|---|---|---|
| **Water** | 100/200/300 (T1–T3) | 1 per crew per 1200 ticks; 5 per Medbay heal | <20: morale −1/tick. 0: 1 HP per 200 ticks. | +1 per 600 ticks from condensation at `DEEP` (if upgraded). |
| **Oxygen** | See §1 | Crew breathing + leaks | Room O2 < 20: `SUFFOCATING`. Ship O2 = 0: HP loss. | Hull breaches lose 2× O2 at depth. |
| **Food** | 50/100/200 | 1 ration per crew per 600 ticks | <10: morale −2/tick. 0: fatigue 2×, HP drops. | None direct; long deep runs need more per voyage. |
| **Ammo** | Per weapon (§1) | 1 per shot | Empty weapon = useless until base. | None direct. |
| **Electricity** | Battery cap (§1) | All powered systems per tick | 0: rooms power down in priority order. | The deep run's clock. Without upgrades, browns out by ~800 ticks. |
| **Fuel** | 50/100/200 | 1 per 60 ticks while diesel runs | 0: cannot generate electricity at surface; cannot strategic-move. | None direct. |

**The depth clock.** A deep-sea run's failure mode is running out of electricity or oxygen at depth before loot lets you surface safely. Without the deep-sea build, a `DEEP` camp browns out inside 800 ticks. The build pushes that ceiling past 2000.

---

## 5. Upgrade tree

Currency: **Scrap**. Some upgrades also require a tech token (alien artifact, salvaged blueprint).

| Category | Effects | Deep-sea relevance |
|---|---|---|
| **Hull** | Hull Integrity, Pressure Resistance, Depth Rating, Room Count | Core. T3 is the gate to `ABYSSAL`. |
| **Propulsion** | Surface/Submerged Speed, Diesel Output, Acoustic Signature | Quieter engines for deep stealth. |
| **Life Support** | O2 Capacity/Generation, Water cap, Food cap, Battery cap | O2 + Battery are the deep clock. Mandatory. |
| **Sensors** | Surface/Sonar/Hydrophone, Alien Sensor unlock | Hydrophone Bonus + Alien Sensor unlock deep-sea offense. |
| **Weapons** | Hardpoints, Ammo cap, mount types | Pick low-noise/electric weapons for deep build. |
| **Crew Quarters** | Crew Cap, Medbay tier, Galley tier, Dive Trim unlock | Dive Trim room is exclusive to deep-sea path. |

### Deep-sea progression path (recommended order)

1. Hull T2 → unlock `DEEP`
2. Life Support T2 → Battery + O2 capacity
3. Sensors T2 → Hydrophone Bonus +1
4. Propulsion T2 → Acoustic Signature down
5. **Install Dive Trim room** (requires Hull T2 + tech token from wreck)
6. Hull T3 → unlock `ABYSSAL`
7. Sensors T3 + **Alien Sensor module** → enables Bioluminescent Eye
8. Life Support T3 → battery to 700 for long abyssal patrols
9. Recruit Pressure-Hardened, Cold Lung, Gillsworn crew

---

## 6. Playstyle archetypes

### 6.1 ★ Deep Stalker
- **Loop:** Dive to `DEEP`/`ABYSSAL`, locate enemy via Hydrophone, fire from depth, surface only to resupply.
- **Key stats:** Depth Rating, Pressure Resistance, Sonar Range, Battery Capacity, Acoustic Signature (low).
- **Key perks:** Pressure-Hardened, Abyssal Native, Deep Sonar Affinity, Cold Lung, Trim Diver, Bioluminescent Eye.
- **Strengths:** Hard to detect, +20–30 Evasion from depth, first-strike via sonar.
- **Weaknesses:** Battery is the run clock. Surfacing near bases is dangerous. Weapons limited to deep-fire-capable types.

### 6.2 Surface Raider
- **Loop:** Stay surfaced for diesel power, high speed, heavy weapons, win fast before reinforcements.
- **Key stats:** Surface Speed, Hull Integrity, Hardpoints, Diesel Output.
- **Key perks:** Crack Shot, Quick Reload, Salvager, Drillmaster, Iron Stomach.
- **Strengths:** Fast, hits hard, abundant power, easy resupply.
- **Weaknesses:** Visible, easily flanked, vulnerable to air attack events.

### 6.3 Silent Knife
- **Loop:** Periscope-depth approach, single decisive volley, escape submerged.
- **Key stats:** Acoustic Signature (lowest), Sonar Range, Evasion, burst damage.
- **Key perks:** Power Miser, Steel Nerves, Crack Shot, Lightning Hands.
- **Strengths:** Picks only fights it wants, rarely takes damage.
- **Weaknesses:** Low hull, brittle in extended fights.

### 6.4 Crew Brawler
- **Loop:** Disable enemy weapons, send Divers via hatch to board, claim ship intact for bonus scrap.
- **Key stats:** Crew Capacity, Medbay tier, Diver skill.
- **Key perks:** Field Medic, Drillmaster, Voidspoken, Iron Stomach.
- **Strengths:** High loot, scales with crew quality.
- **Weaknesses:** Crew deaths are catastrophic; high O2/food load.

---

## 7. Interaction matrix

### 7.1 Stat × Resource

| Sub stat | Drains | Produces |
|---|---|---|
| O2 Generation Rate | Electricity (2/tick) | Oxygen |
| Diesel Output | Fuel | Electricity (surface only) |
| Submerged Speed (engine room) | Electricity | — |
| Weapon fire | Ammo, Electricity (per shot) | — |
| Dive/Surface action | Electricity (per band) | — |
| Sonar (active ping) | Electricity | Detection event |
| Medbay heal | Water | Crew HP |
| Galley meal | Food, Water | Morale buff (timed) |

### 7.2 Crew skill × Sub stat

| Skill | Stat affected | Magnitude |
|---|---|---|
| Engineer (in damaged room) | Room HP regen | +1 HP per (10 − level) ticks |
| Navigator (Bridge) | Evasion | +5 per level |
| Navigator (Bridge) | Dive/surface action time | −5% per level |
| Gunner (Weapon Mount) | Reload time | −10% per level |
| Gunner (Weapon Mount) | Hit chance | +5% per level |
| Sensor Tech (Sonar) | Sonar Range | +1 per 2 levels |
| Sensor Tech (Sonar) | Enemy target lock time | −10% per level |
| Medic (Medbay) | Heal rate | +1 HP per (5 − level) ticks |
| Diver (Hatch event) | Sabotage success | +10% per level |

### 7.3 Depth band effects

| Band | Diesel | Acoustic Sig | Sonar bonus | Evasion bonus | MP drain (no perk) | Hull stress (over rating) |
|---|---|---|---|---|---|---|
| SURFACE | ON | +2 | −2 | 0 | 0 | 0 |
| PERISCOPE | OFF | +0 | 0 | +5 | 0 | 0 |
| SHALLOW | OFF | 0 | 0 | +10 | 0 | 0 |
| DEEP | OFF | −2 | +1 (Hydrophone T2) | +20 | 1/200 ticks | 1 HP/10 ticks per band over |
| ABYSSAL | OFF | −3 | +2 (Hydrophone T3) | +30 | 2/200 ticks | 2 HP/10 ticks per band over |

### 7.4 RNG streams (all deterministic, seeded from run seed)

`weapon_hit`, `weapon_crit`, `event_roll`, `recruit_roll`, `perk_offer`, `loot_roll`, `panic_check`, `map_layout`

Each streamed from `seed_root + hash(stream_name)`.

### 7.5 Required event log entries

Schema: `{ tick, kind, actor_id?, target_id?, payload }`

Kinds: `damage`, `repair`, `death`, `recruit`, `perk_gained`, `room_offline`, `dive`, `surface`, `jump`, `encounter_start`, `encounter_end`, `resource_zero`, `run_end`

QA cannot assert on what isn't logged.

---

## 8. Fantasy WWII + alien tone

- **Hull / pressure:** Riveted U-boat plates reinforced with non-Euclidean alloy ribs salvaged from a downed saucer. Pressure sickness manifests as alien whispers, not nitrogen narcosis.
- **Depth bands:** `ABYSSAL` is named **"The Vault"** in UI — something is down there, not just us.
- **O2 Generator:** Standard scrubbers + an alien algae tank. Gillsworn lore: "She breathes the algae directly."
- **Electricity / Battery:** Alien crystal capacitor — explains the 1942 U-boat's hours of submerged endurance.
- **Sensors / Hydrophone:** Standard sonar + **Bioluminescent Lure** upgrade (a bolted-on tendril that sees heat through water).
- **Weapons:** Deck gun + torpedoes + **arc-lance** (laser cannon) + **harmonic charge** (alien depth charge).
- **Crew perks (ALIEN):** Acquired by artifact exposure or surviving abyssal encounters. The deep changes you.
- **Enemies:** Nazi surface fleet (corvettes, destroyers, recon planes) at shallow; **abyssal cult-craft** and **leviathans** at depth. Different bestiary rewards diving.
- **Bases:** Allied resistance ports + neutral **"singing reefs"** (rare upgrades, alien tokens, but risk).
- **Run framing:** Each run is a single patrol cycle. Death = boat lost. Victory = sector liberated, next sector unlocks.

---

## 9. Open questions (flagged, not blocking)

1. **Save format:** JSON snapshot of sim state + seed + input log for replay determinism.
2. **Map model:** Recommend FTL beacon graph (simplest, fits roguelike, easiest to test headlessly).
3. **Real-time speed:** 5 ticks/sec at 1x is a starting assumption — confirm in first playable.
4. **Weapon roster:** This doc defines hardpoints and ammo cap but not the full weapon list. Next design doc: *Weapons & Enemies*.
5. **Boarding:** Crew Brawler assumes a boarding event. Lowest-cost prototype: resolve as a die-roll modified by Diver skill. Defer real boarding until post-prototype.

---

## 10. Scope guard (deliberately omitted)

- No torpedo solutions, lead angles, or realistic acoustic modeling.
- No supply chain or strategic base economy beyond scrap.
- No procedural crew personalities beyond stats + perks.
- No multi-deck interiors. Single-layer cutaway like FTL.
- No weather, currents, or thermoclines. Depth band is the entire underwater dimension.

Next design docs in queue: (a) Weapons & Enemies roster, (b) Event/encounter catalog, (c) Base/economy spec.
