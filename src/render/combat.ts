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

import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
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
  if (param === "gunboat_hunt") return "gunboat_hunt";
  if (param === "destroyer_battle") return "destroyer_battle";
  if (param === "submerged_ambush") return "submerged_ambush";
  return "surface_battle";
}

function makeHudButton(
  label: string,
  x: number,
  y: number,
  w: number,
  onClick: () => void,
): Container {
  const h = 22;
  const bg = new Graphics();
  bg.rect(0, 0, w, h).fill(0x0a1420).stroke({ color: 0x334455, width: 1 });
  bg.eventMode = "static";
  bg.cursor = "pointer";
  bg.on("pointerover", () => {
    bg.clear();
    bg.rect(0, 0, w, h).fill(0x162035).stroke({ color: 0x4466aa, width: 1 });
  });
  bg.on("pointerout", () => {
    bg.clear();
    bg.rect(0, 0, w, h).fill(0x0a1420).stroke({ color: 0x334455, width: 1 });
  });
  bg.on("pointertap", onClick);

  const text = new Text({
    text: label,
    style: new TextStyle({ fontFamily: "monospace", fontSize: 10, fill: 0x8899aa }),
  });
  text.anchor.set(0.5, 0.5);
  text.x = w / 2;
  text.y = h / 2;
  text.eventMode = "none";

  const c = new Container();
  c.addChild(bg);
  c.addChild(text);
  c.x = x;
  c.y = y;
  return c;
}

export function showCombat(
  app: Application,
  engine: ISimEngine,
  scenario: CombatScenario,
  onSettings?: () => void,
): Promise<void> {
  return new Promise<void>((resolveMenu) => {
    app.stage.removeChildren();

    const interiorView = new InteriorView(engine, () => {
      paused = !paused;
    });
    const radarView = new RadarView();

    interiorView.container.x = 0;
    radarView.container.x = 460;

    const divider = new Graphics();
    divider.rect(459, 0, 2, 540).fill(0x334455);

    app.stage.addChild(interiorView.container);
    app.stage.addChild(radarView.container);
    app.stage.addChild(divider);

    // HUD buttons — top right corner
    const menuBtn = makeHudButton("MENU", 960 - 170, 5, 78, () => goToMenu());
    const settingsBtn = makeHudButton("SETTINGS", 960 - 88, 5, 83, () => onSettings?.());
    app.stage.addChild(menuBtn);
    app.stage.addChild(settingsBtn);

    // Game-over overlay — shown when combat ends; absorbs taps so nothing below fires
    const overlay = new Container();
    overlay.visible = false;

    const overlayBg = new Graphics();
    overlayBg.rect(0, 0, 960, 540).fill({ color: 0x000011, alpha: 0.88 });
    overlayBg.eventMode = "static";
    overlay.addChild(overlayBg);

    const resultStyle = new TextStyle({
      fontFamily: "monospace",
      fontSize: 40,
      fill: 0xffffff,
      align: "center",
    });
    const resultLabel = new Text({ text: "", style: resultStyle });
    resultLabel.anchor.set(0.5);
    resultLabel.x = 480;
    resultLabel.y = 200;
    overlay.addChild(resultLabel);

    const restartBg = new Graphics();
    restartBg.rect(330, 275, 300, 48).fill(0x0a2030).stroke({ color: 0x00ccff, width: 2 });
    overlay.addChild(restartBg);

    const restartLabelStyle = new TextStyle({
      fontFamily: "monospace",
      fontSize: 14,
      fill: 0x00ccff,
    });
    const restartLabelText = new Text({ text: "RESTART", style: restartLabelStyle });
    restartLabelText.anchor.set(0.5);
    restartLabelText.x = 480;
    restartLabelText.y = 299;
    overlay.addChild(restartLabelText);

    const restartHit = new Graphics();
    restartHit.rect(330, 275, 300, 48).fill({ color: 0, alpha: 0 });
    restartHit.eventMode = "static";
    restartHit.cursor = "pointer";
    restartHit.on("pointertap", () => restart());
    overlay.addChild(restartHit);

    const menuOverlayBg = new Graphics();
    menuOverlayBg.rect(330, 333, 300, 40).fill(0x0a1420).stroke({ color: 0x334455, width: 2 });
    overlay.addChild(menuOverlayBg);

    const menuOverlayStyle = new TextStyle({
      fontFamily: "monospace",
      fontSize: 14,
      fill: 0x8899aa,
    });
    const menuOverlayText = new Text({ text: "BACK TO MENU", style: menuOverlayStyle });
    menuOverlayText.anchor.set(0.5);
    menuOverlayText.x = 480;
    menuOverlayText.y = 353;
    overlay.addChild(menuOverlayText);

    const menuOverlayHit = new Graphics();
    menuOverlayHit.rect(330, 333, 300, 40).fill({ color: 0, alpha: 0 });
    menuOverlayHit.eventMode = "static";
    menuOverlayHit.cursor = "pointer";
    menuOverlayHit.on("pointertap", () => goToMenu());
    overlay.addChild(menuOverlayHit);

    app.stage.addChild(overlay); // last → on top of everything

    app.stage.eventMode = "static";

    let timeSinceLastTick = 0;
    let elapsed = 0;
    let paused = true;

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
        interiorView.update(combat, step, elapsed, paused);
        radarView.update(combat, state);

        if (combat.result !== "ongoing" && !overlay.visible) {
          overlay.visible = true;
          paused = true;
          const labels: Record<string, string> = {
            player_win: "VICTORY!",
            escaped: "ESCAPED!",
            player_lose: "DEFEATED",
          };
          const colors: Record<string, number> = {
            player_win: 0x00ff88,
            escaped: 0xffdd44,
            player_lose: 0xff3333,
          };
          resultLabel.text = labels[combat.result] ?? combat.result;
          (resultLabel.style as TextStyle).fill = colors[combat.result] ?? 0xffffff;
        }
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

    function goToMenu(): void {
      app.ticker.remove(tickerCallback);
      window.removeEventListener("keydown", onKey);
      app.stage.removeChildren();
      resolveMenu();
    }

    function restart(): void {
      app.ticker.remove(tickerCallback);
      window.removeEventListener("keydown", onKey);

      const urlSeed = new URLSearchParams(window.location.search).get("seed");
      const seed = urlSeed !== null ? parseInt(urlSeed, 10) : 0;

      const newEngine = new SimEngine(seed);
      newEngine.startCombat(scenario);
      showCombat(app, newEngine, scenario, onSettings)
        .then(resolveMenu)
        .catch(() => undefined);
    }
  });
}

export { readScenario };
