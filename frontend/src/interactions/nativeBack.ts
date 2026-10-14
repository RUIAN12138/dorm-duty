declare global {
  interface Window {
    DormNativeBack?: () => boolean;
  }
}
const handlers: (() => void)[] = [];
export function registerNativeBack(close: () => void) {
  handlers.push(close);
  return () => {
    const index = handlers.lastIndexOf(close);
    if (index !== -1) handlers.splice(index, 1);
  };
}
export function handleNativeBack(): boolean {
  const close = handlers.at(-1);
  if (!close) return false;
  close();
  return true;
}
export function installNativeBack() {
  window.DormNativeBack = handleNativeBack;
  return () => {
    if (window.DormNativeBack === handleNativeBack)
      delete window.DormNativeBack;
  };
}
