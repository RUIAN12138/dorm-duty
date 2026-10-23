// Geometry and scroll ownership for the inline reminder reply. The visual
// viewport is the only source of truth for the visible area; the parked
// document position and the measured card height are read here, never derived
// from a guessed keyboard height.
import { animate } from "motion-v";
import { motionAllowed, motionTokens } from "./motion";
import { createChatViewport, type ChatViewportState } from "./chatViewport";

export const BANNER_REPLY_GAP = 10;
export const BANNER_REPLY_EDGE = 8;

export function bannerReplyTop(input: {
  anchorTop: number;
  viewportTop: number;
  viewportHeight: number;
  height: number;
  keyboard?: boolean;
  gap?: number;
  edge?: number;
}) {
  const gap = input.gap ?? BANNER_REPLY_GAP;
  const edge = input.edge ?? BANNER_REPLY_EDGE;
  const viewportBottom = input.viewportTop + Math.max(0, input.viewportHeight);
  const height = Math.max(0, input.height);
  if (input.keyboard) {
    // With a soft keyboard the panel is attached ~10px above its top edge and
    // follows every candidate-bar/pan frame. It only gives up the gap when the
    // card genuinely cannot fit in the visible area.
    return Math.round(
      Math.max(input.viewportTop + edge, viewportBottom - height - gap),
    );
  }
  // Idle long-press grows downward from the card's parked position. The clamp
  // still keeps an unusually tall draft inside the visible viewport.
  const top = Math.max(input.viewportTop, input.anchorTop);
  const highest = Math.max(
    input.viewportTop + edge,
    viewportBottom - height - gap,
  );
  return Math.round(Math.min(top, highest));
}

export interface BannerReplyLayout {
  start: () => void;
  stop: () => void;
  sync: () => void;
}

