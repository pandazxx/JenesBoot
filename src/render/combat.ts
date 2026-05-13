/**
 * Combat render layer — PixiJS v8.
 *
 * Reads state exclusively through engine.getState() and engine.queueCommand().
 * No direct access to sim internals.
 */

import { Application, Graphics, Text, TextStyle } from "pixi.js";
import { SimEngine } from "../sim/index.js";
import type { ISimEngine, PlayerCommand } from "../sim/index.js";
import type { SimState } from "../sim/index.js";
import { RangeBand, SpeedSetting, SpeedDirection } from "../sim/combat/types.js";
import type { CombatState } from "../sim/combat/types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TICK_MS = 100; // 10 ticks/sec at 1× speed

const COLOUR = {
  bg: 0x0a0e1a,
  player: 0x00ff88,
  enemy: 0xff4444,
  ui: 0x8899aa,
  highlight: 0xffffff,
  hpBgPlayer: 0x113311,
  hpBgEnemy: 0x331111,
  controls: 0x445566,
  separator: 0x1a2233,
} as const;

// Range band display order: index 0 = leftmost (LONG at x=880... wait, spec says LONG=880 right)
// Spec layout: LONG x=880, MEDIUM x=670, SHORT x=460, POINT_BLANK x=250, RAMMING x=80
const RANGE_POSITIONS: Record<number, { x: number; label: string }> = {
  [RangeBand.LONG]: { x: 880, label: "L" },
  [RangeBand.MEDIUM]: { x: 670, label: "M" },
  [RangeBand.SHORT]: { x: 460, label: "S" },
  [RangeBand.POINT_BLANK]: { x: 250, label: "P" },
  [RangeBand.RAMMING]: { x: 80, label: "R" },
};

const RANGE_NAMES: Record<number, string> = {
  [RangeBand.LONG]: "LONG",
  [RangeBand.MEDIUM]: "MEDIUM",
  [RangeBand.SHORT]: "SHORT",
  [RangeBand.POINT_BLANK]: "POINT_BLANK",
  [RangeBand.RAMMING]: "RAMMING",
};

const SPEED_NAMES: Record<number, string> = {
  [SpeedSetting.SILENT]: "SILENT",
  [SpeedSetting.STANDARD]: "STANDARD",
  [SpeedSetting.AHEAD_FULL]: "AHEAD FULL",
};

const DIRECTION_NAMES: Record<number, string> = {
  [SpeedDirection.OPEN]: "OPEN",
  [SpeedDirection.HOLD]: "HOLD",
  [SpeedDirection.CLOSE]: "CLOSE",
};

const DEPTH_NAMES: Record<number, string> = {
  0: "SURFACE",
  1: "PERISCOPE",
  2: "SHALLOW",
  3: "DEEP",
  4: "ABYSSAL",
};

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

// ---------------------------------------------------------------------------
// Text factory helpers
// ---------------------------------------------------------------------------

