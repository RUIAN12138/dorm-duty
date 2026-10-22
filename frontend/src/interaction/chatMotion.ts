import { motionAllowed } from "./motion";
// Local to the conversation: other pages keep their existing motion language.
export const chatMotion = {
  bubble: { type: "spring" as const, duration: 0.24, bounce: 0.12 },
  layout: { type: "spring" as const, duration: 0.32, bounce: 0.08 },
  exit: {
    duration: 0.24,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  },
};
export const chatTransition = (kind: keyof typeof chatMotion) =>
  motionAllowed() ? chatMotion[kind] : { duration: 0 };
export const bubbleOrigin = (role: string) =>
  motionAllowed()
    ? { opacity: 0, x: role === "user" ? 12 : -10, y: 6, scale: 0.97 }
    : false;
