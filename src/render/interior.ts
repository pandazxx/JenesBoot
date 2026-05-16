/**
 * InteriorView — submarine interior panel (left 460×540).
 *
 * PixiJS v8 rendering only. No sim logic, no Math.random().
 */

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import type { ISimEngine } from "../sim/index.js";
import type { CombatState } from "../sim/combat/types.js";
import { DepthBand, RoomType, SpeedSetting, SpeedDirection } from "../sim/combat/types.js";
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
const ROW_HP_BAR = 163;
const ROW_HP_VALUE = 178;
const ROW_O2_LABEL = 193;
const ROW_O2_BAR = 206;
const ROW_O2_VALUE = 221;
const ROW_DEPTH = 237;
const ROW_TORPEDO = 255;
const ROW_POS = 271;

// Control buttons — 32px tall for touch-friendly targets
const SPEED_CTRL_Y = 291;
const SPEED_BTN_Y = 303;
const SPEED_BTN_H = 32;

const DIR_CTRL_Y = 339;
const DIR_BTN_Y = 351;
const DIR_BTN_H = 32;

const PAUSE_BTN_Y = 387;
const PAUSE_BTN_H = 32;

const DEPTH_CTRL_Y = 423;
const DEPTH_BTN_Y = 435;
const DEPTH_BTN_H = 32;
const DEPTH_BTN_GAP = 5;

// Weapon fire buttons — 36px tall, red/orange theme
const WEAPON_CTRL_Y = 471;
const WEAPON_BTN_Y = 483;
const WEAPON_BTN_H = 36;

const TUTORIAL_Y = 524;

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

interface TripleBtn {
  gfx: Graphics;
  label: Text;
  x: number;
  w: number;
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

function makeBtnLabelStyle(active: boolean): TextStyle {
  return new TextStyle({
    fontFamily: "monospace",
    fontSize: 9,
    fill: active ? 0xffffff : 0x668899,
  });
}

function buildThreeButtons(
  container: Container,
  btnY: number,
  btnH: number,
  labels: [string, string, string],
  onTap: (index: number) => void,
): TripleBtn[] {
  const totalW = PANEL_W - ROOM_MARGIN_X * 2;
  const btnW = Math.floor((totalW - DEPTH_BTN_GAP * 2) / 3);
  const btns: TripleBtn[] = [];

  for (let i = 0; i < 3; i++) {
    const bx = ROOM_MARGIN_X + i * (btnW + DEPTH_BTN_GAP);

    const gfx = new Graphics();
    container.addChild(gfx);

    const labelText = new Text({ text: labels[i] ?? "", style: makeBtnLabelStyle(false) });
    labelText.x = bx + 4;
    labelText.y = btnY + Math.floor((btnH - 12) / 2);
    container.addChild(labelText);

    const hitArea = new Graphics();
    hitArea.rect(bx, btnY, btnW, btnH).fill({ color: 0xffffff, alpha: 0 });
    hitArea.eventMode = "static";
    hitArea.cursor = "pointer";
    const idx = i;
    hitArea.on("pointertap", () => onTap(idx));
    container.addChild(hitArea);

    btns.push({ gfx, label: labelText, x: bx, w: btnW });
  }

  return btns;
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
  private o2Bar: Graphics;
  private o2Value: Text;
  private o2BarBgContainer: Graphics;
  private suffocatingLabel: Text;
  private depthValue: Text;
  private torpedoValue: Text;
  private positionValue: Text;

  // Speed buttons
  private speedBtns: TripleBtn[];

  // Direction buttons
  private dirBtns: TripleBtn[];

  // Pause button
  private pauseBtnGfx: Graphics;
  private pauseBtnLabel: Text;

  // Depth selector
  private depthBtns: DepthBtn[] = [];
  private depthPulseGfx: Graphics;

  // Weapon fire buttons
  private deckGunBtnGfx: Graphics;
  private deckGunBtnLabel: Text;
  private torpedoBtnGfx: Graphics;
  private torpedoBtnLabel: Text;

  private tutorialText: Text;

  constructor(engine: ISimEngine, onPauseToggle: () => void) {
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

    // O2
    const o2Label = new Text({ text: "O2", style: makeLabelStyle() });
    o2Label.x = DASH_LABEL_X;
    o2Label.y = ROW_O2_LABEL;
    this.container.addChild(o2Label);

    this.o2BarBgContainer = new Graphics();
    this.o2BarBgContainer
      .rect(DASH_HP_BAR_X, ROW_O2_BAR, DASH_HP_BAR_W, DASH_HP_BAR_H)
      .fill(0x1a2030);
    this.container.addChild(this.o2BarBgContainer);

    this.o2Bar = new Graphics();
    this.container.addChild(this.o2Bar);

    this.o2Value = new Text({ text: "", style: makeValueStyle() });
    this.o2Value.y = ROW_O2_VALUE;
    this.container.addChild(this.o2Value);

    this.suffocatingLabel = new Text({
      text: "SUFFOCATING",
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 11,
        fill: 0xff3333,
        fontWeight: "bold",
      }),
    });
    this.suffocatingLabel.x = DASH_LABEL_X;
    this.suffocatingLabel.y = ROW_O2_VALUE;
    this.suffocatingLabel.visible = false;
    this.container.addChild(this.suffocatingLabel);

