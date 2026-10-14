import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { getCachedBlobUrl } from "../utils/blobUrlCache";

interface SmartImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string | Blob;
  asyncDecode?: boolean;
}

export const SmartImage = forwardRef<HTMLImageElement, SmartImageProps>(
  ({ src, className = "", onLoad, asyncDecode = true, ...props }, ref) => {
    const internalRef = useRef<HTMLImageElement | null>(null);
    useImperativeHandle(ref, () => internalRef.current!);

    const displayUrl = getCachedBlobUrl(src);

    const [isLoaded, setIsLoaded] = useState<boolean>(() => {
      if (displayUrl) {
        if (typeof window !== "undefined") {
          const img = new Image();
          img.src = displayUrl;
          if (img.complete && img.naturalWidth > 0) return true;
        }
      }
      return false;
    });

    const prevDisplayUrlRef = useRef<string>(displayUrl);

    useEffect(() => {
      // Only reset isLoaded if displayUrl actually changed
      if (prevDisplayUrlRef.current !== displayUrl) {
        prevDisplayUrlRef.current = displayUrl;
        setIsLoaded(false);
      }

      if (internalRef.current && internalRef.current.complete && internalRef.current.naturalWidth > 0) {
        setIsLoaded(true);
      }
    }, [displayUrl]);

    if (!displayUrl) return null;

    return (
      <img
        ref={internalRef}
        src={displayUrl}
        decoding="async"
        loading="eager"
        onLoad={(e) => {
          setIsLoaded(true);
          if (onLoad) onLoad(e);
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
        className={`transition-opacity duration-200 ease-out ${
          isLoaded ? "opacity-100" : "opacity-0"
        } ${className}`}
        {...props}
      />
    );
  }
);

SmartImage.displayName = "SmartImage";




