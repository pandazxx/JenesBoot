/**
 * SettingsPanel — a developer overlay for tweaking SimConfig values.
 *
 * Pure DOM — no PixiJS. Injected directly into document.body.
 * Intentional: this is a dev tool that needs real <input> elements.
 */

import type { SimConfig } from "../sim/index.js";
import { defaultSimConfig } from "../sim/combat/config.js";

interface FieldDef {
  key: keyof SimConfig;
  label: string;
  min?: string;
}

interface Section {
  heading: string;
  fields: FieldDef[];
}

const SECTIONS: Section[] = [
  {
    heading: "MOVEMENT",
    fields: [
      { key: "xSpeedSilent", label: "xSpeedSilent" },
      { key: "xSpeedStandard", label: "xSpeedStandard" },
      { key: "xSpeedAheadFull", label: "xSpeedAheadFull" },
      { key: "ySpeed", label: "ySpeed" },
    ],
  },
  {
    heading: "OXYGEN",
    fields: [
      { key: "maxOxygen", label: "maxOxygen" },
      { key: "o2DrainPeriscope", label: "o2DrainPeriscope" },
      { key: "o2DrainShallow", label: "o2DrainShallow" },
      { key: "o2DrainDeep", label: "o2DrainDeep" },
      { key: "o2DrainAbyssal", label: "o2DrainAbyssal" },
      { key: "o2DrainStandard", label: "o2DrainStandard" },
      { key: "o2DrainAheadFull", label: "o2DrainAheadFull" },
      { key: "o2SurfaceRegen", label: "o2SurfaceRegen" },
      { key: "o2GraceTicks", label: "o2GraceTicks" },
    ],
  },
  {
    heading: "PLAYER SHIP",
    fields: [
      { key: "playerMaxHullHP", label: "playerMaxHullHP" },
      { key: "playerTorpedoCount", label: "playerTorpedoCount" },
    ],
  },
  {
    heading: "WEAPONS",
    fields: [
      { key: "deckGunDamage", label: "deckGunDamage" },
      { key: "deckGunCooldown", label: "deckGunCooldown" },
      { key: "torpedoDamage", label: "torpedoDamage" },
      { key: "torpedoCooldown", label: "torpedoCooldown" },
      { key: "torpedoFlightTicks", label: "torpedoFlightTicks" },
      { key: "depthChargeDamage", label: "depthChargeDamage" },
      { key: "depthChargeCooldown", label: "depthChargeCooldown" },
    ],
  },
  {
    heading: "ENEMY HP",
    fields: [
      { key: "enemyHullSurfaceBattle", label: "enemyHullSurfaceBattle" },
      { key: "enemyHullDestroyerDive", label: "enemyHullDestroyerDive" },
      { key: "enemyHullGunboatHunt", label: "enemyHullGunboatHunt" },
      { key: "enemyHullDestroyerBattle", label: "enemyHullDestroyerBattle" },
      { key: "enemyHullSubmergedAmbush", label: "enemyHullSubmergedAmbush" },
    ],
  },
  {
    heading: "ENEMY SPEED (units/tick at AHEAD_FULL)",
    fields: [
      { key: "gunboatSpeed", label: "gunboatSpeed", min: "0" },
      { key: "destroyerSpeed", label: "destroyerSpeed", min: "0" },
    ],
  },
  {
    heading: "ESCAPE THRESHOLDS",
    fields: [
      { key: "escapeTicksDestroyerDive", label: "escapeTicksDestroyerDive" },
      { key: "escapeTicksSubmergedAmbush", label: "escapeTicksSubmergedAmbush" },
      { key: "escapeTicksOther", label: "escapeTicksOther" },
    ],
  },
];

const OVERLAY_STYLE = `
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  font-family: monospace;
`;

const CARD_STYLE = `
  background: #0a0e1a;
  color: #e8e8e0;
  border: 1px solid #2a3a4a;
  border-radius: 4px;
  padding: 24px 32px;
  max-height: 80vh;
  overflow-y: auto;
  width: 480px;
  font-family: monospace;
  font-size: 13px;
`;

const SECTION_HEADING_STYLE = `
  color: #88aacc;
  font-weight: bold;
  margin: 16px 0 8px 0;
  font-size: 12px;
  letter-spacing: 1px;
`;

const FIELD_ROW_STYLE = `
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 4px 0;
`;

const LABEL_STYLE = `
  color: #a8b8c8;
  flex: 1;
`;

