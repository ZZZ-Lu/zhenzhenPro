import React, {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { getCachedBlobUrl } from "../utils/blobUrlCache";
import { useGatedImageUrl } from "../utils/imageLoadGate";

// ---------------------------------------------------------------------------
// 直接渲染的图片元素（已移除自定义优化）。
//
// 之前：维护「本会话已解码 URL」集合以跳过揭幕动画，并用 reveal 状态机接管淡入
// 动画的生命周期（动画结束即摘除，避免占用合成层）。
// 现在：直接挂载 <img>，加载完成即显示；不再维护已解码集合，也不做动画接管。
//
// 保留 getCachedBlobUrl：它不只是缓存，更是全应用「同一 Blob 对应同一 URL」的
// 身份契约——多处用 data-url / data-lightbox-wrapper 做元素查找与比对，去掉会破坏
// 灯箱定位、跳转到指定图与拖拽等功能，因此按「只保留功能」的原则原样保留。
// ---------------------------------------------------------------------------

interface SmartImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string | Blob;
  asyncDecode?: boolean;
}

export const SmartImage = forwardRef<HTMLImageElement, SmartImageProps>(
  (
    {
      src,
      className = "",
      onLoad,
      onAnimationEnd,
      asyncDecode: _asyncDecode,
      loading = "eager",
      style,
      ...props
    },
    ref,
  ) => {
    const internalRef = useRef<HTMLImageElement | null>(null);
    useImperativeHandle(ref, () => internalRef.current!);

    const displayUrl = getCachedBlobUrl(src);

    // 图片加载闸门：只有被放行的图片才挂上 src，放行速率受每帧/每秒配额约束（滚动期收紧、
    // 停下后放宽补齐）；同时已加载张数超上限时，最远优先释放、视口内的永不释放。
    // 见 src/utils/imageLoadGate.ts。放行前 src 为空，图片保持透明，露出容器底色。
    const gatedUrl = useGatedImageUrl(displayUrl || null, internalRef);

    const [loaded, setLoaded] = useState(false);
    const prevDisplayUrlRef = useRef<string>(displayUrl);

    useEffect(() => {
      if (prevDisplayUrlRef.current !== displayUrl) {
        prevDisplayUrlRef.current = displayUrl;
        setLoaded(false);
      }
      const el = internalRef.current;
      if (el && el.complete && el.naturalWidth > 0) setLoaded(true);
    }, [displayUrl]);

    // 被闸门释放（src 被置空）时回到未加载态，避免残留一个透明的“已加载”空图
    useEffect(() => {
      if (!gatedUrl) setLoaded(false);
    }, [gatedUrl]);

    if (!displayUrl) return null;

    return (
      <img
        ref={internalRef}
        src={gatedUrl ?? undefined}
        decoding="async"
        loading={loading}
        onLoad={(e) => {
          setLoaded(true);
          if (onLoad) onLoad(e);
        }}
        onAnimationEnd={onAnimationEnd}
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
        className={className}
        style={{ opacity: loaded ? 1 : 0, ...style }}
        {...props}
      />
    );
  },
);

SmartImage.displayName = "SmartImage";