    // DEPTH stat row
    const depthLabel = new Text({ text: "DEPTH", style: makeLabelStyle() });
    depthLabel.x = DASH_LABEL_X;
    depthLabel.y = ROW_DEPTH;
    this.container.addChild(depthLabel);

    this.depthValue = new Text({ text: "", style: makeValueStyle() });
    this.depthValue.x = DASH_VALUE_X;
    this.depthValue.y = ROW_DEPTH;
    this.container.addChild(this.depthValue);

    // TORPEDO count row
    const torpLabel = new Text({ text: "TORPEDO", style: makeLabelStyle() });
    torpLabel.x = DASH_LABEL_X;
    torpLabel.y = ROW_TORPEDO;
    this.container.addChild(torpLabel);

    this.torpedoValue = new Text({ text: "", style: makeValueStyle() });
    this.torpedoValue.x = DASH_VALUE_X;
    this.torpedoValue.y = ROW_TORPEDO;
    this.container.addChild(this.torpedoValue);

    // Position row
    const posLabel = new Text({ text: "POS", style: makeLabelStyle() });
    posLabel.x = DASH_LABEL_X;
    posLabel.y = ROW_POS;
    this.container.addChild(posLabel);

    this.positionValue = new Text({ text: "", style: makeValueStyle() });
    this.positionValue.x = DASH_VALUE_X;
    this.positionValue.y = ROW_POS;
    this.container.addChild(this.positionValue);

    // ── Speed control buttons ────────────────────────────────────────────────

    const speedCtrlLabel = new Text({ text: "SPEED", style: makeLabelStyle() });
    speedCtrlLabel.x = DASH_LABEL_X;
    speedCtrlLabel.y = SPEED_CTRL_Y;
    this.container.addChild(speedCtrlLabel);

    const speedValues: SpeedSetting[] = [
      SpeedSetting.SILENT,
      SpeedSetting.STANDARD,
      SpeedSetting.AHEAD_FULL,
    ];
    this.speedBtns = buildThreeButtons(
      this.container,
      SPEED_BTN_Y,
      SPEED_BTN_H,
      ["SILENT", "STANDARD", "AHEAD FULL"],
      (idx) => {
        const speed = speedValues[idx] ?? SpeedSetting.STANDARD;
        const direction = this.engine.getState().combat?.player.direction ?? SpeedDirection.HOLD;
        this.engine.queueCommand({ type: "SET_SPEED", speed, direction });
      },
    );

    // ── Direction control buttons ────────────────────────────────────────────

    const dirCtrlLabel = new Text({ text: "DIRECTION", style: makeLabelStyle() });
    dirCtrlLabel.x = DASH_LABEL_X;
    dirCtrlLabel.y = DIR_CTRL_Y;
    this.container.addChild(dirCtrlLabel);

