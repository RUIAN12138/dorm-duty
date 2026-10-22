// Time-based decay, independent of rendering and notification sending.
export function createTapEnergy(decayMs = 700) {
  let energy = 0,
    last = -Infinity;
  const sample = (now: number) =>
    Math.max(
      0,
      Math.min(1, energy * Math.exp(-Math.max(0, now - last) / decayMs)),
    );
  return {
    sample,
    tap(now: number) {
      const current = sample(now);
      energy = Math.min(1, current + 0.26);
      last = now;
      return current;
    },
    reset() {
      energy = 0;
      last = -Infinity;
    },
  };
}