function makeText(text: string, size: number, colour: number, x: number, y: number): Text {
  const style = new TextStyle({ fontFamily: "monospace", fontSize: size, fill: colour });
  const t = new Text({ text, style });
  t.x = x;
  t.y = y;
  return t;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function showCombat(app: Application, engine: ISimEngine): void {
  // Clear stage before attaching (supports restart)
  app.stage.removeChildren();

  // -------------------------------------------------------------------------
  // Persistent display objects (recreated on each showCombat call)
  // -------------------------------------------------------------------------

  // Header
  const scenarioLabel = makeText("SURFACE ENGAGEMENT", 12, COLOUR.ui, 16, 12);
  const tickLabel = makeText("TICK: 000", 12, COLOUR.player, 0, 12);
  tickLabel.anchor.set(1, 0);
  tickLabel.x = 944;

  // Range bar layer
  const rangeGfx = new Graphics();

  // Range labels (static — one per band)
  const rangeLabels: Text[] = Object.values(RANGE_POSITIONS).map((pos) =>
    makeText(pos.label, 10, COLOUR.ui, pos.x - 4, 92),
  );

  // Ship stats layer
  const statsGfx = new Graphics();
  const playerLabel = makeText("PLAYER", 11, COLOUR.player, 40, 128);
  const playerHPText = makeText("HP  00/00", 11, COLOUR.player, 40, 144);
  const playerSpdText = makeText("SPD  -", 11, COLOUR.player, 40, 160);
  const playerDirText = makeText("DIR  -", 11, COLOUR.player, 40, 176);
  const playerDepthText = makeText("DEPTH  -", 11, COLOUR.player, 40, 192);

  const enemyLabel = makeText("ENEMY", 11, COLOUR.enemy, 920, 128);
  enemyLabel.anchor.set(1, 0);
  const enemyHPText = makeText("HP  00/00", 11, COLOUR.enemy, 920, 144);
  enemyHPText.anchor.set(1, 0);
  const enemySpdText = makeText("SPD  -", 11, COLOUR.enemy, 920, 160);
  enemySpdText.anchor.set(1, 0);

  // Victory / defeat overlay text
  const resultText = makeText("", 36, COLOUR.highlight, 480, 200);
  resultText.anchor.set(0.5, 0.5);

  // Event log layer
  const LOG_Y_START = 248;
  const LOG_LINE_HEIGHT = 16;
  const eventLogTexts: Text[] = Array.from({ length: 8 }, (_, i) =>
    makeText("", 11, COLOUR.ui, 40, LOG_Y_START + i * LOG_LINE_HEIGHT),
  );

  // Controls bar
  const controlsText = makeText(
    "[F] FIRE    [← →] SPEED    [A D] DIRECTION    [SPACE] PAUSE    [R] RESTART",
    11,
    COLOUR.controls,
    480,
    470,
  );
  controlsText.anchor.set(0.5, 0);
  const restartHint = makeText("[R] RESTART", 11, COLOUR.highlight, 480, 490);
  restartHint.anchor.set(0.5, 0);
  restartHint.visible = false;

  // Pause indicator
  const pauseText = makeText("  PAUSED  ", 14, COLOUR.highlight, 480, 12);
  pauseText.anchor.set(0.5, 0);
  pauseText.visible = false;

  // Add everything to stage
  app.stage.addChild(scenarioLabel);
  app.stage.addChild(tickLabel);
  app.stage.addChild(rangeGfx);
  for (const lbl of rangeLabels) app.stage.addChild(lbl);
  app.stage.addChild(statsGfx);
  app.stage.addChild(playerLabel);
  app.stage.addChild(playerHPText);
  app.stage.addChild(playerSpdText);
  app.stage.addChild(playerDirText);
  app.stage.addChild(playerDepthText);
  app.stage.addChild(enemyLabel);
  app.stage.addChild(enemyHPText);
  app.stage.addChild(enemySpdText);
  for (const t of eventLogTexts) app.stage.addChild(t);
  app.stage.addChild(controlsText);
  app.stage.addChild(restartHint);
  app.stage.addChild(resultText);
  app.stage.addChild(pauseText);

  // -------------------------------------------------------------------------
  // Tick loop state
  // -------------------------------------------------------------------------

  let timeSinceLastTick = 0;
  let paused = false;
  let currentState: SimState = engine.getState();

  // -------------------------------------------------------------------------
  // Render function — called every frame
  // -------------------------------------------------------------------------

  function render(state: SimState): void {
    currentState = state;
    const combat = state.combat;

    // Header
    tickLabel.text = `TICK: ${String(state.tick).padStart(3, "0")}`;

    // Pause indicator
    pauseText.visible = paused;

    // Range bar
    rangeGfx.clear();

    // Separator lines
    rangeGfx.rect(0, 40, 960, 1).fill(COLOUR.separator);
    rangeGfx.rect(0, 120, 960, 1).fill(COLOUR.separator);
    rangeGfx.rect(0, 240, 960, 1).fill(COLOUR.separator);
    rangeGfx.rect(0, 460, 960, 1).fill(COLOUR.separator);

    // Horizontal range line
    rangeGfx.moveTo(80, 80);
    rangeGfx.lineTo(880, 80);
    rangeGfx.stroke({ color: 0x334455, width: 2 });

    // Range markers
    for (const [band, pos] of Object.entries(RANGE_POSITIONS)) {
      const bandNum = Number(band);
      const isCurrent = combat !== null && combat.range === bandNum;
      const radius = isCurrent ? 8 : 6;
      const colour = isCurrent ? COLOUR.highlight : COLOUR.ui;
      rangeGfx.circle(pos.x, 80, radius).fill(colour);
    }

    // Player and enemy ship icons flanking the current range marker
    if (combat !== null) {
      const rpos = RANGE_POSITIONS[combat.range];
      if (rpos !== undefined) {
        // Player icon: small filled triangle to the left of the marker
        rangeGfx.poly([rpos.x - 22, 84, rpos.x - 14, 76, rpos.x - 14, 84]).fill(COLOUR.player);
        // Enemy icon: small filled triangle to the right of the marker (mirrored)
        rangeGfx.poly([rpos.x + 22, 84, rpos.x + 14, 76, rpos.x + 14, 84]).fill(COLOUR.enemy);
      }
    }

    // Stats panel
    statsGfx.clear();

    if (combat !== null) {
      // Player HP bar
      const pFrac = combat.player.hullHP / combat.player.maxHullHP;
      statsGfx.rect(40, 208, 200, 14).fill(COLOUR.hpBgPlayer);
      statsGfx.rect(40, 208, Math.round(200 * pFrac), 14).fill(COLOUR.player);

      // Enemy HP bar
      const eFrac = combat.enemy.hullHP / combat.enemy.maxHullHP;
      statsGfx.rect(720, 208, 200, 14).fill(COLOUR.hpBgEnemy);
      statsGfx.rect(720, 208, Math.round(200 * eFrac), 14).fill(COLOUR.enemy);

      // Player text stats
      playerHPText.text = `HP  ${combat.player.hullHP}/${combat.player.maxHullHP}`;
      playerSpdText.text = `SPD  ${SPEED_NAMES[combat.player.speed] ?? "-"}`;
      playerDirText.text = `DIR  ${DIRECTION_NAMES[combat.player.direction] ?? "-"}`;
      playerDepthText.text = `DEPTH  ${DEPTH_NAMES[combat.player.depth] ?? "-"}`;

      // Enemy text stats
      enemyHPText.text = `HP  ${combat.enemy.hullHP}/${combat.enemy.maxHullHP}`;
      enemySpdText.text = `SPD  ${SPEED_NAMES[combat.enemy.speed] ?? "-"}`;

      // Result overlay
      if (combat.result === "player_win") {
        resultText.text = "VICTORY";
        resultText.style.fill = COLOUR.player;
        resultText.visible = true;
        restartHint.visible = true;
      } else if (combat.result === "player_lose" || combat.result === "escaped") {
        resultText.text = "DEFEATED";
        resultText.style.fill = COLOUR.enemy;
        resultText.visible = true;
        restartHint.visible = true;
      } else {
        resultText.visible = false;
        restartHint.visible = false;
      }
    } else {
      playerHPText.text = "HP  -";
      playerSpdText.text = "SPD  -";
      playerDirText.text = "DIR  -";
      playerDepthText.text = "DEPTH  -";
      enemyHPText.text = "HP  -";
      enemySpdText.text = "SPD  -";
      resultText.visible = false;
      restartHint.visible = false;
    }

    // Event log — last 8, newest first, skip "hello"
    const filtered = state.log
      .filter((e) => e.type !== "hello")
      .slice()
      .reverse()
      .slice(0, 8);
    for (let i = 0; i < 8; i++) {
      const logText = eventLogTexts[i];
      if (logText === undefined) continue;
      const ev = filtered[i];
      if (ev === undefined) {
        logText.text = "";
        continue;
      }

      const tickStr = `[${String(ev.tick).padStart(3, "0")}]`;
      logText.text = `${tickStr} ${formatEvent(ev.type, ev.payload)}`;
      logText.style.fill = i === 0 ? COLOUR.highlight : COLOUR.ui;
    }
  }

  // -------------------------------------------------------------------------
  // Ticker
  // -------------------------------------------------------------------------

  function tickerCallback(ticker: { deltaMS: number }): void {
    if (!paused) {
      timeSinceLastTick += ticker.deltaMS;
      while (timeSinceLastTick >= TICK_MS) {
        timeSinceLastTick -= TICK_MS;
        engine.tick();
      }
    }
    render(engine.getState());
  }

  app.ticker.add(tickerCallback);

  // -------------------------------------------------------------------------
  // Keyboard input
  // -------------------------------------------------------------------------

  const onKey = (e: KeyboardEvent): void => {
    const state = currentState;
    const combat: CombatState | null = state.combat ?? null;

    switch (e.key.toLowerCase()) {
      case "f": {
        engine.queueCommand({ type: "FIRE_DECK_GUN" });
        break;
      }

      case "arrowright":
      case "d": {
        const currentDir: SpeedDirection = combat?.player.direction ?? SpeedDirection.HOLD;
        const currentSpd: SpeedSetting = combat?.player.speed ?? SpeedSetting.STANDARD;
        const idx = DIRECTION_ORDER.indexOf(currentDir);
        const nextDir =
          DIRECTION_ORDER[Math.min(idx + 1, DIRECTION_ORDER.length - 1)] ?? currentDir;
        const cmd: PlayerCommand = { type: "SET_SPEED", speed: currentSpd, direction: nextDir };
        engine.queueCommand(cmd);
        break;
      }

      case "arrowleft":
      case "a": {
        const currentDir: SpeedDirection = combat?.player.direction ?? SpeedDirection.HOLD;
        const currentSpd: SpeedSetting = combat?.player.speed ?? SpeedSetting.STANDARD;
        const idx = DIRECTION_ORDER.indexOf(currentDir);
        const prevDir = DIRECTION_ORDER[Math.max(idx - 1, 0)] ?? currentDir;
        const cmd: PlayerCommand = { type: "SET_SPEED", speed: currentSpd, direction: prevDir };
        engine.queueCommand(cmd);
        break;
      }

      case "arrowup":
      case "w": {
        const currentDir: SpeedDirection = combat?.player.direction ?? SpeedDirection.HOLD;
        const currentSpd: SpeedSetting = combat?.player.speed ?? SpeedSetting.STANDARD;
        const idx = SPEED_ORDER.indexOf(currentSpd);
        const nextSpd = SPEED_ORDER[Math.min(idx + 1, SPEED_ORDER.length - 1)] ?? currentSpd;
        const cmd: PlayerCommand = { type: "SET_SPEED", speed: nextSpd, direction: currentDir };
        engine.queueCommand(cmd);
        break;
      }

      case "arrowdown":
      case "s": {
        const currentDir: SpeedDirection = combat?.player.direction ?? SpeedDirection.HOLD;
        const currentSpd: SpeedSetting = combat?.player.speed ?? SpeedSetting.STANDARD;
        const idx = SPEED_ORDER.indexOf(currentSpd);
        const prevSpd = SPEED_ORDER[Math.max(idx - 1, 0)] ?? currentSpd;
        const cmd: PlayerCommand = { type: "SET_SPEED", speed: prevSpd, direction: currentDir };
        engine.queueCommand(cmd);
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

  // -------------------------------------------------------------------------
  // Restart
  // -------------------------------------------------------------------------

  function restart(): void {
    // Stop current ticker
    app.ticker.remove(tickerCallback);
    window.removeEventListener("keydown", onKey);

    // Determine seed
    const urlSeed = new URLSearchParams(window.location.search).get("seed");
    const seed = urlSeed !== null ? parseInt(urlSeed, 10) : 0;

    const newEngine = new SimEngine(seed);
    newEngine.startCombat("surface_battle");
    showCombat(app, newEngine);
  }
}

// ---------------------------------------------------------------------------
// Event formatting helpers
// ---------------------------------------------------------------------------

function formatEvent(type: string, payload: unknown): string {
  const p = payload as Record<string, unknown>;

  switch (type) {
    case "combat_start":
      return "Combat started";

    case "range_change": {
      const from = RANGE_NAMES[p["from"] as number] ?? String(p["from"]);
      const to = RANGE_NAMES[p["to"] as number] ?? String(p["to"]);
      return `Range: ${from} → ${to}`;
    }

    case "shot_fired": {
      const by = String(p["by"]);
      const range = RANGE_NAMES[p["range"] as number] ?? String(p["range"]);
      return `Shot fired — ${by} deck gun at ${range}`;
    }

    case "shot_hit": {
      const by = String(p["by"]);
      const targetKey = by === "player" ? "enemy" : "player";
      const damage = String(p["damage"]);
      const targetHP = String(p["targetHP"]);
      return `Hit! ${by} → ${targetKey}  (−${damage} HP, ${targetKey} HP: ${targetHP})`;
    }

    case "shot_miss": {
      const by = String(p["by"]);
      return `Miss — ${by} deck gun`;
    }

    case "combat_end": {
      const result = String(p["result"]);
      return `Combat ended: ${result}`;
    }

    default:
      return type;
  }
}
