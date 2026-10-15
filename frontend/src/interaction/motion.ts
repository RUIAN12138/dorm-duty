import { onMounted, onScopeDispose, ref } from "vue";
import {
  animate,
  useMotionTemplate,
  useMotionValue,
  useTransform,
  useVelocity,
} from "motion-v";

export const motionTokens = {
  selection: {
    type: "spring" as const,
    stiffness: 620,
    damping: 42,
    mass: 0.8,
    restDelta: 0.001,
    restSpeed: 0.01,
  },
  settle: { type: "spring" as const, stiffness: 480, damping: 38, mass: 0.8 },
  layout: { type: "spring" as const, stiffness: 540, damping: 40, mass: 0.8 },
  enter: {
    duration: 0.26,
    ease: [0.32, 0.72, 0, 1] as [number, number, number, number],
  },
  exit: {
    duration: 0.2,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  },
};

export function motionAllowed() {
  return (
    !matchMedia("(prefers-reduced-motion: reduce)").matches &&
    document.documentElement.dataset.interaction !== "keyboard"
  );
}

/** Navigation links and same-page selectors share motion, not semantics. */
export function useSelectionMotion(
  initial: number,
  count: () => number,
  gap = 0,
) {
  const position = useMotionValue(initial);
  const velocity = useVelocity(position);
  const scaleX = useTransform(
    velocity,
    (value) => 1 + Math.min(0.035, Math.abs(value) * 0.006),
  );
  const scaleY = useTransform(scaleX, (value) => 1 - (value - 1) * 0.35);
  const gapLength = `${gap}px`;
  const transform = useMotionTemplate`translateX(calc(${position} * (100% + ${gapLength}))) scale(${scaleX}, ${scaleY})`;
  const moving = ref(false);
  let target = initial;
  let generation = 0;
  const bound = (value: number) =>
    Math.max(0, Math.min(Math.max(0, count() - 1), value));
  function jump(value = target) {
    generation++;
    target = bound(value);
    position.jump(target);
    moving.value = false;
  }
  function move(value: number) {
    target = bound(value);
    if (!motionAllowed() || document.hidden) return jump(target);
    const id = ++generation;
    const speed = position.getVelocity();
    position.stop();
    moving.value = true;
    animate(position, target, {
      ...motionTokens.selection,
      velocity: speed,
      onComplete: () => {
        if (id === generation) moving.value = false;
      },
    });
  }
  function track(value: number) {
    generation++;
    position.stop();
    position.set(bound(value));
    moving.value = false;
  }
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const visibility = () => {
    if (document.hidden) jump();
  };
  const preference = () => {
    if (media.matches) jump();
  };
  onMounted(() => {
    document.addEventListener("visibilitychange", visibility);
    media.addEventListener("change", preference);
  });
  onScopeDispose(() => {
    document.removeEventListener("visibilitychange", visibility);
    media.removeEventListener("change", preference);
    position.destroy();
  });
  return { position, transform, moving, move, track, jump };
}
