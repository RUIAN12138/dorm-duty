import { animate, useMotionValue } from "motion-v";
import { motionAllowed } from "./motion";
import { chatMotion } from "./chatMotion";

export interface TravelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
export type TravelOutcome = "done" | "cancelled";
type Direction = "open" | "close";
type Geometry = { x: number; y: number; scale: number };

interface TravelOptions {
  ball: () => HTMLElement | undefined;
  visual: () => HTMLElement | undefined;
  onReveal?: (value: number) => void;
}

// The visible ball is the only element this controller writes. Base geometry
// is measured on mount / viewport or endpoint changes; per-frame work reads the
// persistent MotionValues and writes one transform, never layout.
export function createChatTravel({ ball, visual, onReveal }: TravelOptions) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const reveal = useMotionValue(0);

  const base = { cx: 0, cy: 0, width: 0, height: 0 };
  const visualOffset = { x: 0, y: 0 };
  const visualScale = { x: 1, y: 1 };
  let measured = false;
  let animating: Direction | null = null;
  let lastDirection: Direction = "open";
  let destination: (() => TravelRect | null) | undefined;
  let pending: {
    resolve: (outcome: TravelOutcome) => void;
    generation: number;
  } | null = null;
  let flightGeneration = 0;
  let runGeneration = 0;
  let destroyed = false;

  function paint() {
    const el = ball();
    if (!el) return;
    el.style.transform = `translate3d(${x.get()}px,${y.get()}px,0) scale(${scale.get()})`;
  }
  function notifyReveal() {
    onReveal?.(reveal.get());
  }
  function jump(geometry: Geometry, revealTo: number) {
    x.jump(geometry.x);
    y.jump(geometry.y);
    scale.jump(geometry.scale);
    reveal.jump(revealTo);
    paint();
    notifyReveal();
  }
  function settlePending(outcome: TravelOutcome) {
    const current = pending;
    pending = null;
    current?.resolve(outcome);
  }
  function stopValues() {
    x.stop();
    y.stop();
    scale.stop();
    reveal.stop();
  }

  /**
   * Cache the ball's untransformed box and the visual child's offset/scale.
   * Inverting the live transform makes this safe to call while travelling.
   * Callers invoke it on mount and on viewport/endpoint changes only.
   */
  function measure() {
    const el = ball();
    if (!el) return false;
    const part = visual() || el;
    const matrix =
      typeof getComputedStyle === "function"
        ? getComputedStyle(el).transform
        : "none";
    let tx = 0,
      ty = 0,
      currentScale = 1;
    if (matrix && matrix !== "none") {
      const parsed = new DOMMatrixReadOnly(matrix);
      tx = parsed.e;
      ty = parsed.f;
      currentScale = Math.hypot(parsed.a, parsed.b) || 1;
    }
    const rect = el.getBoundingClientRect();
    const partRect = part.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const safeScale = currentScale || 1;
    base.width = rect.width / safeScale;
    base.height = rect.height / safeScale;
    base.cx = rect.left + rect.width / 2 - tx;
    base.cy = rect.top + rect.height / 2 - ty;
    visualOffset.x =
      (partRect.left + partRect.width / 2 - (rect.left + rect.width / 2)) /
      safeScale;
    visualOffset.y =
      (partRect.top + partRect.height / 2 - (rect.top + rect.height / 2)) /
      safeScale;
    visualScale.x = partRect.width / rect.width || 1;
    visualScale.y = partRect.height / rect.height || 1;
    measured = true;
    return true;
  }

  function geometryFor(rect: TravelRect | null): Geometry | null {
    if (!rect || !measured || !base.width || !visualScale.x) return null;
    if (!rect.width || !rect.height) return null;
    const nextScale = rect.width / (base.width * visualScale.x);
    return {
      x: rect.left + rect.width / 2 - base.cx - visualOffset.x * nextScale,
      y: rect.top + rect.height / 2 - base.cy - visualOffset.y * nextScale,
      scale: nextScale,
    };
  }

  function startRun(geometry: Geometry, revealTo: number, instant: boolean) {
    const run = ++runGeneration;
    lastDirection = revealTo > 0.5 ? "open" : "close";
    if (instant || !motionAllowed()) {
      jump(geometry, revealTo);
      completeRun(run);
      return;
    }
    const spring =
      lastDirection === "open" ? chatMotion.expand : chatMotion.collapse;
    // Read velocity before stopping: reversing or retargeting continues in the
    // direction and speed the ball already had instead of restarting at rest.
    const vx = x.getVelocity();
    const vy = y.getVelocity();
    const vs = scale.getVelocity();
    const vr = reveal.getVelocity();
    // Capture first, then hand the channels to the new spring. Starting the
    // new animation replaces the old controls on each MotionValue.
    x.stop();
    y.stop();
    scale.stop();
    reveal.stop();
    const animations = [
      // Rest tolerances use each channel's own units. Sub-pixel precision is
      // sufficient for position; treating pixels like a 0–1 opacity value
      // keeps the invisible spring tail alive and delays the focus handoff.
      animate(x, geometry.x, {
        ...spring,
        restDelta: 0.35,
        restSpeed: 8,
        velocity: vx,
      }),
      animate(y, geometry.y, {
        ...spring,
        restDelta: 0.35,
        restSpeed: 8,
        velocity: vy,
      }),
      animate(scale, geometry.scale, {
        ...spring,
        restDelta: 0.002,
        restSpeed: 0.04,
        velocity: vs,
      }),
      animate(reveal, revealTo, {
        ...spring,
        restDelta: 0.003,
        restSpeed: 0.04,
        velocity: vr,
      }),
    ];
    Promise.all(
      animations.map((control) =>
        control.then(
          () => {},
          () => {},
        ),
      ),
    ).then(() => completeRun(run));
  }

  function completeRun(run: number) {
    if (destroyed || run !== runGeneration) return;
    animating = null;
    settlePending("done");
  }

  function begin(
    direction: Direction,
    geometry: Geometry | null,
    revealTo: number,
    instant: boolean,
  ): Promise<TravelOutcome> {
    flightGeneration++;
    runGeneration++;
    settlePending("cancelled");
    animating = direction;
    const generation = flightGeneration;
    const result = new Promise<TravelOutcome>((resolve) => {
      pending = { resolve, generation };
    });
    if (!geometry) {
      animating = null;
      jump({ x: x.get(), y: y.get(), scale: scale.get() }, revealTo);
      settlePending("done");
      return result;
    }
    startRun(geometry, revealTo, instant);
    if (!pending) return result;
    // A synchronous reduced-motion run may already have resolved.
    if (generation !== flightGeneration) return result;
    return result;
  }

  /**
   * Open towards the edited layout. `fromClosed` jumps to the source ball
   * synchronously so the first press responds before any API work; a reopen
   * that interrupts closing keeps the current pose and velocity.
   */
  function open(
    origin: TravelRect | null,
    options: { fromClosed?: boolean; instant?: boolean } = {},
  ) {
    const fromClosed = !!options.fromClosed;
    if (fromClosed) {
      // The fresh DOM node has no transform yet; park the persistent values at
      // rest before measuring so the base box is not read through stale values.
      runGeneration++;
      x.stop();
      y.stop();
      scale.stop();
      x.jump(0);
      y.jump(0);
      scale.jump(1);
      reveal.jump(0);
      paint();
    }
    measure();
    if (fromClosed) {
      const source = geometryFor(origin);
      if (source) {
        x.jump(source.x);
        y.jump(source.y);
        scale.jump(source.scale);
        paint();
      }
    }
    return begin(
      "open",
      { x: 0, y: 0, scale: 1 },
      1,
      !!options.instant || !motionAllowed(),
    );
  }

  function close(
    getDestination: () => TravelRect | null,
    options: { instant?: boolean } = {},
  ) {
    destination = getDestination;
    // One measurement at the endpoint change; layout reads are never repeated
    // inside the spring's per-frame render.
    measure();
    const target = geometryFor(getDestination());
    return begin("close", target, 0, !!options.instant || !motionAllowed());
  }

  /**
   * Endpoint/base refresh for visualViewport changes. During the close spring
   * this retargets with the live velocity; after it settles the same visible
   * ball is snapped to the source's new layout so the handoff stays aligned.
   */
  function refreshDestination() {
    if (!destination) return;
    measure();
    const target = geometryFor(destination());
    if (!target) return;
    if (animating === "close" && pending) {
      startRun(target, 0, !motionAllowed());
      return;
    }
    if (lastDirection === "close") {
      runGeneration++;
      stopValues();
      jump(target, 0);
    }
  }

  function snapClosed(targetRect: TravelRect | null) {
    if (!targetRect) return;
    measure();
    const target = geometryFor(targetRect);
    if (!target) return;
    runGeneration++;
    stopValues();
    jump(target, 0);
  }

  function complete(direction: Direction) {
    runGeneration++;
    flightGeneration++;
    stopValues();
    if (direction === "close" && destination) {
      measure();
      const target = geometryFor(destination());
      if (target) jump(target, 0);
    } else {
      jump({ x: 0, y: 0, scale: 1 }, 1);
    }
    settlePending("cancelled");
    animating = null;
  }

  function cancel() {
    runGeneration++;
    flightGeneration++;
    stopValues();
    settlePending("cancelled");
    animating = null;
  }

  function destroy() {
    cancel();
    destroyed = true;
    unbind();
    x.destroy();
    y.destroy();
    scale.destroy();
    reveal.destroy();
  }

  const unbind = (() => {
    const offX = x.on("change", paint);
    const offY = y.on("change", paint);
    const offScale = scale.on("change", paint);
    const offReveal = reveal.on("change", (value) => onReveal?.(value));
    return () => {
      offX();
      offY();
      offScale();
      offReveal();
    };
  })();

  return {
    open,
    close,
    refreshDestination,
    snapClosed,
    complete,
    measure,
    cancel,
    destroy,
    reveal: () => reveal.get(),
    isAnimating: () => animating !== null,
    state: () => ({
      x: x.get(),
      y: y.get(),
      scale: scale.get(),
      velocity: {
        x: x.getVelocity(),
        y: y.getVelocity(),
        scale: scale.getVelocity(),
      },
    }),
  };
}
