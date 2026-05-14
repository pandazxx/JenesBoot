/**
 * InteriorView — submarine interior panel (left 460×540).
 *
 * PixiJS v8 rendering only. No sim logic, no Math.random().
 */

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import type { ISimEngine } from "../sim/index.js";
import type { CombatState } from "../sim/combat/types.js";
import { DepthBand, RoomType, SpeedSetting } from "../sim/combat/types.js";
import type { TutorialStep } from "./tutorial.js";
import { TUTORIAL_TEXT } from "./tutorial.js";

const PANEL_W = 460;
const PANEL_H = 540;

// Rooms
const ROOM_Y = 40;
const ROOM_H = 95;
const ROOM_MARGIN_X = 20;
const ROOM_GAP = 5;

// Dashboard stat block
const DASH_LABEL_X = 20;
const DASH_VALUE_X = 118;
const DASH_HP_BAR_X = 118;
const DASH_HP_BAR_W = 302;
const DASH_HP_BAR_H = 12;

const ROW_HP_LABEL = 150;
const ROW_HP_BAR = 165;
const ROW_HP_VALUE = 180;
const ROW_DEPTH = 203;
const ROW_SPEED = 226;
const ROW_COURSE = 249;
const ROW_TORPEDO = 272;

// Depth selector
const DEPTH_CTRL_Y = 304;
const DEPTH_BTN_Y = 319;
const DEPTH_BTN_H = 26;
const DEPTH_BTN_GAP = 5;

const DEPTH_BANDS = [
  DepthBand.SURFACE,
  DepthBand.PERISCOPE,
  DepthBand.SHALLOW,
  DepthBand.DEEP,
  DepthBand.ABYSSAL,
] as const;

const DEPTH_LABELS = ["SURFACE", "PERISCP", "SHALLOW", "DEEP", "ABYSSAL"] as const;

const DEPTH_NAMES: Record<number, string> = {
  [DepthBand.SURFACE]: "SURFACE",
  [DepthBand.PERISCOPE]: "PERISCOPE",
  [DepthBand.SHALLOW]: "SHALLOW",
  [DepthBand.DEEP]: "DEEP",
  [DepthBand.ABYSSAL]: "ABYSSAL",
};

const SPEED_NAMES: Record<number, string> = {
  [SpeedSetting.SILENT]: "SILENT",
  [SpeedSetting.STANDARD]: "STANDARD",
  [SpeedSetting.AHEAD_FULL]: "AHEAD FULL",
};

const ROOM_LABELS: Record<RoomType, string> = {
  BRIDGE: "BRIDGE",
  DECK_GUN: "DECK GUN",
  ENGINE: "ENGINE",
  TORPEDO: "TORPEDO",
};

const TORPEDO_MAX = 4;

interface RoomLayout {
  id: string;
  type: RoomType;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DepthBtn {
  gfx: Graphics;
  x: number;
  w: number;
  band: DepthBand;
}

function buildRoomLayout(rooms: readonly { id: string; type: RoomType }[]): RoomLayout[] {
  const count = rooms.length;
  const totalW = PANEL_W - ROOM_MARGIN_X * 2;
  const roomW = Math.floor((totalW - ROOM_GAP * (count - 1)) / count);
  return rooms.map((room, i) => ({
    id: room.id,
    type: room.type,
    label: ROOM_LABELS[room.type] ?? room.type,
    x: ROOM_MARGIN_X + i * (roomW + ROOM_GAP),
    y: ROOM_Y,
    w: roomW,
    h: ROOM_H,
  }));
}

function makeLabelStyle(): TextStyle {
  return new TextStyle({ fontFamily: "monospace", fontSize: 10, fill: 0x8899aa });
}

function makeValueStyle(): TextStyle {
  return new TextStyle({ fontFamily: "monospace", fontSize: 11, fill: 0xffffff });
}

export class InteriorView {
  readonly container: Container;
  private engine: ISimEngine;
  private selectedCrewId: string | null = null;
  private roomDefs: RoomLayout[];

  private roomGraphics: Map<string, Graphics> = new Map();
  private crewGraphics: Map<string, Graphics> = new Map();
  private pulseGfx: Graphics;

  // Dashboard
  private hpBar: Graphics;
  private hpValue: Text;
  private depthValue: Text;
  private speedValue: Text;
  private torpedoValue: Text;

