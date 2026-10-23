// Pure contact mapping. Reorder/FLIP/month transforms remain owned by their
// existing controllers; the directive uses only independent transform channels.
export const cardFeedbackTokens = {
  angle: 1.6,
  depression: 1.5,
  scale: 0.992,
  lift: 4,
  intent: 8,
} as const;
export function cardContact(
  box: { left: number; top: number; width: number; height: number },
  x: number,
  y: number,
) {
  const norm = (value: number, origin: number, size: number) =>
    Math.max(-1, Math.min(1, ((value - origin) / Math.max(1, size)) * 2 - 1));
  const pose = {
    x: -norm(y, box.top, box.height) * cardFeedbackTokens.angle,
    y: norm(x, box.left, box.width) * cardFeedbackTokens.angle,
  };
  const ratio = Math.min(
    1,
    cardFeedbackTokens.angle / (Math.hypot(pose.x, pose.y) || 1),
  );
  return { x: pose.x * ratio, y: pose.y * ratio };
}
export function cardRotation(x: number, y: number) {
  const length = Math.hypot(x, y);
  return length < 0.00001
    ? "0deg"
    : `${x / length} ${y / length} 0 ${length}deg`;
}
// Same substep integration as pressDynamics, tuned for the smaller card travel.
export function cardSpringStep(
  position: number,
  velocity: number,
  target: number,
  elapsed: number,
  pressed = false,
) {
  let remaining = Math.min(0.04, Math.max(0, elapsed));
  const stiffness = pressed ? 1700 : 700,
    damping = pressed ? 60 : 38;
  while (remaining > 0) {
    const dt = Math.min(1 / 240, remaining);
    velocity += ((target - position) * stiffness - velocity * damping) * dt;
    position += velocity * dt;
    remaining -= dt;
  }
  return { position, velocity };
}
