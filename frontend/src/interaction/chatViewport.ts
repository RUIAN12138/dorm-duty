// One coalesced visual-viewport state for the chat surface. The soft-keyboard
// flag is deliberately separate from the geometric offset used by CSS: the
// offset follows the real visible bottom continuously, while the flag is
// latched and only used for keyboard-specific UI (shortcut hiding, close wait).

export const COMPACT_HEIGHT = 560;
export const KEYBOARD_MIN_OCCLUSION = 110;
export const KEYBOARD_RECOVERY = 8;
export const KEYBOARD_GAP = 10;
const WIDTH_TOLERANCE = 24;
const SCALE_TOLERANCE = 0.01;

export type ChatViewportSample = {
  height: number;
  offsetTop: number;
  width: number;
  scale: number;
  // Layout viewport height. It is only used to establish the first baseline,
  // so a resize-only WebView can still report a keyboard-sized reduction.
  layoutHeight: number;
  focused: boolean;
};

export type ChatViewportState = {
  top: number;
  height: number;
  width: number;
  scale: number;
  restingHeight: number;
  restingTop: number;
  restingWidth: number;
  restingScale: number;
  keyboard: boolean;
  // Real occlusion consumed by `max(10px, idleGap - inset)` in CSS.
  inset: number;
};

export function isCompactViewportHeight(height: number) {
  return height < COMPACT_HEIGHT;
}

function finite(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? (value as number) : fallback;
}

export function createChatViewportState(
  sample: ChatViewportSample,
): ChatViewportState {
  const height = Math.max(0, finite(sample.height, sample.layoutHeight));
  const top = Math.max(0, finite(sample.offsetTop, 0));
  const width = Math.max(1, finite(sample.width, 1));
  const scale = Math.max(0.01, finite(sample.scale, 1));
  return {
    top,
    height,
    width,
    scale,
    // The initial layout height lets an already-open keyboard be detected,
    // while later baselines use the settled visual height.
    restingHeight: Math.max(
      height,
      Math.max(0, finite(sample.layoutHeight, height)),
    ),
    restingTop: top,
    restingWidth: width,
    restingScale: scale,
    keyboard: false,
    inset: 0,
  };
}

export function reduceChatViewport(
  previous: ChatViewportState,
  sample: ChatViewportSample,
): ChatViewportState {
  const height = Math.max(0, finite(sample.height, previous.height));
  const top = Math.max(0, finite(sample.offsetTop, previous.top));
  const width = Math.max(1, finite(sample.width, previous.width));
  const scale = Math.max(0.01, finite(sample.scale, previous.scale));

  // Orientation changes and pinch zoom move the coordinate system, not the
  // keyboard. Re-baseline from the new visible height so neither is inferred
  // as a soft keyboard.
  if (
    Math.abs(width - previous.restingWidth) > WIDTH_TOLERANCE ||
    Math.abs(scale - previous.restingScale) > SCALE_TOLERANCE
  ) {
    return {
      top,
      height,
      width,
      scale,
      restingHeight: height,
      restingTop: top,
      restingWidth: width,
      restingScale: scale,
      keyboard: false,
      inset: 0,
    };
  }

  const recovered =
    height >= previous.restingHeight - KEYBOARD_RECOVERY &&
    Math.abs(top - previous.restingTop) <= KEYBOARD_RECOVERY;
  // A blur can arrive during the first few keyboard frames, before the full
  // keyboard threshold is reached. Keep that partial geometry until recovery.
  const following = previous.keyboard || previous.inset > 0;
  // Once a keyboard is seen, losing focus does not end it early: keep the
  // keyboard state (and the attached footer) until the viewport really
  // restores. A hardware keyboard never changes height, so it never latches.
  const keyboard = previous.keyboard
    ? !recovered
    : sample.focused &&
      previous.restingHeight - height > KEYBOARD_MIN_OCCLUSION;

  let restingHeight = previous.restingHeight,
    restingTop = previous.restingTop,
    restingWidth = previous.restingWidth,
    restingScale = previous.restingScale;
  // Re-baseline only while no keyboard has been observed. Focused but small
  // viewport changes (browser chrome) keep the previous resting height; an
  // unfocused resize (address bar, WebView window) adopts the new height.
  if (!keyboard && !following && (!sample.focused || height >= restingHeight)) {
    restingHeight = height;
    restingTop = top;
    restingWidth = width;
    restingScale = scale;
  }

  const inset =
    (sample.focused || following) && !recovered
      ? Math.max(0, restingHeight - height)
      : 0;
  return {
    top,
    height,
    width,
    scale,
    restingHeight,
    restingTop,
    restingWidth,
    restingScale,
    keyboard,
    inset,
  };
}

function sameState(a: ChatViewportState, b: ChatViewportState) {
  return (
    Math.abs(a.top - b.top) < 0.01 &&
    Math.abs(a.height - b.height) < 0.01 &&
    Math.abs(a.width - b.width) < 0.01 &&
    Math.abs(a.scale - b.scale) < 0.001 &&
    Math.abs(a.restingHeight - b.restingHeight) < 0.01 &&
    Math.abs(a.restingTop - b.restingTop) < 0.01 &&
    Math.abs(a.restingWidth - b.restingWidth) < 0.01 &&
    Math.abs(a.restingScale - b.restingScale) < 0.001 &&
    a.keyboard === b.keyboard &&
    Math.abs(a.inset - b.inset) < 0.01
  );
}

export type ChatViewportController = {
  start: () => void;
  stop: () => void;
  schedule: () => void;
  flush: () => void;
  state: () => ChatViewportState;
  subscribe: (listener: (state: ChatViewportState) => void) => () => void;
};

export function createChatViewport(options: {
  focused: () => boolean;
  onFrame: (state: ChatViewportState) => void;
  win?: Window;
  view?: VisualViewport | null;
}): ChatViewportController {
  const win = options.win || window;
  const view = options.view === undefined ? win.visualViewport : options.view;
  const listeners = new Set<(state: ChatViewportState) => void>();
  let frame = 0;
  let started = false;
  let stopped = false;

  const read = (): ChatViewportSample => ({
    height: view?.height ?? win.innerHeight,
    offsetTop: view?.offsetTop ?? 0,
    width: view?.width ?? win.innerWidth,
    scale: view?.scale ?? 1,
    layoutHeight: win.innerHeight,
    focused: options.focused(),
  });
  let current = createChatViewportState(read());

  function run() {
    frame = 0;
    if (stopped) return;
    const next = reduceChatViewport(current, read());
    const changed = !sameState(current, next);
    current = next;
    if (changed) options.onFrame(next);
    for (const listener of listeners) listener(next);
  }

  function schedule() {
    if (stopped || frame) return;
    frame = requestAnimationFrame(run);
  }

  function flush() {
    if (stopped) return;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    run();
  }

  function start() {
    if (started) return;
    started = true;
    stopped = false;
    if (view) {
      view.addEventListener("resize", schedule);
      view.addEventListener("scroll", schedule);
    }
    // A resize-only WebView (or a browser that omits VisualViewport) reports
    // the keyboard through the layout viewport instead.
    win.addEventListener("resize", schedule);
    schedule();
  }

  function stop() {
    if (!started) return;
    started = false;
    stopped = true;
    cancelAnimationFrame(frame);
    frame = 0;
    if (view) {
      view.removeEventListener("resize", schedule);
      view.removeEventListener("scroll", schedule);
    }
    win.removeEventListener("resize", schedule);
    listeners.clear();
  }

  return {
    start,
    stop,
    schedule,
    flush,
    state: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