  // Depth selector
  private depthBtns: DepthBtn[] = [];
  private depthPulseGfx: Graphics;

  private tutorialText: Text;

  constructor(engine: ISimEngine) {
    this.engine = engine;
    this.container = new Container();

    const initialRooms = engine.getState().combat?.rooms ?? [];
    this.roomDefs = buildRoomLayout(initialRooms);

    // Background
    const bg = new Graphics();
    bg.rect(0, 0, PANEL_W, PANEL_H).fill(0x06080f);
    this.container.addChild(bg);

    // Header
    const headerStyle = new TextStyle({ fontFamily: "monospace", fontSize: 11, fill: 0x8899aa });
    const header = new Text({ text: "SUBMARINE INTERIOR", style: headerStyle });
    header.x = 16;
    header.y = 12;
    this.container.addChild(header);

    // Attention pulse overlay (rooms)
    this.pulseGfx = new Graphics();
    this.container.addChild(this.pulseGfx);

    // Room boxes
    for (const def of this.roomDefs) {
      const gfx = new Graphics();
      this.container.addChild(gfx);
      this.roomGraphics.set(def.id, gfx);

      const label = new Text({ text: def.label, style: makeLabelStyle() });
      label.x = def.x + 5;
      label.y = def.y + 5;
      this.container.addChild(label);

      const hitArea = new Graphics();
      hitArea.rect(def.x, def.y, def.w, def.h).fill({ color: 0xffffff, alpha: 0 });
      hitArea.eventMode = "static";
      hitArea.cursor = "pointer";
      const roomId = def.id;
      hitArea.on("pointertap", () => {
        if (this.selectedCrewId !== null) {
          this.engine.queueCommand({ type: "ASSIGN_CREW", crewId: this.selectedCrewId, roomId });
          this.selectedCrewId = null;
        }
      });
      this.container.addChild(hitArea);
    }

    // ── Dashboard ────────────────────────────────────────────────────────────

    // HULL HP
    const hpLabel = new Text({ text: "HULL HP", style: makeLabelStyle() });
    hpLabel.x = DASH_LABEL_X;
    hpLabel.y = ROW_HP_LABEL;
    this.container.addChild(hpLabel);

    const hpBarBg = new Graphics();
    hpBarBg.rect(DASH_HP_BAR_X, ROW_HP_BAR, DASH_HP_BAR_W, DASH_HP_BAR_H).fill(0x1a2030);
    this.container.addChild(hpBarBg);

    this.hpBar = new Graphics();
    this.container.addChild(this.hpBar);

    this.hpValue = new Text({ text: "", style: makeValueStyle() });
    this.hpValue.x = DASH_VALUE_X;
    this.hpValue.y = ROW_HP_VALUE;
    this.container.addChild(this.hpValue);

    // DEPTH stat row
    const depthLabel = new Text({ text: "DEPTH", style: makeLabelStyle() });
    depthLabel.x = DASH_LABEL_X;
    depthLabel.y = ROW_DEPTH;
    this.container.addChild(depthLabel);

    this.depthValue = new Text({ text: "", style: makeValueStyle() });
    this.depthValue.x = DASH_VALUE_X;
    this.depthValue.y = ROW_DEPTH;
    this.container.addChild(this.depthValue);

    // SPEED stat row
    const speedLabel = new Text({ text: "SPEED", style: makeLabelStyle() });
    speedLabel.x = DASH_LABEL_X;
    speedLabel.y = ROW_SPEED;
    this.container.addChild(speedLabel);

    this.speedValue = new Text({ text: "", style: makeValueStyle() });
    this.speedValue.x = DASH_VALUE_X;
    this.speedValue.y = ROW_SPEED;
    this.container.addChild(this.speedValue);

    // COURSE stat row (fixed for now)
    const courseLabel = new Text({ text: "COURSE", style: makeLabelStyle() });
    courseLabel.x = DASH_LABEL_X;
    courseLabel.y = ROW_COURSE;
    this.container.addChild(courseLabel);

    const courseValue = new Text({ text: "270°", style: makeValueStyle() });
    courseValue.x = DASH_VALUE_X;
    courseValue.y = ROW_COURSE;
    this.container.addChild(courseValue);

    // TORPEDO count row
    const torpLabel = new Text({ text: "TORPEDO", style: makeLabelStyle() });
    torpLabel.x = DASH_LABEL_X;
    torpLabel.y = ROW_TORPEDO;
    this.container.addChild(torpLabel);

    this.torpedoValue = new Text({ text: "", style: makeValueStyle() });
    this.torpedoValue.x = DASH_VALUE_X;
    this.torpedoValue.y = ROW_TORPEDO;
    this.container.addChild(this.torpedoValue);

    // ── Depth selector ───────────────────────────────────────────────────────

    const depthCtrlLabel = new Text({ text: "DIVE CTRL", style: makeLabelStyle() });
    depthCtrlLabel.x = DASH_LABEL_X;
    depthCtrlLabel.y = DEPTH_CTRL_Y;
    this.container.addChild(depthCtrlLabel);

    const btnCount = DEPTH_BANDS.length;
    const totalW = PANEL_W - ROOM_MARGIN_X * 2;
    const btnW = Math.floor((totalW - DEPTH_BTN_GAP * (btnCount - 1)) / btnCount);

    this.depthPulseGfx = new Graphics();
    this.container.addChild(this.depthPulseGfx);

    for (let i = 0; i < btnCount; i++) {
      const band = DEPTH_BANDS[i] as DepthBand;
      const bx = ROOM_MARGIN_X + i * (btnW + DEPTH_BTN_GAP);

      const gfx = new Graphics();
      this.container.addChild(gfx);

      const btnLabelStyle = new TextStyle({ fontFamily: "monospace", fontSize: 9, fill: 0x668899 });
      const btnLabel = new Text({ text: DEPTH_LABELS[i] ?? "", style: btnLabelStyle });
      btnLabel.x = bx + 4;
      btnLabel.y = DEPTH_BTN_Y + 8;
      this.container.addChild(btnLabel);

      const hitArea = new Graphics();
      hitArea.rect(bx, DEPTH_BTN_Y, btnW, DEPTH_BTN_H).fill({ color: 0xffffff, alpha: 0 });
      hitArea.eventMode = "static";
      hitArea.cursor = "pointer";
      hitArea.on("pointertap", () => {
        this.engine.queueCommand({ type: "SET_DEPTH", target: band });
      });
      this.container.addChild(hitArea);

      this.depthBtns.push({ gfx, x: bx, w: btnW, band });
    }

    // Tutorial text
    const tutStyle = new TextStyle({
      fontFamily: "monospace",
      fontSize: 12,
      fill: 0xffffff,
      wordWrap: true,
      wordWrapWidth: 428,
    });
    this.tutorialText = new Text({ text: "", style: tutStyle });
    this.tutorialText.x = 16;
    this.tutorialText.y = 460;
    this.container.addChild(this.tutorialText);
  }

