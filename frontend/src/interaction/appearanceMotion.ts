// A continuous spring can be retargeted midway through a sun/moon morph.
export function appearanceStep(
  position: number,
  velocity: number,
  target: number,
  elapsed: number,
) {
  let remaining = Math.min(0.05, Math.max(0, elapsed));
  while (remaining > 0) {
    const dt = Math.min(1 / 240, remaining);
    velocity += ((target - position) * 390 - velocity * 27) * dt;
    position += velocity * dt;
    remaining -= dt;
  }
  return { position, velocity };
}
export function appearancePose(position: number) {
  const progress = Math.max(0, Math.min(1, position));
  return {
    radius: 6 + progress * 2,
    cutX: 29 - progress * 13,
    cutY: 3 + progress * 5,
    cutRadius: 8.5,
    rayOpacity: 1 - progress,
    rotation: position * 32,
  };
}
