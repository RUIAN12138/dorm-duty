import { motionAllowed } from "./motion";

const NEAR_BOTTOM = 60;
const ANCHOR_SELECTOR =
  ".chat-bubble,.chat-reminder,.conversation-note,.chat-confirm,.chat-loading,.chat-quick-prompts,.chat-clear";

// The browser owns scrolling and inertia. This controller only asks for a
// programmatic smooth follow while the reader is near the bottom; touch/wheel
// interrupts it in place and native scroll events decide the new near-bottom
// state. No per-frame scrollTop integrator and no per-frame layout reads.
export function createChatScroll(
  element: () => HTMLElement | undefined,
  paint: () => void,
  content?: () => HTMLElement | undefined,
) {
  let frame = 0;
  let wantImmediate = false;
  let pinned = true;
  let smooth = false;
  let userPaused = false;
  let smoothTimer: ReturnType<typeof setTimeout> | undefined;
  let anchor: { el: HTMLElement; offset: number } | null = null;
  let observer: ResizeObserver | undefined;
  let observed: HTMLElement | undefined;

  const cancelFrame = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };
  function stopSmooth() {
    smooth = false;
    clearTimeout(smoothTimer);
    smoothTimer = undefined;
    const el = element();
    if (el) el.scrollTo({ top: el.scrollTop, behavior: "auto" });
  }
  function distance(el: HTMLElement) {
    return el.scrollHeight - el.scrollTop - el.clientHeight;
  }

  function flush(immediate: boolean) {
    const el = element();
    if (!el || !pinned) return;
    // Read the size once per coalesced batch, never inside a frame loop.
    const target = Math.max(0, el.scrollHeight - el.clientHeight);
    if (immediate || !motionAllowed()) {
      stopSmooth();
      el.scrollTo({ top: target, behavior: "auto" });
      paint();
      return;
    }
    smooth = true;
    el.scrollTo({ top: target, behavior: "smooth" });
    clearTimeout(smoothTimer);
    // Safety for browsers that do not emit a final scroll event.
    smoothTimer = setTimeout(() => {
      smooth = false;
      smoothTimer = undefined;
    }, 700);
  }

  function request(immediate = false) {
    wantImmediate = wantImmediate || immediate;
    if (!pinned) return;
    ensureObserver();
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const next = wantImmediate;
      wantImmediate = false;
      flush(next);
    });
  }

  function captureAnchor() {
    const el = element();
    const host = content?.();
    if (pinned || !el || !host) return;
    // offsetTop is layout position (unaffected by scroll), so switching
    // between DOM nodes never needs a rectangle read.
    const visibleTop = el.scrollTop;
    const nodes = host.querySelectorAll<HTMLElement>(ANCHOR_SELECTOR);
    for (const node of nodes) {
      if (node.offsetTop + node.offsetHeight > visibleTop + 1) {
        // Keep the anchor's viewport-relative position, not just the delta, so
        // browser scroll clamping cannot silently jump the reader.
        anchor = { el: node, offset: node.offsetTop - visibleTop };
        return;
      }
    }
    anchor = null;
  }

  function restoreAnchor() {
    const el = element();
    if (pinned || !el || !anchor) return;
    if (!anchor.el.isConnected) {
      anchor = null;
      return;
    }
    const next = anchor.el.offsetTop - anchor.offset;
    if (Math.abs(next - el.scrollTop) < 0.5) return;
    el.scrollTop = Math.max(0, next);
    paint();
  }

  function ensureObserver() {
    if (typeof ResizeObserver === "undefined") return;
    const host = content?.();
    if (!host || host === observed) return;
    observer?.disconnect();
    observed = host;
    anchor = null;
    observer = new ResizeObserver(() => {
      // Layout changes below the reader should not scroll them; if pinned,
      // coalesce a single follow into the next frame.
      if (pinned) request();
      else restoreAnchor();
    });
    observer.observe(host);
  }

  function scroll() {
    const el = element();
    if (el) {
      const gap = distance(el);
      if (smooth && gap < 1.5) smooth = false;
      if (userPaused) {
        if (gap < NEAR_BOTTOM) {
          userPaused = false;
          pinned = true;
          anchor = null;
        }
      } else if (!smooth) {
        pinned = gap < NEAR_BOTTOM;
      }
      if (!pinned && !smooth) captureAnchor();
    }
    paint();
  }

  function interrupt() {
    cancelFrame();
    wantImmediate = false;
    stopSmooth();
    pinned = false;
    userPaused = true;
  }

  function pin() {
    pinned = true;
    userPaused = false;
    anchor = null;
  }

  function stop() {
    cancelFrame();
    wantImmediate = false;
    clearTimeout(smoothTimer);
    smoothTimer = undefined;
    smooth = false;
    // Leaving the conversation must not leave a native smooth flight running.
    const el = element();
    if (el) el.scrollTo({ top: el.scrollTop, behavior: "auto" });
  }
  function destroy() {
    stop();
    observer?.disconnect();
    observer = undefined;
    observed = undefined;
    anchor = null;
  }

  return {
    request,
    scroll,
    interrupt,
    pin,
    stop,
    destroy,
    // Exposed for callers that know a layout change is about to happen.
    capture: captureAnchor,
    restore: restoreAnchor,
  };
}
