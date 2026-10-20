export function bannerSwipe(up: number) {
  const progress = Math.max(0, Math.min(1, up / 80));
  return { scale: 1 - progress * 0.88, opacity: Math.pow(1 - progress, 1.4) };
}
export function dismissBanner(up: number, velocity: number) {
  return up >= 18 || (up >= 6 && velocity < -0.22);
}
