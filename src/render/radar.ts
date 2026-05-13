/**
 * RadarView — tactical radar/compass panel (right 500×540, positioned at x=460).
 *
 * PixiJS v8 rendering only. No sim logic, no Math.random().
 */

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import type { CombatState } from "../sim/combat/types.js";
import { RangeBand } from "../sim/combat/types.js";
import type { SimState } from "../sim/index.js";

const RADAR_CX = 250;
const RADAR_CY = 290;
const RADAR_R = 170;

const RING_RADII: Record<number, number> = {
  [RangeBand.POINT_BLANK]: 42,
  [RangeBand.SHORT]: 85,
  [RangeBand.MEDIUM]: 127,
  [RangeBand.LONG]: 170,
};

const RING_LABELS: Record<number, string> = {
  [RangeBand.POINT_BLANK]: "PB",
  [RangeBand.SHORT]: "S",
  [RangeBand.MEDIUM]: "M",
  [RangeBand.LONG]: "L",
};

const RANGE_NAMES: Record<number, string> = {
  [RangeBand.LONG]: "LONG",
  [RangeBand.MEDIUM]: "MEDIUM",
  [RangeBand.SHORT]: "SHORT",
  [RangeBand.POINT_BLANK]: "POINT_BLANK",
  [RangeBand.RAMMING]: "RAMMING",
};

function formatEvent(type: string, payload: unknown): string {
  const p = payload as Record<string, unknown>;

  switch (type) {
    case "combat_start":
      return "Combat started";

    case "range_change": {
      const from = RANGE_NAMES[p["from"] as number] ?? String(p["from"]);
      const to = RANGE_NAMES[p["to"] as number] ?? String(p["to"]);
      return `Range: ${from} -> ${to}`;
    }

    case "shot_fired": {
      const by = String(p["by"]);
      const range = RANGE_NAMES[p["range"] as number] ?? String(p["range"]);
      return `Shot fired -- ${by} deck gun at ${range}`;
    }

    case "shot_hit": {
      const by = String(p["by"]);
      const targetKey = by === "player" ? "enemy" : "player";
      const damage = String(p["damage"]);
      const targetHP = String(p["targetHP"]);
      return `Hit! ${by} -> ${targetKey}  (-${damage} HP, ${targetKey} HP: ${targetHP})`;
    }

    case "shot_miss": {
      const by = String(p["by"]);
      return `Miss -- ${by} deck gun`;
    }

    case "combat_end": {
      const result = String(p["result"]);
      return `Combat ended: ${result}`;
    }

    default:
      return type;
  }
}

export class RadarView {
  readonly container: Container;
  private radarGfx: Graphics;
  private enemyGfx: Graphics;
  private hpGfx: Graphics;
  private logTexts: Text[];

  constructor() {
    this.container = new Container();

    // Background
    const bg = new Graphics();
    bg.rect(0, 0, 500, 540).fill(0x060d0a);
    this.container.addChild(bg);

    // Header
    const headerStyle = new TextStyle({ fontFamily: "monospace", fontSize: 11, fill: 0x8899aa });
    const header = new Text({ text: "TACTICAL", style: headerStyle });
    header.x = 16;
    header.y = 12;
    this.container.addChild(header);

    // Static radar base (circle + rings + labels) — drawn once
    this.radarGfx = new Graphics();
    this.container.addChild(this.radarGfx);
    this._drawRadarBase();

    // Enemy dot — redrawn each update
    this.enemyGfx = new Graphics();
    this.container.addChild(this.enemyGfx);

    // HP bar — redrawn each update
    this.hpGfx = new Graphics();
    this.container.addChild(this.hpGfx);

    // Event log — 6 lines
    const logStyle = new TextStyle({ fontFamily: "monospace", fontSize: 10, fill: 0x8899aa });
    this.logTexts = Array.from({ length: 6 }, (_, i) => {
      const t = new Text({ text: "", style: logStyle });
      t.x = 16;
      t.y = 420 + i * 18;
      this.container.addChild(t);
      return t;
    });
  }

  private _drawRadarBase(): void {
    const gfx = this.radarGfx;
    gfx.clear();

    // Main radar circle
    gfx.circle(RADAR_CX, RADAR_CY, RADAR_R).fill(0x020f07).stroke({ color: 0x00aa44, width: 2 });

    // Range rings
    const ringStyle = new TextStyle({ fontFamily: "monospace", fontSize: 10, fill: 0x446655 });
    for (const [bandKey, radius] of Object.entries(RING_RADII)) {
      const band = Number(bandKey);
      gfx.circle(RADAR_CX, RADAR_CY, radius).stroke({ color: 0x113322, width: 1 });

      // Label at 3 o'clock
      const labelText = RING_LABELS[band] ?? "";
      const lbl = new Text({ text: labelText, style: ringStyle });
      lbl.x = RADAR_CX + radius + 4;
      lbl.y = RADAR_CY - 6;
      this.container.addChild(lbl);
    }

    // Player sub — small rectangle at center
    gfx.rect(RADAR_CX - 5, RADAR_CY - 3, 10, 6).fill(0x00ff88);
  }

  update(state: CombatState, simState: SimState): void {
    // Enemy position based on range band
    const ringRadius = RING_RADII[state.range] ?? 0;
    const ex = RADAR_CX + ringRadius;
    const ey = RADAR_CY;

    // Enemy dot
    this.enemyGfx.clear();
    this.enemyGfx.circle(ex, ey, 8).fill(0xff4444);

    // Enemy HP bar
    this.hpGfx.clear();
    const barX = ex - 30;
    const barY = ey - 20;
    this.hpGfx.rect(barX, barY, 60, 6).fill(0x331111);
    const frac = state.enemy.hullHP / state.enemy.maxHullHP;
    if (frac > 0) {
      this.hpGfx.rect(barX, barY, Math.round(60 * frac), 6).fill(0xff4444);
    }

    // Event log — last 6 non-hello events, newest first
    const filtered = simState.log
      .filter((e) => e.type !== "hello")
      .slice()
      .reverse()
      .slice(0, 6);

    for (let i = 0; i < 6; i++) {
      const t = this.logTexts[i];
      if (t === undefined) continue;
      const ev = filtered[i];
      if (ev === undefined) {
        t.text = "";
        continue;
      }
      const tickStr = `[${String(ev.tick).padStart(3, "0")}]`;
      t.text = `${tickStr} ${formatEvent(ev.type, ev.payload)}`;
    }
  }
}
