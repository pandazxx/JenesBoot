/**
 * Combat render layer — PixiJS v8, split-screen layout.
 *
 * Left panel (460px): submarine interior with crew/room assignment (InteriorView).
 * Right panel (500px): tactical radar / compass (RadarView).
 *
 * Reads state exclusively through engine.getState() and engine.queueCommand().
 * No direct access to sim internals.
 *
 * Scenario is selected via ?scenario=<name> URL parameter.
 * Defaults to surface_battle.
 */

import { Application, Graphics } from "pixi.js";
import { SimEngine, type CombatScenario } from "../sim/index.js";
import type { ISimEngine } from "../sim/index.js";
import { DepthBand, SpeedSetting, SpeedDirection } from "../sim/combat/types.js";
import type { CombatState } from "../sim/combat/types.js";
import { InteriorView } from "./interior.js";
import { RadarView } from "./radar.js";
import { getTutorialStep } from "./tutorial.js";

const TICK_MS = 100;

const SPEED_ORDER: SpeedSetting[] = [
  SpeedSetting.SILENT,
  SpeedSetting.STANDARD,
  SpeedSetting.AHEAD_FULL,
];
const DIRECTION_ORDER: SpeedDirection[] = [
  SpeedDirection.OPEN,
  SpeedDirection.HOLD,
  SpeedDirection.CLOSE,
];

function readScenario(): CombatScenario {
  const param = new URLSearchParams(window.location.search).get("scenario");
  if (param === "destroyer_dive") return "destroyer_dive";
  return "surface_battle";
}

export function showCombat(app: Application, engine: ISimEngine, scenario: CombatScenario): void {
  app.stage.removeChildren();

  const interiorView = new InteriorView(engine);
  const radarView = new RadarView();

  interiorView.container.x = 0;
  radarView.container.x = 460;

  const divider = new Graphics();
  divider.rect(459, 0, 2, 540).fill(0x334455);

  app.stage.addChild(interiorView.container);
  app.stage.addChild(radarView.container);
  app.stage.addChild(divider);

  app.stage.eventMode = "static";

  let timeSinceLastTick = 0;
  let elapsed = 0;
  let paused = false;

  function tickerCallback(ticker: { deltaMS: number }): void {
    if (!paused) {
      timeSinceLastTick += ticker.deltaMS;
      elapsed += ticker.deltaMS;
      while (timeSinceLastTick >= TICK_MS) {
        timeSinceLastTick -= TICK_MS;
        engine.tick();
      }
    }

    const state = engine.getState();
    const combat: CombatState | null = state.combat ?? null;
    if (combat !== null) {
      const step = getTutorialStep(combat, scenario);
      interiorView.update(combat, step, elapsed);
      radarView.update(combat, state);
    }
  }

  app.ticker.add(tickerCallback);

  const onKey = (e: KeyboardEvent): void => {
    const state = engine.getState();
    const combat: CombatState | null = state.combat ?? null;

    switch (e.key.toLowerCase()) {
      case "f": {
        engine.queueCommand({ type: "FIRE_DECK_GUN" });
        break;
      }

      case "t": {
        engine.queueCommand({ type: "FIRE_TORPEDO" });
        break;
      }

      case "z": {
        const currentDepth = combat?.player.depth ?? DepthBand.SURFACE;
        const nextDepth = Math.min(DepthBand.ABYSSAL, currentDepth + 1) as DepthBand;
        engine.queueCommand({ type: "SET_DEPTH", target: nextDepth });
        break;
      }

      case "x": {
        engine.queueCommand({ type: "SET_DEPTH", target: DepthBand.SURFACE });
        break;
      }

      case "arrowright":
      case "d": {
        const currentDir: SpeedDirection = combat?.player.direction ?? SpeedDirection.HOLD;
        const currentSpd: SpeedSetting = combat?.player.speed ?? SpeedSetting.STANDARD;
        const idx = DIRECTION_ORDER.indexOf(currentDir);
        const nextDir =
          DIRECTION_ORDER[Math.min(idx + 1, DIRECTION_ORDER.length - 1)] ?? currentDir;
        engine.queueCommand({ type: "SET_SPEED", speed: currentSpd, direction: nextDir });
        break;
      }

      case "arrowleft":
      case "a": {
        const currentDir: SpeedDirection = combat?.player.direction ?? SpeedDirection.HOLD;
        const currentSpd: SpeedSetting = combat?.player.speed ?? SpeedSetting.STANDARD;
        const idx = DIRECTION_ORDER.indexOf(currentDir);
        const prevDir = DIRECTION_ORDER[Math.max(idx - 1, 0)] ?? currentDir;
        engine.queueCommand({ type: "SET_SPEED", speed: currentSpd, direction: prevDir });
        break;
      }

      case "arrowup":
      case "w": {
        const currentDir: SpeedDirection = combat?.player.direction ?? SpeedDirection.HOLD;
        const currentSpd: SpeedSetting = combat?.player.speed ?? SpeedSetting.STANDARD;
        const idx = SPEED_ORDER.indexOf(currentSpd);
        const nextSpd = SPEED_ORDER[Math.min(idx + 1, SPEED_ORDER.length - 1)] ?? currentSpd;
        engine.queueCommand({ type: "SET_SPEED", speed: nextSpd, direction: currentDir });
        break;
      }

      case "arrowdown":
      case "s": {
        const currentDir: SpeedDirection = combat?.player.direction ?? SpeedDirection.HOLD;
        const currentSpd: SpeedSetting = combat?.player.speed ?? SpeedSetting.STANDARD;
        const idx = SPEED_ORDER.indexOf(currentSpd);
        const prevSpd = SPEED_ORDER[Math.max(idx - 1, 0)] ?? currentSpd;
        engine.queueCommand({ type: "SET_SPEED", speed: prevSpd, direction: currentDir });
        break;
      }

      case " ": {
        paused = !paused;
        e.preventDefault();
        break;
      }

      case "r": {
        if (state.combat?.result !== "ongoing") {
          restart();
        }
        break;
      }
    }
  };

  window.addEventListener("keydown", onKey);

  function restart(): void {
    app.ticker.remove(tickerCallback);
    window.removeEventListener("keydown", onKey);

    const urlSeed = new URLSearchParams(window.location.search).get("seed");
    const seed = urlSeed !== null ? parseInt(urlSeed, 10) : 0;

    const newEngine = new SimEngine(seed);
    newEngine.startCombat(scenario);
    showCombat(app, newEngine, scenario);
  }
}

export { readScenario };
