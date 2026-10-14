/**
 * Shared IntersectionObserver manager for Card Virtualization (Shared Observer Pool)
 * Configured with 1.5 screen viewports margin vertically and horizontally,
 * and explicitly targeting the scrollable container root for 100% reliable trigger.
 */

type VisibilityCallback = (isIntersecting: boolean) => void;

class SharedCardObserver {
  private observers = new Map<Element | null, IntersectionObserver>();
  private callbacks = new Map<Element, VisibilityCallback>();

  constructor() {
    // Lazy initialize on first observe
  }

  private getObserver(rootContainer: Element | null): IntersectionObserver {
    if (!this.observers.has(rootContainer)) {
      const vh = typeof window !== "undefined" ? window.innerHeight || 800 : 800;
      const vw = typeof window !== "undefined" ? window.innerWidth || 1200 : 1200;
      // 1.5 screen heights & widths buffer for seamless pre-loading
      const marginVertical = Math.round(vh * 1.5);
      const marginHorizontal = Math.round(vw * 1.5);

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const cb = this.callbacks.get(entry.target);
            if (cb) {
              // Direct callback without rAF frame delay for instant pre-loading response
              cb(entry.isIntersecting);
            }
          });
        },
        {
          root: rootContainer, // explicitly bind to the scrollable container or null for viewport
          rootMargin: `${marginVertical}px ${marginHorizontal}px ${marginVertical}px ${marginHorizontal}px`,
          threshold: 0, // trigger as soon as any part enters the 1.5x margin buffer
        }
      );

      this.observers.set(rootContainer, observer);
    }
    return this.observers.get(rootContainer)!;
  }

  public observe(element: Element, callback: VisibilityCallback) {
    this.callbacks.set(element, callback);

    if (typeof window === "undefined" || !window.IntersectionObserver) {
      callback(true);
      return;
    }

    // Find closest scrollable ancestor (.overflow-y-auto / .overflow-auto)
    const rootContainer = element.closest(".overflow-y-auto") || element.closest(".overflow-auto") || null;

    const observer = this.getObserver(rootContainer);
    observer.observe(element);
  }

  public unobserve(element: Element) {
    this.callbacks.delete(element);
    // Unobserve from all stored observers to be safe
    this.observers.forEach((observer) => {
      try {
        observer.unobserve(element);
      } catch (e) {}
    });
  }
}

export const sharedCardObserver = new SharedCardObserver();
