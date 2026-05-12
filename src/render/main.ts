import { Application, Text, TextStyle } from "pixi.js";
import { SimEngine } from "../sim/index.js";
import { showLanding } from "./landing.js";

async function main(): Promise<void> {
  const app = new Application();

  await app.init({
    width: 960,
    height: 540,
    backgroundColor: 0x0a0e1a,
    antialias: false,
  });

  document.body.appendChild(app.canvas);

  await showLanding(app);

  const urlSeed = new URLSearchParams(window.location.search).get("seed");
  const seed = urlSeed !== null ? parseInt(urlSeed, 10) : 0;

  const engine = new SimEngine(seed);

  const style = new TextStyle({
    fontFamily: "monospace",
    fontSize: 14,
    fill: 0x00ff88,
  });

  const tickLabel = new Text({ text: "tick: 0", style });
  tickLabel.x = 16;
  tickLabel.y = 16;
  app.stage.addChild(tickLabel);

  app.ticker.add(() => {
    engine.tick();
    const state = engine.getState();
    tickLabel.text = `tick: ${state.tick}`;
  });
}

main().catch((err: unknown) => {
  console.error("Fatal render error:", err);
});
