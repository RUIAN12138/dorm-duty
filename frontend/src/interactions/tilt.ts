import type { ObjectDirective } from "vue";

const cleanups = new WeakMap<HTMLElement, () => void>();
/** Pointer-driven spring values stay outside Vue's render cycle. Touch scrolling remains native. */
export const tilt: ObjectDirective<HTMLElement> = {
  mounted(el) {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let pressed = false,
      frame = 0,
      last = 0;
    const current = [0, 0],
      target = [0, 0],
      velocity = [0, 0];
    function tick(time: number) {
      const dt = Math.min((time - (last || time - 16)) / 1000, 0.032);
      last = time;
      let settled = true;
      for (let i = 0; i < 2; i++) {
        velocity[i]! +=
          ((target[i]! - current[i]!) * 180 - velocity[i]! * 22) * dt;
        current[i]! += velocity[i]! * dt;
        if (
          Math.abs(target[i]! - current[i]!) > 0.01 ||
          Math.abs(velocity[i]!) > 0.02
        )
          settled = false;
      }
      el.style.setProperty("--tilt-x", `${current[0]}deg`);
      el.style.setProperty("--tilt-y", `${current[1]}deg`);
      frame = settled ? 0 : requestAnimationFrame(tick);
      if (settled) last = 0;
    }
    function start() {
      if (!frame) frame = requestAnimationFrame(tick);
    }
    function move(event: PointerEvent) {
      if (reduced.matches || (event.pointerType !== "mouse" && !pressed))
        return;
      const r = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - r.left) / r.width));
      const y = Math.max(0, Math.min(1, (event.clientY - r.top) / r.height));
      target[0] = (y - 0.5) * -6;
      target[1] = (x - 0.5) * 6;
      el.style.setProperty("--shine-x", `${x * 100}%`);
      el.style.setProperty("--shine-y", `${y * 100}%`);
      el.style.setProperty("--shine-opacity", ".65");
      start();
    }
    function down(event: PointerEvent) {
      pressed = true;
      move(event);
    }
    function reset() {
      pressed = false;
      target.fill(0);
      el.style.setProperty("--shine-opacity", "0");
      if (reduced.matches) {
        cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
        current.fill(0);
        velocity.fill(0);
        el.style.setProperty("--tilt-x", "0deg");
        el.style.setProperty("--tilt-y", "0deg");
      } else start();
    }
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", reset);
    el.addEventListener("pointercancel", reset);
    window.addEventListener("pointerup", reset);
    reduced.addEventListener("change", reset);
    cleanups.set(el, () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", reset);
      el.removeEventListener("pointercancel", reset);
      window.removeEventListener("pointerup", reset);
      reduced.removeEventListener("change", reset);
    });
  },
  unmounted(el) {
    cleanups.get(el)?.();
    cleanups.delete(el);
  },
};
