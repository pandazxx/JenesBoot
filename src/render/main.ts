/**
 * Web entry point — mounts PixiJS and drives the simulation loop.
 *
 * This file and everything below src/render/ may import from PixiJS and the
 * DOM. It must NEVER be imported by src/sim/ or src/headless/.
 */

import { Application, Text, TextStyle } from "pixi.js";
import { SimEngine } from "../sim/index.js";

async function main(): Promise<void> {
  const app = new Application();

  await app.init({
    width: 800,
    height: 600,
    backgroundColor: 0x0a0a1a,
    antialias: false, // pixel-art — keep sharp
  });

  document.body.appendChild(app.canvas);

  // Seed from URL ?seed=N, or default to 0.
  const urlSeed = new URLSearchParams(window.location.search).get("seed");
  const seed = urlSeed !== null ? parseInt(urlSeed, 10) : 0;

  const engine = new SimEngine(seed);

  // Tick counter label — pixel-art style, no DOM text.
  const style = new TextStyle({
    fontFamily: "monospace",
    fontSize: 14,
    fill: 0x00ff88,
  });

  const tickLabel = new Text({ text: "tick: 0", style });
  tickLabel.x = 16;
  tickLabel.y = 16;
  app.stage.addChild(tickLabel);

  // Run one sim tick per animation frame.
  app.ticker.add(() => {
    engine.tick();
    const state = engine.getState();
    tickLabel.text = `tick: ${state.tick}`;
  });
}

main().catch((err: unknown) => {
  console.error("Fatal render error:", err);
});
