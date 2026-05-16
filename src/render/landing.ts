import { Application, Assets, Container, Graphics, Sprite, Text, TextStyle } from "pixi.js";
import type { CombatScenario } from "../sim/index.js";

const BTN_W = 300;
const BTN_H = 28;
const BTN_GAP = 8;
const BTN_FILL = 0x0a1420;
const BTN_BORDER = 0x334455;
const BTN_HOVER = 0x162035;

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

    const scenarios: { label: string; scenario: CombatScenario }[] = [
      { label: "Surface Battle", scenario: "surface_battle" },
      { label: "Destroyer Dive (escape)", scenario: "destroyer_dive" },
      { label: "Gunboat Hunt", scenario: "gunboat_hunt" },
      { label: "Destroyer Battle", scenario: "destroyer_battle" },
    ];

    type BtnEntry = { bg: Graphics; label: Text };
    const buttons: BtnEntry[] = [];

    const cleanup = (scenario: CombatScenario): void => {
      window.removeEventListener("resize", onResize);
      app.stage.removeChild(container);
      container.destroy({ children: true });
      resolve(scenario);
    };

    for (const { label, scenario } of scenarios) {
      const bg = new Graphics();
      bg.roundRect(0, 0, BTN_W, BTN_H, 2).fill(BTN_FILL).stroke({ color: BTN_BORDER, width: 1 });
      bg.eventMode = "static";
      bg.cursor = "pointer";
      bg.on("pointerover", () => {
        bg.clear();
        bg.roundRect(0, 0, BTN_W, BTN_H, 2).fill(BTN_HOVER).stroke({ color: BTN_BORDER, width: 1 });
      });
      bg.on("pointerout", () => {
        bg.clear();
        bg.roundRect(0, 0, BTN_W, BTN_H, 2).fill(BTN_FILL).stroke({ color: BTN_BORDER, width: 1 });
      });
      bg.on("pointertap", () => cleanup(scenario));

      const text = new Text({ text: label, style: labelStyle });
      text.anchor.set(0.5, 0.5);
      text.x = BTN_W / 2;
      text.y = BTN_H / 2;

      const btnContainer = new Container();
      btnContainer.addChild(bg);
      btnContainer.addChild(text);
      container.addChild(btnContainer);
      buttons.push({ bg, label: text });
    }

    if (onSettings !== undefined) {
      const settingsBg = new Graphics();
      settingsBg
        .roundRect(0, 0, BTN_W, BTN_H, 2)
        .fill(BTN_FILL)
        .stroke({ color: 0x225544, width: 1 });
      settingsBg.eventMode = "static";
      settingsBg.cursor = "pointer";
      settingsBg.on("pointerover", () => {
        settingsBg.clear();
        settingsBg
          .roundRect(0, 0, BTN_W, BTN_H, 2)
          .fill(0x0d2018)
          .stroke({ color: 0x225544, width: 1 });
      });
      settingsBg.on("pointerout", () => {
        settingsBg.clear();
        settingsBg
          .roundRect(0, 0, BTN_W, BTN_H, 2)
          .fill(BTN_FILL)
          .stroke({ color: 0x225544, width: 1 });
      });
      settingsBg.on("pointertap", () => onSettings());

      const settingsText = new Text({
        text: "Settings",
        style: new TextStyle({
          fontFamily: "monospace",
          fontSize: 13,
          fill: 0x88ccaa,
          align: "center",
        }),
      });
      settingsText.anchor.set(0.5, 0.5);
      settingsText.x = BTN_W / 2;
      settingsText.y = BTN_H / 2;

      const settingsContainer = new Container();
      settingsContainer.addChild(settingsBg);
      settingsContainer.addChild(settingsText);
      container.addChild(settingsContainer);
      buttons.push({ bg: settingsBg, label: settingsText });
    }

    const totalButtons = buttons.length;
    const totalHeight = totalButtons * BTN_H + (totalButtons - 1) * BTN_GAP;

    const positionButtons = (): void => {
      const { width: cw, height: ch } = app.renderer;
      const startX = Math.round(cw / 2 - BTN_W / 2);
      const startY = Math.round(ch - totalHeight - 16);
      const allBtnContainers = container.children.filter(
        (c) => c !== sprite && c !== buildLabel,
      ) as Container[];
      allBtnContainers.forEach((c, i) => {
        c.x = startX;
        c.y = startY + i * (BTN_H + BTN_GAP);
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
