import { motionAllowed } from "./motion";
const active = new Map<Element, Animation>();
export function cancelPageReveal(root: Element) {
  for (const [el, animation] of active)
    if (root === el || root.contains(el)) {
      animation.cancel();
      active.delete(el);
    }
}
export function revealPage(root: Element | null, selector: string, step = 48) {
  if (!root) return;
  cancelPageReveal(root);
  if (!motionAllowed()) return;
  const candidates = [...root.querySelectorAll<HTMLElement>(selector)].filter(
    (el) => !el.closest("[hidden],[inert]"),
  );
  const layers = candidates.filter(
    (el) => !candidates.some((parent) => parent !== el && parent.contains(el)),
  );
  layers.forEach((el, index) => {
    const opacity = getComputedStyle(el).opacity || "1";
    const animation = el.animate(
      [
        { opacity: 0, translate: `0 ${18 + Math.min(index, 4) * 3}px` },
        { opacity, translate: "0 0" },
      ],
      {
        duration: 460,
        delay: Math.min(260, index * step),
        easing: "cubic-bezier(.22,1,.36,1)",
        fill: "both",
      },
    );
    active.set(el, animation);
    animation.onfinish = () => {
      if (active.get(el) === animation) {
        active.delete(el);
        animation.cancel();
      }
    };
  });
}
export const pageLayers =
  ".hero-caption,.task-selector,.task-title-stage,.hero-date,.completion-surface,.round-progress,.water-title-stage,.water-nudge-actions,.water-empty,.chore-calendar>header,.calendar-view-selector,.calendar-mode,.compact-records,.stats-mode";
