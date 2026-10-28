import { horizontalIntent } from "./gestures";
// Horizontal intent keeps vertical scrolling and ordinary taps available.
export function createTaskSwipe(
  offset: (value: number, dragging: boolean, axis?: "horizontal" | "vertical") => void,
  step: (direction: -1 | 1) => void,
  vertical?: { enabled: () => boolean; step: (direction: -1 | 1) => void },
) {
  let pointer: number | null = null;
  let startX = 0,
    startY = 0,
    direction: "horizontal" | "vertical" | null = null;
  let target: HTMLElement | null = null;
  let suppressUntil = 0;
  function cancel(event?: Event) {
    if (event && "pointerId" in event && event.pointerId !== pointer) return;
    // Touch starts with implicit capture on the date/title child. Transferring
    // it to the gesture surface emits a bubbling loss from that old child.
    if (
      event?.type === "lostpointercapture" &&
      pointer !== null &&
      target?.hasPointerCapture(pointer)
    )
      return;
    const id = pointer;
    pointer = null;
    if (id !== null && target?.hasPointerCapture(id))
      target.releasePointerCapture(id);
    target = null;
    const previous = direction;
    direction = null;
    offset(0, false, previous || "horizontal");
  }
  return {
    down(event: PointerEvent) {
      if (pointer !== null || !event.isPrimary || event.button !== 0) return;
      pointer = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      target = event.currentTarget as HTMLElement;
    },
    move(event: PointerEvent) {
      if (event.pointerId !== pointer) return;
      const x = event.clientX - startX,
        y = event.clientY - startY;
      if (!direction) {
        const intent = horizontalIntent(x, y);
        if (intent === "vertical" && !vertical?.enabled()) { cancel(); return; }
        if (intent === "pending") return;
        direction = intent;
        target?.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      suppressUntil = Date.now() + 350;
      const delta = direction === "vertical" ? y : x;
      offset(Math.max(-20, Math.min(20, delta * 0.18)), true, direction);
    },
    up(event: PointerEvent) {
      if (event.pointerId !== pointer) return;
      const axis = direction;
      const delta = axis === "vertical" ? event.clientY - startY : event.clientX - startX;
      const commit = axis && Math.abs(delta) >= 48;
      if (axis) suppressUntil = Date.now() + 350;
      cancel();
      if (commit && axis === "vertical") vertical?.step(delta < 0 ? 1 : -1);
      else if (commit) step(delta < 0 ? 1 : -1);
    },
    cancel,
    suppressesClick(event: MouseEvent) {
      return event.detail !== 0 && Date.now() < suppressUntil;
    },
  };
}
