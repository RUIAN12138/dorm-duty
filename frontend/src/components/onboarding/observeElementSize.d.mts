type ResizeEnvironment = Pick<Window, 'addEventListener' | 'removeEventListener'> & {
  ResizeObserver?: typeof ResizeObserver;
};

export function observeElementSize(
  element: Element,
  callback: () => void,
  environment: ResizeEnvironment,
): () => void;
