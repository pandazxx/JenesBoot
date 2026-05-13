import { Application } from "pixi.js";
import { SimEngine } from "../sim/index.js";
import { showLanding } from "./landing.js";
import { showCombat, readScenario } from "./combat.js";

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

  const scenario = readScenario();
  const engine = new SimEngine(seed);
  engine.startCombat(scenario);

  showCombat(app, engine, scenario);
}

main().catch((err: unknown) => {
  console.error("Fatal render error:", err);
});
