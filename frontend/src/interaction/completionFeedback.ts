import { motionAllowed } from "./motion";

/** A local acknowledgement after the server receipt, without moving the page. */
export function completionFeedback(bounds: DOMRect | undefined) {
  if (!bounds || !motionAllowed() || document.hidden) return;
  try {
    navigator.vibrate?.(12);
  } catch {
    // Unsupported devices keep the same visual acknowledgement.
  }
  const layer = document.createElement("span");
  layer.className = "completion-particles";
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, {
    position: "fixed",
    left: `${bounds.left + bounds.width / 2}px`,
    top: `${bounds.top + bounds.height / 2}px`,
    width: "0",
    height: "0",
    pointerEvents: "none",
    zIndex: "110",
  });
  document.body.append(layer);
  const animations = Array.from({ length: 8 }, (_, index) => {
    const angle = (index * Math.PI) / 4;
    const dot = document.createElement("i");
    Object.assign(dot.style, {
      position: "absolute",
      width: index % 2 ? "4px" : "5px",
      height: "5px",
      borderRadius: "50%",
      boxShadow: "0 0 0 2px #fff",
      background: index % 2 ? "#999" : "#222",
    });
    layer.append(dot);
    const startX = Math.cos(angle) * Math.min(100, bounds.width * 0.36);
    const startY = Math.sin(angle) * (bounds.height / 2 + 7);
    const endX = startX + Math.cos(angle) * 30;
    const endY = startY + Math.sin(angle) * 27;
    return dot.animate(
      [
        {
          transform: `translate(${startX}px,${startY}px) scale(.6)`,
          opacity: 0,
        },
        { opacity: 0.75, offset: 0.12 },
        {
          transform: `translate(${endX}px,${endY}px) rotate(60deg) scale(.2)`,
          opacity: 0,
        },
      ],
      { duration: 360, easing: "cubic-bezier(.22,1,.36,1)" },
    );
  });
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const preference = () => {
    if (!motionAllowed()) remove();
  };
  const remove = () => {
    animations.forEach((animation) => animation.cancel());
    layer.remove();
    document.removeEventListener("visibilitychange", remove);
    media.removeEventListener("change", preference);
    window.removeEventListener("ui-motion-change", preference);
  };
  document.addEventListener("visibilitychange", remove);
  media.addEventListener("change", preference);
  window.addEventListener("ui-motion-change", preference);
  void Promise.allSettled(
    animations.map((animation) => animation.finished),
  ).then(remove);
  return remove;
}
