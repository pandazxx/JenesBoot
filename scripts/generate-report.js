/**
 * generate-report.js
 *
 * Reads:
 *   test-results/junit.xml          — unit test pass/fail and durations
 *   test-results/scenario-results.json — scenario outcomes
 *
 * Writes:
 *   test-results/index.html         — self-contained HTML test report
 *
 * No external dependencies. Runs with plain Node.js (ESM, "type":"module" in
 * package.json). Parse XML with a minimal hand-rolled parser — no npm needed.
 *
 * Report lives at pr-N/test-report/index.html so all relative links use ../
 * to reach pr-N/ (the game preview) and ../qa/ (the QA viewer).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RESULTS_DIR = join(ROOT, "test-results");
const JUNIT_PATH = join(RESULTS_DIR, "junit.xml");
const SCENARIOS_PATH = join(RESULTS_DIR, "scenario-results.json");
const OUT_PATH = join(RESULTS_DIR, "index.html");

// ---------------------------------------------------------------------------
// Minimal XML parser for JUnit format
// ---------------------------------------------------------------------------

/**
 * Extract all attributes from an XML opening tag string.
 * e.g. `<testcase name="foo" time="0.01" classname="bar">`
 */
function parseAttrs(tag) {
  const attrs = {};
  const re = /(\w[\w-]*)="([^"]*)"/g;
  let m;
  while ((m = re.exec(tag)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

/**
 * Returns array of { attrs, inner } for each <testcase ...>...</testcase>.
 */
function parseJunit(xml) {
  const testcases = [];
  // Match either self-closing or with body
  const re = /<testcase([^>]*)>([\s\S]*?)<\/testcase>|<testcase([^/>]*?)\/>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    if (m[3] !== undefined) {
      // self-closing
      testcases.push({ attrs: parseAttrs(m[3]), inner: "" });
    } else {
      testcases.push({ attrs: parseAttrs(m[1]), inner: m[2] });
    }
  }
  return testcases;
}

// ---------------------------------------------------------------------------
// Load inputs (gracefully handle missing files)
// ---------------------------------------------------------------------------

let junitXml = null;
if (existsSync(JUNIT_PATH)) {
  junitXml = readFileSync(JUNIT_PATH, "utf8");
} else {
  console.warn("[generate-report] junit.xml not found — unit tests section will be empty");
}

let scenarioManifest = null;
if (existsSync(SCENARIOS_PATH)) {
  scenarioManifest = JSON.parse(readFileSync(SCENARIOS_PATH, "utf8"));
} else {
  console.warn("[generate-report] scenario-results.json not found — scenarios section will be empty");
}

// ---------------------------------------------------------------------------
// Parse JUnit
// ---------------------------------------------------------------------------

const unitTests = junitXml ? parseJunit(junitXml) : [];

// Decorate each test with pass/fail/skip
const unitTestRows = unitTests.map((tc) => {
  const hasFailure = tc.inner.includes("<failure") || tc.inner.includes("<error");
  const hasSkip = tc.inner.includes("<skipped");
  return {
    name: tc.attrs["name"] ?? "(unnamed)",
    classname: tc.attrs["classname"] ?? "",
    time: parseFloat(tc.attrs["time"] ?? "0"),
    passed: !hasFailure && !hasSkip,
    skipped: hasSkip,
    failed: hasFailure,
    // Extract failure message if present
    failDetail: (() => {
      const fm = /<failure[^>]*>([\s\S]*?)<\/failure>/.exec(tc.inner);
      if (fm) return htmlEscape(fm[1].trim());
      const em = /<error[^>]*>([\s\S]*?)<\/error>/.exec(tc.inner);
      if (em) return htmlEscape(em[1].trim());
      return null;
    })(),
  };
});

// ---------------------------------------------------------------------------
// Summary counts
// ---------------------------------------------------------------------------

const scenarioRows = scenarioManifest ? scenarioManifest.scenarios : [];

const unitPassed = unitTestRows.filter((t) => t.passed).length;
const unitFailed = unitTestRows.filter((t) => t.failed).length;
const unitSkipped = unitTestRows.filter((t) => t.skipped).length;

const scenPassed = scenarioRows.filter((s) => s.passed).length;
const scenFailed = scenarioRows.filter((s) => !s.passed).length;

const totalPassed = unitPassed + scenPassed;
const totalFailed = unitFailed + scenFailed;
const totalSkipped = unitSkipped;
const totalTests = totalPassed + totalFailed + totalSkipped;

const generatedAt = scenarioManifest?.generatedAt ?? new Date().toISOString();

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function htmlEscape(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function msStr(ms) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function secStr(sec) {
  const ms = Math.round(sec * 1000);
  return msStr(ms);
}

function statusIcon(passed, skipped) {
  if (skipped) return '<span class="icon skip">-</span>';
  if (passed) return '<span class="icon pass">+</span>';
  return '<span class="icon fail">X</span>';
}

// ---------------------------------------------------------------------------
// Build unit test rows HTML
// ---------------------------------------------------------------------------

function buildUnitRows() {
  if (unitTestRows.length === 0) {
    return "<tr><td colspan='3' class='empty'>No unit test data available.</td></tr>";
  }
  return unitTestRows
    .map((t) => {
      const rowClass = t.failed ? "row-fail" : t.skipped ? "row-skip" : "";
      const label = t.classname ? `${htmlEscape(t.classname)} &gt; ${htmlEscape(t.name)}` : htmlEscape(t.name);
      const detail = t.failDetail
        ? `<div class="fail-detail"><pre>${t.failDetail}</pre></div>`
        : "";
      return `
      <tr class="${rowClass}">
        <td>${statusIcon(t.passed, t.skipped)} ${label}${detail}</td>
        <td class="num">${secStr(t.time)}</td>
        <td></td>
      </tr>`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Build scenario rows HTML
// ---------------------------------------------------------------------------

function replayHref(id, firstFailingTick) {
  let href = `../qa/?scenario=${encodeURIComponent(id)}`;
  if (firstFailingTick !== null) {
    href += `&pauseAt=${firstFailingTick}`;
  }
  return href;
}

function buildScenarioRows() {
  if (scenarioRows.length === 0) {
    return "<tr><td colspan='3' class='empty'>No scenario data available.</td></tr>";
  }
  return scenarioRows
    .map((s) => {
      const rowClass = s.passed ? "" : "row-fail";
      const replay = `<a class="replay-link" href="${htmlEscape(replayHref(s.id, s.firstFailingTick))}">Replay</a>`;

      let detail = "";
      if (!s.passed) {
        const failedAssertions = s.assertions.filter((a) => !a.passed);
        detail = failedAssertions
          .map(
            (a) =>
              `<div class="fail-detail">Reason: ${htmlEscape(a.label)}${a.detail ? " — " + htmlEscape(a.detail) : ""}</div>`,
          )
          .join("");
      }

      const tickInfo = s.passed
        ? `${msStr(s.durationMs)} &middot; ${s.ticksReached} ticks`
        : `${msStr(s.durationMs)} &middot; failed tick ${s.firstFailingTick ?? s.ticksReached}`;

      return `
      <tr class="${rowClass}">
        <td>
          ${statusIcon(s.passed, false)} <strong>${htmlEscape(s.id)}</strong>
          <span class="scenario-title">${htmlEscape(s.title)}</span>
          ${detail}
        </td>
        <td class="num">${tickInfo}</td>
        <td class="replay-cell">${replay}</td>
      </tr>`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Assemble HTML
// ---------------------------------------------------------------------------

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JenesBoot — Test Report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: monospace;
      font-size: 14px;
      background: #1a1a1a;
      color: #e0e0e0;
      margin: 0;
      padding: 16px;
    }
    h1 { font-size: 1.1em; margin: 0 0 4px 0; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-bottom: 1px solid #444;
      padding-bottom: 8px;
      margin-bottom: 8px;
      flex-wrap: wrap;
      gap: 8px;
    }
    .header-links { font-size: 0.85em; }
    .header-links a { color: #7ab4f5; text-decoration: none; margin-left: 12px; }
    .header-links a:hover { text-decoration: underline; }
    .summary {
      background: #252525;
      border: 1px solid #444;
      padding: 8px 12px;
      margin-bottom: 12px;
      border-radius: 3px;
    }
    .summary .pass  { color: #7ec87e; }
    .summary .fail  { color: #e06c6c; }
    .summary .skip  { color: #aaa; }
    .generated { font-size: 0.8em; color: #888; margin-top: 4px; }
    h2 { font-size: 1em; border-bottom: 1px solid #333; padding-bottom: 4px; margin: 16px 0 6px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 4px 6px; vertical-align: top; }
    th { font-weight: bold; color: #aaa; border-bottom: 1px solid #333; }
    td.num { white-space: nowrap; text-align: right; color: #aaa; width: 130px; }
    td.replay-cell { width: 80px; text-align: right; white-space: nowrap; }
    tr.row-fail { background: rgba(200, 60, 60, 0.12); border-left: 3px solid #c03c3c; }
    tr.row-skip { color: #888; }
    .icon { font-weight: bold; margin-right: 4px; }
    .icon.pass { color: #7ec87e; }
    .icon.fail { color: #e06c6c; }
    .icon.skip { color: #aaa; }
    .fail-detail {
      font-size: 0.85em;
      color: #e06c6c;
      margin-top: 3px;
      padding-left: 12px;
    }
    .fail-detail pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 120px;
      overflow-y: auto;
      background: #2a1a1a;
      padding: 4px;
      border-radius: 2px;
    }
    .scenario-title {
      color: #aaa;
      margin-left: 6px;
      font-size: 0.9em;
    }
    .replay-link {
      color: #7ab4f5;
      text-decoration: none;
      font-size: 0.85em;
      border: 1px solid #7ab4f5;
      padding: 1px 5px;
      border-radius: 2px;
    }
    .replay-link:hover { background: #7ab4f533; }
    td.empty { color: #666; font-style: italic; }
    tr:not(.row-fail):hover > td { background: #242424; }
  </style>
</head>
<body>

<div class="header">
  <div>
    <h1>JenesBoot — Test Report</h1>
    <div class="generated">Generated: ${htmlEscape(generatedAt)}</div>
  </div>
  <div class="header-links">
    <a href="../">Open game</a>
    <a href="vitest.html">Vitest HTML report</a>
  </div>
</div>

<div class="summary">
  Summary: <span class="pass">${totalPassed} passed</span>
  &middot; <span class="fail">${totalFailed} failed</span>
  &middot; <span class="skip">${totalSkipped} skipped</span>
  &middot; ${totalTests} total
</div>

<h2>Unit tests</h2>
<table>
  <thead>
    <tr><th>Test</th><th class="num">Duration</th><th></th></tr>
  </thead>
  <tbody>
    ${buildUnitRows()}
  </tbody>
</table>

<h2>Scenarios</h2>
<table>
  <thead>
    <tr><th>Scenario</th><th class="num">Duration / Ticks</th><th class="replay-cell">Replay</th></tr>
  </thead>
  <tbody>
    ${buildScenarioRows()}
  </tbody>
</table>

</body>
</html>
`;

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

mkdirSync(RESULTS_DIR, { recursive: true });
writeFileSync(OUT_PATH, html, "utf8");
console.log(`[generate-report] Written: ${OUT_PATH}`);
console.log(`[generate-report] Unit tests: ${unitPassed} pass / ${unitFailed} fail / ${unitSkipped} skip`);
console.log(`[generate-report] Scenarios: ${scenPassed} pass / ${scenFailed} fail`);
