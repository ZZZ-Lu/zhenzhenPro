import React, { useEffect, useRef, useState } from "react";

interface LazyTrackWrapperProps {
  children: React.ReactNode;
  id: string;
  className?: string;
  loadMarginPercent?: string;
}

export const LazyTrackWrapper: React.FC<LazyTrackWrapperProps> = ({
  children,
  id,
  className = "",
  loadMarginPercent = "100%",
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !window.IntersectionObserver) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsVisible(entry.isIntersecting);
        });
      },
      {
        root: el.closest("#tracks-scroll-viewport"),
        rootMargin: loadMarginPercent,
      }
    );

    observer.observe(el);
    return () => observer.unobserve(el);
  }, [loadMarginPercent]);

  return (
    <div
      ref={containerRef}
      id={`track-wrapper-${id}`}
      className={`w-full h-full relative ${className}`}
    >
      {isVisible ? children : <div className="w-full h-full animate-pulse bg-slate-900/50 rounded-2xl" />}
    </div>
  );
};
