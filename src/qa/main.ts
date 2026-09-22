/**
 * QA Viewer entry point.
 *
 * Two modes:
 *   - No ?scenario= param: renders the scenario picker.
 *   - ?scenario=<id>[&pauseAt=<N>]: runs the named scenario deterministically
 *     and renders it via the existing combat renderer in read-only mode.
 *
 * No player input is accepted. Scripts drive the sim; the viewer observes.
 */

import { Application, Graphics } from "pixi.js";
import { SimEngine } from "../sim/index.js";
import type { SimInitialOverrides } from "../sim/index.js";
import { InteriorView } from "../render/interior.js";
import { RadarView } from "../render/radar.js";
import type { CombatState } from "../sim/combat/types.js";
import { getScenarios, getScenarioById, getFailedScenarioPaths } from "../scenarios/registry.js";
import type { Scenario, ScenarioInitial } from "../scenarios/types.js";

const params = new URLSearchParams(window.location.search);
const scenarioId = params.get("scenario");
const pauseAtParam = params.get("pauseAt");
const pauseAt = pauseAtParam !== null ? parseInt(pauseAtParam, 10) : null;

if (scenarioId === null) {
  renderPicker();
} else {
  const scenario = getScenarioById(scenarioId);
  if (scenario === undefined) {
    renderError(`Unknown scenario: "${scenarioId}"`);
  } else {
    renderViewer(scenario, pauseAt).catch((err: unknown) => {
      renderError(String(err));
    });
  }
}

function renderPicker(): void {
  const scenarios = getScenarios();
  const failed = getFailedScenarioPaths();
  const list = document.getElementById("scenario-list");
  if (list === null) return;

  const rows: string[] = scenarios.map(
    (s) =>
      `<a class="scenario-row" href="?scenario=${encodeURIComponent(s.id)}">` +
      `<span class="play">&#9654;</span>` +
      `<span class="sid">${escapeHtml(s.id)}</span>` +
      `<span class="stitle">${escapeHtml(s.title)}</span>` +
      `</a>`,
  );

  if (scenarios.length === 0 && failed.length === 0) {
    list.innerHTML =
      '<div class="scenario-row" style="color:#778899">No scenarios registered.</div>';
    return;
  }

  if (failed.length > 0) {
    rows.push(
      `<div class="scenario-row" style="color:#ff6666">` +
        `One or more scenarios failed to load: ${failed.map(escapeHtml).join(", ")}` +
        `</div>`,
    );
  }

  list.innerHTML = rows.join("");
}

function renderError(msg: string): void {
  document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:monospace;color:#ff6666;padding:2rem;">${escapeHtml(msg)}</div>`;
}

