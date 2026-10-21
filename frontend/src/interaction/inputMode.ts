export function installInputMode() {
  const keyboard = (event: KeyboardEvent) => {
    if (
      event.key !== "Tab" &&
      event.target instanceof Element &&
      event.target.closest("input,textarea,[contenteditable=true]")
    )
      return;
    document.documentElement.dataset.interaction = "keyboard";
    window.dispatchEvent(new Event("ui-motion-change"));
    for (const animation of document.getAnimations()) {
      try {
        animation.finish();
      } catch {
        animation.cancel();
      }
    }
  };
  const pointer = () => {
    const changed = document.documentElement.dataset.interaction !== "pointer";
    document.documentElement.dataset.interaction = "pointer";
    if (changed) window.dispatchEvent(new Event("ui-motion-change"));
  };
  // Capture before the target's handler: a pointer-triggered transition must
  // see pointer mode immediately, not only after the event bubbles to window.
  window.addEventListener("keydown", keyboard, true);
  window.addEventListener("pointerdown", pointer, true);
  return () => {
    window.removeEventListener("keydown", keyboard, true);
    window.removeEventListener("pointerdown", pointer, true);
  };
}
