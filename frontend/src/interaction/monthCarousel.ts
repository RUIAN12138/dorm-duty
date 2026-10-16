import { ref, watch, onBeforeUnmount, type Ref } from "vue";
import { motionAllowed, motionTokens } from "./motion";
import { animate } from "motion-v";
export function shiftMonth(month: string, amount: number) {
  const [year = 2026, number = 1] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
/** Three real month panels; only the centre panel accepts focus or date taps. */
export function useMonthCarousel(
  month: () => string,
  loading: () => boolean,
  change: (month: string) => void,
  viewport: Ref<HTMLElement | undefined>,
  track: Ref<HTMLElement | undefined>,
) {
  const offset = ref(0),
    dragging = ref(false);
  let animation: { stop: () => void } | undefined;
  let suppressUntil = 0;
  let pending: { month: string; offset: number } | null = null;
  let pointer: {
    id: number;
    x: number;
    y: number;
    lastX: number;
    lastTime: number;
    velocity: number;
    base: number;
    horizontal: boolean;
    surface: HTMLElement;
  } | null = null;
  const width = () => viewport.value?.clientWidth || 1;
  function interrupt() {
    if (animation && track.value) {
      offset.value =
        new DOMMatrixReadOnly(getComputedStyle(track.value).transform).m41 +
        width();
    }
    animation?.stop();
    animation = undefined;
  }
  function settle(from = offset.value) {
    animation?.stop();
    offset.value = 0;
    if (
      !track.value ||
      !motionAllowed() ||
      document.hidden ||
      Math.abs(from) < 0.5
    )
      return;
    track.value.style.transform = `translate3d(${-width() + from}px,0,0)`;
    const running = animate(
      track.value,
      { transform: `translate3d(${-width()}px,0,0)` },
      motionTokens.settle,
    );
    animation = running;
    void running.then(() => {
      if (animation === running) animation = undefined;
    });
  }
  function step(amount: number, from?: number) {
    if (loading()) {
      settle();
      return;
    }
    interrupt();
    const next = shiftMonth(month(), amount);
    if (next.startsWith("0000") || next.length !== 7) {
      settle();
      return;
    }
    pending = {
      month: next,
      offset: (from ?? offset.value) + amount * width(),
    };
    change(next);
  }
  function release() {
    const old = pointer;
    pointer = null;
    dragging.value = false;
    if (old?.surface.hasPointerCapture(old.id))
      old.surface.releasePointerCapture(old.id);
  }
  function down(event: PointerEvent) {
    if (loading() || pointer || !event.isPrimary || event.button !== 0) return;
    interrupt();
    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastTime: performance.now(),
      velocity: 0,
      base: offset.value,
      horizontal: false,
      surface: event.currentTarget as HTMLElement,
    };
  }
  function move(event: PointerEvent) {
    const p = pointer;
    if (!p || p.id !== event.pointerId) return;
    const x = event.clientX - p.x,
      y = event.clientY - p.y;
    if (!p.horizontal) {
      if (Math.abs(y) > 8 && Math.abs(y) >= Math.abs(x)) {
        cancel();
        return;
      }
      if (Math.abs(x) < 8 || Math.abs(x) < Math.abs(y) * 1.2) return;
      p.horizontal = true;
      p.surface.setPointerCapture(event.pointerId);
      dragging.value = true;
    }
    event.preventDefault();
    const now = performance.now(),
      dt = now - p.lastTime;
    if (dt > 0) p.velocity = (event.clientX - p.lastX) / dt;
    p.lastTime = now;
    p.lastX = event.clientX;
    offset.value = Math.max(-width(), Math.min(width(), p.base + x));
    suppressUntil = now + 400;
  }
  function up(event: PointerEvent) {
    const p = pointer;
    if (!p || p.id !== event.pointerId) return;
    const distance = event.clientX - p.x;
    const amount = offset.value,
      held = performance.now() - p.lastTime;
    const commit =
      p.horizontal &&
      (Math.abs(distance) >= Math.min(64, width() * 0.2) ||
        (Math.abs(distance) > 28 && held < 90 && Math.abs(p.velocity) > 0.4));
    release();
    if (commit) step(distance < 0 ? 1 : -1, amount);
    else settle(amount);
  }
  function cancel() {
    if (!pointer) return;
    release();
    settle();
  }
  function lost(event: PointerEvent) {
    if (pointer?.surface.hasPointerCapture(event.pointerId)) return;
    cancel();
  }
  function click(event: MouseEvent) {
    if (event.detail && performance.now() < suppressUntil) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
  watch(
    month,
    (next) => {
      release();
      const from = pending?.month === next ? pending.offset : 0;
      pending = null;
      settle(from);
    },
    { flush: "post" },
  );
  const hidden = () => {
    if (document.hidden) {
      cancel();
      animation?.stop();
      offset.value = 0;
    }
  };
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const preference = () => {
    if (!motionAllowed()) {
      release();
      animation?.stop();
      animation = undefined;
      offset.value = 0;
      if (track.value)
        track.value.style.transform = `translate3d(${-width()}px,0,0)`;
    }
  };
  media.addEventListener("change", preference);
  window.addEventListener("ui-motion-change", preference);
  window.addEventListener("blur", cancel);
  document.addEventListener("visibilitychange", hidden);
  onBeforeUnmount(() => {
    release();
    animation?.stop();
    media.removeEventListener("change", preference);
    window.removeEventListener("ui-motion-change", preference);
    window.removeEventListener("blur", cancel);
    document.removeEventListener("visibilitychange", hidden);
  });
  return { offset, dragging, down, move, up, cancel, click, step, lost };
}
