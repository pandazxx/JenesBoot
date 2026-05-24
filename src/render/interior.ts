/**
 * InteriorView — submarine interior panel (left 460×540).
 *
 * PixiJS v8 rendering only. No sim logic, no Math.random().
 */

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import type { ISimEngine } from "../sim/index.js";
import type { CombatState, PlayerCommand } from "../sim/combat/types.js";
import { DepthBand, NauticalSpeed, DiveSpeed } from "../sim/combat/enums.js";

const PANEL_W = 460;
const PANEL_H = 540;

const ROOM_Y = 40;
const ROOM_MARGIN_X = 20;

const DASH_LABEL_X = 20;
const DASH_VALUE_X = 118;
const DASH_HP_BAR_X = 118;
const DASH_HP_BAR_W = 302;
const DASH_HP_BAR_H = 12;

const ROW_HP_LABEL = 150;
const ROW_HP_BAR = 163;
const ROW_HP_VALUE = 178;
const ROW_DEPTH = 237;
const ROW_POS = 271;

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

const WEAPON_CTRL_Y = 471;
const WEAPON_BTN_Y = 483;
const WEAPON_BTN_H = 36;

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

interface DepthBtn {
  gfx: Graphics;
  x: number;
  w: number;
  band: (typeof DepthBand)[keyof typeof DepthBand];
}

interface TripleBtn {
  gfx: Graphics;
  label: Text;
  x: number;
  w: number;
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
  private onCommand: (() => void) | undefined;

  private hpBar: Graphics;
  private hpValue: Text;
  private depthValue: Text;
  private positionValue: Text;

  private speedBtns: TripleBtn[];
  private dirBtns: TripleBtn[];

  private pauseBtnGfx: Graphics;
  private pauseBtnLabel: Text;

  private depthBtns: DepthBtn[] = [];
  private depthPulseGfx: Graphics;

  private deckGunBtnGfx: Graphics;
  private deckGunBtnLabel: Text;
  private torpedoBtnGfx: Graphics;
  private torpedoBtnLabel: Text;

  constructor(engine: ISimEngine, onPauseToggle: () => void, onCommand?: () => void) {
    this.engine = engine;
    this.onCommand = onCommand;
    this.container = new Container();

    const bg = new Graphics();
    bg.rect(0, 0, PANEL_W, PANEL_H).fill(0x06080f);
    this.container.addChild(bg);

    const headerStyle = new TextStyle({ fontFamily: "monospace", fontSize: 11, fill: 0x8899aa });
    const header = new Text({ text: "SUBMARINE INTERIOR", style: headerStyle });
    header.x = 16;
    header.y = 12;
    this.container.addChild(header);

    // Room placeholder (no rooms in new system)
    const roomPlaceholder = new Graphics();
    roomPlaceholder
      .rect(ROOM_MARGIN_X, ROOM_Y, PANEL_W - ROOM_MARGIN_X * 2, 95)
      .fill(0x0a1420)
      .stroke({ color: 0x334455, width: 1 });
    this.container.addChild(roomPlaceholder);
    const roomLabel = new Text({ text: "SUBMARINE", style: makeLabelStyle() });
    roomLabel.x = ROOM_MARGIN_X + 5;
    roomLabel.y = ROOM_Y + 5;
    this.container.addChild(roomLabel);

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

    // Position row
    const posLabel = new Text({ text: "POS", style: makeLabelStyle() });
    posLabel.x = DASH_LABEL_X;
    posLabel.y = ROW_POS;
    this.container.addChild(posLabel);

    this.positionValue = new Text({ text: "", style: makeValueStyle() });
    this.positionValue.x = DASH_VALUE_X;
    this.positionValue.y = ROW_POS;
    this.container.addChild(this.positionValue);

    // Speed control buttons
    const speedCtrlLabel = new Text({ text: "SPEED", style: makeLabelStyle() });
    speedCtrlLabel.x = DASH_LABEL_X;
    speedCtrlLabel.y = SPEED_CTRL_Y;
    this.container.addChild(speedCtrlLabel);

    const speedValues: (typeof NauticalSpeed)[keyof typeof NauticalSpeed][] = [
      NauticalSpeed.DEAD_SLOW,
      NauticalSpeed.HALF_AHEAD,
      NauticalSpeed.FULL_AHEAD,
    ];
    this.speedBtns = buildThreeButtons(
      this.container,
      SPEED_BTN_Y,
      SPEED_BTN_H,
      ["DEAD SLOW", "HALF AHEAD", "FULL AHEAD"],
      (idx) => {
        const speed = speedValues[idx] ?? NauticalSpeed.HALF_AHEAD;
        const intent = this.engine.getState().combat?.player.horizontalIntent ?? 0;
        this.issue({ type: "SET_NAUTICAL_SPEED", speed, intent });
      },
    );

    // Direction control buttons
    const dirCtrlLabel = new Text({ text: "DIRECTION", style: makeLabelStyle() });
    dirCtrlLabel.x = DASH_LABEL_X;
    dirCtrlLabel.y = DIR_CTRL_Y;
    this.container.addChild(dirCtrlLabel);

    const intentValues: (-1 | 0 | 1)[] = [-1, 0, 1];
    this.dirBtns = buildThreeButtons(
      this.container,
      DIR_BTN_Y,
      DIR_BTN_H,
      ["◄ OPEN", "● HOLD", "► CLOSE"],
      (idx) => {
        const intent = intentValues[idx] ?? 0;
        const speed =
          this.engine.getState().combat?.player.nauticalSpeed ?? NauticalSpeed.HALF_AHEAD;
        this.issue({ type: "SET_NAUTICAL_SPEED", speed, intent });
      },
    );

    // Pause button
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

    // Depth selector
    const depthCtrlLabel = new Text({ text: "DIVE CTRL", style: makeLabelStyle() });
    depthCtrlLabel.x = DASH_LABEL_X;
    depthCtrlLabel.y = DEPTH_CTRL_Y;
    this.container.addChild(depthCtrlLabel);

    const btnCount = DEPTH_BANDS.length;
    const btnW = Math.floor((totalW - DEPTH_BTN_GAP * (btnCount - 1)) / btnCount);

    this.depthPulseGfx = new Graphics();
    this.container.addChild(this.depthPulseGfx);

    for (let i = 0; i < btnCount; i++) {
      const band = DEPTH_BANDS[i] as (typeof DepthBand)[keyof typeof DepthBand];
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
        this.issue({
          type: "SET_DEPTH",
          target: band,
          diveSpeed: DiveSpeed.STANDARD,
        });
      });
      this.container.addChild(hitArea);

