// QA Viewer entry point.
// Scenario playback lands in PR #4.
// This file reads URL parameters and echoes them back so later PRs
// have a working URL contract to build on.

const params = new URLSearchParams(window.location.search);
const scenario = params.get("scenario") ?? "(none)";
const pauseAt = params.get("pauseAt") ?? "(none)";

const dl = document.getElementById("params");
if (dl) {
  dl.innerHTML = `
    <dt>scenario</dt>
    <dd>${escapeHtml(scenario)}</dd>
    <dt>pauseAt</dt>
    <dd>${escapeHtml(pauseAt)}</dd>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