    const dirValues: SpeedDirection[] = [
      SpeedDirection.OPEN,
      SpeedDirection.HOLD,
      SpeedDirection.CLOSE,
    ];
    this.dirBtns = buildThreeButtons(
      this.container,
      DIR_BTN_Y,
      DIR_BTN_H,
      ["◄ OPEN", "● HOLD", "► CLOSE"],
      (idx) => {
        const direction = dirValues[idx] ?? SpeedDirection.HOLD;
        const speed = this.engine.getState().combat?.player.speed ?? SpeedSetting.STANDARD;
        this.engine.queueCommand({ type: "SET_SPEED", speed, direction });
      },
    );

    // ── Pause button ─────────────────────────────────────────────────────────

    const totalW = PANEL_W - ROOM_MARGIN_X * 2;

    this.pauseBtnGfx = new Graphics();
    this.container.addChild(this.pauseBtnGfx);

    const pauseLabelStyle = new TextStyle({
      fontFamily: "monospace",
      fontSize: 9,
      fill: 0x668899,
    });
    this.pauseBtnLabel = new Text({ text: "⏸ PAUSE", style: pauseLabelStyle });
    this.pauseBtnLabel.x = ROOM_MARGIN_X + 4;
    this.pauseBtnLabel.y = PAUSE_BTN_Y + Math.floor((PAUSE_BTN_H - 12) / 2);
    this.container.addChild(this.pauseBtnLabel);

    const pauseHitArea = new Graphics();
    pauseHitArea
      .rect(ROOM_MARGIN_X, PAUSE_BTN_Y, totalW, PAUSE_BTN_H)
      .fill({ color: 0xffffff, alpha: 0 });
    pauseHitArea.eventMode = "static";
    pauseHitArea.cursor = "pointer";
    pauseHitArea.on("pointertap", () => onPauseToggle());
    this.container.addChild(pauseHitArea);

    // ── Depth selector ───────────────────────────────────────────────────────

    const depthCtrlLabel = new Text({ text: "DIVE CTRL", style: makeLabelStyle() });
    depthCtrlLabel.x = DASH_LABEL_X;
    depthCtrlLabel.y = DEPTH_CTRL_Y;
    this.container.addChild(depthCtrlLabel);

    const btnCount = DEPTH_BANDS.length;
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
      btnLabel.y = DEPTH_BTN_Y + Math.floor((DEPTH_BTN_H - 12) / 2);
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

    // ── Weapon fire buttons ──────────────────────────────────────────────────

    const weaponCtrlLabel = new Text({ text: "WEAPONS", style: makeLabelStyle() });
    weaponCtrlLabel.x = DASH_LABEL_X;
    weaponCtrlLabel.y = WEAPON_CTRL_Y;
    this.container.addChild(weaponCtrlLabel);

    const weaponBtnW = Math.floor((totalW - DEPTH_BTN_GAP) / 2);
    const deckGunX = ROOM_MARGIN_X;
    const torpedoX = ROOM_MARGIN_X + weaponBtnW + DEPTH_BTN_GAP;

    this.deckGunBtnGfx = new Graphics();
    this.container.addChild(this.deckGunBtnGfx);
    this.deckGunBtnLabel = new Text({
      text: "◉ DECK GUN",
      style: new TextStyle({ fontFamily: "monospace", fontSize: 9, fill: 0x442222 }),
    });
    this.deckGunBtnLabel.x = deckGunX + 4;
    this.deckGunBtnLabel.y = WEAPON_BTN_Y + Math.floor((WEAPON_BTN_H - 12) / 2);
    this.container.addChild(this.deckGunBtnLabel);

    const deckGunHit = new Graphics();
    deckGunHit
      .rect(deckGunX, WEAPON_BTN_Y, weaponBtnW, WEAPON_BTN_H)
      .fill({ color: 0xffffff, alpha: 0 });
    deckGunHit.eventMode = "static";
    deckGunHit.cursor = "pointer";
    deckGunHit.on("pointertap", () => {
      this.engine.queueCommand({ type: "FIRE_DECK_GUN" });
    });
    this.container.addChild(deckGunHit);

    this.torpedoBtnGfx = new Graphics();
    this.container.addChild(this.torpedoBtnGfx);
    this.torpedoBtnLabel = new Text({
      text: "◈ TORPEDO",
      style: new TextStyle({ fontFamily: "monospace", fontSize: 9, fill: 0x443300 }),
    });
    this.torpedoBtnLabel.x = torpedoX + 4;
    this.torpedoBtnLabel.y = WEAPON_BTN_Y + Math.floor((WEAPON_BTN_H - 12) / 2);
    this.container.addChild(this.torpedoBtnLabel);

