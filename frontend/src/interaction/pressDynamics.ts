export function pressStep(
  position: number,
  velocity: number,
  target: number,
  elapsed: number,
) {
  let remaining = Math.min(0.04, Math.max(0, elapsed));
  const stiffness = target < 1 ? 1700 : 700,
    damping = target < 1 ? 60 : 26;
  while (remaining > 0) {
    const dt = Math.min(1 / 240, remaining);
    velocity += ((target - position) * stiffness - velocity * damping) * dt;
    position += velocity * dt;
    remaining -= dt;
  }
  return { position, velocity };
}
