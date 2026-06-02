import { Application, Assets, Container, Graphics, Sprite, Text, TextStyle } from "pixi.js";
import { VesselType } from "../sim/combat/enums.js";
import type { PlayerScenario } from "../scenarios/types.js";
import { getPlayerScenarios } from "../scenarios/player/registry.js";

const BTN_W = 300;
const BTN_H = 28;
const BTN_GAP = 8;

export type LandingResult =
  | { kind: "quick-start"; enemyType: VesselType }
  | { kind: "player-scenario"; playerScenario: PlayerScenario };

export async function showLanding(
  app: Application,
  onSettings?: () => void,
): Promise<LandingResult> {
  const texture = await Assets.load(import.meta.env.BASE_URL + "landing.png");

  return new Promise<LandingResult>((resolve) => {
    const container = new Container();
    app.stage.addChild(container);

    const sprite = new Sprite(texture);

    const fitToCanvas = (): void => {
      const { width: cw, height: ch } = app.renderer;
      const scaleX = cw / 480;
      const scaleY = ch / 270;
      const scale = Math.min(scaleX, scaleY);
      sprite.scale.set(scale);
      sprite.x = Math.round((cw - 480 * scale) / 2);
      sprite.y = Math.round((ch - 270 * scale) / 2);
    };

    fitToCanvas();
    container.addChild(sprite);

    const labelStyle = new TextStyle({
      fontFamily: "monospace",
      fontSize: 13,
      fill: 0xe8e8e0,
      align: "center",
    });

    const buildStyle = new TextStyle({ fontFamily: "monospace", fontSize: 10, fill: 0x445566 });
    const buildLabel = new Text({ text: `build ${__GIT_COMMIT__}`, style: buildStyle });
    buildLabel.anchor.set(1, 1);
    buildLabel.x = app.renderer.width - 6;
    buildLabel.y = app.renderer.height - 4;
    container.addChild(buildLabel);

    app.stage.eventMode = "static";

    const cleanup = (result: LandingResult): void => {
      window.removeEventListener("resize", onResize);
      app.stage.removeChild(container);
      container.destroy({ children: true });
      resolve(result);
    };

    type BtnObjects = { bgNormal: Graphics; bgHover: Graphics; label: Text; hit: Graphics };
    const btnObjs: BtnObjects[] = [];

    const makeButton = (
      labelText: string,
      borderColor: number,
      fillNormal: number,
      fillHover: number,
      onClick: () => void,
    ): void => {
      const bgNormal = new Graphics();
      bgNormal
        .roundRect(0, 0, BTN_W, BTN_H, 2)
        .fill(fillNormal)
        .stroke({ color: borderColor, width: 1 });
      bgNormal.eventMode = "none";
      container.addChild(bgNormal);

      const bgHover = new Graphics();
      bgHover
        .roundRect(0, 0, BTN_W, BTN_H, 2)
        .fill(fillHover)
        .stroke({ color: borderColor, width: 1 });
      bgHover.eventMode = "none";
      bgHover.visible = false;
      container.addChild(bgHover);

      const label = new Text({ text: labelText, style: labelStyle });
      label.anchor.set(0.5, 0.5);
      label.eventMode = "none";
      container.addChild(label);

      const hit = new Graphics();
      hit.rect(0, 0, BTN_W, BTN_H).fill({ color: 0xffffff, alpha: 0 });
      hit.eventMode = "static";
      hit.cursor = "pointer";
      hit.on("pointerover", () => {
        bgNormal.visible = false;
        bgHover.visible = true;
      });
      hit.on("pointerout", () => {
        bgNormal.visible = true;
        bgHover.visible = false;
      });
      hit.on("pointertap", onClick);
      container.addChild(hit);

      btnObjs.push({ bgNormal, bgHover, label, hit });
    };

    // --- Scenario picker overlay (shown when "Scenarios" is clicked) ---

    let scenarioOverlay: Container | null = null;

    const showScenarioPicker = (): void => {
      if (scenarioOverlay !== null) return;

      const overlay = new Container();
      scenarioOverlay = overlay;
      container.addChild(overlay);

      const bg = new Graphics();
      const { width: cw, height: ch } = app.renderer;
      bg.rect(0, 0, cw, ch).fill({ color: 0x060b14, alpha: 0.92 });
      bg.eventMode = "static";
      overlay.addChild(bg);

      const titleStyle = new TextStyle({
        fontFamily: "monospace",
        fontSize: 14,
        fill: 0xaabbcc,
        align: "center",
      });
      const descStyle = new TextStyle({
        fontFamily: "monospace",
        fontSize: 10,
        fill: 0x778899,
        align: "center",
        wordWrap: true,
        wordWrapWidth: BTN_W - 8,
      });

      const pickerBtns: BtnObjects[] = [];
      const descLabels: Text[] = [];

      const playerScenarios = getPlayerScenarios();

      const titleLabel = new Text({ text: "— Scenarios —", style: titleStyle });
      titleLabel.anchor.set(0.5, 0);
      titleLabel.x = cw / 2;
      titleLabel.y = 20;
      overlay.addChild(titleLabel);

      for (const ps of playerScenarios) {
        const bgNormal = new Graphics();
        bgNormal
          .roundRect(0, 0, BTN_W, BTN_H, 2)
          .fill(0x0a1a2a)
          .stroke({ color: 0x335566, width: 1 });
        bgNormal.eventMode = "none";
        overlay.addChild(bgNormal);

        const bgHover = new Graphics();
        bgHover
          .roundRect(0, 0, BTN_W, BTN_H, 2)
          .fill(0x162840)
          .stroke({ color: 0x44aacc, width: 1 });
        bgHover.eventMode = "none";
        bgHover.visible = false;
        overlay.addChild(bgHover);

        const btnLabel = new Text({ text: ps.title, style: labelStyle });
        btnLabel.anchor.set(0.5, 0.5);
        btnLabel.eventMode = "none";
        overlay.addChild(btnLabel);

        const hit = new Graphics();
        hit.rect(0, 0, BTN_W, BTN_H).fill({ color: 0xffffff, alpha: 0 });
        hit.eventMode = "static";
        hit.cursor = "pointer";

        const desc = new Text({ text: ps.description, style: descStyle });
        desc.anchor.set(0.5, 0);
        desc.visible = false;
        overlay.addChild(desc);
        descLabels.push(desc);

        hit.on("pointerover", () => {
          bgNormal.visible = false;
          bgHover.visible = true;
          desc.visible = true;
        });
        hit.on("pointerout", () => {
          bgNormal.visible = true;
          bgHover.visible = false;
          desc.visible = false;
        });
        hit.on("pointertap", () => {
          cleanup({ kind: "player-scenario", playerScenario: ps });
        });
        overlay.addChild(hit);

        pickerBtns.push({ bgNormal, bgHover, label: btnLabel, hit });
      }

      // Back button
      const backBgNormal = new Graphics();
      backBgNormal
        .roundRect(0, 0, BTN_W, BTN_H, 2)
        .fill(0x0a1420)
        .stroke({ color: 0x334455, width: 1 });
      backBgNormal.eventMode = "none";
      overlay.addChild(backBgNormal);

      const backBgHover = new Graphics();
      backBgHover
        .roundRect(0, 0, BTN_W, BTN_H, 2)
        .fill(0x162035)
        .stroke({ color: 0x334455, width: 1 });
      backBgHover.eventMode = "none";
      backBgHover.visible = false;
      overlay.addChild(backBgHover);

      const backLabel = new Text({ text: "← Back", style: labelStyle });
      backLabel.anchor.set(0.5, 0.5);
      backLabel.eventMode = "none";
      overlay.addChild(backLabel);

      const backHit = new Graphics();
      backHit.rect(0, 0, BTN_W, BTN_H).fill({ color: 0xffffff, alpha: 0 });
      backHit.eventMode = "static";
      backHit.cursor = "pointer";
      backHit.on("pointerover", () => {
        backBgNormal.visible = false;
        backBgHover.visible = true;
      });
      backHit.on("pointerout", () => {
        backBgNormal.visible = true;
        backBgHover.visible = false;
      });
      backHit.on("pointertap", () => {
        container.removeChild(overlay);
        overlay.destroy({ children: true });
        scenarioOverlay = null;
      });
      overlay.addChild(backHit);
      pickerBtns.push({
        bgNormal: backBgNormal,
        bgHover: backBgHover,
        label: backLabel,
        hit: backHit,
      });

      const positionOverlay = (): void => {
        const { width: ocw, height: och } = app.renderer;
        bg.clear().rect(0, 0, ocw, och).fill({ color: 0x060b14, alpha: 0.92 });
        titleLabel.x = ocw / 2;

        const PICKER_BTN_GAP = 32;
        const totalH = pickerBtns.length * BTN_H + (pickerBtns.length - 1) * PICKER_BTN_GAP;
        const startX = Math.round(ocw / 2 - BTN_W / 2);
        const startY = Math.round((och - totalH) / 2);

        pickerBtns.forEach(({ bgNormal, bgHover, label, hit }, i) => {
          const bx = startX;
          const by = startY + i * (BTN_H + PICKER_BTN_GAP);
          bgNormal.x = bx;
          bgNormal.y = by;
          bgHover.x = bx;
          bgHover.y = by;
          label.x = bx + BTN_W / 2;
          label.y = by + BTN_H / 2;
          hit.x = bx;
          hit.y = by;

          if (i < descLabels.length) {
            const d = descLabels[i];
            if (d !== undefined) {
              d.x = bx + BTN_W / 2;
              d.y = by + BTN_H + 4;
            }
          }
        });
      };

      positionOverlay();
    };

    // --- Main landing buttons ---

    const encounters: { label: string; enemyType: VesselType }[] = [
      { label: "vs Merchant", enemyType: VesselType.MERCHANT },
      { label: "vs Gunboat", enemyType: VesselType.GUNBOAT },
      { label: "vs Destroyer", enemyType: VesselType.DESTROYER },
    ];

    for (const { label, enemyType } of encounters) {
      makeButton(label, 0x334455, 0x0a1420, 0x162035, () =>
        cleanup({ kind: "quick-start", enemyType }),
      );
    }

    makeButton("Scenarios", 0x335566, 0x0a1a2a, 0x162840, () => showScenarioPicker());
    const scenariosBtn = btnObjs[btnObjs.length - 1];
    if (scenariosBtn !== undefined) (scenariosBtn.label.style as TextStyle).fill = 0x88ccdd;

    if (onSettings !== undefined) {
      makeButton("Settings", 0x225544, 0x0a1420, 0x0d2018, () => onSettings());
      const last = btnObjs[btnObjs.length - 1];
      if (last !== undefined) (last.label.style as TextStyle).fill = 0x88ccaa;
    }

    const totalButtons = btnObjs.length;
    const totalHeight = totalButtons * BTN_H + (totalButtons - 1) * BTN_GAP;

    const positionButtons = (): void => {
      const { width: cw, height: ch } = app.renderer;
      const startX = Math.round(cw / 2 - BTN_W / 2);
      const startY = Math.round(ch - totalHeight - 16);
      btnObjs.forEach(({ bgNormal, bgHover, label, hit }, i) => {
        const bx = startX;
        const by = startY + i * (BTN_H + BTN_GAP);
        bgNormal.x = bx;
        bgNormal.y = by;
        bgHover.x = bx;
        bgHover.y = by;
        label.x = bx + BTN_W / 2;
        label.y = by + BTN_H / 2;
        hit.x = bx;
        hit.y = by;
      });
    };

    positionButtons();

    const onResize = (): void => {
      fitToCanvas();
      positionButtons();
      buildLabel.x = app.renderer.width - 6;
      buildLabel.y = app.renderer.height - 4;
    };

    window.addEventListener("resize", onResize);
  });
}
