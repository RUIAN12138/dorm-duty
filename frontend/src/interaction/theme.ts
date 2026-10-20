import { ref } from "vue";
export type ThemeMode = "system" | "light" | "dark";
export const themeMode = ref<ThemeMode>("system"),
  darkTheme = ref(false);
const key = "lundao-theme-mode-v2";
const valid = (value: unknown): value is ThemeMode =>
  value === "system" || value === "light" || value === "dark";
let media: MediaQueryList | undefined;
function apply() {
  const dark =
    themeMode.value === "dark" ||
    (themeMode.value === "system" && Boolean(media?.matches));
  darkTheme.value = dark;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#16171b" : "#ffffff");
  window.dispatchEvent(new Event("ui-theme-change"));
}
type Origin = { x: number; y: number };
let transition: ViewTransition | undefined;
export function setThemeMode(mode: ThemeMode, origin?: Origin) {
  if (!valid(mode)) return;
  themeMode.value = mode;
  try {
    localStorage.setItem(key, mode);
  } catch {}
  const nextDark =
    mode === "dark" || (mode === "system" && Boolean(media?.matches));
  const animated =
    Boolean(origin) &&
    nextDark !== darkTheme.value &&
    !document.hidden &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches;
  transition?.skipTransition();
  transition = undefined;
  if (!animated || !document.startViewTransition) {
    apply();
    if (animated)
      document.documentElement.animate?.(
        { opacity: [0.88, 1] },
        { duration: 180, easing: "ease-out" },
      );
    return;
  }
  const point = origin!;
  try {
    const current = document.startViewTransition(apply);
    transition = current;
    void current.ready
      .then(() => {
        if (transition !== current) return;
        const radius = Math.hypot(
          Math.max(point.x, innerWidth - point.x),
          Math.max(point.y, innerHeight - point.y),
        );
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${point.x}px ${point.y}px)`,
              `circle(${radius}px at ${point.x}px ${point.y}px)`,
            ],
          },
          {
            duration: 320,
            easing: "cubic-bezier(.22,1,.36,1)",
            pseudoElement: "::view-transition-new(root)",
            fill: "both",
          },
        );
      })
      .catch(() => {});
    void current.finished
      .catch(() => {})
      .then(() => {
        if (transition === current) transition = undefined;
      });
  } catch {
    apply();
  }
}
export function installTheme() {
  media = matchMedia("(prefers-color-scheme: dark)");
  try {
    const saved = localStorage.getItem(key);
    themeMode.value = valid(saved) ? saved : "system";
  } catch {}
  const system = () => {
    if (themeMode.value === "system") apply();
  };
  const storage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) {
      themeMode.value = valid(event.newValue) ? event.newValue : "system";
      apply();
    }
  };
  media.addEventListener("change", system);
  window.addEventListener("storage", storage);
  apply();
  return () => {
    media?.removeEventListener("change", system);
    window.removeEventListener("storage", storage);
  };
}
