/**
 * LRU Cache for Image Blobs and ObjectURLs to prevent browser OOM
 */
class ImageLruCache {
  private capacity: number;
  private cache: Map<string, { url: string; blob?: Blob; timestamp: number }>;

  constructor(capacity: number = 75) {
    this.capacity = capacity;
    this.cache = new Map();
  }

  get(key: string): string | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;
    // Refresh timestamp on access
    item.timestamp = Date.now();
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.url;
  }

  set(key: string, url: string, blob?: Blob) {
    if (this.cache.has(key)) {
      const existing = this.cache.get(key)!;
      if (existing.url && existing.url.startsWith("blob:") && existing.url !== url) {
        try {
          URL.revokeObjectURL(existing.url);
        } catch (e) {
          // ignore
        }
      }
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      // Evict oldest
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        const oldest = this.cache.get(oldestKey);
        if (oldest && oldest.url && oldest.url.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(oldest.url);
          } catch (e) {
            // ignore
          }
        }
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { url, blob, timestamp: Date.now() });
  }

  remove(key: string) {
    const item = this.cache.get(key);
    if (item && item.url && item.url.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(item.url);
      } catch (e) {
        // ignore
      }
    }
    this.cache.delete(key);
  }

  clear() {
    for (const [_, item] of this.cache.entries()) {
      if (item.url && item.url.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(item.url);
        } catch (e) {
          // ignore
        }
      }
    }
    this.cache.clear();
  }
}

export const globalImageLruCache = new ImageLruCache(80);
