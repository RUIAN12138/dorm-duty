import { nextTick, ref } from "vue";
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
    ?.setAttribute("content", dark ? "#151515" : "#ffffff");
  window.dispatchEvent(new Event("ui-theme-change"));
}
type Origin = { x: number; y: number };
let transition: ViewTransition | undefined;
let fallback: Animation | undefined;
export function setThemeMode(mode: ThemeMode, origin?: Origin) {
  if (!valid(mode)) return;
  const wasDark = darkTheme.value;
  themeMode.value = mode;
  try {
    localStorage.setItem(key, mode);
  } catch {}
  transition?.skipTransition();
  transition = undefined;
  fallback?.cancel();
  fallback = undefined;
  const nextDark =
    mode === "dark" || (mode === "system" && Boolean(media?.matches));
  const animated =
    Boolean(origin) &&
    wasDark !== nextDark &&
    !document.hidden &&
    document.documentElement.dataset.interaction !== "keyboard" &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!animated || !document.startViewTransition) {
    apply();
    if (animated)
      fallback = document.documentElement.animate?.(
        { opacity: [0.88, 1] },
        { duration: 180, easing: "ease-out" },
      );
    return;
  }
  const point = origin!;
  try {
    const current = document.startViewTransition(async () => {
      apply();
      // A view-transition pauses frame rendering during its update callback.
      // Flush Vue and repaint retained glass synchronously; awaiting RAF here
      // would stall the reveal until the browser times out the transition.
      await nextTick();
      window.dispatchEvent(new Event("ui-theme-snapshot"));
    });
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
    transition?.skipTransition();
    transition = undefined;
    fallback?.cancel();
    fallback = undefined;
    media?.removeEventListener("change", system);
    window.removeEventListener("storage", storage);
  };
}
