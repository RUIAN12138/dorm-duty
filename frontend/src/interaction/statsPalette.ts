import { ref } from "vue";
export const defaultStatsColor = "#b98a48";
const key = "lundao-stats-colors-v1";
export const validColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
export function readStatsColor(value: string | null) {
  try {
    const saved = JSON.parse(value || "null");
    return validColor(saved?.base)
      ? saved.base.toLowerCase() === "#555555"
        ? defaultStatsColor
        : saved.base.toLowerCase()
      : defaultStatsColor;
  } catch {
    return defaultStatsColor;
  }
}
function load() {
  try {
    return readStatsColor(localStorage.getItem(key));
  } catch {
    return defaultStatsColor;
  }
}
export const statsBaseColor = ref(load());
export function saveStatsColor(color: string) {
  if (!validColor(color)) return;
  statsBaseColor.value = color.toLowerCase();
  try {
    localStorage.setItem(key, JSON.stringify({ base: statsBaseColor.value }));
  } catch {}
}
export function resetStatsColors() {
  saveStatsColor(defaultStatsColor);
}
export function statsFill(base: string, progress: number, dark: boolean) {
  const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const channels = base
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16));
  // Warm brown/yellow by day, neutral grey/white by night. Warning depth stays
  // continuous; the night surface never inherits the custom daytime hue.
  const rgb = channels.map((v, index) =>
    Math.round(
      dark
        ? 242 * (1 - p) + 176 * p
        : [255, 248, 237][index]! * (1 - p) + Math.min(224, v) * p,
    ),
  );
  return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
}
export function statsInk(background: string) {
  const channels = background
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16) / 255);
  const linear = channels.map((v) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  const l = linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#000000" : "#ffffff";
}
