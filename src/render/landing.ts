import { Application, Assets, Container, Graphics, Sprite, Text, TextStyle } from "pixi.js";
import type { CombatScenario } from "../sim/index.js";

const BLINK_INTERVAL_MS = 800;

export async function showLanding(app: Application): Promise<CombatScenario> {
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

    const choiceStyle = new TextStyle({
      fontFamily: "monospace",
      fontSize: 13,
      fill: 0xe8e8e0,
      align: "center",
    });

    const choice1 = new Text({ text: "[1]  Surface Battle", style: choiceStyle });
    const choice2 = new Text({ text: "[2]  Destroyer Dive", style: choiceStyle });
    const choice3 = new Text({ text: "[3]  Gunboat Hunt", style: choiceStyle });

    const positionChoices = (): void => {
      const { width: cw, height: ch } = app.renderer;
      choice1.anchor.set(0.5, 1);
      choice2.anchor.set(0.5, 1);
      choice3.anchor.set(0.5, 1);
      choice1.x = Math.round(cw / 2);
      choice1.y = ch - 60;
      choice2.x = Math.round(cw / 2);
      choice2.y = ch - 36;
      choice3.x = Math.round(cw / 2);
      choice3.y = ch - 12;
    };

    positionChoices();
    container.addChild(choice1);
    container.addChild(choice2);
    container.addChild(choice3);

    app.stage.eventMode = "static";

    const addTapTarget = (text: Text, scenario: CombatScenario): void => {
      const hit = new Graphics();
      hit.rect(text.x - text.width / 2 - 40, text.y - 36, text.width + 80, 36).fill({
        color: 0xffffff,
        alpha: 0,
      });
      hit.eventMode = "static";
      hit.cursor = "pointer";
      hit.on("pointertap", () => cleanup(scenario));
      container.addChild(hit);
    };
    addTapTarget(choice1, "surface_battle");
    addTapTarget(choice2, "destroyer_dive");
    addTapTarget(choice3, "gunboat_hunt");

    const buildStyle = new TextStyle({ fontFamily: "monospace", fontSize: 10, fill: 0x445566 });
    const buildLabel = new Text({ text: `build ${__GIT_COMMIT__}`, style: buildStyle });
    buildLabel.anchor.set(1, 1);
    buildLabel.x = app.renderer.width - 6;
    buildLabel.y = app.renderer.height - 4;
    container.addChild(buildLabel);

    let blinkVisible = true;
    let blinkAccum = 0;

    const onTick = (): void => {
      blinkAccum += app.ticker.deltaMS;
      if (blinkAccum >= BLINK_INTERVAL_MS) {
        blinkAccum -= BLINK_INTERVAL_MS;
        blinkVisible = !blinkVisible;
        choice1.visible = blinkVisible;
        choice2.visible = blinkVisible;
        choice3.visible = blinkVisible;
      }
    };

    app.ticker.add(onTick);

    const cleanup = (scenario: CombatScenario): void => {
      app.ticker.remove(onTick);
      document.removeEventListener("keydown", onKey);
      app.stage.removeChild(container);
      container.destroy({ children: true });
      resolve(scenario);
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "1") cleanup("surface_battle");
      else if (e.key === "2") cleanup("destroyer_dive");
      else if (e.key === "3") cleanup("gunboat_hunt");
    };

    document.addEventListener("keydown", onKey);

    const onResize = (): void => {
      fitToCanvas();
      positionChoices();
    };

    window.addEventListener("resize", onResize);
  });
}