const INPUT_STYLE = `
  background: #141c2a;
  color: #e8e8e0;
  border: 1px solid #2a3a4a;
  border-radius: 2px;
  padding: 2px 6px;
  width: 80px;
  font-family: monospace;
  font-size: 13px;
  text-align: right;
`;

const BUTTON_ROW_STYLE = `
  display: flex;
  gap: 12px;
  margin-top: 20px;
  justify-content: flex-end;
`;

const BTN_SAVE_STYLE = `
  background: #1a4a2a;
  color: #e8e8e0;
  border: 1px solid #2a6a3a;
  border-radius: 2px;
  padding: 6px 16px;
  font-family: monospace;
  font-size: 12px;
  cursor: pointer;
  letter-spacing: 1px;
`;

const BTN_RESET_STYLE = `
  background: #3a1a1a;
  color: #e8e8e0;
  border: 1px solid #6a2a2a;
  border-radius: 2px;
  padding: 6px 16px;
  font-family: monospace;
  font-size: 12px;
  cursor: pointer;
  letter-spacing: 1px;
`;

const TITLE_STYLE = `
  color: #e8e8e0;
  font-size: 14px;
  font-weight: bold;
  letter-spacing: 2px;
  margin-bottom: 4px;
`;

const SUBTITLE_STYLE = `
  color: #556677;
  font-size: 11px;
  margin-bottom: 4px;
`;

export class SettingsPanel {
  private overlay: HTMLDivElement;
  private inputs: Map<keyof SimConfig, HTMLInputElement> = new Map();
  onClose: ((config: SimConfig) => void) | null = null;

  constructor() {
    this.overlay = document.createElement("div");
    this.overlay.style.cssText = OVERLAY_STYLE;
    this.overlay.style.display = "none";

    const card = document.createElement("div");
    card.style.cssText = CARD_STYLE;

    const title = document.createElement("div");
    title.style.cssText = TITLE_STYLE;
    title.textContent = "DEV SETTINGS";
    card.appendChild(title);

    const subtitle = document.createElement("div");
    subtitle.style.cssText = SUBTITLE_STYLE;
    subtitle.textContent = "Changes take effect on next combat start.";
    card.appendChild(subtitle);

    for (const section of SECTIONS) {
      const heading = document.createElement("div");
      heading.style.cssText = SECTION_HEADING_STYLE;
      heading.textContent = section.heading;
      card.appendChild(heading);

      for (const field of section.fields) {
        const row = document.createElement("div");
        row.style.cssText = FIELD_ROW_STYLE;

        const label = document.createElement("label");
        label.style.cssText = LABEL_STYLE;
        label.textContent = field.label;
        label.htmlFor = `sp-${field.key}`;

        const input = document.createElement("input");
        input.type = "number";
        input.min = field.min ?? "1";
        input.id = `sp-${field.key}`;
        input.style.cssText = INPUT_STYLE;

        this.inputs.set(field.key, input);
        row.appendChild(label);
        row.appendChild(input);
        card.appendChild(row);
      }
    }

    const buttonRow = document.createElement("div");
    buttonRow.style.cssText = BUTTON_ROW_STYLE;

    const resetBtn = document.createElement("button");
    resetBtn.style.cssText = BTN_RESET_STYLE;
    resetBtn.textContent = "RESET DEFAULTS";
    resetBtn.addEventListener("click", () => {
      this.populateInputs(defaultSimConfig());
    });

    const saveBtn = document.createElement("button");
    saveBtn.style.cssText = BTN_SAVE_STYLE;
    saveBtn.textContent = "SAVE & CLOSE";
    saveBtn.addEventListener("click", () => {
      const config = this.readInputs();
      this.hide();
      if (this.onClose !== null) this.onClose(config);
    });

    buttonRow.appendChild(resetBtn);
    buttonRow.appendChild(saveBtn);
    card.appendChild(buttonRow);

    this.overlay.appendChild(card);
    document.body.appendChild(this.overlay);
  }

  show(current: SimConfig): void {
    this.populateInputs(current);
    this.overlay.style.display = "flex";
  }

  hide(): void {
    this.overlay.style.display = "none";
  }

  private populateInputs(config: SimConfig): void {
    for (const [key, input] of this.inputs) {
      input.value = String(config[key]);
    }
  }

  private readInputs(): SimConfig {
    const defaults = defaultSimConfig();
    const result: SimConfig = { ...defaults };
    for (const [key, input] of this.inputs) {
      const parsed = parseFloat(input.value);
      if (!isNaN(parsed) && parsed >= 0) {
        (result as Record<keyof SimConfig, number>)[key] = parsed;
      }
    }
    return result;
  }
}
