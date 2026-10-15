// Horizontal intent keeps vertical scrolling and ordinary taps available.
export function createTaskSwipe(
  offset: (value: number, dragging: boolean) => void,
  step: (direction: -1 | 1) => void,
) {
  let pointer: number | null = null;
  let startX = 0,
    startY = 0,
    horizontal = false;
  let target: HTMLElement | null = null;
  let suppressUntil = 0;
  function cancel() {
    const id = pointer;
    pointer = null;
    if (id !== null && target?.hasPointerCapture(id))
      target.releasePointerCapture(id);
    target = null;
    horizontal = false;
    offset(0, false);
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
      if (!horizontal) {
        if (Math.abs(y) > 8 && Math.abs(y) >= Math.abs(x)) {
          cancel();
          return;
        }
        if (Math.abs(x) < 8 || Math.abs(x) <= Math.abs(y) * 1.2) return;
        horizontal = true;
        target?.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      suppressUntil = Date.now() + 350;
      offset(Math.max(-20, Math.min(20, x * 0.18)), true);
    },
    up(event: PointerEvent) {
      if (event.pointerId !== pointer) return;
      const x = event.clientX - startX;
      const commit = horizontal && Math.abs(x) >= 48;
      if (horizontal) suppressUntil = Date.now() + 350;
      cancel();
      if (commit) step(x < 0 ? 1 : -1);
    },
    cancel,
    suppressesClick(event: MouseEvent) {
      return event.detail !== 0 && Date.now() < suppressUntil;
    },
  };
}
