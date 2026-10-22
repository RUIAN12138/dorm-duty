// One controller owns the whole tap decision: the first tap previews
// immediately, while only the 280ms window can turn it into a double tap and
// request a rollback. Touch browsers do not consistently increment
// MouseEvent.detail, so this timing and the reserved second press are the
// source of truth.
export const COMPANION_TAP_WINDOW = 280;
export const COMPANION_TAP_RADIUS = 36;
export function createCompanionTapGesture(
  actions: {
    single: () => void;
    double: () => void;
    preview?: () => void;
    rollback?: () => void;
  },
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
  let secondPress = false;
  function reset() {
    stop?.();
    stop = undefined;
    pending = null;
    secondPress = false;
  }
  const within = (x: number, y: number, from: { x: number; y: number }) =>
    Math.hypot(x - from.x, y - from.y) <= COMPANION_TAP_RADIUS;
  return {
    cancel() {
      const active = !!pending || secondPress;
      reset();
      if (active) actions.rollback?.();
    },
    // Returns whether this pointer-down belongs to the open arbitration
    // window. Callers must not intercept the event when it returns false:
    // an expired window can never swallow a normal chat/back click.
    press(x: number, y: number, mapped?: { x: number; y: number }) {
      if (!pending || clock.now() - pending.at > COMPANION_TAP_WINDOW)
        return false;
      // A tap on the shared ball after it has travelled is still the same
      // gesture; the caller maps it back to the first tap coordinates.
      const point = mapped || { x, y };
      if (!within(point.x, point.y, pending)) return false;
      // Reserve the second tap at finger-down. On WebView a slow frame may
      // deliver finger-up after the single-tap timer would otherwise fire.
      stop?.();
      stop = undefined;
      secondPress = true;
      return true;
    },
    tap(x: number, y: number, keyboard = false) {
      const now = clock.now();
      if (keyboard) {
        reset();
        actions.single();
        return;
      }
      if (now < blockedUntil) return;
      if (
        pending &&
        (secondPress ||
          (now - pending.at <= COMPANION_TAP_WINDOW && within(x, y, pending)))
      ) {
        reset();
        actions.rollback?.();
        blockedUntil = now + 180;
        actions.double();
        return;
      }
      if (pending) {
        reset();
        actions.single();
      }
      pending = { x, y, at: now };
      actions.preview?.();
      stop = clock.later(() => {
        reset();
        actions.single();
      }, COMPANION_TAP_WINDOW);
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