async function renderViewer(scenario: Scenario, pauseAt: number | null): Promise<void> {
  const pickerEl = document.getElementById("picker");
  const viewerEl = document.getElementById("viewer");
  if (pickerEl !== null) pickerEl.style.display = "none";
  if (viewerEl !== null) viewerEl.classList.add("active");

  const titleEl = document.getElementById("viewer-title");
  if (titleEl !== null) {
    titleEl.textContent = `${scenario.id}   seed=${scenario.seed}`;
  }

  const engine = SimEngine(scenario.seed);

  if (scenario.scenario !== undefined) {
    engine.startCombat(scenario.scenario);
  }

  if (scenario.initial !== undefined) {
    applyInitial(engine.setInitialState.bind(engine), scenario.initial);
  }

  const maxTicks = scenario.maxTicks ?? 1000;
  const sortedScript = [...scenario.script].sort((a, b) => a.atTick - b.atTick);
  let scriptIndex = 0;
  let currentTick = 0;

  function applyScriptUpToTick(upTo: number): void {
    while (scriptIndex < sortedScript.length) {
      const entry = sortedScript[scriptIndex];
      if (entry === undefined || entry.atTick > upTo) break;
      engine.queueCommand(entry.cmd);
      scriptIndex++;
    }
  }

  const ffOverlay = document.getElementById("ff-overlay");
  if (pauseAt !== null && pauseAt > 0) {
    if (ffOverlay !== null) ffOverlay.style.display = "flex";
    const target = Math.min(pauseAt, maxTicks);
    for (let t = currentTick + 1; t <= target; t++) {
      applyScriptUpToTick(t);
      engine.tick();
      currentTick = t;
    }
  }

  const app = new Application();
  await app.init({
    width: 960,
    height: 540,
    backgroundColor: 0x0a0e1a,
    antialias: false,
  });

  const canvasWrap = document.getElementById("canvas-wrap");
  if (canvasWrap !== null) {
    if (ffOverlay !== null) ffOverlay.style.display = "none";
    canvasWrap.appendChild(app.canvas);
  }

  fitCanvas(app.canvas);
  window.addEventListener("resize", () => fitCanvas(app.canvas));

  const interiorView = new InteriorView(engine, (): void => undefined, true);
  const radarView = new RadarView();

  interiorView.container.x = 0;
  radarView.container.x = 460;

  const divider = new Graphics();
  divider.rect(459, 0, 2, 540).fill(0x334455);

  app.stage.addChild(interiorView.container);
  app.stage.addChild(radarView.container);
  app.stage.addChild(divider);

  const tickCounter = document.getElementById("tick-counter");
  const btnPlay = document.getElementById("btn-play") as HTMLButtonElement | null;
  const btnPause = document.getElementById("btn-pause") as HTMLButtonElement | null;
  const btnStep = document.getElementById("btn-step") as HTMLButtonElement | null;
  const speedSelect = document.getElementById("speed-select") as HTMLSelectElement | null;
  const scenarioCompleteEl = document.getElementById("scenario-complete");
  const logEntries = document.getElementById("log-entries");

  let playing = false;
  let complete = false;
  let elapsed = 0;
  let timeSinceLastTick = 0;

  const TICKS_PER_SECOND_BASE = 10;

  function getTicksPerSecond(): number {
    const val = speedSelect !== null ? parseFloat(speedSelect.value) : 1;
    return TICKS_PER_SECOND_BASE * val;
  }

  function isScenarioComplete(): boolean {
    const state = engine.getState();
    if (state.combat !== null && state.combat.result !== "ongoing") return true;
    if (currentTick >= maxTicks) return true;
    return false;
  }

  function advanceTick(): void {
    if (complete) return;
    currentTick++;
    applyScriptUpToTick(currentTick);
    engine.tick();
    if (isScenarioComplete()) {
      complete = true;
      playing = false;
    }
  }

  function renderFrame(): void {
    const state = engine.getState();
    const combat: CombatState | null = state.combat ?? null;

    if (combat !== null) {
      interiorView.update(combat, elapsed, !playing);
      radarView.update(combat, state);
    }

    if (tickCounter !== null) {
      tickCounter.textContent = `tick ${currentTick} / ${maxTicks}`;
    }

    if (scenarioCompleteEl !== null) {
      scenarioCompleteEl.style.display = complete ? "inline" : "none";
    }

    if (btnPlay !== null) btnPlay.disabled = playing || complete;
    if (btnPause !== null) btnPause.disabled = !playing;
    if (btnStep !== null) btnStep.disabled = playing || complete;

    updateLogPanel(state.log);
  }

  function updateLogPanel(log: ReturnType<typeof engine.getState>["log"]): void {
    if (logEntries === null) return;
    const last20 = log.slice(-20).reverse();
    logEntries.innerHTML = last20
      .map((ev) => {
        const payloadStr = truncatePayload(ev.payload);
        return (
          `<div class="log-entry">` +
          `<span class="log-tick">tick ${ev.tick}</span>` +
          `<span class="log-type">${escapeHtml(ev.type)}</span>` +
          `<span>${escapeHtml(payloadStr)}</span>` +
          `</div>`
        );
      })
      .join("");
  }

  renderFrame();

  let rafId: number | null = null;
  let lastRafTime: number | null = null;

  function rafLoop(now: number): void {
    if (lastRafTime !== null) {
      const deltaMs = now - lastRafTime;
      elapsed += deltaMs;

      if (playing && !complete) {
        timeSinceLastTick += deltaMs;
        const msPerTick = 1000 / getTicksPerSecond();
        while (timeSinceLastTick >= msPerTick && !complete) {
          timeSinceLastTick -= msPerTick;
          advanceTick();
        }
        renderFrame();
      }
    }
    lastRafTime = now;
    rafId = requestAnimationFrame(rafLoop);
  }

  rafId = requestAnimationFrame(rafLoop);

  if (btnPlay !== null) {
    btnPlay.addEventListener("click", () => {
      if (!complete) {
        playing = true;
        timeSinceLastTick = 0;
        renderFrame();
      }
    });
  }

  if (btnPause !== null) {
    btnPause.addEventListener("click", () => {
      playing = false;
      renderFrame();
    });
  }

  if (btnStep !== null) {
    btnStep.addEventListener("click", () => {
      if (!playing && !complete) {
        advanceTick();
        renderFrame();
      }
    });
  }

  if (speedSelect !== null) {
    speedSelect.addEventListener("change", () => {
      timeSinceLastTick = 0;
    });
  }

  const backLink = document.getElementById("back-link");
  if (backLink !== null) {
    backLink.addEventListener("click", () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      app.destroy(true);
    });
  }
}

function applyInitial(
  setInitialState: (overrides: SimInitialOverrides) => void,
  initial: ScenarioInitial,
): void {
  const overrides: SimInitialOverrides = {};
  if (initial.playerDepth !== undefined) overrides.playerDepth = initial.playerDepth;
  if (initial.playerNauticalSpeed !== undefined)
    overrides.playerNauticalSpeed = initial.playerNauticalSpeed;
  if (initial.playerHorizontalIntent !== undefined)
    overrides.playerHorizontalIntent = initial.playerHorizontalIntent;
  if (initial.playerDiveSpeed !== undefined) overrides.playerDiveSpeed = initial.playerDiveSpeed;
  if (initial.enemyX !== undefined) overrides.enemyX = initial.enemyX;
  if (initial.enemyY !== undefined) overrides.enemyY = initial.enemyY;
  if (initial.enemyNauticalSpeed !== undefined)
    overrides.enemyNauticalSpeed = initial.enemyNauticalSpeed;
  if (initial.enemyHorizontalIntent !== undefined)
    overrides.enemyHorizontalIntent = initial.enemyHorizontalIntent;
  setInitialState(overrides);
}

function fitCanvas(canvas: HTMLCanvasElement): void {
  const wrap = document.getElementById("canvas-wrap");
  if (wrap === null) return;
  const ww = wrap.clientWidth;
  const wh = wrap.clientHeight;
  const aspect = 960 / 540;
  let cw: number;
  let ch: number;
  if (ww / wh > aspect) {
    ch = wh;
    cw = wh * aspect;
  } else {
    cw = ww;
    ch = ww / aspect;
  }
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
}

function truncatePayload(payload: unknown): string {
  try {
    const s = JSON.stringify(payload);
    return s.length > 80 ? s.slice(0, 77) + "..." : s;
  } catch {
    return String(payload);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
