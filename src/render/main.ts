import { Application } from "pixi.js";
import { SimEngine } from "../sim/index.js";
import { showLanding } from "./landing.js";
import { showCombat } from "./combat.js";

async function main(): Promise<void> {
  const app = new Application();

  await app.init({
    width: 960,
    height: 540,
    backgroundColor: 0x0a0e1a,
    antialias: false,
  });

  document.body.appendChild(app.canvas);
  document.body.style.overflow = "hidden";

  function fitCanvas(canvas: HTMLCanvasElement): void {
    const aspect = 960 / 540;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw / vh > aspect) {
      canvas.style.height = `${vh}px`;
      canvas.style.width = `${vh * aspect}px`;
    } else {
      canvas.style.width = `${vw}px`;
      canvas.style.height = `${vw / aspect}px`;
    }
    canvas.style.position = "absolute";
    canvas.style.left = `${(window.innerWidth - parseFloat(canvas.style.width)) / 2}px`;
    canvas.style.top = `${(window.innerHeight - parseFloat(canvas.style.height)) / 2}px`;
  }

  fitCanvas(app.canvas);
  window.addEventListener("resize", () => fitCanvas(app.canvas));

  const scenario = await showLanding(app);

  const urlSeed = new URLSearchParams(window.location.search).get("seed");
  const seed = urlSeed !== null ? parseInt(urlSeed, 10) : 0;

  const engine = new SimEngine(seed);
  engine.startCombat(scenario);

  showCombat(app, engine, scenario);
}

main().catch((err: unknown) => {
  console.error("Fatal render error:", err);
});
