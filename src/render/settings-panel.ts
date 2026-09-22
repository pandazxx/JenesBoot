/**
 * SettingsPanel — developer overlay for combat config.
 *
 * Pure DOM — no PixiJS. Injected directly into document.body.
 * Intentional: this is a dev tool that needs real <input> elements.
 */

import { defaultCombatConfig } from "../sim/combat/config.js";
import type { CombatConfig } from "../sim/combat/config.js";

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

export class SettingsPanel {
  private overlay: HTMLDivElement;
  onClose: ((config: CombatConfig) => void) | null = null;

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
    subtitle.textContent = "Config editing coming soon. Changes take effect on next combat start.";
    card.appendChild(subtitle);

    const buttonRow = document.createElement("div");
    buttonRow.style.cssText = BUTTON_ROW_STYLE;

    const resetBtn = document.createElement("button");
    resetBtn.style.cssText = BTN_RESET_STYLE;
    resetBtn.textContent = "RESET DEFAULTS";
    resetBtn.addEventListener("click", () => {
      if (this.onClose !== null) this.onClose(defaultCombatConfig());
      this.hide();
    });

    const saveBtn = document.createElement("button");
    saveBtn.style.cssText = BTN_SAVE_STYLE;
    saveBtn.textContent = "CLOSE";
    saveBtn.addEventListener("click", () => {
      this.hide();
      if (this.onClose !== null) this.onClose(defaultCombatConfig());
    });

    buttonRow.appendChild(resetBtn);
    buttonRow.appendChild(saveBtn);
    card.appendChild(buttonRow);

    this.overlay.appendChild(card);
    document.body.appendChild(this.overlay);
  }

  show(_current: CombatConfig): void {
    this.overlay.style.display = "flex";
  }

  hide(): void {
    this.overlay.style.display = "none";
  }
}
