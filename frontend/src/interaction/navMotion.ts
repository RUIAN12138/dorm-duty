type FrameDriver = {
  request: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
};

/** One continuous spring: retargeting keeps position and velocity. */
export function createNavMotion(
  initial: number,
  paint: (position: number, velocity: number, settled: boolean) => void,
  driver: FrameDriver = {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id),
  },
) {
  let position = initial;
  let target = initial;
  let velocity = 0;
  let frame = 0;
  let previousTime = 0;
  let dragTime = 0;
  let disposed = false;
  const bound = (value: number) => Math.max(0, Math.min(2, value));
  function stop() {
    if (frame) driver.cancel(frame);
    frame = 0;
    previousTime = 0;
  }
  function jump(value: number) {
    stop();
    target = position = bound(value);
    velocity = 0;
    dragTime = 0;
    if (!disposed) paint(position, velocity, true);
  }
  function tick(time: number) {
    frame = 0;
    if (disposed) return;
    // A backgrounded document should return at the selected tab immediately.
    if (previousTime && time - previousTime > 120) {
      jump(target);
      return;
    }
    let remaining = previousTime
      ? Math.min(0.032, Math.max(0, (time - previousTime) / 1000))
      : 1 / 60;
    previousTime = time;
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 240);
      velocity += ((target - position) * 700 - velocity * 42) * step;
      position += velocity * step;
      // Keep edge overshoot within the navigation padding.
      if (position < -0.025 || position > 2.025) {
        position = Math.max(-0.025, Math.min(2.025, position));
        velocity = 0;
      }
      remaining -= step;
    }
    const settled =
      Math.abs(target - position) < 0.0015 && Math.abs(velocity) < 0.018;
    if (settled) {
      position = target;
      velocity = 0;
      previousTime = 0;
    }
    paint(position, velocity, settled);
    if (!settled) frame = driver.request(tick);
  }
  paint(position, velocity, true);
  return {
    move(value: number, animate = true) {
      if (disposed) return;
      if (!animate) return jump(value);
      target = bound(value);
      dragTime = 0;
      if (!frame && (position !== target || velocity !== 0)) {
        previousTime = 0;
        frame = driver.request(tick);
      }
    },
    track(value: number, time: number) {
      if (disposed) return;
      stop();
      const next = bound(value);
      const elapsed = (time - dragTime) / 1000;
      velocity =
        dragTime && elapsed > 0 && elapsed < 0.08
          ? Math.max(-8, Math.min(8, (next - position) / elapsed))
          : 0;
      target = position = next;
      dragTime = time;
      paint(position, velocity, false);
    },
    dispose() {
      disposed = true;
      stop();
    },
  };
}
