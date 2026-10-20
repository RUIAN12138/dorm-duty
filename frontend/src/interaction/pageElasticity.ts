import { rubberBand } from "./gestures";
export function pagePull(distance: number, height: number) {
  const free = Math.min(56, Math.max(18, height * 0.075));
  const travel = Math.abs(distance) * 0.82;
  return (
    Math.sign(distance) *
    (travel <= free ? travel : free + rubberBand(travel - free, 40))
  );
}
export function pagePullInput(pull: number, height: number) {
  const free = Math.min(56, Math.max(18, height * 0.075));
  const travel = Math.abs(pull);
  const tail = Math.min(39.99, Math.max(0, travel - free));
  return (
    (Math.sign(pull) *
      (travel <= free ? travel : free + (40 * tail) / (40 - tail))) /
    0.82
  );
}
export function pageSpringStep(position: number, velocity: number, dt: number) {
  const step = Math.min(1 / 60, Math.max(0, dt));
  const speed = velocity + (-190 * position - 19 * velocity) * step;
  return { position: position + speed * step, velocity: speed };
}
