/**
 * InteriorView — submarine interior panel (left 460×540).
 *
 * PixiJS v8 rendering only. No sim logic, no Math.random().
 */

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import type { ISimEngine } from "../sim/index.js";
import type { CombatState } from "../sim/combat/types.js";
import { RoomType } from "../sim/combat/types.js";
import type { TutorialStep } from "./tutorial.js";
import { TUTORIAL_TEXT } from "./tutorial.js";

const PANEL_W = 460;
const PANEL_H = 540;

const ROOM_DEFS = [
  { id: "bridge", type: RoomType.BRIDGE, label: "BRIDGE", x: 20, y: 50, w: 200, h: 110 },
  {
    id: "deck_gun",
    type: RoomType.DECK_GUN,
    label: "DECK GUN",
    x: 240,
    y: 50,
    w: 200,
    h: 110,
  },
] as const;

export class InteriorView {
  readonly container: Container;
  private engine: ISimEngine;
  private selectedCrewId: string | null = null;

  private roomGraphics: Map<string, Graphics> = new Map();
  private crewGraphics: Map<string, Graphics> = new Map();
  private pulseGfx: Graphics;
  private hpBar: Graphics;
  private hpText: Text;
  private tutorialText: Text;

  constructor(engine: ISimEngine) {
    this.engine = engine;
    this.container = new Container();

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

    // Pulse outline for uncrewed deck gun
    this.pulseGfx = new Graphics();
    this.container.addChild(this.pulseGfx);

    // Room boxes
    for (const def of ROOM_DEFS) {
      const gfx = new Graphics();
      this.container.addChild(gfx);
      this.roomGraphics.set(def.id, gfx);

      // Room label
      const labelStyle = new TextStyle({ fontFamily: "monospace", fontSize: 10, fill: 0x8899aa });
      const label = new Text({ text: def.label, style: labelStyle });
      label.x = def.x + 6;
      label.y = def.y + 6;
      this.container.addChild(label);

      // Clickable hit area — use an invisible Graphics over the room box
      const hitArea = new Graphics();
      hitArea.rect(def.x, def.y, def.w, def.h).fill({ color: 0xffffff, alpha: 0 });
      hitArea.eventMode = "static";
      hitArea.cursor = "pointer";
      const roomId = def.id;
      hitArea.on("pointertap", () => {
        if (this.selectedCrewId !== null) {
          this.engine.queueCommand({
            type: "ASSIGN_CREW",
            crewId: this.selectedCrewId,
            roomId,
          });
          this.selectedCrewId = null;
        }
      });
      this.container.addChild(hitArea);
    }

    // Hull HP display
    const hpLabelStyle = new TextStyle({ fontFamily: "monospace", fontSize: 10, fill: 0x8899aa });
    const hpLabel = new Text({ text: "HULL HP", style: hpLabelStyle });
    hpLabel.x = 16;
    hpLabel.y = 186;
    this.container.addChild(hpLabel);

    const hpBarBg = new Graphics();
    hpBarBg.rect(16, 200, 420, 16).fill(0x1a2030);
    this.container.addChild(hpBarBg);

    this.hpBar = new Graphics();
    this.container.addChild(this.hpBar);

    const hpTextStyle = new TextStyle({ fontFamily: "monospace", fontSize: 11, fill: 0xffffff });
    this.hpText = new Text({ text: "", style: hpTextStyle });
    this.hpText.x = 16;
    this.hpText.y = 222;
    this.container.addChild(this.hpText);

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
    this.tutorialText.y = 480;
    this.container.addChild(this.tutorialText);
  }

  update(state: CombatState, step: TutorialStep, elapsed: number): void {
    // Draw room boxes
    for (const def of ROOM_DEFS) {
      const gfx = this.roomGraphics.get(def.id);
      if (gfx === undefined) continue;

      const room = state.rooms.find((r) => r.id === def.id);
      const hasCrew = room !== undefined && room.crewIds.length > 0;
      const strokeColor = hasCrew ? 0x00ff88 : 0x334455;

      gfx.clear();
      gfx.rect(def.x, def.y, def.w, def.h).fill(0x0a1420).stroke({ color: strokeColor, width: 2 });
    }

    // Pulse for uncrewed deck gun when step === 0
    this.pulseGfx.clear();
    if (step === 0) {
      const deckGunDef = ROOM_DEFS[1];
      const deckGunRoom = state.rooms.find((r) => r.id === "deck_gun");
      const isEmpty = deckGunRoom === undefined || deckGunRoom.crewIds.length === 0;
      if (isEmpty) {
        const alpha = 0.4 + 0.6 * Math.abs(Math.sin(elapsed / 400));
        this.pulseGfx.alpha = alpha;
        this.pulseGfx
          .rect(deckGunDef.x, deckGunDef.y, deckGunDef.w, deckGunDef.h)
          .stroke({ color: 0xff8800, width: 3 });
      }
    }

    // Draw crew dots
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

      const roomId = crewMember.roomId;
      if (roomId === null) continue;

      const def = ROOM_DEFS.find((d) => d.id === roomId);
      if (def === undefined) continue;

      const cx = def.x + def.w / 2;
      const cy = def.y + 60;
      const color = this.selectedCrewId === crewMember.id ? 0xffff00 : 0x00ff88;

      gfx.circle(cx, cy, 10).fill(color);
    }

    // Hull HP bar
    const hpFrac = state.player.maxHullHP > 0 ? state.player.hullHP / state.player.maxHullHP : 0;
    const hpColor = hpFrac > 0.6 ? 0x00ff88 : hpFrac > 0.3 ? 0xffcc00 : 0xff3333;
    this.hpBar.clear();
    if (hpFrac > 0) {
      this.hpBar.rect(16, 200, Math.round(420 * hpFrac), 16).fill(hpColor);
    }
    this.hpText.text = `${state.player.hullHP} / ${state.player.maxHullHP}`;

    // Tutorial text
    this.tutorialText.text = TUTORIAL_TEXT[step];
    this.tutorialText.style.fill = step === 4 ? 0xff3333 : step === 3 ? 0x00ff88 : 0xffffff;
  }
}
