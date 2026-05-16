import { Application, Assets, Container, Graphics, Sprite, Text, TextStyle } from "pixi.js";
import type { CombatScenario } from "../sim/index.js";

const BTN_W = 300;
const BTN_H = 28;
const BTN_GAP = 8;

export async function showLanding(
  app: Application,
  onSettings?: () => void,
): Promise<CombatScenario> {
  const texture = await Assets.load(import.meta.env.BASE_URL + "landing.png");

  return new Promise<CombatScenario>((resolve) => {
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

    const cleanup = (scenario: CombatScenario): void => {
      window.removeEventListener("resize", onResize);
      app.stage.removeChild(container);
      container.destroy({ children: true });
      resolve(scenario);
    };

    // Each logical button is 4 sibling display objects added to container:
    //   bgNormal, bgHover (pre-drawn, never cleared), labelText, hit (transparent, stable).
    // The hit area is never redrawn so pointertap fires reliably.
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

    const scenarios: { label: string; scenario: CombatScenario }[] = [
      { label: "Surface Battle", scenario: "surface_battle" },
      { label: "Destroyer Dive (escape)", scenario: "destroyer_dive" },
      { label: "Gunboat Hunt", scenario: "gunboat_hunt" },
      { label: "Destroyer Battle", scenario: "destroyer_battle" },
    ];

    for (const { label, scenario } of scenarios) {
      makeButton(label, 0x334455, 0x0a1420, 0x162035, () => cleanup(scenario));
    }

    if (onSettings !== undefined) {
      makeButton("Settings", 0x225544, 0x0a1420, 0x0d2018, () => onSettings());
      // Tint the settings label green
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
