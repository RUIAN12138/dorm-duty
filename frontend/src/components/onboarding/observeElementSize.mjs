export function observeElementSize(element, callback, environment) {
  const Observer = environment.ResizeObserver;
  if (typeof Observer === 'function') {
    const observer = new Observer(callback);
    observer.observe(element);
    return () => observer.disconnect();
  }

  environment.addEventListener('resize', callback);
  return () => environment.removeEventListener('resize', callback);
}
