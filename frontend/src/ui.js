// Appearance settings are stored in this browser only and applied as data attributes on <html>.
const KEY = "hf_ui", DEF = { theme: "light", accent: "purple", density: "comfortable", motion: "on", assist: "on" };
export const loadUi = () => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { ...DEF }; } };
export const saveUi = ui => { try { localStorage.setItem(KEY, JSON.stringify(ui)); } catch { /* storage blocked */ } };
let hooked = false;
export function applyUi(ui) {
  const el = document.documentElement, mq = matchMedia("(prefers-color-scheme: dark)");
  el.dataset.theme = ui.theme === "system" ? (mq.matches ? "dark" : "light") : ui.theme;
  el.dataset.accent = ui.accent; el.dataset.density = ui.density; el.dataset.motion = ui.motion; el.dataset.assist = ui.assist;
  if (!hooked) { hooked = true; mq.addEventListener("change", () => applyUi(loadUi())); }
}
