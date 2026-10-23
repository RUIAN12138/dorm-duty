import type { ObjectDirective } from "vue";
import {
  cardContact,
  cardRotation,
  cardSpringStep,
  cardFeedbackTokens as tokens,
} from "../interaction/cardFeedback";

export interface CardFeedbackOptions {
  lifted?: boolean;
  liftOnly?: boolean;
  disabled?: boolean;
}
type Controller = {
  update: (value?: CardFeedbackOptions) => void;
  dispose: () => void;
};
const controllers = new WeakMap<HTMLElement, Controller>();
// Retains the existing directive entry point. No Vue updates or layout reads in
// pointermove, no pointer capture and no second swipe/drag recognizer.
export const tilt: ObjectDirective<
  HTMLElement,
  CardFeedbackOptions | undefined
> = {
  mounted(el, binding) {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let options: CardFeedbackOptions = {};
    const owned = ["translate", "rotate", "scale", "will-change"] as const;
    let saved: { value: string; priority: string }[] | null = null;
    const hadOwner = el.hasAttribute("data-press-owned");
    el.setAttribute("data-press-owned", "");
    el.setAttribute("data-card-feedback", "");
    const value = [0, 0, 0, 0],
      velocity = [0, 0, 0, 0],
      target = [0, 0, 0, 0];
    let frame = 0,
      last = 0;
    let pointer: { id: number; x: number; y: number; box: DOMRect } | null =
      null;
    const allowed = () =>
      !options.disabled &&
      !media.matches &&
      !document.hidden &&
      document.documentElement.dataset.interaction !== "keyboard" &&
      !el.closest("[inert]") &&
      !el.matches(':disabled,[aria-disabled="true"]');
    function acquire() {
      if (saved) return true;
      // Do not replace an existing independent-transform owner.
      if (
        ["translate", "rotate", "scale"].some((name) =>
          el.style.getPropertyValue(name),
        )
      )
        return false;
      saved = owned.map((name) => ({
        value: el.style.getPropertyValue(name),
        priority: el.style.getPropertyPriority(name),
      }));
      el.style.willChange = "transform";
      return true;
    }
    function restore() {
      if (saved)
        owned.forEach((name, i) => {
          const old = saved![i]!;
          if (old.value) el.style.setProperty(name, old.value, old.priority);
          else el.style.removeProperty(name);
        });
      saved = null;
      el.removeAttribute("data-card-state");
    }
    function paint() {
      el.style.translate = `0 ${value[0]! * tokens.depression - value[3]! * tokens.lift}px`;
      el.style.rotate = cardRotation(value[1]!, value[2]!);
      el.style.scale = String(1 - value[0]! * (1 - tokens.scale));
    }
    function tick(now: number) {
      frame = 0;
      if (!allowed() || !el.isConnected) return clear();
      const dt = Math.max(0, (now - last) / 1000);
      last = now;
      let moving = false;
      for (let i = 0; i < value.length; i++) {
        const next = cardSpringStep(
          value[i]!,
          velocity[i]!,
          target[i]!,
          dt,
          !!pointer,
        );
        value[i] = next.position;
        velocity[i] = next.velocity;
        if (
          // Below 0.005 degrees / 0.02px of remaining lift, restore the
          // original inline state instead of running imperceptible tail frames.
          Math.abs(value[i]! - target[i]!) < 0.005 &&
          Math.abs(velocity[i]!) < 0.15
        ) {
          value[i] = target[i]!;
          velocity[i] = 0;
        } else moving = true;
      }
      paint();
      if (moving) frame = requestAnimationFrame(tick);
      else if (!pointer && !options.lifted) restore();
    }
    function request() {
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    }
    function detach() {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);
      document.removeEventListener("scroll", scroll, true);
    }
    function release() {
      pointer = null;
      detach();
      target.fill(0);
      if (!saved) return;
      el.setAttribute("data-card-state", "settling");
      if (!allowed()) clear();
      else request();
    }
    function clear() {
      pointer = null;
      detach();
      cancelAnimationFrame(frame);
      frame = 0;
      value.fill(0);
      velocity.fill(0);
      target.fill(0);
      restore();
    }
    function down(event: PointerEvent) {
      if (
        !allowed() ||
        options.liftOnly ||
        pointer ||
        !event.isPrimary ||
        event.button !== 0
      )
        return;
      const origin = event.target instanceof Element ? event.target : null;
      // Nested completion/actions/date cells keep their own feedback/gestures.
      if (
        !origin ||
        origin.closest("[data-card-feedback]") !== el ||
        (origin.closest(
          'button,a,input,textarea,select,[role="button"],[role="slider"]',
        ) &&
          origin.closest(
            'button,a,input,textarea,select,[role="button"],[role="slider"]',
          ) !== el)
      )
        return;
      if (!acquire()) return;
      const box = el.getBoundingClientRect(); // one read for the entire gesture
      pointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        box,
      };
      const contact = cardContact(box, event.clientX, event.clientY);
      target[0] = 1;
      target[1] = contact.x;
      target[2] = contact.y;
      target[3] = 0;
      if (value.every((v) => Math.abs(v) < 0.00001)) {
        value[0] = 0.25;
        value[1] = contact.x * 0.25;
        value[2] = contact.y * 0.25;
      }
      el.setAttribute("data-card-state", "pressed");
      paint();
      request();
      window.addEventListener("pointermove", move, {
        capture: true,
        passive: true,
      });
      window.addEventListener("pointerup", up, true);
      window.addEventListener("pointercancel", cancel, true);
      document.addEventListener("scroll", scroll, {
        capture: true,
        passive: true,
      });
    }
    function move(event: PointerEvent) {
      if (!pointer || event.pointerId !== pointer.id) return;
      if (
        Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) >
        tokens.intent
      )
        return release();
      const contact = cardContact(pointer.box, event.clientX, event.clientY);
      // Direct manipulation for small drift. Larger motion has already yielded
      // to the original native scroll/swipe controller, without canceling it.
      value[1] = target[1] = contact.x;
      value[2] = target[2] = contact.y;
      velocity[1] = velocity[2] = 0;
      request();
    }
    function up(event: PointerEvent) {
      if (pointer?.id === event.pointerId) release();
    }
    function cancel(event: PointerEvent) {
      if (pointer?.id === event.pointerId) release();
    }
    function leave(event: PointerEvent) {
      if (event.pointerType === "mouse" && pointer) release();
    }
    function scroll() {
      release();
    }
    function visibility() {
      if (document.hidden) clear();
    }
    function quiet() {
      if (!allowed()) clear();
    }
    function update(next?: CardFeedbackOptions) {
      const previousLifted = options.lifted;
      options = next || {};
      if (!allowed()) return clear();
      if (options.liftOnly && options.lifted !== previousLifted) {
        if (!options.lifted) return release();
        if (!acquire()) return;
        target.fill(0);
        target[3] = 1;
        el.setAttribute("data-card-state", "lifted");
        request();
      }
    }
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerleave", leave);
    window.addEventListener("blur", clear);
    window.addEventListener("ui-motion-change", quiet);
    document.addEventListener("visibilitychange", visibility);
    media.addEventListener("change", quiet);
    controllers.set(el, {
      update,
      dispose() {
        clear();
        el.removeEventListener("pointerdown", down);
        el.removeEventListener("pointerleave", leave);
        window.removeEventListener("blur", clear);
        window.removeEventListener("ui-motion-change", quiet);
        document.removeEventListener("visibilitychange", visibility);
        media.removeEventListener("change", quiet);
        el.removeAttribute("data-card-feedback");
        if (!hadOwner) el.removeAttribute("data-press-owned");
      },
    });
    update(binding.value);
  },
  updated(el, binding) {
    controllers.get(el)?.update(binding.value);
  },
  unmounted(el) {
    controllers.get(el)?.dispose();
    controllers.delete(el);
  },
};
