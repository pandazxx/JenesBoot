# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: JenesBoot

A **prototype / demo** for a submarine game. The repo is currently empty — this file captures design intent so future work stays coherent.

## Genre and references

Inspired by **FTL: Faster Than Light** and **Bomber Crew**. **Not a realistic submarine simulator** — do not pull mechanics, UI patterns, or framing from *Silent Hunter*, *UBOAT*, or similar sims.

Core loop:
- Recruit and manage submarine crew; assign them to chambers with tasks; level them up.
- Semi-automatic, semi-realtime ship-to-ship combat (FTL-style, pausable).
- Build, extend, and upgrade the submarine between encounters.
- Resource management: water, oxygen, food, ammo, electricity, fuel.
- Liberate territories on a campaign map; dock at bases to upgrade / build / resupply.
- Roguelike survival structure (run-based).

## Setting and tone

Fantasy WWII with alien technology. The player fights Nazis and the aliens controlling them. Anachronisms are intentional — e.g. a diesel-powered U-boat firing a laser cannon. When making art, copy, or mechanic decisions, lean into this fusion rather than sanding it down toward historical realism.

## Art direction

Pixel art, FTL-style. Keep palette and sprite scale consistent with that reference.

## Tech stack

- **Language:** TypeScript (strict mode).
- **Renderer:** PixiJS (WebGL pixel-art).
- **Build:** Vite. Deployed as a static site to GitHub Pages.
- **Simulation:** plain TypeScript modules. No DOM, no PixiJS imports, no `window` / `document`, no wall-clock reads, no `Math.random()`. The simulation is the same code in the web build and the headless build.
- **Headless target:** a Node entry that imports the same simulation modules. Used by `gameplay-qa` for scripted scenarios and by CI for smoke runs.

Tooling below this layer (package manager, linter, test runner, formatter) is chosen by `build-engineer` in its first PR — boring, mainstream, version-pinned.

## Way of working

- **All code is written by an LLM agent.** Optimize for legibility to future-Claude over cleverness; keep modules small and named for what they do.
- **CI/CD is a requirement from day one.** Every merge should produce a deployable web build the user can open in a browser. Wire this up before mechanics pile up.
- Keep PRs small and self-contained so each can be reviewed and play-tested independently.

## Agent-testable by design

This project is heavily agent-driven, so the **game itself must be drivable by an agent without a human at the keyboard**. Treat this as a first-class architectural constraint, not an afterthought:

- **Deterministic by seed.** All RNG flows from explicit seeds. The same seed plus the same input sequence must produce the same outcome, tick for tick.
- **Headless mode.** The game runs without rendering or audio when asked. Logic, simulation, and rendering must be cleanly separable.
- **Scriptable input.** An input queue or scripting API can drive the game in lieu of mouse/keyboard, including pause/step/advance-N-ticks controls.
- **State inspection API.** Tests can read crew state, room state, resources, RNG state, and event log without reaching into internals.
- **Event log.** Significant events (damage, death, jump, recruit, run-end) emit structured records the QA agent can assert against.

If a gameplay feature can't be exercised through these hooks, the hooks are incomplete — fix them before shipping the feature. `gameplay-qa` runs scripted scenarios on top of this surface; it cannot do its job if the surface isn't there.

## Commands

```
npm run dev       # Vite dev server (HMR)
npm run build     # production web build → dist/
npm run preview   # preview dist/
npm run typecheck # tsc --noEmit
npm run lint      # eslint src/
npm run test      # vitest run (unit tests, node environment)
npm run headless  # build headless entry then run: node dist-node/runner.js
```

Headless smoke check (same as CI):
```
npm run headless -- --seed 42 --ticks 10
```

Stack: npm · TypeScript 5 (strict) · Vite 6 · PixiJS 8 · Vitest 3 · ESLint 9 · Prettier 3

## Deferred design decisions

Not blocking, but flag before silently picking an answer:
- Save format and run-state representation.
- Map / sector model (FTL-style beacon graph vs. tile grid vs. something else).
- How the "fantasy WWII + aliens" tone is conveyed in UI copy and faction naming.
