// Touch browsers do not consistently increment MouseEvent.detail.
export function createCompanionTapGesture(
  actions: { single: () => void; double: () => void },
  clock = {
    now: () => performance.now(),
    later: (callback: () => void, delay: number) => {
      const timer = setTimeout(callback, delay);
      return () => clearTimeout(timer);
    },
  },
) {
  let pending: { x: number; y: number; at: number } | null = null;
  let stop: (() => void) | undefined;
  let blockedUntil = 0;
  function cancel() {
    stop?.();
    stop = undefined;
    pending = null;
  }
  return {
    cancel,
    tap(x: number, y: number, keyboard = false) {
      const now = clock.now();
      if (keyboard) {
        cancel();
        actions.single();
        return;
      }
      if (now < blockedUntil) return;
      if (
        pending &&
        now - pending.at <= 480 &&
        Math.hypot(x - pending.x, y - pending.y) <= 36
      ) {
        cancel();
        blockedUntil = now + 180;
        actions.double();
        return;
      }
      if (pending) {
        cancel();
        actions.single();
      }
      pending = { x, y, at: now };
      stop = clock.later(() => {
        cancel();
        actions.single();
      }, 480);
    },
  };
}

export function naturalGaze(
  x: number,
  y: number,
  box: { left: number; top: number; width: number; height: number },
  viewport: { width: number; height: number },
) {
  return {
    x:
      Math.tanh(
        (x - box.left - box.width / 2) / Math.max(160, viewport.width * 0.55),
      ) * 0.95,
    y:
      Math.tanh(
        (y - box.top - box.height / 2) / Math.max(200, viewport.height * 0.5),
      ) * 0.9,
  };
}
