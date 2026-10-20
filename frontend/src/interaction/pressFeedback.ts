import { pressStep } from "./pressDynamics";
// No computed-style/layout reads on pointerdown. One spring loop composes scale
// with existing sorting, completion and drawer transforms.
export function installPressFeedback() {
  const selector =
    'button,a[href],summary,[role="button"],[role="tab"],[role="switch"],[role="checkbox"],[role="menuitem"],input[type="submit"],input[type="button"],input[type="reset"],input[type="checkbox"],input[type="radio"]';
  type State = {
    position: number;
    velocity: number;
    target: number;
    scale: string;
    opacity: string;
  };
  const states = new Map<HTMLElement, State>(),
    recent = new WeakMap<HTMLElement, number>();
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  let pressed: {
      el: HTMLElement;
      pointer: number | null;
      x: number;
      y: number;
    } | null = null,
    frame = 0,
    last = 0;
  function control(target: EventTarget | null) {
    if (!(target instanceof Element)) return null;
    const el = target.closest<HTMLElement>(selector);
    return !el ||
      el.closest("[inert]") ||
      el.matches(':disabled,[aria-disabled="true"]') ||
      el.closest(".chore-bottom-nav,.reminder-banner-card")
      ? null
      : el;
  }
  function restore(el: HTMLElement, state: State) {
    el.style.scale = state.scale;
    el.style.opacity = state.opacity;
    el.removeAttribute("data-press-feedback");
    states.delete(el);
  }
  function request() {
    if (!frame && !document.hidden) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }
  function tick(now: number) {
    frame = 0;
    const dt = Math.max(0, (now - last) / 1000);
    last = now;
    let moving = false;
    for (const [el, state] of states) {
      if (!el.isConnected) {
        restore(el, state);
        continue;
      }
      if (media.matches) continue;
      const next = pressStep(state.position, state.velocity, state.target, dt);
      state.position = next.position;
      state.velocity = next.velocity;
      el.style.scale = next.position.toFixed(4);
      if (
        Math.abs(state.position - state.target) < 0.0002 &&
        Math.abs(state.velocity) < 0.003
      ) {
        state.position = state.target;
        state.velocity = 0;
        if (state.target === 1) restore(el, state);
        else el.style.scale = String(state.target);
      } else moving = true;
    }
    if (moving) frame = requestAnimationFrame(tick);
  }
  function stateFor(el: HTMLElement) {
    let state = states.get(el);
    if (!state) {
      state = {
        position: 1,
        velocity: 0,
        target: 1,
        scale: el.style.scale,
        opacity: el.style.opacity,
      };
      states.set(el, state);
    }
    el.setAttribute("data-press-feedback", "");
    return state;
  }
  function press(el: HTMLElement, pulse = false) {
    if (!el.isConnected || document.hidden) return;
    const state = stateFor(el);
    state.target = pulse ? 1 : 0.96;
    if (media.matches) {
      el.style.opacity = String((Number(state.opacity) || 1) * 0.76);
      if (pulse) {
        restore(el, state);
      }
      return;
    }
    state.position = Math.min(state.position, pulse ? 0.945 : 0.975);
    state.velocity = Math.min(state.velocity, -0.35);
    el.style.scale = String(state.position);
    request();
  }
  function up(event?: PointerEvent) {
    if (!pressed) return;
    if (
      event &&
      pressed.pointer !== null &&
      event.pointerId !== pressed.pointer
    )
      return;
    const { el } = pressed;
    pressed = null;
    const state = states.get(el);
    if (!state) return;
    recent.set(el, performance.now());
    state.target = 1;
    if (media.matches) restore(el, state);
    else request();
  }
  function down(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0) return;
    up();
    const el = control(event.target);
    if (!el) return;
    pressed = {
      el,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    press(el);
  }
  function move(event: PointerEvent) {
    if (
      pressed?.pointer === event.pointerId &&
      Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 8
    )
      up(event);
  }
  function keydown(event: KeyboardEvent) {
    if (event.repeat || !["Enter", " "].includes(event.key)) return;
    const el = control(event.target);
    if (!el) return;
    up();
    pressed = { el, pointer: null, x: 0, y: 0 };
    press(el);
  }
  function keyup(event: KeyboardEvent) {
    if (["Enter", " "].includes(event.key) && pressed?.pointer === null) up();
  }
  function click(event: MouseEvent) {
    const el = control(event.target);
    if (
      !el ||
      pressed?.el === el ||
      performance.now() - (recent.get(el) || -1000) < 400
    )
      return;
    recent.set(el, performance.now());
    press(el, true);
  }
  function clear() {
    pressed = null;
    cancelAnimationFrame(frame);
    frame = 0;
    for (const [el, state] of states) restore(el, state);
  }
  function visibility() {
    if (document.hidden) clear();
  }
  document.addEventListener("pointerdown", down, true);
  document.addEventListener("pointermove", move, true);
  document.addEventListener("pointerup", up, true);
  document.addEventListener("pointercancel", up, true);
  document.addEventListener("keydown", keydown, true);
  document.addEventListener("keyup", keyup, true);
  document.addEventListener("click", click, true);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("blur", clear);
  media.addEventListener("change", clear);
  return () => {
    clear();
    document.removeEventListener("pointerdown", down, true);
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("pointerup", up, true);
    document.removeEventListener("pointercancel", up, true);
    document.removeEventListener("keydown", keydown, true);
    document.removeEventListener("keyup", keyup, true);
    document.removeEventListener("click", click, true);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("blur", clear);
    media.removeEventListener("change", clear);
  };
}
