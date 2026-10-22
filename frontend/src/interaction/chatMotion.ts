import { motionAllowed } from "./motion";

// Local to the conversation: other pages keep their existing motion language.
// Spring values are shared by the travel controller, bubbles and cards so the
// visible rhythm stays one language instead of stacked effects.
export const chatMotion = {
  // 90–150ms visible press response.
  press: {
    type: "spring" as const,
    stiffness: 900,
    damping: 38,
    mass: 0.6,
    restDelta: 0.001,
    restSpeed: 0.01,
  },
  // 180–260ms spring response, with a short physical tail.
  bubble: {
    type: "spring" as const,
    stiffness: 520,
    damping: 36,
    mass: 1,
    restDelta: 0.001,
    restSpeed: 0.01,
  },
  // 250–360ms layout/projection response.
  layout: {
    type: "spring" as const,
    stiffness: 360,
    damping: 32,
    mass: 1,
    restDelta: 0.001,
    restSpeed: 0.01,
  },
  // 280–420ms shared surface expansion.
  expand: {
    type: "spring" as const,
    stiffness: 260,
    damping: 30,
    mass: 1,
    restDelta: 0.001,
    restSpeed: 0.01,
  },
  // 240–360ms shared surface collapse.
  collapse: {
    type: "spring" as const,
    stiffness: 380,
    damping: 34,
    mass: 0.95,
    restDelta: 0.001,
    restSpeed: 0.01,
  },
  exit: {
    duration: 0.24,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  },
};
export const chatTransition = (kind: keyof typeof chatMotion) =>
  motionAllowed() ? chatMotion[kind] : { duration: 0 };
// New bubbles start near their real source: users from the composer below,
// replies slightly from the assistant side. Cached history mounts without a
// replay, so swapping the list never animates bubbles that already existed.
export const bubbleOrigin = (role: string) =>
  motionAllowed()
    ? {
        opacity: 0,
        x: role === "user" ? 14 : -12,
        y: role === "user" ? 20 : 8,
        scale: role === "user" ? 0.94 : 0.97,
      }
    : false;
