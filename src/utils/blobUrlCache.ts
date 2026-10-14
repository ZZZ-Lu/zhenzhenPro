const blobUrlCache = new WeakMap<Blob, string>();

/**
 * Returns a stable Object URL for a Blob object.
 * Reuses the same Object URL if the Blob instance hasn't changed,
 * preventing browser image flickering / re-decoding on re-renders.
 */
export function getCachedBlobUrl(src: string | Blob | null | undefined): string {
  if (!src) return "";
  if (typeof src === "string") return src;
  if (src instanceof Blob) {
    let existing = blobUrlCache.get(src);
    if (!existing) {
      existing = URL.createObjectURL(src);
      blobUrlCache.set(src, existing);
    }
    return existing;
  }
  return String(src);
}
