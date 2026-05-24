/**
 * Combat render layer — PixiJS v8, split-screen layout.
 *
 * Left panel (460px): submarine interior (InteriorView).
 * Right panel (500px): tactical display (RadarView).
 *
 * Reads state exclusively through engine.getState() and engine.queueCommand().
 */

import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import { SimEngine } from "../sim/index.js";
import type { ISimEngine } from "../sim/index.js";
import { DepthBand, NauticalSpeed, VesselType } from "../sim/combat/enums.js";
import type { CombatState, PlayerCommand } from "../sim/combat/types.js";
import { InteriorView } from "./interior.js";
import { RadarView } from "./radar.js";

const TICK_MS = 100;

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
  enemyType: VesselType,
  onSettings?: () => void,
): Promise<void> {
  return new Promise<void>((resolveMenu) => {
    app.stage.removeChildren();

    const interiorView = new InteriorView(
      engine,
      () => {
        paused = !paused;
      },
      () => {
        if (paused) engine.tick();
      },
    );
    const radarView = new RadarView();

    interiorView.container.x = 0;
    radarView.container.x = 460;

    const divider = new Graphics();
    divider.rect(459, 0, 2, 540).fill(0x334455);

    app.stage.addChild(interiorView.container);
    app.stage.addChild(radarView.container);
    app.stage.addChild(divider);

    const menuBtn = makeHudButton("MENU", 960 - 170, 5, 78, () => goToMenu());
    const settingsBtn = makeHudButton("SETTINGS", 960 - 88, 5, 83, () => onSettings?.());
    app.stage.addChild(menuBtn);
    app.stage.addChild(settingsBtn);

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

    app.stage.addChild(overlay);

    app.stage.eventMode = "static";

    let timeSinceLastTick = 0;
    let elapsed = 0;
    let paused = true;

    function issueCommand(cmd: PlayerCommand): void {
      engine.queueCommand(cmd);
      if (paused) engine.tick();
    }

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
        interiorView.update(combat, elapsed, paused);
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
          issueCommand({ type: "FIRE_WEAPON", weaponId: "deck_gun" });
          break;
        }

        case "t": {
          issueCommand({ type: "FIRE_WEAPON", weaponId: "torpedo" });
          break;
        }

        case "z": {
          const currentDepth = combat?.player.depth ?? DepthBand.SURFACE;
          const nextDepth = Math.min(
            DepthBand.ABYSSAL,
            currentDepth + 1,
          ) as (typeof DepthBand)[keyof typeof DepthBand];
          issueCommand({ type: "SET_DEPTH", target: nextDepth, diveSpeed: 1 });
          break;
        }

        case "x": {
          issueCommand({ type: "SET_DEPTH", target: DepthBand.SURFACE, diveSpeed: 1 });
          break;
        }

        case "arrowright":
        case "d": {
          const currentSpd = combat?.player.nauticalSpeed ?? NauticalSpeed.HALF_AHEAD;
          issueCommand({ type: "SET_NAUTICAL_SPEED", speed: currentSpd, intent: 1 });
          break;
        }

        case "arrowleft":
        case "a": {
          const currentSpd = combat?.player.nauticalSpeed ?? NauticalSpeed.HALF_AHEAD;
          issueCommand({ type: "SET_NAUTICAL_SPEED", speed: currentSpd, intent: -1 });
          break;
        }

        case "arrowup":
        case "w": {
          const currentSpd = combat?.player.nauticalSpeed ?? NauticalSpeed.HALF_AHEAD;
          const nextSpd = Math.min(
            NauticalSpeed.FLANK,
            currentSpd + 1,
          ) as (typeof NauticalSpeed)[keyof typeof NauticalSpeed];
          const intent = combat?.player.horizontalIntent ?? 0;
          issueCommand({ type: "SET_NAUTICAL_SPEED", speed: nextSpd, intent });
          break;
        }

        case "arrowdown":
        case "s": {
          const currentSpd = combat?.player.nauticalSpeed ?? NauticalSpeed.HALF_AHEAD;
          const prevSpd = Math.max(
            NauticalSpeed.DEAD_SLOW,
            currentSpd - 1,
          ) as (typeof NauticalSpeed)[keyof typeof NauticalSpeed];
          const intent = combat?.player.horizontalIntent ?? 0;
          issueCommand({ type: "SET_NAUTICAL_SPEED", speed: prevSpd, intent });
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
      newEngine.startCombat(enemyType);
      showCombat(app, newEngine, enemyType, onSettings)
        .then(resolveMenu)
        .catch(() => undefined);
    }
  });
}
