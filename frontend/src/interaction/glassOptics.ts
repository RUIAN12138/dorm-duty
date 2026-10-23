/**
 * Local glass optics helpers.
 *
 * Optical principles (edge curvature, a per-channel fringe and a directional
 * highlight) are adapted from rdev/liquid-glass-react,
 * https://github.com/rdev/liquid-glass-react, which is MIT licensed. Only the
 * principles were reimplemented for this Vue codebase; no React or library
 * source is copied. The verbatim license is distributed with the frontend at
 * /licenses/liquid-glass-react-MIT.txt. That MIT notice covers the reference
 * library only and does not relicense third-party assets it may reference.
 */

/** Per-channel chromatic offset stays below 1.5px: no rainbow outline. */
export const FRINGE_LIMIT_PX = 1.5;

export type GlassGlint = { x: number; y: number; strength: number };

export type GlassRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function clampFringe(offset: number) {
  return clamp(offset, -FRINGE_LIMIT_PX, FRINGE_LIMIT_PX);
}

/** Highlight position for a press inside an already-measured host box. */
export function pointerGlint(
  clientX: number,
  clientY: number,
  rect: GlassRect,
): GlassGlint {
  const x = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1) * 100;
  const y = clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1) * 100;
  const rim = clamp(Math.min(x, 100 - x, y, 100 - y) / 42, 0, 1);
  return { x, y, strength: 0.28 + rim * 0.4 };
}

/**
 * Highlight position derived from an existing swipe offset. It changes only
 * gradient variables; the swipe layer keeps sole ownership of transform.
 */
export function swipeGlint(
  offsetX: number,
  offsetY: number,
  width = 360,
  height = 60,
): GlassGlint {
  const dx = clamp(offsetX / Math.max(1, width), -1, 1);
  const dy = clamp(offsetY / Math.max(1, height), -1, 1);
  return {
    x: clamp(50 - dx * 34, 14, 86),
    y: clamp(20 + dy * 14, 8, 40),
    strength: 0.3 + Math.min(0.36, Math.hypot(dx, dy) * 0.5),
  };
}

export function applyGlassGlint(element: HTMLElement, glint: GlassGlint) {
  element.style.setProperty("--glass-glint-x", `${glint.x.toFixed(2)}%`);
  element.style.setProperty("--glass-glint-y", `${glint.y.toFixed(2)}%`);
  element.style.setProperty(
    "--glass-glint-strength",
    glint.strength.toFixed(3),
  );
}

export function resetGlassGlint(element: HTMLElement) {
  applyGlassGlint(element, { x: 50, y: 22, strength: 0.3 });
}

export interface GlassCapabilities {
  pointer: boolean;
  reducedMotion: boolean;
  reducedTransparency: boolean;
  /**
   * Syntax support only. This does not prove that a backdrop filter renders
   * pixels on this engine, so callers must keep their CSS fallback.
   */
  backdropSyntax: boolean;
}

const media = (query: string) =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(query).matches;

export function glassCapabilities(): GlassCapabilities {
  return {
    pointer:
      typeof window !== "undefined" &&
      typeof window.PointerEvent === "function",
    reducedMotion: media("(prefers-reduced-motion: reduce)"),
    reducedTransparency: media("(prefers-reduced-transparency: reduce)"),
    backdropSyntax:
      typeof CSS !== "undefined" &&
      (CSS.supports("backdrop-filter", "blur(1px)") ||
        CSS.supports("-webkit-backdrop-filter", "blur(1px)")),
  };
}
