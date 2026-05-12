import { Application, Container, Sprite, Text, TextStyle, Texture } from "pixi.js";

const BLINK_INTERVAL_MS = 800;
const PROMPT_TEXT = "PRESS ANY KEY";

export function showLanding(app: Application): Promise<void> {
  return new Promise<void>((resolve) => {
    const container = new Container();
    app.stage.addChild(container);

    const texture = Texture.from("landing.png");
    const sprite = new Sprite(texture);

    const fitToCanvas = () => {
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

    const style = new TextStyle({
      fontFamily: "monospace",
      fontSize: 12,
      fill: 0xe8e8e0,
      letterSpacing: 3,
      align: "center",
    });

    const promptText = new Text({ text: PROMPT_TEXT, style });
    promptText.anchor.set(0.5, 1);

    const positionPrompt = () => {
      const { width: cw, height: ch } = app.renderer;
      promptText.x = Math.round(cw / 2);
      promptText.y = ch - 8;
    };

    positionPrompt();
    container.addChild(promptText);

    let blinkVisible = true;
    let blinkAccum = 0;

    const onTick = () => {
      blinkAccum += app.ticker.deltaMS;
      if (blinkAccum >= BLINK_INTERVAL_MS) {
        blinkAccum -= BLINK_INTERVAL_MS;
        blinkVisible = !blinkVisible;
        promptText.visible = blinkVisible;
      }
    };

    app.ticker.add(onTick);

    const onKey = () => {
      app.ticker.remove(onTick);
      document.removeEventListener("keydown", onKey);
      app.stage.removeChild(container);
      container.destroy({ children: true });
      window.dispatchEvent(new CustomEvent("jenesboooot:start"));
      resolve();
    };

    document.addEventListener("keydown", onKey, { once: true });

    const onResize = () => {
      fitToCanvas();
      positionPrompt();
    };

    window.addEventListener("resize", onResize);

    window.addEventListener(
      "jenesboooot:start",
      () => {
        window.removeEventListener("resize", onResize);
      },
      { once: true },
    );
  });
}
