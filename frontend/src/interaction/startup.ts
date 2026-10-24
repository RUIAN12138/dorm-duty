export type StartupStatus =
  | "initializing"
  | "verifying"
  | "authenticated"
  | "unauthenticated"
  | "recovery-failed";
// Independent mathematical Lissajous trajectory; no upstream source copied.
export function startupOrbit(t: number, phase = 0) {
  return { x: Math.sin(3 * t + phase) * 62, y: Math.sin(2 * t + phase) * 30 };
}
