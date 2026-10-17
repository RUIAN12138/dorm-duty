import { onMounted, onScopeDispose, ref } from "vue";
import {
  animate,
  useMotionTemplate,
  useMotionValue,
  useTransform,
  useVelocity,
} from "motion-v";

export const navigationScrubbing = ref(false);
export const navigationOrigin = ref<{
  x: number;
  y: number;
  time: number;
} | null>(null);

// Durations are seconds for Motion; CSS consumes these same values at startup.
export const motionTiming = {
  drawer: 0.25,
  page: 0.2,
  reorder: 0.3,
  completion: 0.4,
  press: 0.09,
  release: 0.36,
  stagger: 0.025,
} as const;
export const motionEase = [0.22, 1, 0.36, 1] as [
  number,
  number,
  number,
  number,
];
export const motionEaseCss = "cubic-bezier(0.22, 1, 0.36, 1)";
export function installMotionTokens() {
  for (const [key, seconds] of Object.entries(motionTiming))
    document.documentElement.style.setProperty(
      `--ui-${key}-time`,
      `${seconds * 1000}ms`,
    );
}
export const motionTokens = {
  press: { scaleX: 1.02, scaleY: 0.94 },
  selection: {
    type: "spring" as const,
    stiffness: 620,
    damping: 42,
    mass: 0.8,
    restDelta: 0.001,
    restSpeed: 0.01,
  },
  settle: { type: "spring" as const, stiffness: 540, damping: 42, mass: 0.8 },
  layout: {
    type: "spring" as const,
    duration: motionTiming.reorder,
    bounce: 0.12,
  },
  drawer: {
    type: "spring" as const,
    duration: motionTiming.drawer,
    bounce: 0.1,
  },
  enter: {
    duration: motionTiming.drawer,
    ease: motionEase,
  },
  exit: {
    duration: motionTiming.drawer,
    ease: motionEase,
  },
};

export function motionAllowed() {
  return (
    !document.hidden &&
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
    if (!motionAllowed()) jump();
  };
  onMounted(() => {
    document.addEventListener("visibilitychange", visibility);
    media.addEventListener("change", preference);
    window.addEventListener("ui-motion-change", preference);
  });
  onScopeDispose(() => {
    document.removeEventListener("visibilitychange", visibility);
    media.removeEventListener("change", preference);
    window.removeEventListener("ui-motion-change", preference);
    position.destroy();
  });
  return { position, transform, moving, move, track, jump };
}
