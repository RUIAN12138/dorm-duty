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
    ?.setAttribute("content", "#ffffff");
  window.dispatchEvent(new Event("ui-theme-change"));
}
type Origin = { x: number; y: number };
let reveal: Animation | undefined;
export function setThemeMode(mode: ThemeMode, origin?: Origin) {
  if (!valid(mode)) return;
  const wasDark = darkTheme.value;
  themeMode.value = mode;
  try {
    localStorage.setItem(key, mode);
  } catch {}
  reveal?.cancel();
  reveal = undefined;
  // WebGL/backdrop-filter layers cannot reliably survive root snapshots on
  // iOS. Keep glass live and only soften the page surface; the icon has its
  // own reversible sun/moon spring.
  apply();
  if (
    origin &&
    wasDark !== darkTheme.value &&
    !document.hidden &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    reveal = document
      .querySelector<HTMLElement>(".screen-surface")
      ?.animate?.([{ opacity: 0.96 }, { opacity: 1 }], {
        duration: 180,
        easing: "cubic-bezier(.22,1,.36,1)",
      });
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
    reveal?.cancel();
    reveal = undefined;
    media?.removeEventListener("change", system);
    window.removeEventListener("storage", storage);
  };
}
