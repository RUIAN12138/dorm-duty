// Shared recognition rules; each surface retains its own commit semantics.
export function horizontalIntent(x: number, y: number) {
  if (Math.abs(y) > 8 && Math.abs(y) >= Math.abs(x)) return "vertical";
  if (Math.abs(x) >= 8 && Math.abs(x) > Math.abs(y) * 1.2) return "horizontal";
  return "pending";
}

export function rubberBand(distance: number, resistance = 64) {
  return distance / (1 + Math.abs(distance) / resistance);
}

/** Recent movement, rather than one noisy pointer event, determines a flick. */
export function createVelocityTracker(position: number, time: number) {
  let points = [{ position, time }];
  let direction = 0;
  return {
    add(position: number, time: number) {
      const last = points.at(-1)!;
      if (time <= last.time) return;
      const delta = position - last.position;
      if (Math.abs(delta) >= 1) {
        const nextDirection = Math.sign(delta);
        if (direction && nextDirection !== direction) points = [last];
        direction = nextDirection;
      }
      points.push({ position, time });
      while (points.length > 2 && points[1]!.time < time - 100) points.shift();
    },
    read(time: number) {
      const last = points.at(-1)!;
      if (time - last.time > 80 || points.length < 2) return 0;
      const first = points[0]!;
      return Math.max(
        -3,
        Math.min(
          3,
          (last.position - first.position) / (last.time - first.time),
        ),
      );
    },
  };
}