  update(state: CombatState, step: TutorialStep, elapsed: number): void {
    // Room boxes
    for (const def of this.roomDefs) {
      const gfx = this.roomGraphics.get(def.id);
      if (gfx === undefined) continue;

      const room = state.rooms.find((r) => r.id === def.id);
      const hasCrew = room !== undefined && room.crewIds.length > 0;

      gfx.clear();
      gfx
        .rect(def.x, def.y, def.w, def.h)
        .fill(0x0a1420)
        .stroke({ color: hasCrew ? 0x00ff88 : 0x334455, width: 2 });
    }

    // Attention pulse on room that needs crew for this tutorial step
    this.pulseGfx.clear();
    const pulseTarget =
      step === 0
        ? this.roomDefs.find((d) => d.type === RoomType.DECK_GUN)
        : step === 6
          ? this.roomDefs.find((d) => d.type === RoomType.TORPEDO)
          : undefined;

    if (pulseTarget !== undefined) {
      const room = state.rooms.find((r) => r.id === pulseTarget.id);
      if (room === undefined || room.crewIds.length === 0) {
        this.pulseGfx.alpha = 0.4 + 0.6 * Math.abs(Math.sin(elapsed / 400));
        this.pulseGfx
          .rect(pulseTarget.x, pulseTarget.y, pulseTarget.w, pulseTarget.h)
          .stroke({ color: 0xff8800, width: 3 });
      }
    }

    // Crew dots
    for (const crewMember of state.crew) {
      let gfx = this.crewGraphics.get(crewMember.id);
      if (gfx === undefined) {
        gfx = new Graphics();
        gfx.eventMode = "static";
        gfx.cursor = "pointer";
        const memberId = crewMember.id;
        gfx.on("pointertap", (event) => {
          event.stopPropagation();
          this.selectedCrewId = memberId;
        });
        this.container.addChild(gfx);
        this.crewGraphics.set(crewMember.id, gfx);
      }

      gfx.clear();
      if (crewMember.roomId === null) continue;
      const def = this.roomDefs.find((d) => d.id === crewMember.roomId);
      if (def === undefined) continue;

      const cx = def.x + def.w / 2;
      const cy = def.y + 58;
      gfx.circle(cx, cy, 9).fill(this.selectedCrewId === crewMember.id ? 0xffff00 : 0x00ff88);
    }

    // ── Dashboard updates ────────────────────────────────────────────────────

    // HP bar
    const hpFrac = state.player.maxHullHP > 0 ? state.player.hullHP / state.player.maxHullHP : 0;
    const hpColor = hpFrac > 0.6 ? 0x00ff88 : hpFrac > 0.3 ? 0xffcc00 : 0xff3333;
    this.hpBar.clear();
    if (hpFrac > 0) {
      this.hpBar
        .rect(DASH_HP_BAR_X, ROW_HP_BAR, Math.round(DASH_HP_BAR_W * hpFrac), DASH_HP_BAR_H)
        .fill(hpColor);
    }
    this.hpValue.text = `${state.player.hullHP} / ${state.player.maxHullHP}`;

    // Depth
    const depthName = DEPTH_NAMES[state.player.depth] ?? "?";
    const targetName =
      state.player.depthTarget !== state.player.depth
        ? ` → ${DEPTH_NAMES[state.player.depthTarget] ?? "?"}`
        : "";
    this.depthValue.text = `${depthName}${targetName}`;

    // Speed
    this.speedValue.text = SPEED_NAMES[state.player.speed] ?? "?";

    // Torpedo count (course is static, set once in constructor)
    const count = state.player.torpedoCount;
    const full = Math.min(count, TORPEDO_MAX);
    const empty = TORPEDO_MAX - full;
    this.torpedoValue.text = `${"◆".repeat(full)}${"◇".repeat(empty)}  ${count}`;

    // ── Depth selector ───────────────────────────────────────────────────────

    const bridgeCrewed = state.rooms.some(
      (r) => r.type === RoomType.BRIDGE && r.crewIds.length > 0,
    );

    this.depthPulseGfx.clear();

    for (const btn of this.depthBtns) {
      const isCurrent = state.player.depth === btn.band;
      const isTarget =
        state.player.depthTarget === btn.band && state.player.depthTarget !== state.player.depth;

      const fillColor = isCurrent ? 0x0d2820 : isTarget ? 0x201008 : 0x0a1420;
      const strokeColor = isCurrent
        ? 0x00ffcc
        : isTarget
          ? 0xff8800
          : bridgeCrewed
            ? 0x335566
            : 0x1a2530;

      btn.gfx.clear();
      btn.gfx
        .rect(btn.x, DEPTH_BTN_Y, btn.w, DEPTH_BTN_H)
        .fill(fillColor)
        .stroke({ color: strokeColor, width: 1 });
    }

    // Pulse PERISCOPE button when step 5 needs player to dive
    if (step === 5 && state.player.depthTarget === DepthBand.SURFACE) {
      const periscopeBtn = this.depthBtns.find((b) => b.band === DepthBand.PERISCOPE);
      if (periscopeBtn !== undefined) {
        this.depthPulseGfx.alpha = 0.4 + 0.6 * Math.abs(Math.sin(elapsed / 400));
        this.depthPulseGfx
          .rect(periscopeBtn.x, DEPTH_BTN_Y, periscopeBtn.w, DEPTH_BTN_H)
          .stroke({ color: 0x00eebb, width: 3 });
      }
    }

    // Tutorial text
    this.tutorialText.text = TUTORIAL_TEXT[step];
    this.tutorialText.style.fill =
      step === 9 || step === 4 ? 0xff3333 : step === 8 || step === 3 ? 0x00ff88 : 0xffffff;
  }
}
