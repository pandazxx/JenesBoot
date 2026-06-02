import { Application } from "pixi.js";
import { SimEngine } from "../sim/index.js";
import { showLanding } from "./landing.js";
import { showCombat } from "./combat.js";
import { SettingsPanel } from "./settings-panel.js";
import { loadSimConfig, saveSimConfig } from "./sim-config-storage.js";
import { getPlayerScenarioById } from "../scenarios/player/registry.js";

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

  const settingsPanel = new SettingsPanel();
  let currentConfig = loadSimConfig();

  settingsPanel.onClose = (config): void => {
    saveSimConfig(config);
    currentConfig = config;
  };

  const params = new URLSearchParams(window.location.search);
  const urlSeed = params.get("seed");
  const urlScenarioId = params.get("scenario");

  // Deep-link: ?scenario=<id> boots straight into the named player scenario.
  if (urlScenarioId !== null) {
    const ps = getPlayerScenarioById(urlScenarioId);
    if (ps !== undefined) {
      const engine = new SimEngine(ps.seed, currentConfig);
      if (ps.scenario !== undefined) {
        engine.startCombat(ps.scenario);
      }
      if (ps.initial !== undefined) {
        engine.setInitialState(ps.initial);
      }
      const enemyTypeDeepLink = ps.scenario ?? "MERCHANT";
      await showCombat(app, engine, enemyTypeDeepLink, () => {
        settingsPanel.show(currentConfig);
      });
    }
  }

  const seed = urlSeed !== null ? parseInt(urlSeed, 10) : 0;

  while (true) {
    const result = await showLanding(app, () => {
      settingsPanel.show(currentConfig);
    });

    if (result.kind === "quick-start") {
      const engine = new SimEngine(seed, currentConfig);
      engine.startCombat(result.enemyType);
      await showCombat(app, engine, result.enemyType, () => {
        settingsPanel.show(currentConfig);
      });
    } else {
      const ps = result.playerScenario;
      const engine = new SimEngine(ps.seed, currentConfig);
      if (ps.scenario !== undefined) {
        engine.startCombat(ps.scenario);
      }
      if (ps.initial !== undefined) {
        engine.setInitialState(ps.initial);
      }
      const enemyType = ps.scenario ?? "MERCHANT";
      await showCombat(app, engine, enemyType, () => {
        settingsPanel.show(currentConfig);
      });
    }
  }
}

main().catch((err: unknown) => {
  console.error("Fatal render error:", err);
});
