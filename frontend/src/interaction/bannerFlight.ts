export const bannerFlightTiming = { enter: 660, leave: 320 };
// Linear playback of sampled, NON-linear trajectories. Entry starts with an
// impulse, then a damped spring settles; exit accelerates in size and position.
export function bannerEnterFrames(height: number): Keyframe[] {
  const frames: Keyframe[] = [],
    distance = height + 64,
    frequency = Math.sqrt(23 * 23 - 12 * 12);
  for (let step = 0; step <= 44; step++) {
    const t = ((step / 44) * bannerFlightTiming.enter) / 1000;
    const rest =
      Math.exp(-12 * t) *
      (Math.cos(frequency * t) +
        ((12 - 14) / frequency) * Math.sin(frequency * t));
    const y = -distance * rest,
      impact = Math.max(0, Math.min(1, y / 18));
    const x = 7 * Math.exp(-8 * t) * Math.sin(17 * t),
      angle = -3 * Math.exp(-8 * t) * Math.cos(17 * t);
    const sx = 1 - 0.44 * Math.max(rest, 0) + 0.04 * impact,
      sy = 1 - 0.4 * Math.max(rest, 0) - 0.085 * impact;
    frames.push({
      offset: step / 44,
      transform: `translate3d(${x.toFixed(3)}px,${y.toFixed(3)}px,0) rotate(${angle.toFixed(3)}deg) scale(${sx.toFixed(4)},${sy.toFixed(4)})`,
      opacity: 1,
    });
  }
  frames[frames.length - 1] = {
    offset: 1,
    transform: "translate3d(0,0,0) rotate(0deg) scale(1,1)",
    opacity: 1,
  };
  return frames;
}
export function bannerLeaveFrames(
  height: number,
  transform: string,
  opacity: number,
  direction = 0,
): Keyframe[] {
  const frames: Keyframe[] = [];
  for (let step = 0; step <= 40; step++) {
    const t = step / 40,
      shrink = Math.pow(t, 2.2),
      wave = Math.sin(Math.PI * t);
    const y = 3 * wave - (height + 96) * Math.pow(t, 6.5),
      x =
        direction * (height + 96) * Math.pow(t, 3) +
        6 * Math.sin(Math.PI * 2 * t) * wave,
      angle = direction * 9 * shrink + 2 * Math.sin(Math.PI * 2 * t) * wave;
    frames.push({
      offset: t,
      transform: `translate3d(${x.toFixed(3)}px,${y.toFixed(3)}px,0) rotate(${angle.toFixed(3)}deg) scale(${(1 - 0.88 * shrink).toFixed(4)},${(1 - 0.9 * shrink).toFixed(4)})`,
      opacity: opacity * (1 - shrink),
    });
  }
  frames[0] = {
    offset: 0,
    transform:
      transform === "none"
        ? "translate3d(0,0,0) rotate(0deg) scale(1,1)"
        : transform,
    opacity,
  };
  return frames;
}