export function createBannerReplyLayout(options: {
  position: () => HTMLElement | null;
  card: () => HTMLElement | null;
  editing: () => boolean;
  focused: () => boolean;
  win?: Window;
  view?: VisualViewport | null;
}): BannerReplyLayout {
  const win = options.win || window;
  let started = false;
  let visualOffset: number | null = null;
  let appliedTop: number | null = null;
  let targetTop: number | null = null;
  let velocity = 0;
  let lastDraw = 0;
  let flight: ReturnType<typeof animate> | null = null;
  let currentState: ChatViewportState | null = null;
  let observer: ResizeObserver | null = null;
  let lastHeight = 0;

  const clear = () => {
    const el = options.position();
    flight?.stop();
    flight = null;
    if (el) {
      el.style.transform = "";
      el.style.removeProperty("--banner-visible-height");
    }
    appliedTop = null;
    targetTop = null;
    velocity = 0;
    lastDraw = 0;
    visualOffset = null;
  };

  const measureOffset = (el: HTMLElement) => {
    // The parked top is CSS `calc(env(safe-area-inset-top) + 14px)`. Reading
    // the computed value resolves the safe-area inset without duplicating it.
    const value = Number.parseFloat(win.getComputedStyle(el).top);
    return Number.isFinite(value) ? value : 0;
  };

  const apply = (state: ChatViewportState) => {
    const el = options.position();
    if (!el) return;
    const previous = currentState;
    const trackingKeyboard =
      options.editing() &&
      !!previous &&
      previous.inset > 0 &&
      state.inset > 0 &&
      (previous.height !== state.height || previous.top !== state.top);
    currentState = state;
    if (visualOffset === null) visualOffset = measureOffset(el);
    const parked = visualOffset;
    // Swipe/press transforms must never feed back into keyboard layout.
    const height = options.card()?.offsetHeight || 0;
    const resizingContent = lastHeight > 0 && height !== lastHeight;
    lastHeight = height;
    el.style.setProperty("--banner-visible-height", `${state.height}px`);
    const top = options.editing()
      ? bannerReplyTop({
          anchorTop: state.top + parked,
          viewportTop: state.top,
          viewportHeight: state.height,
          height,
          keyboard: state.keyboard || state.inset > 0,
        })
      : parked;
    const draw = (next: number) => {
      const now = win.performance.now();
      // Clamp only when the keyboard would otherwise cover the editor. The
      // spring owns position, including reversal; no CSS top/bottom transition
      // or second keyboard-height compensation competes with this channel.
      if (options.editing() && currentState) {
        const maxTop = Math.max(
          currentState.top + BANNER_REPLY_EDGE,
          currentState.top + currentState.height - height - BANNER_REPLY_GAP,
        );
        next = Math.max(
          currentState.top + BANNER_REPLY_EDGE,
          Math.min(next, maxTop),
        );
      }
      velocity =
        appliedTop === null || !lastDraw || now === lastDraw
          ? 0
          : ((next - appliedTop) * 1000) / (now - lastDraw);
      appliedTop = next;
      lastDraw = now;
      el.style.transform = `translate3d(-50%, ${next - parked}px, 0)`;
    };
    if (appliedTop === null) appliedTop = parked;
    if (
      targetTop !== null &&
      Math.abs(top - targetTop) < 0.5 &&
      motionAllowed()
    )
      return;
    targetTop = top;
    flight?.stop();
    // Once resize frames are flowing, track the system exactly. Re-springing
    // each keyboard frame makes the panel chase the candidate bar. Only the
    // initial relocation and explicit collapse use the reversible spring.
    if (
      trackingKeyboard ||
      (resizingContent && options.editing()) ||
      !motionAllowed() ||
      Math.abs(top - appliedTop) < 0.5
    ) {
      draw(top);
      return;
    }
    flight = animate(appliedTop, top, {
      ...motionTokens.settle,
      velocity,
      restDelta: 0.25,
      restSpeed: 4,
      onUpdate: draw,
      onComplete: () => {
        draw(top);
        flight = null;
      },
    });
  };

  const viewport = createChatViewport({
    focused: options.focused,
    onFrame: apply,
    win,
    view: options.view,
  });

  const sync = () => {
    const el = options.position();
    if (!el) return;
    if (visualOffset === null) visualOffset = measureOffset(el);
    // `flush` coalesces pending viewport frames; apply once for the current
    // state even when the viewport has not changed since the panel opened.
    viewport.flush();
    apply(viewport.state());
  };

  const start = () => {
    if (started) return;
    started = true;
    const el = options.position();
    if (el && typeof ResizeObserver === "function") {
      // The card's grid height is the only size input. Observing the wrapper
      // lets the anchored top chase the growing panel without a second owner.
      observer = new ResizeObserver(() => {
        apply(viewport.state());
      });
      observer.observe(el);
    }
    viewport.start();
    sync();
  };

  const stop = () => {
    if (!started) return;
    started = false;
    observer?.disconnect();
    observer = null;
    viewport.stop();
    clear();
  };

  return { start, stop, sync };
}

interface ScrollLockState {
  count: number;
  bodyOverflow: string;
  bodyOverscroll: string;
  htmlOverflow: string;
  x: number;
  y: number;
}

let scrollLock: ScrollLockState | null = null;

// Reference-counted so the banner never drops a lock another surface owns.
// Only the properties this lock actually changed are restored.
export function lockBackgroundScroll(win: Window = window): () => void {
  const body = win.document.body;
  const html = win.document.documentElement;
  if (!scrollLock) {
    scrollLock = {
      count: 0,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
      htmlOverflow: html.style.overflow,
      x: win.scrollX,
      y: win.scrollY,
    };
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    html.style.overflow = "hidden";
  }
  scrollLock.count++;
  let released = false;
  return () => {
    if (released || !scrollLock) return;
    released = true;
    scrollLock.count--;
    if (scrollLock.count > 0) return;
    const saved = scrollLock;
    scrollLock = null;
    if (body.style.overflow === "hidden")
      body.style.overflow = saved.bodyOverflow;
    if (body.style.overscrollBehavior === "none")
      body.style.overscrollBehavior = saved.bodyOverscroll;
    if (html.style.overflow === "hidden")
      html.style.overflow = saved.htmlOverflow;
    if (win.scrollX !== saved.x || win.scrollY !== saved.y)
      win.scrollTo(saved.x, saved.y);
  };
}
