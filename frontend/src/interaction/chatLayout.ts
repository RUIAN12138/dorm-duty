import { nextTick } from "vue";

// The chat has one geometric source: the visual viewport. This module only
// derives presentation values from that state, so the root, header, footer and
// scroll settling cannot drift into independent keyboard controllers.

// The keyboard inset is already continuous; 180px maps it to the full compact
// header instead of switching at the old 110px keyboard latch.
export const CHAT_HEADER_OCCLUSION = 180;
export const CHAT_PANEL_MIN = 44;
export const CHAT_PANEL_MAX = 260;
export const CHAT_PANEL_RATIO = 0.34;
// Compact header, composer, attached gap and one readable message row.
export const CHAT_PANEL_RESERVE = 246;

export type ChatHeaderLayout = {
  // 0 at rest, 1 when the keyboard has consumed the full compression range.
  progress: number;
  // Inner ball scale only; chatTravel keeps ownership of the outer transform.
  ballScale: number;
  // Safe-area aware top: max(base, env(safe-area-inset-top) + gap).
  ballTopBase: number;
  ballSafeGap: number;
  // Extra height below the ball for the toolbar, history and top frost.
  toolbarExtra: number;
  toolbarPadOffset: number;
  historyExtra: number;
  frostExtra: number;
  nameplateOffset: number;
  nameplateFont: number;
  nameplatePadY: number;
  nameplatePadX: number;
  backOpacity: number;
};

type HeaderMetrics = {
  ballTopBase: number;
  ballSafeGap: number;
  toolbarExtra: number;
  toolbarPadOffset: number;
  historyExtra: number;
  frostExtra: number;
  nameplateGap: number;
  nameplateFont: number;
  nameplatePadY: number;
  nameplatePadX: number;
};

// These are the existing idle values, kept exact so a keyboard-free view is
// pixel-identical to the previous layout.
const IDLE_HEADER: HeaderMetrics = {
  ballTopBase: 48,
  ballSafeGap: 28,
  toolbarExtra: 128,
  toolbarPadOffset: 12,
  historyExtra: 144,
  frostExtra: 144,
  nameplateGap: 8,
  nameplateFont: 14,
  nameplatePadY: 5,
  nameplatePadX: 18,
};

// Short screens already enter with the old compact geometry. The keyboard may
// compress further but must never enlarge this baseline.
const COMPACT_HEADER: HeaderMetrics = {
  ballTopBase: 18,
  ballSafeGap: 8,
  toolbarExtra: 90,
  toolbarPadOffset: 6,
  historyExtra: 98,
  frostExtra: 107,
  nameplateGap: 4.7,
  nameplateFont: 12,
  nameplatePadY: 3,
  nameplatePadX: 12,
};

const KEYBOARD_HEADER: HeaderMetrics = {
  ballTopBase: 16,
  ballSafeGap: 6,
  toolbarExtra: 80,
  toolbarPadOffset: 2,
  historyExtra: 94,
  frostExtra: 98,
  nameplateGap: 6,
  nameplateFont: 11,
  nameplatePadY: 3,
  nameplatePadX: 12,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const mix = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;

export function chatHeaderProgress(inset: number) {
  return clamp01((Number.isFinite(inset) ? inset : 0) / CHAT_HEADER_OCCLUSION);
}

/**
 * Pure header derivation. The same progress drives ball, nameplate, toolbar,
 * frost and history padding so they cannot disagree on a keyboard frame.
 */
export function deriveChatHeaderLayout(options: {
  compact: boolean;
  inset: number;
}): ChatHeaderLayout {
  const progress = chatHeaderProgress(options.inset);
  const idle = options.compact ? COMPACT_HEADER : IDLE_HEADER;
  // Normal entry reaches 70% (88 -> 61.6px); an already compact short screen
  // keeps its 64% size instead of growing when the keyboard appears.
  const ballScale = Math.min(options.compact ? 0.64 : 1, 1 - 0.3 * progress);
  return {
    progress,
    ballScale,
    ballTopBase: mix(idle.ballTopBase, KEYBOARD_HEADER.ballTopBase, progress),
    ballSafeGap: mix(idle.ballSafeGap, KEYBOARD_HEADER.ballSafeGap, progress),
    toolbarExtra: mix(
      idle.toolbarExtra,
      KEYBOARD_HEADER.toolbarExtra,
      progress,
    ),
    toolbarPadOffset: mix(
      idle.toolbarPadOffset,
      KEYBOARD_HEADER.toolbarPadOffset,
      progress,
    ),
    historyExtra: mix(
      idle.historyExtra,
      KEYBOARD_HEADER.historyExtra,
      progress,
    ),
    frostExtra: mix(idle.frostExtra, KEYBOARD_HEADER.frostExtra, progress),
    nameplateOffset:
      88 * ballScale +
      mix(idle.nameplateGap, KEYBOARD_HEADER.nameplateGap, progress),
    nameplateFont: mix(
      idle.nameplateFont,
      KEYBOARD_HEADER.nameplateFont,
      progress,
    ),
    nameplatePadY: mix(
      idle.nameplatePadY,
      KEYBOARD_HEADER.nameplatePadY,
      progress,
    ),
    nameplatePadX: mix(
      idle.nameplatePadX,
      KEYBOARD_HEADER.nameplatePadX,
      progress,
    ),
    // The toolbar owns the entry reveal opacity; only the inner back control
    // fades here, so paintReveal never fights this value.
    backOpacity: clamp01(1 - progress * 2),
  };
}

/**
 * One animated panel height owner. The panel may scroll its content locally,
 * but it can never grow past the space left after the header and composer.
 */
export function deriveChatPanelMax(viewportHeight: number) {
  const height = Number.isFinite(viewportHeight)
    ? Math.max(0, viewportHeight)
    : 0;
  const budget = Math.max(
    CHAT_PANEL_MIN,
    Math.min(
      CHAT_PANEL_MAX,
      Math.floor(
        Math.min(height * CHAT_PANEL_RATIO, height - CHAT_PANEL_RESERVE),
      ),
    ),
  );
  return budget;
}

/**
 * Coalesces viewport/footer/panel notifications into one post-DOM-update
 * layout pass. Sources never each settle scroll or measure the dock separately.
 */
export function createChatLayoutCoordinator(apply: () => void) {
  let scheduled = false;
  let disposed = false;
  return {
    invalidate() {
      if (scheduled || disposed) return;
      scheduled = true;
      void nextTick(() => {
        scheduled = false;
        if (!disposed) apply();
      });
    },
    stop() {
      disposed = true;
      scheduled = false;
    },
  };
}