    const torpedoHit = new Graphics();
    torpedoHit
      .rect(torpedoX, WEAPON_BTN_Y, weaponBtnW, WEAPON_BTN_H)
      .fill({ color: 0xffffff, alpha: 0 });
    torpedoHit.eventMode = "static";
    torpedoHit.cursor = "pointer";
    torpedoHit.on("pointertap", () => {
      this.engine.queueCommand({ type: "FIRE_TORPEDO" });
    });
    this.container.addChild(torpedoHit);

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
    this.tutorialText.y = TUTORIAL_Y;
    this.container.addChild(this.tutorialText);
  }

  update(state: CombatState, step: TutorialStep, elapsed: number, paused: boolean): void {
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

    // O2 bar
    if (state.player.maxOxygen > 0) {
      this.o2BarBgContainer.visible = true;
      this.o2Bar.visible = true;
      this.o2Value.visible = true;
      const o2Frac = state.player.oxygen / state.player.maxOxygen;
      const o2Color = o2Frac > 0.5 ? 0x00ccff : o2Frac > 0.25 ? 0xffaa00 : 0xff3333;
      this.o2Bar.clear();
      if (o2Frac > 0) {
        this.o2Bar
          .rect(DASH_HP_BAR_X, ROW_O2_BAR, Math.round(DASH_HP_BAR_W * o2Frac), DASH_HP_BAR_H)
          .fill(o2Color);
      }
      const o2Pct = Math.round(o2Frac * 100);
      this.o2Value.text = `${o2Pct}%`;
      this.o2Value.x = DASH_HP_BAR_X + DASH_HP_BAR_W - this.o2Value.width;
      this.o2Value.y = ROW_O2_VALUE;

      const suffocating = state.player.oxygen <= 0 && state.oxygenDepletedTicks > 0;
      this.suffocatingLabel.visible = suffocating && Math.floor(elapsed / 300) % 2 === 0;
      this.o2Value.visible = !suffocating;
    } else {
      this.o2BarBgContainer.visible = false;
      this.o2Bar.visible = false;
      this.o2Value.visible = false;
      this.suffocatingLabel.visible = false;
    }

    // Depth
    const depthName = DEPTH_NAMES[state.player.depth] ?? "?";
    const targetName =
      state.player.depthTarget !== state.player.depth
        ? ` → ${DEPTH_NAMES[state.player.depthTarget] ?? "?"}`
        : "";
    this.depthValue.text = `${depthName}${targetName}`;

    // Torpedo count
    const count = state.player.torpedoCount;
    const full = Math.min(count, TORPEDO_MAX);
    const empty = TORPEDO_MAX - full;
    this.torpedoValue.text = `${"◆".repeat(full)}${"◇".repeat(empty)}  ${count}`;

    // Positions
    this.positionValue.text = `SUB (${Math.round(state.player.x)},${Math.round(state.player.y)})  ENM (${Math.round(state.enemy.x)},${Math.round(state.enemy.y)})`;

    // ── Speed buttons ────────────────────────────────────────────────────────

    const speedValues: SpeedSetting[] = [
      SpeedSetting.SILENT,
      SpeedSetting.STANDARD,
      SpeedSetting.AHEAD_FULL,
    ];
    for (let i = 0; i < this.speedBtns.length; i++) {
      const btn = this.speedBtns[i];
      if (btn === undefined) continue;
      const isActive = state.player.speed === speedValues[i];
      btn.gfx.clear();
      btn.gfx
        .rect(btn.x, SPEED_BTN_Y, btn.w, SPEED_BTN_H)
        .fill(isActive ? 0x0d2030 : 0x0a1420)
        .stroke({ color: isActive ? 0x00ccff : 0x334455, width: 1 });
      (btn.label.style as TextStyle).fill = isActive ? 0xffffff : 0x668899;
    }

    // ── Direction buttons ────────────────────────────────────────────────────

    const dirValues: SpeedDirection[] = [
      SpeedDirection.OPEN,
      SpeedDirection.HOLD,
      SpeedDirection.CLOSE,
    ];
    for (let i = 0; i < this.dirBtns.length; i++) {
      const btn = this.dirBtns[i];
      if (btn === undefined) continue;
      const isActive = state.player.direction === dirValues[i];
      btn.gfx.clear();
      btn.gfx
        .rect(btn.x, DIR_BTN_Y, btn.w, DIR_BTN_H)
        .fill(isActive ? 0x0d2030 : 0x0a1420)
        .stroke({ color: isActive ? 0x00ccff : 0x334455, width: 1 });
      (btn.label.style as TextStyle).fill = isActive ? 0xffffff : 0x668899;
    }

    // ── Pause button ─────────────────────────────────────────────────────────

    const totalW = PANEL_W - ROOM_MARGIN_X * 2;
    this.pauseBtnGfx.clear();
    if (paused) {
      this.pauseBtnGfx
        .rect(ROOM_MARGIN_X, PAUSE_BTN_Y, totalW, PAUSE_BTN_H)
        .fill(0x1a1a08)
        .stroke({ color: 0xffdd44, width: 1 });
      this.pauseBtnLabel.text = "▶ RESUME";
      (this.pauseBtnLabel.style as TextStyle).fill = 0xffdd44;
    } else {
      this.pauseBtnGfx
        .rect(ROOM_MARGIN_X, PAUSE_BTN_Y, totalW, PAUSE_BTN_H)
        .fill(0x0a1420)
        .stroke({ color: 0x334455, width: 1 });
      this.pauseBtnLabel.text = "⏸ PAUSE";
      (this.pauseBtnLabel.style as TextStyle).fill = 0x668899;
    }

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

    // ── Weapon buttons ───────────────────────────────────────────────────────

    const deckGunRoom = state.rooms.find((r) => r.type === RoomType.DECK_GUN);
    const deckGunCrewed = deckGunRoom !== undefined && deckGunRoom.crewIds.length > 0;
    const deckGunReady =
      state.player.depth === DepthBand.SURFACE &&
      state.player.deckGunCooldown === 0 &&
      deckGunCrewed;

    const torpedoRoom = state.rooms.find((r) => r.type === RoomType.TORPEDO);
    const torpedoCrewed = torpedoRoom !== undefined && torpedoRoom.crewIds.length > 0;
    const torpedoReady =
      state.player.torpedoCooldown === 0 &&
      state.player.torpedoCount > 0 &&
      torpedoCrewed &&
      state.player.depth >= DepthBand.PERISCOPE &&
      state.player.depth <= DepthBand.DEEP;

    const weaponBtnW = Math.floor((PANEL_W - ROOM_MARGIN_X * 2 - DEPTH_BTN_GAP) / 2);

    this.deckGunBtnGfx.clear();
    this.deckGunBtnGfx
      .rect(ROOM_MARGIN_X, WEAPON_BTN_Y, weaponBtnW, WEAPON_BTN_H)
      .fill(deckGunReady ? 0x1a0808 : 0x0a0808)
      .stroke({ color: deckGunReady ? 0xff3333 : 0x332222, width: deckGunReady ? 2 : 1 });
    (this.deckGunBtnLabel.style as TextStyle).fill = deckGunReady ? 0xff8888 : 0x442222;

    const weaponTorpedoX = ROOM_MARGIN_X + weaponBtnW + DEPTH_BTN_GAP;
    this.torpedoBtnGfx.clear();
    this.torpedoBtnGfx
      .rect(weaponTorpedoX, WEAPON_BTN_Y, weaponBtnW, WEAPON_BTN_H)
      .fill(torpedoReady ? 0x0e0d08 : 0x0a0a08)
      .stroke({ color: torpedoReady ? 0xff8800 : 0x332200, width: torpedoReady ? 2 : 1 });
    (this.torpedoBtnLabel.style as TextStyle).fill = torpedoReady ? 0xffaa44 : 0x443300;

    // Tutorial text
    this.tutorialText.text = TUTORIAL_TEXT[step];
    this.tutorialText.style.fill =
      step === 9 || step === 4 ? 0xff3333 : step === 8 || step === 3 ? 0x00ff88 : 0xffffff;
  }
}
