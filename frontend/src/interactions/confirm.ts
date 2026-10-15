import { showConfirmDialog, type DialogOptions } from "vant";

/** Keep an existing Vant confirmation inside the active Reka focus scope. */
export function confirmInSheet(options: DialogOptions) {
  const layers =
    typeof document === "undefined"
      ? []
      : [...document.querySelectorAll<HTMLElement>(".sheet-layer")];
  return showConfirmDialog({ ...options, teleport: layers.at(-1) || "body" });
}
