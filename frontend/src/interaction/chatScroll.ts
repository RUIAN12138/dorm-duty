import { motionAllowed } from "./motion";
// One driver owns scrollTop. Appends retarget a running flight, while native
// touch/wheel cancels it immediately; late replies never pull a reader down.
export function createChatScroll(
  element: () => HTMLElement | undefined,
  paint: () => void,
) {
  let frame = 0,
    pending = 0,
    pinned = true,
    moving = false;
  let target = 0,
    velocity = 0,
    last = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    cancelAnimationFrame(pending);
    frame = pending = 0;
    moving = false;
    velocity = 0;
  };
  function tick(now: number) {
    const el = element();
    if (!el) {
      stop();
      return;
    }
    const dt = Math.min(0.025, Math.max(0.001, (now - last) / 1000));
    last = now;
    target = Math.max(0, el.scrollHeight - el.clientHeight);
    velocity += ((target - el.scrollTop) * 240 - velocity * 30) * dt;
    const next = Math.min(target, Math.max(0, el.scrollTop + velocity * dt));
    if (Math.abs(target - next) < 1 && Math.abs(velocity) < 8) {
      el.scrollTop = target;
      stop();
      pinned = true;
      paint();
      return;
    }
    el.scrollTop = next;
    paint();
    frame = requestAnimationFrame(tick);
  }
  return {
    request(immediate = false) {
      if (!pinned) return;
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        pending = 0;
        const el = element();
        if (!el || !pinned) return;
        if (immediate || !motionAllowed()) {
          stop();
          el.scrollTop = el.scrollHeight;
          paint();
          return;
        }
        if (!moving) {
          moving = true;
          last = performance.now();
          frame = requestAnimationFrame(tick);
        }
      });
    },
    scroll() {
      const el = element();
      if (el && !moving)
        pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      paint();
    },
    interrupt() {
      stop();
      pinned = false;
    },
    pin() {
      pinned = true;
    },
    stop,
  };
}
