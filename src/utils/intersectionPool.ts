type ObserverCallback = (isIntersecting: boolean, entry: IntersectionObserverEntry) => void;

interface ObserverPoolEntry {
  observer: IntersectionObserver;
  callbacks: WeakMap<Element, ObserverCallback>;
  count: number;
}

const pool = new Map<string, ObserverPoolEntry>();

function getPoolKey(
  root: Element | Document | null,
  rootMargin: string,
  threshold: number | number[]
): string {
  const rootId = root ? (root as any).__obsId || ((root as any).__obsId = Math.random().toString(36).slice(2)) : "window";
  const threshStr = Array.isArray(threshold) ? threshold.join(",") : threshold.toString();
  return `${rootId}__${rootMargin}__${threshStr}`;
}

/**
 * Shared IntersectionObserver pool to observe elements with minimal overhead.
 * Avoids creating hundreds of individual IntersectionObserver instances.
 */
export function observeIntersection(
  element: Element,
  callback: ObserverCallback,
  options?: {
    root?: Element | Document | null;
    rootMargin?: string;
    threshold?: number | number[];
  }
): () => void {
  if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
    // Fallback: immediately treat as visible
    callback(true, null as any);
    return () => {};
  }

  const root =
    options?.root !== undefined && options.root !== null
      ? options.root
      : (element.closest("#tracks-scroll-viewport") ||
          (typeof document !== "undefined"
            ? document.getElementById("tracks-scroll-viewport")
            : null) ||
          null);
  const rootMargin = options?.rootMargin || "1000px 2400px 1000px 2400px";
  const threshold = options?.threshold ?? 0;
  const key = getPoolKey(root, rootMargin, threshold);

  let entry = pool.get(key);
  if (!entry) {
    const callbacks = new WeakMap<Element, ObserverCallback>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((change) => {
          const cb = callbacks.get(change.target);
          if (cb) {
            cb(change.isIntersecting, change);
          }
        });
      },
      {
        root: root as Element | null,
        rootMargin,
        threshold,
      }
    );
    entry = { observer, callbacks, count: 0 };
    pool.set(key, entry);
  }

  entry.callbacks.set(element, callback);
  entry.observer.observe(element);
  entry.count++;

  return () => {
    if (!entry) return;
    entry.callbacks.delete(element);
    entry.observer.unobserve(element);
    entry.count--;

    if (entry.count <= 0) {
      entry.observer.disconnect();
      pool.delete(key);
    }
  };
}