      this.depthBtns.push({ gfx, x: bx, w: btnW, band });
    }

    // Weapon fire buttons
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
      this.issue({ type: "FIRE_WEAPON", weaponId: "deck_gun" });
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
      this.issue({ type: "FIRE_WEAPON", weaponId: "torpedo" });
    });
    this.container.addChild(torpedoHit);
  }

  private issue(cmd: PlayerCommand): void {
    this.engine.queueCommand(cmd);
    this.onCommand?.();
  }

  update(state: CombatState, elapsed: number, paused: boolean): void {
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

    // Ammo
    const torpedoAmmo = state.player.weaponAmmo["torpedo"];
    if (torpedoAmmo !== undefined) {
      this.positionValue.text = `SUB (${Math.round(state.player.x)},${Math.round(state.player.y)})  ENM (${Math.round(state.enemy.x)},${Math.round(state.enemy.y)})  TORP:${torpedoAmmo}`;
    } else {
      this.positionValue.text = `SUB (${Math.round(state.player.x)},${Math.round(state.player.y)})  ENM (${Math.round(state.enemy.x)},${Math.round(state.enemy.y)})`;
    }

    // Speed buttons
    const speedValues: (typeof NauticalSpeed)[keyof typeof NauticalSpeed][] = [
      NauticalSpeed.DEAD_SLOW,
      NauticalSpeed.HALF_AHEAD,
      NauticalSpeed.FULL_AHEAD,
    ];
    for (let i = 0; i < this.speedBtns.length; i++) {
      const btn = this.speedBtns[i];
      if (btn === undefined) continue;
      const isActive = state.player.nauticalSpeed === speedValues[i];
      btn.gfx.clear();
      btn.gfx
        .rect(btn.x, SPEED_BTN_Y, btn.w, SPEED_BTN_H)
        .fill(isActive ? 0x0d2030 : 0x0a1420)
        .stroke({ color: isActive ? 0x00ccff : 0x334455, width: 1 });
      (btn.label.style as TextStyle).fill = isActive ? 0xffffff : 0x668899;
    }

    // Direction buttons
    const intentValues: (-1 | 0 | 1)[] = [-1, 0, 1];
    for (let i = 0; i < this.dirBtns.length; i++) {
      const btn = this.dirBtns[i];
      if (btn === undefined) continue;
      const isActive = state.player.horizontalIntent === intentValues[i];
      btn.gfx.clear();
      btn.gfx
        .rect(btn.x, DIR_BTN_Y, btn.w, DIR_BTN_H)
        .fill(isActive ? 0x0d2030 : 0x0a1420)
        .stroke({ color: isActive ? 0x00ccff : 0x334455, width: 1 });
      (btn.label.style as TextStyle).fill = isActive ? 0xffffff : 0x668899;
    }

    // Pause button
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

    // Depth selector
    this.depthPulseGfx.clear();
    for (const btn of this.depthBtns) {
      const isCurrent = state.player.depth === btn.band;
      const isTarget =
        state.player.depthTarget === btn.band && state.player.depthTarget !== state.player.depth;
      const fillColor = isCurrent ? 0x0d2820 : isTarget ? 0x201008 : 0x0a1420;
      const strokeColor = isCurrent ? 0x00ffcc : isTarget ? 0xff8800 : 0x335566;

      btn.gfx.clear();
      btn.gfx
        .rect(btn.x, DEPTH_BTN_Y, btn.w, DEPTH_BTN_H)
        .fill(fillColor)
        .stroke({ color: strokeColor, width: 1 });
    }

    // Weapon buttons
    const deckGunCooldown = state.player.weaponCooldowns["deck_gun"] ?? 0;
    const deckGunReady = state.player.depth === DepthBand.SURFACE && deckGunCooldown === 0;

    const torpCooldown = state.player.weaponCooldowns["torpedo"] ?? 0;
    const torpAmmo = state.player.weaponAmmo["torpedo"];
    const torpedoReady =
      torpCooldown === 0 &&
      (torpAmmo === undefined || torpAmmo > 0) &&
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

    void elapsed;
  }
}
