import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { getCachedBlobUrl } from "../utils/blobUrlCache";

// Display URLs whose bytes are already decoded in this session. Remounting one
// of these (e.g. scrolling back to an already-seen column) must be instant, so
// it skips the reveal fade entirely.
const decodedUrls = new Set<string>();

interface SmartImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string | Blob;
  asyncDecode?: boolean;
}

export const SmartImage = forwardRef<HTMLImageElement, SmartImageProps>(
  ({ src, className = "", onLoad, onAnimationEnd, asyncDecode = true, loading = "lazy", style, ...props }, ref) => {
    const internalRef = useRef<HTMLImageElement | null>(null);
    useImperativeHandle(ref, () => internalRef.current!);

    const displayUrl = getCachedBlobUrl(src);

    // Deliberately no `new Image()` probe here anymore: it created a second
    // Image object and kicked off a duplicate decode of the same source on
    // every mount, which is costly when a board mounts many images at once.
    // `<img onLoad>` plus the completeness check in the effect below cover the
    // same "already cached" case.
    //
    // `loaded` drives visibility. `reveal` is armed only when this mount really
    // waited for the bytes: an image already decoded in this session starts out
    // `loaded` with `reveal` still false, so scrolling back to it stays instant
    // instead of replaying the fade. The reveal itself is a keyframe animation
    // (see `.image-reveal` in index.css) because a class-based transition would
    // be cancelled by the `transition-transform` utility the card hover styles
    // put on the very same element.
    const [imgState, setImgState] = useState(() => ({
      loaded: displayUrl ? decodedUrls.has(displayUrl) : false,
      reveal: false,
    }));

    const markLoaded = () => {
      setImgState((s) => (s.loaded ? s : { loaded: true, reveal: true }));
    };

    const prevDisplayUrlRef = useRef<string>(displayUrl);

    useEffect(() => {
      // Only reset state if displayUrl actually changed
      if (prevDisplayUrlRef.current !== displayUrl) {
        prevDisplayUrlRef.current = displayUrl;
        setImgState({
          loaded: displayUrl ? decodedUrls.has(displayUrl) : false,
          reveal: false,
        });
      }

      if (internalRef.current && internalRef.current.complete && internalRef.current.naturalWidth > 0) {
        markLoaded();
      }
    }, [displayUrl]);

    if (!displayUrl) return null;

    return (
      <img
        ref={internalRef}
        src={displayUrl}
        decoding="async"
        loading={loading}
        onLoad={(e) => {
          if (displayUrl) decodedUrls.add(displayUrl);
          markLoaded();
          if (onLoad) onLoad(e);
        }}
        onAnimationEnd={(e) => {
          // Release the reveal animation as soon as it has played: keeping it
          // attached (with `fill-mode: both`) pins a composited layer to every
          // revealed image for the rest of the session, which measurably costs
          // frames while a board with hundreds of images is being scrolled.
          setImgState((s) => (s.reveal ? { loaded: true, reveal: false } : s));
          if (onAnimationEnd) onAnimationEnd(e);
        }}
        onContextMenu={(e) => {
          const isDev =
            typeof window !== "undefined" &&
            (window.location.hostname.includes("-dev-") ||
              window.location.hostname.includes("localhost") ||
              window.location.hostname.includes("127.0.0.1"));
          if (!isDev) {
            e.preventDefault();
          }
          if (props.onContextMenu) {
            props.onContextMenu(e);
          }
        }}
        className={`${imgState.reveal ? "image-reveal " : ""}${className}`}
        style={{ opacity: imgState.loaded ? 1 : 0, ...style }}
        {...props}
      />
    );
  }
);

SmartImage.displayName = "SmartImage";
