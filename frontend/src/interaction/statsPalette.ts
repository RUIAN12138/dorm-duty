import { ref } from "vue";
export const defaultStatsColor = "#aaaaaa";
const key = "lundao-stats-colors-v1";
export const validColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
export function readStatsColor(value: string | null) {
  try {
    const saved = JSON.parse(value || "null");
    return validColor(saved?.base)
      ? ["#555555", "#b98a48", "#303030"].includes(saved.base.toLowerCase())
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
const taskKey = "lundao-stats-task-colors-v2";
export const statsTaskKeys = ["floor", "toilet", "sink", "water"] as const;
type StatsTask = (typeof statsTaskKeys)[number];
type TaskColors = Partial<Record<StatsTask, { light?: string; dark?: string }>>;
export function readStatsTaskColors(value: string | null): TaskColors {
  try {
    const input = JSON.parse(value || "null"),
      result: TaskColors = {};
    for (const task of statsTaskKeys) {
      for (const mode of ["light", "dark"] as const) {
        const color = input?.[task]?.[mode];
        if (validColor(color))
          (result[task] ||= {})[mode] = color.toLowerCase();
      }
    }
    return result;
  } catch {
    return {};
  }
}
function loadTaskColors() {
  try {
    return readStatsTaskColors(localStorage.getItem(taskKey));
  } catch {
    return {};
  }
}
export const statsTaskColors = ref<TaskColors>(loadTaskColors());
export function statsColorFor(task: string, dark: boolean) {
  return (
    statsTaskColors.value[task as StatsTask]?.[dark ? "dark" : "light"] ||
    (dark ? "#b0b0b0" : statsBaseColor.value)
  );
}
export function saveStatsTaskColor(task: string, color: string, dark: boolean) {
  if (!statsTaskKeys.includes(task as StatsTask) || !validColor(color)) return;
  const name = task as StatsTask;
  statsTaskColors.value = {
    ...statsTaskColors.value,
    [name]: {
      ...statsTaskColors.value[name],
      [dark ? "dark" : "light"]: color.toLowerCase(),
    },
  };
  try {
    localStorage.setItem(taskKey, JSON.stringify(statsTaskColors.value));
  } catch {}
}
export function resetStatsColors() {
  saveStatsColor(defaultStatsColor);
  statsTaskColors.value = {};
  try {
    localStorage.removeItem(taskKey);
  } catch {}
}
// One subtle step per elapsed 24 hours; reminder intervals still control
// reminders, but no longer compress the visual scale into a few days.
export function statsElapsedShade(days: number | null) {
  if (days === null || !Number.isFinite(days)) return 0;
  return Math.min(1, Math.floor(Math.max(0, days)) / 30);
}
export function statsFill(
  base: string,
  progress: number,
  dark: boolean,
  nightColor = "#b0b0b0",
) {
  const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const depth = p;
  const channels = (dark ? nightColor : base)
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16));
  // Fresh completions start white; elapsed time deepens toward a medium grey.
  // Equal daily steps; CSS owns the short colour interpolation between them.
  const rgb = channels.map((v) => Math.round(255 * (1 - depth) + v * depth));
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
