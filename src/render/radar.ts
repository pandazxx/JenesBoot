/**
 * RadarView — tactical radar/compass panel (right 500×540, positioned at x=460).
 *
 * PixiJS v8 rendering only. No sim logic, no Math.random().
 */

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import type { CombatState } from "../sim/combat/types.js";
import { DepthBand, RangeBand } from "../sim/combat/types.js";
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

const DEPTH_NAMES: Record<number, string> = {
  [DepthBand.SURFACE]: "SURFACE",
  [DepthBand.PERISCOPE]: "PERISCOPE",
  [DepthBand.SHALLOW]: "SHALLOW",
  [DepthBand.DEEP]: "DEEP",
  [DepthBand.ABYSSAL]: "ABYSSAL",
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
      const weapon = String(p["weapon"] ?? "deck gun");
      const range = RANGE_NAMES[p["range"] as number] ?? String(p["range"]);
      return `Shot fired -- ${by} ${weapon} at ${range}`;
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
      const weapon = String(p["weapon"] ?? "deck gun");
      return `Miss -- ${by} ${weapon}`;
    }

    case "depth_change": {
      const who = String(p["who"]);
      const depth = DEPTH_NAMES[p["depth"] as number] ?? String(p["depth"]);
      return `${who} depth: ${depth}`;
    }

    case "combat_end": {
      const result = String(p["result"]);
      return `Combat ended: ${result}`;
    }

    case "enemy_spotted": {
      const range = RANGE_NAMES[p["range"] as number] ?? String(p["range"]);
      const depth = DEPTH_NAMES[p["playerDepth"] as number] ?? "?";
      const px = p["playerX"] as number | undefined;
      const py = p["playerY"] as number | undefined;
      const posStr = px !== undefined && py !== undefined ? ` (${px},${py})` : "";
      return `Enemy spotted sub@${depth}${posStr} [${range}]`;
    }

    case "enemy_contact_lost": {
      const last = RANGE_NAMES[p["lastKnownRange"] as number] ?? String(p["lastKnownRange"]);
      const depth = DEPTH_NAMES[p["playerDepth"] as number] ?? "?";
      const cq = p["cq"] as number | undefined;
      const px = p["playerX"] as number | undefined;
      const py = p["playerY"] as number | undefined;
      const posStr = px !== undefined && py !== undefined ? ` at (${px},${py})` : "";
      const cqStr = cq !== undefined ? ` CQ=${cq}` : "";
      return `Enemy lost contact sub@${depth}${posStr} [${last}]${cqStr}`;
    }

    case "position_report": {
      const px = p["playerX"] as number;
      const py = p["playerY"] as number;
      const ex2 = p["enemyX"] as number;
      const ey2 = p["enemyY"] as number;
      const rangeName = RANGE_NAMES[p["range"] as number] ?? "?";
      return `SUB (${px},${py}) ENM (${ex2},${ey2}) [${rangeName}]`;
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
  private depthText: Text;
  private logTexts: Text[];
  private exportBtn: Text;
  private exportFeedback: Text;
  private feedbackTimer: number = 0;
  private fullLog: SimState["log"] = [];

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

    // Depth indicator — top right of panel
    const depthStyle = new TextStyle({ fontFamily: "monospace", fontSize: 11, fill: 0x00ccaa });
    this.depthText = new Text({ text: "DEPTH: SURFACE", style: depthStyle });
    this.depthText.x = 300;
    this.depthText.y = 12;
    this.container.addChild(this.depthText);

    // Event log — 6 lines
    const logStyle = new TextStyle({ fontFamily: "monospace", fontSize: 10, fill: 0x8899aa });
    this.logTexts = Array.from({ length: 6 }, (_, i) => {
      const t = new Text({ text: "", style: logStyle });
      t.x = 16;
      t.y = 420 + i * 18;
      this.container.addChild(t);
      return t;
    });

    // Export log button
    const btnStyle = new TextStyle({ fontFamily: "monospace", fontSize: 10, fill: 0x446688 });
    this.exportBtn = new Text({ text: "[ EXPORT LOG ]", style: btnStyle });
    this.exportBtn.x = 370;
    this.exportBtn.y = 518;
    this.exportBtn.eventMode = "static";
    this.exportBtn.cursor = "pointer";
    this.exportBtn.on("pointerover", () => {
      (this.exportBtn.style as TextStyle).fill = 0x88aacc;
    });
    this.exportBtn.on("pointerout", () => {
      (this.exportBtn.style as TextStyle).fill = 0x446688;
    });
    this.exportBtn.on("pointerdown", () => {
      this._exportLog();
    });
    this.container.addChild(this.exportBtn);

    // "Copied!" feedback label
    const fbStyle = new TextStyle({ fontFamily: "monospace", fontSize: 10, fill: 0x00ff88 });
    this.exportFeedback = new Text({ text: "COPIED!", style: fbStyle });
    this.exportFeedback.x = 370;
    this.exportFeedback.y = 502;
    this.exportFeedback.visible = false;
    this.container.addChild(this.exportFeedback);
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
    // Depth indicator
    const depthName = DEPTH_NAMES[state.player.depth] ?? "?";
    const targetName =
      state.player.depthTarget !== state.player.depth
        ? ` -> ${DEPTH_NAMES[state.player.depthTarget] ?? "?"}`
        : "";
    this.depthText.text = `DEPTH: ${depthName}${targetName}`;

    // Enemy position based on range band
    const ringRadius = RING_RADII[state.range] ?? 0;
    const ex = RADAR_CX + ringRadius;
    const ey = RADAR_CY;

    // Enemy dot
    this.enemyGfx.clear();
    const enemyColor = state.playerTracking ? 0xff4444 : 0x4488ff;
    this.enemyGfx.circle(ex, ey, 8).fill(enemyColor);

    // Enemy HP bar
    this.hpGfx.clear();
    const barX = ex - 30;
    const barY = ey - 20;
    const barBgColor = state.playerTracking ? 0x331111 : 0x111133;
    const barFillColor = state.playerTracking ? 0xff4444 : 0x4488ff;
    this.hpGfx.rect(barX, barY, 60, 6).fill(barBgColor);
    const frac = state.enemy.hullHP / state.enemy.maxHullHP;
    if (frac > 0) {
      this.hpGfx.rect(barX, barY, Math.round(60 * frac), 6).fill(barFillColor);
    }

    // Keep a reference to the full log for export
    this.fullLog = simState.log;

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

    // Feedback timer for "COPIED!" label
    if (this.feedbackTimer > 0) {
      this.feedbackTimer -= 1;
      if (this.feedbackTimer === 0) this.exportFeedback.visible = false;
    }
  }

  private _exportLog(): void {
    const lines = this.fullLog.map((e) => {
      const tickStr = `[${String(e.tick).padStart(3, "0")}]`;
      const summary = formatEvent(e.type, e.payload);
      const raw = JSON.stringify(e.payload);
      return `${tickStr} ${e.type.padEnd(16)} ${summary}  ${raw}`;
    });

    const text =
      `=== JenesBoot Combat Log  (${this.fullLog.length} events) ===\n` + lines.join("\n");

    void navigator.clipboard.writeText(text).then(() => {
      this.exportFeedback.visible = true;
      this.feedbackTimer = 30;
    });
  }
}
