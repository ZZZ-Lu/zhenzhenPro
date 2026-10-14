import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { flushSync } from "react-dom";
import {
  getIndexedDBItem,
  setIndexedDBItem,
  base64ToBlob,
  blobToBase64,
  requestStoragePersistence,
  createThumbnailToBase64,
} from "./utils/db";
import { SmartImage } from "./components/SmartImage";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Play,
  Layers,
  Send,
  Copy,
  Check,
  Eye,
  EyeOff,
  Database,
  Cpu,
  FileJson,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  Sliders,
  Terminal,
  Sparkles,
  Sparkle,
  Link2,
  Lock,
  ChevronDown,
  Info,
  Image as ImageIcon,
  Plus,
  Trash2,
  Eraser,
  Edit3,
  Undo,
  History,
  Settings,
  Layout,
  Library,
  Maximize2,
  CheckCircle,
  HelpCircle,
  ImagePlus,
  X,
  ExternalLink,
  ChevronLeft,
  ArrowLeftRight,
  Sun,
  Moon,
  Download,
  Globe,
  Laptop,
  ClipboardPaste,
  GripVertical,
  Star,
  GitCompare,
  AlignHorizontalJustifyCenter,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SharpStar } from "./components/SharpStar";
import {
  ApiConfig,
  ModelInfo,
  ChatMessage,
  DiagnosticSummary,
  ImageWorkspace,
  GenerationItem,
  ImageReference,
} from "./types";
import ImageLightbox from "./components/ImageLightbox";
import ImageCompareLightbox from "./components/ImageCompareLightbox";
import { LazyImageWrapper } from "./components/LazyImageWrapper";
import { TrackColumn } from "./components/TrackColumn";
import { VirtualTrackColumn } from "./components/VirtualTrackColumn";
import { GlobalReferencePanel } from "./components/GlobalReferencePanel";
import RichPromptEditor, { htmlToPrompt } from "./components/RichPromptEditor";
import { PerformanceMonitor } from "./components/PerformanceMonitor";
import NetworkDebugApp from "./network-debug/App";
import {
  setupNotifications,
  requestNotificationPermission,
  updateSystemStatus,
  sendDesktopNotification,
} from "./utils/notifications";

const playSound = (type: "success" | "error") => {
  try {
    const AudioContext =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === "success") {
      const playBell = (freq: number, startTime: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;

        const osc2 = ctx.createOscillator();
        osc2.type = "sine";
        osc2.frequency.value = freq * 2.01;
        const gain2 = ctx.createGain();

        osc.connect(gain);
        osc2.connect(gain2);
        gain.connect(ctx.destination);
        gain2.connect(ctx.destination);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.15, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);

        gain2.gain.setValueAtTime(0, startTime);
        gain2.gain.linearRampToValueAtTime(0.05, startTime + 0.01);
        gain2.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

        osc.start(startTime);
        osc2.start(startTime);
        osc.stop(startTime + 0.6);
        osc2.stop(startTime + 0.3);
      };

      // Apple-like quick glassy chime, lower pitch
      playBell(440.0, ctx.currentTime);
      playBell(659.25, ctx.currentTime + 0.08);
    } else {
      const playThud = (freq: number, startTime: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";

        osc.frequency.setValueAtTime(freq, startTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, startTime + 0.1);

        osc.connect(gain);
        gain.connect(ctx.destination);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.2, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);

        osc.start(startTime);
        osc.stop(startTime + 0.15);
      };

      // Apple-like soft double thud
      playThud(300, ctx.currentTime);
      playThud(250, ctx.currentTime + 0.1);
    }
  } catch (err) {
    console.error("Audio playback failed", err);
  }
};

/**
 * 版本日志 v1.7.0
 * 1. 更新版本号为 1.7.0，顶部 App Icon 升级为单星微光样式
 *
 * 版本日志 v1.6.5
 * 1. 修复了一些bug
 * 
 * 版本日志 v1.6.4
 * 1，第四次标记1.6版本，修改了气泡UI，增加跟随，尺寸变小等
 *
 * 版本日志 v1.6.3
 * 1，第三次标记1.6版本
 *
 * 版本日志 v1.6.2
 * 1，增加在输入框从剪贴板粘贴图片作为参考图的功能
 *
 * 版本日志 v1.6.1
 * 1，长按空格键触发全景视图时，在当前画板的可视页面中寻找最接近页面中心点的图像，该图像作为中心图成为全景视图开始的默认选项
 * 2，中心图的缩略图位置及其它缩略图位置根据画板相对位置动态计算，全景视图缩放更精准
 *
 * 版本日志 v1.6
 * 1，长按回车触发生成改为Ctrl+回车一起长按触发生成
 * 2，修改退出全景视图的逻辑，必须在滚动动画结束后才能退出
 * 3，优化图片显示，只有屏幕范围内的图片才会一直显示，其它的按需加载
 * 4，将nano-banana-pro-2k替换为nano-banana-pro，可选1k2k4k，添加nano-banana-2，可选1k2k4k
 * 5，修复单图全屏不能上下切换的bug
 * 6，将拖拽图设置为缩略图以节省性能
 * 7，加入复制配置和应用配置以及其它按钮的反馈toast
 * 8，优化了输入框流畅度
 * 9，修复了删除参考图引发的提示词多空行bug
 * 10，把参考图位于中心的删除键移到右上角
 * 11，加入防断电机制
 * 12，优化图片显示和页面滚动机制
 */

// debouncedSetItem helper for scroll positions and other high-frequency small updates
const debounceTimers: Record<string, any> = {};
export const debouncedSetItem = (key: string, value: string) => {
  if (debounceTimers[key]) {
    clearTimeout(debounceTimers[key]);
  }
  debounceTimers[key] = setTimeout(() => {
    setIndexedDBItem(key, value).catch((e) =>
      console.warn("Failed to backup to IndexedDB:", e),
    );
    delete debounceTimers[key];
  }, 100);
};

const getFilenameFromUrl = (url: string | Blob, id: string): string => {
  if (url instanceof Blob) return `reference_${id}.png`;
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const parts = pathname.split("/");
    const lastPart = parts[parts.length - 1];
    if (lastPart && lastPart.includes(".")) {
      return decodeURIComponent(lastPart);
    }
  } catch (e) {}
  return `参考图_${id}.png`;
};

const fetchWithRetry = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  try {
    return await fetch(input, init);
  } catch (err: any) {
    const isNetworkError =
      err &&
      err.message &&
      typeof err.message === "string" &&
      (err.message.toLowerCase().includes("failed to fetch") ||
        err.message.toLowerCase().includes("fetch failed") ||
        err.name === "TypeError");
    if (isNetworkError) {
      console.warn("Detected Failed to fetch error. Retrying 1 time...", err);
      await new Promise((resolve) => setTimeout(resolve, 300));
      return await fetch(input, init);
    }
    throw err;
  }
};

const convertImageUrlToBase64 = async (url: string): Promise<string> => {
  try {
    if (!url || typeof url !== "string") return url;
    if (url.startsWith("data:") || url.startsWith("blob:")) return url;

    const response = await fetchWithRetry(url, { mode: "cors" });
    if (!response.ok) return url;

    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve((reader.result as string) || url);
      };
      reader.onerror = () => {
        resolve(url);
      };
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("Failed to convert image to base64 cache:", err);
    return url;
  }
};

export const getAspectRatioParams = (
  size: string | undefined,
): { style: React.CSSProperties; imageClass: string } => {
  if (!size || size === "Auto") {
    return {
      style: { aspectRatio: "auto" },
      imageClass: "object-cover",
    };
  }
  const parts = size.split(":");
  if (parts.length === 2) {
    const w = parseFloat(parts[0]);
    const h = parseFloat(parts[1]);
    if (!isNaN(w) && !isNaN(h)) {
      return {
        style: { aspectRatio: `${w} / ${h}` },
        imageClass: "object-cover",
      };
    }
  }
  return {
    style: { aspectRatio: "auto" },
    imageClass: "object-cover",
  };
};

export const getAspectRatioValue = (
  size: string | undefined,
): { ratio: string; label: string; isWide: boolean } => {
  if (!size || size === "Auto") {
    return { ratio: "1 / 1", label: "Auto", isWide: true };
  }
  const parts = size.split(":");
  if (parts.length === 2) {
    const w = parseFloat(parts[0]);
    const h = parseFloat(parts[1]);
    if (!isNaN(w) && !isNaN(h)) {
      return { ratio: `${w} / ${h}`, label: size, isWide: w >= h };
    }
  }
  return { ratio: "1 / 1", label: "1:1", isWide: true };
};

const setCustomDragImage = (
  e: React.DragEvent,
  url: string,
  thumbUrl?: string,
) => {
  try {
    const targetNode = e.target as HTMLElement;
    let imgEl: HTMLImageElement | null = null;

    if (targetNode.tagName === "IMG") {
      imgEl = targetNode as HTMLImageElement;
    } else {
      imgEl = targetNode.querySelector("img");
    }

    let w = 150;
    let h = 150;

    if (imgEl && imgEl.naturalWidth && imgEl.naturalHeight) {
      const ratio = imgEl.naturalWidth / imgEl.naturalHeight;
      if (ratio > 1) {
        h = w / ratio;
      } else {
        w = h * ratio;
      }
    } else if (imgEl) {
      const rect = imgEl.getBoundingClientRect();
      const ratio = rect.width / rect.height || 1;
      if (ratio > 1) {
        h = w / ratio;
      } else {
        w = h * ratio;
      }
    }

    const dragGhost = document.createElement("div");
    dragGhost.style.position = "fixed";
    dragGhost.style.top = "-9999px";
    dragGhost.style.left = "-9999px";
    dragGhost.style.width = `${w}px`;
    dragGhost.style.height = `${h}px`;
    dragGhost.style.overflow = "hidden";
    dragGhost.style.pointerEvents = "none";
    dragGhost.style.zIndex = "-1000";
    dragGhost.style.opacity = "0.7";

    const img = document.createElement("img");
    img.src = thumbUrl || url;
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    img.referrerPolicy = "no-referrer";

    dragGhost.appendChild(img);
    document.body.appendChild(dragGhost);

    e.dataTransfer.setDragImage(dragGhost, w / 2, h / 2);

    setTimeout(() => {
      if (dragGhost.parentNode) {
        dragGhost.parentNode.removeChild(dragGhost);
      }
    }, 100);
  } catch (err) {
    console.warn("Failed to set custom drag image:", err);
  }
};

// Helper function to normalise base URL and build endpoint URLs
const getEndpointUrl = (baseUrl: string, endpoint: string): string => {
  let cleanedBase = baseUrl.trim();
  cleanedBase = cleanedBase.replace(/\/+$/, "");

  if (endpoint === "models") {
    if (cleanedBase.endsWith("/v1")) {
      return `${cleanedBase}/models`;
    }
    return `${cleanedBase}/v1/models`;
  } else if (endpoint === "chat") {
    if (cleanedBase.endsWith("/v1")) {
      return `${cleanedBase}/chat/completions`;
    }
    return `${cleanedBase}/v1/chat/completions`;
  } else if (endpoint === "images") {
    if (cleanedBase.endsWith("/v1")) {
      return `${cleanedBase}/images/generations`;
    }
    return `${cleanedBase}/v1/images/generations`;
  }
  return cleanedBase;
};

// Automatic heal and cleansing pipeline for loaded workspaces to ensure zero data-corruption crashes
const autoRepairWorkspaces = (raw: any[]): ImageWorkspace[] => {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item) => item && typeof item === "object")
    .map((ws: any, wsIndex: number) => {
      const repairedWs: ImageWorkspace = {
        id:
          typeof ws.id === "string" && ws.id
            ? ws.id
            : `ws-recovered-${Date.now()}-${wsIndex}-${Math.random()}`,
        name:
          typeof ws.name === "string" && ws.name
            ? ws.name
            : `生图列_修复${wsIndex + 1}`,
        imagePrompt: typeof ws.imagePrompt === "string" ? ws.imagePrompt : "",
        imageModel:
          typeof ws.imageModel === "string" ? ws.imageModel : "gpt-image-2-all",
        imageSize: typeof ws.imageSize === "string" ? ws.imageSize : "1:1",
        imageResolution:
          typeof ws.imageResolution === "string" ? ws.imageResolution : "1k",
        callFormat:
          typeof ws.callFormat === "string" ? ws.callFormat : "images",
        refImages: Array.isArray(ws.refImages) ? ws.refImages : [],
        includeUrlsInPrompt:
          typeof ws.includeUrlsInPrompt === "boolean"
            ? ws.includeUrlsInPrompt
            : true,
        includeUrlsInBody:
          typeof ws.includeUrlsInBody === "boolean"
            ? ws.includeUrlsInBody
            : true,
        generations: [],
        columnWidth:
          typeof ws.columnWidth === "string" ? ws.columnWidth : "narrow",
      };

      // Repair reference images
      repairedWs.refImages = repairedWs.refImages
        .map((img: any, idx: number) => {
          if (typeof img === "string") {
            return {
              id: `ref-${idx + 1}`,
              url: img,
              name: `参考图_${idx + 1}.png`,
            };
          }
          if (img && typeof img === "object") {
            return {
              id: typeof img.id === "string" ? img.id : `ref-${idx + 1}`,
              url:
                typeof img.url === "string" ||
                img.url instanceof Blob ||
                img.url instanceof File
                  ? img.url
                  : "",
              name:
                typeof img.name === "string"
                  ? img.name
                  : `参考图_${idx + 1}.png`,
              thumbnail:
                typeof img.thumbnail === "string" ? img.thumbnail : undefined,
            };
          }
          return null;
        })
        .filter((img) => img && img.url) as any;

      // Repair generation history lists
      if (Array.isArray(ws.generations)) {
        repairedWs.generations = ws.generations
          .filter((gen: any) => gen && typeof gen === "object")
          .map((gen: any, genIdx: number) => {
            const repairedGen: GenerationItem = {
              id:
                typeof gen.id === "string" && gen.id
                  ? gen.id
                  : `gen-recovered-${Date.now()}-${genIdx}-${Math.random()}`,
              prompt: typeof gen.prompt === "string" ? gen.prompt : "",
              refImages: Array.isArray(gen.refImages) ? gen.refImages : [],
              model: typeof gen.model === "string" ? gen.model : "",
              size:
                typeof gen.size === "string"
                  ? gen.size
                  : typeof gen.aspectRatio === "string"
                    ? gen.aspectRatio
                    : "1:1",
              resolution:
                typeof gen.resolution === "string" ? gen.resolution : undefined,
              callFormat:
                gen.callFormat === "chat" || gen.callFormat === "images"
                  ? gen.callFormat
                  : "images",
              status:
                gen.status === "error" ||
                gen.status === "idle" ||
                gen.status === "generating" ||
                gen.status === "success"
                  ? gen.status
                  : "success",
              error: typeof gen.error === "string" ? gen.error : undefined,
              latency:
                typeof gen.latency === "number" ? gen.latency : undefined,
              timestamp:
                typeof gen.timestamp === "string"
                  ? gen.timestamp
                  : new Date().toLocaleTimeString(),
              isStarred:
                typeof gen.isStarred === "boolean" ? gen.isStarred : false,
              downloadedUrls: Array.isArray(gen.downloadedUrls)
                ? gen.downloadedUrls
                : undefined,
              createdAt:
                typeof gen.createdAt === "number" ? gen.createdAt : undefined,
            };

            // Deeply validate result contents
            if (gen.result && typeof gen.result === "object") {
              const resDataRaw = gen.result.data;
              const cleanData: any[] = [];
              if (Array.isArray(resDataRaw)) {
                resDataRaw.forEach((imgItem: any) => {
                  if (imgItem && typeof imgItem === "object") {
                    if (imgItem.url) {
                      cleanData.push({
                        url: imgItem.url,
                        thumbnail_url: imgItem.thumbnail_url || undefined,
                        thumbnail_url_1k: imgItem.thumbnail_url_1k || undefined,
                        revised_prompt: imgItem.revised_prompt || undefined,
                      });
                    }
                  } else if (typeof imgItem === "string" && imgItem) {
                    cleanData.push({ url: imgItem });
                  }
                });
              }

              if (cleanData.length > 0) {
                repairedGen.result = { data: cleanData };
                repairedGen.status = "success";
              } else if (repairedGen.status === "success") {
                repairedGen.status = "error";
                repairedGen.error = "未找到可恢复的生成图像数据 / 崩溃损坏";
              }
            } else if (repairedGen.status === "success") {
              repairedGen.status = "error";
              repairedGen.error = "生图数据损坏";
            }

            return repairedGen;
          });
      }

      return repairedWs;
    });
};

// Clean/truncate workspaces data to safely fit inside localStorage quota limits (usually 5MB)
const getTrimmedWorkspacesForBackup = (
  workspaces: ImageWorkspace[],
): ImageWorkspace[] => {
  return workspaces.map((ws) => {
    return {
      ...ws,
      generations: ws.generations || [],
    };
  });
};

// Helper to generate a 100-column, 1000-image test workspace project for scroll performance testing
const generatePerfTestWorkspaces = (): ImageWorkspace[] => {
  const columnsCount = 100;
  const imagesPerColumn = 10;
  const list: ImageWorkspace[] = [];

  for (let col = 1; col <= columnsCount; col++) {
    const generations: GenerationItem[] = [];
    for (let img = 1; img <= imagesPerColumn; img++) {
      const imgNum = (col - 1) * imagesPerColumn + img;
      
      let resTag: "1k" | "2k" | "4k" = "1k";
      let width = 1024;
      let height = 1024;
      
      const mod = imgNum % 3;
      if (mod === 0) {
        resTag = "4k";
        width = 3840;
        height = 2160;
      } else if (mod === 2) {
        resTag = "2k";
        width = 2560;
        height = 1440;
      } else {
        resTag = "1k";
        width = 1024;
        height = 1024;
      }

      const imageUrl = `https://picsum.photos/seed/perf_${imgNum}/${width}/${height}`;
      const thumbUrl = `https://picsum.photos/seed/perf_${imgNum}/300/300`;

      generations.push({
        id: `gen-perf-${col}-${img}`,
        prompt: `100列测试 [${resTag.toUpperCase()}] 图片 #${imgNum} (第${col}列 第${img}张)`,
        refImages: [],
        model: "gpt-image-2-all",
        size: "1:1",
        resolution: resTag,
        callFormat: "images",
        status: "success",
        timestamp: new Date(Date.now() - imgNum * 30000).toLocaleTimeString(),
        createdAt: Date.now() - imgNum * 30000,
        isStarred: imgNum % 7 === 0,
        result: {
          data: [
            {
              url: imageUrl,
              thumbnail_url: thumbUrl,
              thumbnail_url_1k: imageUrl,
            },
          ],
        },
      });
    }

    list.push({
      id: `ws-perf-${col}`,
      name: `测试列_${String(col).padStart(3, "0")}`,
      imagePrompt: `100列性能测试列 ${col}`,
      imageModel: "gpt-image-2-all",
      imageSize: "1:1",
      imageResolution: "1k",
      callFormat: "images",
      refImages: [],
      includeUrlsInPrompt: true,
      includeUrlsInBody: true,
      generations,
      columnWidth: "narrow",
    });
  }

  return list;
};

export default function App() {
  const isDevEnvironment =
    typeof window !== "undefined" &&
    (window.location.hostname.includes("-dev-") ||
      window.location.hostname.includes("localhost") ||
      window.location.hostname.includes("127.0.0.1"));

  const [isDbLoading, setIsDbLoading] = useState<boolean>(true);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);

  // Connection Configuration (Loads from IndexedDB, defaults to Client request mode)
  const [config, setConfig] = useState<ApiConfig>({
    baseUrl: "https://ai.t8star.org",
    apiKey: "sk-7lbTT3viGET7dXOdeR6d72aD0JrG9bNoUTCBT1aZTKqHJery",
    qianwenApiUrl: "https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation",
    qianwenApiKey: "",
    requestMode: "client",
  });

  useEffect(() => {
    if (isSettingsLoaded && !isDbLoading) {
      setIndexedDBItem("img_studio_api_config", config);
    }
  }, [config, isDbLoading, isSettingsLoaded]);

  const [showKey, setShowKey] = useState<boolean>(false);
  const [showSeedanceKey, setShowSeedanceKey] = useState<boolean>(false);
  const [showQianwenKey, setShowQianwenKey] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<string>("gpt-4o-mini");
  const [modelSearch, setModelSearch] = useState<string>("");
  const [modelsList, setModelsList] = useState<ModelInfo[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // Playground Hyperparameters (for diagnostics & chat)
  const [temperature, setTemperature] = useState<number>(0.7);
  const [maxTokens, setMaxTokens] = useState<number>(1000);
  const [systemPrompt, setSystemPrompt] = useState<string>(
    "You are a helpful assistant.",
  );

  // Diagnostic states
  const [diagnosticStatus, setDiagnosticStatus] = useState<
    "idle" | "running" | "success" | "error"
  >("idle");
  const [diagnostics, setDiagnostics] = useState<DiagnosticSummary | null>(
    null,
  );
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Chat conversation for playground
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [lastRawResponse, setLastRawResponse] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<
    "diagnostics" | "playground" | "models"
  >("diagnostics");

  // Mode configurations
  const [isDiagnosticsMode, setIsDiagnosticsMode] = useState<boolean>(false);
  const [isApi2Mode, setIsApi2Mode] = useState<boolean>(false);

  // Enter key hold progress states for workspace textareas
  const [holdingEnterTrackId, setHoldingEnterTrackId] = useState<string | null>(
    null,
  );
  const [enterHoldProgress, setEnterHoldProgress] = useState<number>(0);

  // Reference Image Staging Area (暂存区)
  const [stagedReferenceImages, setStagedReferenceImages] = useState<
    {
      id?: string;
      url: string | Blob;
      prompt?: string;
      gen?: GenerationItem;
      trackId?: string;
    }[]
  >([]);
  const [isStagedLoaded, setIsStagedLoaded] = useState(false);

  useEffect(() => {
    getIndexedDBItem("img_studio_staged_images_v2")
      .then((data) => {
        if (data && Array.isArray(data)) {
          const processedData = data.map((item: any) => ({
            ...item,
            id: item.id || crypto.randomUUID(),
          }));
          setStagedReferenceImages(processedData);
        }
      })
      .catch((err) => console.warn("Failed to load staged images:", err))
      .finally(() => setIsStagedLoaded(true));
  }, []);

  useEffect(() => {
    if (isStagedLoaded) {
      setIndexedDBItem(
        "img_studio_staged_images_v2",
        stagedReferenceImages,
      ).catch((e) => console.warn("Failed to save staged images:", e));
    }
  }, [stagedReferenceImages, isStagedLoaded]);

  // Cursor position ref for the hold-down circular progress ring indicator (updated via ref/DOM instead of React state on every mousemove)
  const enterRingElRef = useRef<HTMLDivElement | null>(null);

  // Core application and workspace/database state declarations
  const [workspaces, setWorkspaces] = useState<ImageWorkspace[]>([]);
  const [isDbWriteLocked, setIsDbWriteLocked] = useState<boolean>(false);

  useEffect(() => {
    setupNotifications();
  }, []);

  type GenIndicator = {
    id: string;
    status: string; // "generating" | "success" | "error"
    edge: "left" | "right" | "top" | "bottom";
    x: number;
    y: number;
  };
  const [indicators, setIndicators] = useState<GenIndicator[]>([]);
  const recentFinishedGensRef = useRef<Map<string, { status: string }>>(
    new Map(),
  );
  const prevWorkspacesRef = useRef(workspaces);

  useEffect(() => {
    const prevGens = new Map();
    prevWorkspacesRef.current.forEach((ws) =>
      ws.generations.forEach((g) => prevGens.set(g.id, g.status)),
    );

    let hasNewFinished = false;
    workspaces.forEach((ws) =>
      ws.generations.forEach((g) => {
        const prevStatus = prevGens.get(g.id);
        if (
          prevStatus === "generating" &&
          (g.status === "success" || g.status === "error")
        ) {
          recentFinishedGensRef.current.set(g.id, {
            status: g.status,
          });
          hasNewFinished = true;
        }
      }),
    );
    prevWorkspacesRef.current = workspaces;

    if (hasNewFinished) {
      checkOffscreenGenerating();
    }
  }, [workspaces]);

  const checkOffscreenTimeoutRef = useRef<number | null>(null);

  const checkOffscreenGenerating = useCallback(() => {
    if (checkOffscreenTimeoutRef.current !== null) return;
    checkOffscreenTimeoutRef.current = window.setTimeout(() => {
      checkOffscreenTimeoutRef.current = null;
      requestAnimationFrame(() => {
        const el = document.getElementById("tracks-scroll-viewport");
        if (!el) return;
        const viewportRect = el.getBoundingClientRect();
        const now = Date.now();

        const newIndicators: GenIndicator[] = [];
        const seenGenIds = new Set<string>();

        // Only query active generating cards + recently finished cards instead of all cards on board
        const candidateSet = new Set<Element>();
        el.querySelectorAll('[data-gen-status="generating"]').forEach((c) =>
          candidateSet.add(c),
        );
        recentFinishedGensRef.current.forEach((_, finishedId) => {
          const finishedEl = document.getElementById(`gen-card-${finishedId}`);
          if (finishedEl) candidateSet.add(finishedEl);
        });

        if (candidateSet.size === 0 && indicators.length === 0) return;

        candidateSet.forEach((cardEl) => {
          const genId = cardEl.getAttribute("data-gen-id");
          const status = cardEl.getAttribute("data-gen-status");

          if (!genId || !status) return;
          seenGenIds.add(genId);

          let isActive = status === "generating";
          let displayStatus = status;

          if (!isActive) {
            const recent = recentFinishedGensRef.current.get(genId);
            if (recent) {
              isActive = true;
              displayStatus = recent.status;
            }
          }

          if (isActive) {
            const rect = cardEl.getBoundingClientRect();
            const columnEl = cardEl.closest(".overflow-y-auto");
            const columnRect = columnEl
              ? columnEl.getBoundingClientRect()
              : null;

            // Calculate center of the card
            const cardCenterX = rect.left + rect.width / 2;
            const cardCenterY = rect.top + rect.height / 2;

            let edge: "left" | "right" | "top" | "bottom" | null = null;
            let x = 0;
            let y = 0;

            if (rect.right < viewportRect.left + 24) {
              edge = "left";
              x = viewportRect.left + 24;
              y = Math.min(
                Math.max(cardCenterY, viewportRect.top + 72),
                viewportRect.bottom - 24,
              );
            } else if (rect.left > viewportRect.right - 24) {
              edge = "right";
              x = viewportRect.right - 24;
              y = Math.min(
                Math.max(cardCenterY, viewportRect.top + 72),
                viewportRect.bottom - 24,
              );
            } else if (columnRect) {
              if (rect.bottom < columnRect.top + 72) {
                edge = "top";
                y = columnRect.top + 72;
                x = Math.min(
                  Math.max(cardCenterX, columnRect.left + 24),
                  columnRect.right - 24,
                );
              } else if (rect.top > columnRect.bottom - 24) {
                edge = "bottom";
                y = columnRect.bottom - 24;
                x = Math.min(
                  Math.max(cardCenterX, columnRect.left + 24),
                  columnRect.right - 24,
                );
              }
            }

            if (edge) {
              newIndicators.push({
                id: genId,
                status: displayStatus,
                edge,
                x,
                y,
              });
            } else if (!edge && recentFinishedGensRef.current.has(genId)) {
              recentFinishedGensRef.current.delete(genId);
            }
          }
        });

        // Resolve overlaps using a 1D distribution algorithm per edge to completely prevent overlaps
        const BUBBLE_GAP = 70;

        // Group indicators by edge
        const indicatorsByEdge: Record<
          "left" | "right" | "top" | "bottom",
          GenIndicator[]
        > = {
          left: [],
          right: [],
          top: [],
          bottom: [],
        };

        newIndicators.forEach((ind) => {
          indicatorsByEdge[ind.edge].push(ind);
        });

        // 1. Process left and right edges (vertical Y-axis distribution)
        const minY = viewportRect.top + 72;
        const maxY = viewportRect.bottom - 24;

        ["left", "right"].forEach((edgeKey) => {
          const items = indicatorsByEdge[edgeKey as "left" | "right"];
          if (items.length === 0) return;

          // Sort items by their current Y coordinate (ascending)
          items.sort((a, b) => a.y - b.y);

          const n = items.length;
          // Relaxation loop that resolves overlaps and respects bounds during each iteration
          for (let iter = 0; iter < 50; iter++) {
            let shifted = false;

            // Push overlapping items apart
            for (let i = 0; i < n - 1; i++) {
              const a = items[i];
              const b = items[i + 1];
              const dist = b.y - a.y;
              if (dist < BUBBLE_GAP) {
                const overlap = BUBBLE_GAP - dist;
                const shiftAmount = overlap / 2;
                a.y -= shiftAmount;
                b.y += shiftAmount;
                shifted = true;
              }
            }

            // Apply boundary constraints and propagate
            if (items[0].y < minY) {
              items[0].y = minY;
              shifted = true;
            }
            for (let i = 1; i < n; i++) {
              if (items[i].y < items[i - 1].y + BUBBLE_GAP) {
                items[i].y = items[i - 1].y + BUBBLE_GAP;
                shifted = true;
              }
            }

            if (items[n - 1].y > maxY) {
              items[n - 1].y = maxY;
              shifted = true;
              // Push back from the end to maintain gap
              for (let i = n - 2; i >= 0; i--) {
                if (items[i].y > items[i + 1].y - BUBBLE_GAP) {
                  items[i].y = items[i + 1].y - BUBBLE_GAP;
                }
              }
              // If pushing back caused the first element to go below minY, clamp it and cascade forward
              if (items[0].y < minY) {
                items[0].y = minY;
                for (let i = 1; i < n; i++) {
                  items[i].y = Math.max(
                    items[i].y,
                    items[i - 1].y + BUBBLE_GAP,
                  );
                }
              }
            }

            if (!shifted) break;
          }
        });

        // 2. Process top and bottom edges (horizontal X-axis distribution)
        const minX = viewportRect.left + 24;
        const maxX = viewportRect.right - 24;

        ["top", "bottom"].forEach((edgeKey) => {
          const items = indicatorsByEdge[edgeKey as "top" | "bottom"];
          if (items.length === 0) return;

          // Sort items by their current X coordinate (ascending)
          items.sort((a, b) => a.x - b.x);

          const n = items.length;
          // Relaxation loop that resolves overlaps and respects bounds during each iteration
          for (let iter = 0; iter < 50; iter++) {
            let shifted = false;

            // Push overlapping items apart
            for (let i = 0; i < n - 1; i++) {
              const a = items[i];
              const b = items[i + 1];
              const dist = b.x - a.x;
              if (dist < BUBBLE_GAP) {
                const overlap = BUBBLE_GAP - dist;
                const shiftAmount = overlap / 2;
                a.x -= shiftAmount;
                b.x += shiftAmount;
                shifted = true;
              }
            }

            // Apply boundary constraints and propagate
            if (items[0].x < minX) {
              items[0].x = minX;
              shifted = true;
            }
            for (let i = 1; i < n; i++) {
              if (items[i].x < items[i - 1].x + BUBBLE_GAP) {
                items[i].x = items[i - 1].x + BUBBLE_GAP;
                shifted = true;
              }
            }

            if (items[n - 1].x > maxX) {
              items[n - 1].x = maxX;
              shifted = true;
              // Push back from the end to maintain gap
              for (let i = n - 2; i >= 0; i--) {
                if (items[i].x > items[i + 1].x - BUBBLE_GAP) {
                  items[i].x = items[i + 1].x - BUBBLE_GAP;
                }
              }
              // If pushing back caused the first element to go below minX, clamp it and cascade forward
              if (items[0].x < minX) {
                items[0].x = minX;
                for (let i = 1; i < n; i++) {
                  items[i].x = Math.max(
                    items[i].x,
                    items[i - 1].x + BUBBLE_GAP,
                  );
                }
              }
            }

            if (!shifted) break;
          }
        });

        // Clean up deleted cards
        for (const id of recentFinishedGensRef.current.keys()) {
          if (!seenGenIds.has(id)) {
            recentFinishedGensRef.current.delete(id);
          }
        }

        setIndicators((prev) => {
          if (prev.length !== newIndicators.length) return newIndicators;
          for (let i = 0; i < prev.length; i++) {
            if (
              prev[i].id !== newIndicators[i].id ||
              prev[i].status !== newIndicators[i].status ||
              prev[i].edge !== newIndicators[i].edge ||
              Math.abs(prev[i].x - newIndicators[i].x) > 5 ||
              Math.abs(prev[i].y - newIndicators[i].y) > 5
            ) {
              return newIndicators;
            }
          }
          return prev;
        });

        if (recentFinishedGensRef.current.size > 0) {
          setTimeout(() => {
            checkOffscreenGenerating();
          }, 1000);
        }
      });
    }, 16);
  }, []);

  const handleScrollToGenId = (genId: string) => {
    const targetEl = document.querySelector(`[data-gen-id="${genId}"]`);
    if (targetEl) {
      targetEl.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    }
  };

  const generatingCount = useMemo(() => {
    return workspaces.reduce(
      (acc, ws) =>
        acc + ws.generations.filter((g) => g.status === "generating").length,
      0,
    );
  }, [workspaces]);

  useEffect(() => {
    const handleCheckOffscreen = () => checkOffscreenGenerating();
    window.addEventListener("check-offscreen", handleCheckOffscreen);
    return () =>
      window.removeEventListener("check-offscreen", handleCheckOffscreen);
  }, [checkOffscreenGenerating]);

  useEffect(() => {
    if (generatingCount > 0) {
      updateSystemStatus("generating", generatingCount);
    }
  }, [generatingCount]);

  useEffect(() => {
    if (generatingCount > 0 || recentFinishedGensRef.current.size > 0) {
      const interval = setInterval(() => {
        checkOffscreenGenerating();
      }, 100);

      // Also check immediately
      checkOffscreenGenerating();

      return () => clearInterval(interval);
    } else {
      checkOffscreenGenerating();
    }
  }, [generatingCount, checkOffscreenGenerating]);

  const centeredProjectRef = useRef<string | null>(null);

  const [trackFilters, setTrackFilters] = useState<
    Record<string, "all" | "starred" | "downloaded">
  >({});
  const [hoveredPreviewRefImg, setHoveredPreviewRefImg] = useState<{
    trackId: string;
    url: string;
  } | null>(null);

  // Lightbox view state
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    prompt: string;
    gen?: GenerationItem;
    trackId?: string;
  } | null>(null);

  // Image Context Menu state
  const [imageContextMenu, setImageContextMenu] = useState<{
    x: number;
    y: number;
    url: string | Blob;
    prompt: string;
    gen: GenerationItem;
    trackId: string;
    imgIndex: number;
  } | null>(null);

  useEffect(() => {
    const handleShowContextMenu = (e: any) => {
      setImageContextMenu(e.detail);
    };
    window.addEventListener("show-image-context-menu", handleShowContextMenu);
    return () =>
      window.removeEventListener(
        "show-image-context-menu",
        handleShowContextMenu,
      );
  }, []);

  useEffect(() => {
    const handleClickOutside = () => setImageContextMenu(null);
    window.addEventListener("click", handleClickOutside);
    window.addEventListener("scroll", handleClickOutside, { capture: true });
    return () => {
      window.removeEventListener("click", handleClickOutside);
      window.removeEventListener("scroll", handleClickOutside, {
        capture: true,
      });
    };
  }, []);

  // Sync canvas scroll on lightbox view state: defaults to false during image full-screen viewing
  const [syncCanvasScrollOnView, setSyncCanvasScrollOnView] =
    useState<boolean>(false);

  const toggleSyncCanvasScroll = (val: boolean) => {
    setSyncCanvasScrollOnView(val);
    setIndexedDBItem("img_studio_sync_canvas_scroll", val);
  };

  const [workspaceZoomLevel, setWorkspaceZoomLevel] = useState<number>(100);
  const handleZoomChange = (val: number) => {
    setWorkspaceZoomLevel(val);
    setIndexedDBItem("img_studio_workspace_zoom", val);
  };

  const [isSpacebarOverviewActive, setIsSpacebarOverviewActive] =
    useState(false);
  const [isPanoramaScrolling, setIsPanoramaScrolling] = useState(false);
  const [pendingSpacebarExit, setPendingSpacebarExit] = useState(false);
  const activePanoramaScrollCountRef = useRef(0);
  const pendingSpacebarExitRef = useRef(false);
  const isSelectionPendingRef = useRef(false);
  const [isLightboxMapOpen, setIsLightboxMapOpen] = useState(false);
  const isKeyboardHoldingSpaceRef = useRef(false);
  const hoveredImageItemRef = useRef<{
    url: string;
    prompt: string;
    gen: GenerationItem;
    trackId: string;
  } | null>(null);
  const lastMousePosRef = useRef({
    x: typeof window !== "undefined" ? window.innerWidth / 2 : 0,
    y: typeof window !== "undefined" ? window.innerHeight / 2 : 0,
  });

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    const handleGlobalDragOver = (e: DragEvent) => {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handleGlobalMouseMove, {
      passive: true,
    });
    window.addEventListener("dragover", handleGlobalDragOver, {
      passive: true,
    });
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("dragover", handleGlobalDragOver);
    };
  }, []);

  // Helper to resolve the image closest to the mouse cursor on the board
  const getDefaultImage = () => {
    try {
      const viewport = document.getElementById("tracks-scroll-viewport");
      if (!viewport) return null;

      const viewportRect = viewport.getBoundingClientRect();
      const viewportCenterX = viewportRect.left + viewportRect.width / 2;
      const viewportCenterY = viewportRect.top + viewportRect.height / 2;

      const columnElements = viewport.querySelectorAll(
        "[data-track-container]",
      );

      let closestWsId = "";
      let minColumnDist = Infinity;
      let closestColumnEl: Element | null = null;

      // 1. 寻找水平方向上最接近中心点的列
      columnElements.forEach((el) => {
        const rect = el.getBoundingClientRect();

        // 检查列是否在水平可视范围内 (精确使用 viewport 区域边界限制)
        if (rect.right < viewportRect.left || rect.left > viewportRect.right)
          return;

        const centerX = rect.left + rect.width / 2;
        const dist = Math.abs(centerX - viewportCenterX);

        if (dist < minColumnDist) {
          minColumnDist = dist;
          closestWsId = el.getAttribute("data-track-container") || "";
          closestColumnEl = el;
        }
      });

      if (closestWsId && closestColumnEl) {
        const ws = workspacesRef.current.find((w) => w.id === closestWsId);
        if (ws) {
          // 2. 在该列中寻找垂直方向上最接近中心点的图片
          // 仅在那一列的 DOM 容器内查找，避免搜到全景视图或侧边栏里的重复图片
          const imageElements = closestColumnEl.querySelectorAll(
            `[data-track-id="${closestWsId}"][data-lightbox-wrapper]`,
          );
          let closestImage: any = null;
          let minImageDist = Infinity;

          imageElements.forEach((el) => {
            const rect = el.getBoundingClientRect();
            // 检查图片是否在垂直可视范围内
            if (
              rect.bottom < viewportRect.top ||
              rect.top > viewportRect.bottom
            )
              return;

            const centerY = rect.top + rect.height / 2;
            const dist = Math.abs(centerY - viewportCenterY);

            if (dist < minImageDist) {
              const url = el.getAttribute("data-lightbox-wrapper");
              const genId = el.getAttribute("data-gen-id");
              const imgIdxStr = el.getAttribute("data-img-index");
              if (url && genId) {
                const gen = (ws.generations || []).find(
                  (g: any) => g.id === genId,
                );
                if (gen) {
                  minImageDist = dist;
                  const idxVal =
                    imgIdxStr !== null ? parseInt(imgIdxStr, 10) : undefined;
                  const actualUrl =
                    (idxVal !== undefined && gen.result?.data?.[idxVal]?.url) ||
                    url;
                  closestImage = {
                    url: actualUrl,
                    prompt: gen.prompt,
                    gen,
                    trackId: closestWsId,
                    imgIndex: idxVal,
                  };
                }
              }
            }
          });

          if (closestImage) return closestImage;

          // 降级：如果该列内没找到可视图片，取该列最新的成功图
          const lastSuccess = (ws.generations || []).find(
            (g: any) => g.status === "success" && g.result?.data?.[0]?.url,
          );
          if (lastSuccess) {
            return {
              url: lastSuccess.result.data[0].url,
              prompt: lastSuccess.prompt,
              gen: lastSuccess,
              trackId: ws.id,
            };
          }
        }
      }
    } catch (err) {
      console.error("Error in lightweight sampling:", err);
    }

    // 4. 最终兜底：从数据状态中寻找 (从可视索引的中点开始搜索，避免偏向右侧)
    const midIdx = Math.max(0, Math.floor(workspacesRef.current.length / 2));
    const searchOrder = [midIdx];
    for (
      let i = 1;
      i <= midIdx || midIdx + i < workspacesRef.current.length;
      i++
    ) {
      if (midIdx - i >= 0) searchOrder.push(midIdx - i);
      if (midIdx + i < workspacesRef.current.length)
        searchOrder.push(midIdx + i);
    }

    for (const i of searchOrder) {
      const ws = workspacesRef.current[i];
      const generationsList = ws.generations || [];
      // 逆序查找该列中最后一张成功的图
      for (let j = generationsList.length - 1; j >= 0; j--) {
        const gen = generationsList[j];
        if (gen.status === "success" && gen.result?.data) {
          const item = gen.result.data.find((d: any) => d.url);
          if (item && item.url) {
            return {
              url: item.url,
              prompt: gen.prompt,
              gen: gen,
              trackId: ws.id,
            };
          }
        }
      }
    }
    return null;
  };

  // Fullscreen compare view state
  const [compareMode, setCompareMode] = useState<{
    imageA: {
      url: string;
      prompt: string;
      gen: GenerationItem;
      trackId: string;
    };
    imageB: {
      url: string;
      prompt: string;
      gen: GenerationItem;
      trackId: string;
    };
  } | null>(null);

  // Drag and drop states for comparison
  const [draggedImageItem, setDraggedImageItem] = useState<{
    url: string;
    prompt: string;
    gen: GenerationItem;
    trackId: string;
    isFromStaging?: boolean;
  } | null>(null);
  const draggedImageItemRef = useRef<{
    url: string;
    prompt: string;
    gen: GenerationItem;
    trackId: string;
    isFromStaging?: boolean;
  } | null>(null);
  const [dragOverImageId, setDragOverImageId] = useState<string | null>(null);
  const [panoramaCompareSourceImage, setPanoramaCompareSourceImage] =
    useState<any>(null);

  // Track currently focused column/workspace ID
  const [focusedTrackId, setFocusedTrackId] = useState<string | null>(null);
  const [hoveredGenRef, setHoveredGenRef] = useState<{
    trackId: string;
    genId: string;
  } | null>(null);
  const dragLeaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Global filters view state
  const [isGlobalFilterViewOpen, setIsGlobalFilterViewOpen] = useState(false);
  const [globalFilterMode, setGlobalFilterMode] = useState<
    "starred" | "downloaded"
  >("starred");

  const lastActiveImagePerTrackRef = useRef<
    Record<string, { url: string | Blob; genId?: string; imgIndex?: number }>
  >({});

  // Keeps track of the last viewed image per track to preserve column memory when navigating left/right
  useEffect(() => {
    if (lightboxImage?.trackId && lightboxImage?.url) {
      lastActiveImagePerTrackRef.current[lightboxImage.trackId] = {
        url: lightboxImage.url,
        genId: lightboxImage.gen?.id,
        imgIndex: lightboxImage.imgIndex,
      };
    }
  }, [lightboxImage]);

  // Fullscreen single image navigation handler
  const handleLightboxNavigate = (
    direction: "up" | "down" | "left" | "right",
  ) => {
    if (!lightboxImage) return;
    const { url, trackId: currentTrackId } = lightboxImage;

    // Helper: Find current track index in logical workspaces order
    const currentTrackIndex = workspaces.findIndex(
      (ws) => ws.id === currentTrackId,
    );
    if (
      currentTrackIndex === -1 &&
      !isSpacebarOverviewActive &&
      !isLightboxMapOpen
    )
      return;

    // Helper: Get visible images for a specific track based on current filter
    const getTrackVisibleImages = (track: ImageWorkspace) => {
      const currentFilter = trackFilters[track.id] || "all";
      const list: {
        url: string;
        thumbnail_url?: string;
        prompt: string;
        gen: any;
        trackId: string;
      }[] = [];
      (track.generations || []).forEach((gen) => {
        const isSuccess = gen.status === "success" && gen.result?.data;
        const isGenerating = gen.status === "generating";
        const matchesFilter =
          currentFilter === "all" ||
          (currentFilter === "starred" && gen.isStarred) ||
          (currentFilter === "downloaded" &&
            gen.downloadedUrls &&
            gen.downloadedUrls.length > 0);

        if (isSuccess && matchesFilter) {
          gen.result.data.forEach((item: any) => {
            if (item.url) {
              list.push({
                url: item.url,
                thumbnail_url: item.thumbnail_url,
                prompt: gen.prompt,
                gen: gen,
                trackId: track.id,
              });
            }
          });
        } else if (isGenerating && matchesFilter) {
          list.push({
            url: `generating-${gen.id}`,
            prompt: gen.prompt,
            gen: gen,
            trackId: track.id,
          });
        }
      });
      return list;
    };

    // Helper: Get all items shown in the overview mode
    const getOverviewItems = () => {
      const list: {
        gen: any;
        trackId: string;
        url: string;
        thumbnail_url?: string;
      }[] = [];
      workspaces.forEach((ws) => {
        const gens = ws.generations || [];
        gens.forEach((g) => {
          if (g.status === "success" && g.result?.data) {
            if (globalFilterMode === "starred" && g.isStarred) {
              g.result.data.forEach((img: any) => {
                if (img.url || img.b64_json) {
                  list.push({
                    gen: g,
                    trackId: ws.id,
                    url: img.url || `data:image/png;base64,${img.b64_json}`,
                    thumbnail_url: img.thumbnail_url,
                  });
                }
              });
            } else if (
              globalFilterMode === "downloaded" &&
              g.downloadedUrls &&
              g.downloadedUrls.length > 0
            ) {
              g.downloadedUrls.forEach((url) => {
                const matchImg = g.result?.data?.find(
                  (d: any) => d.url === url,
                );
                list.push({
                  gen: g,
                  trackId: ws.id,
                  url,
                  thumbnail_url: matchImg?.thumbnail_url,
                });
              });
            }
          }
        });
      });
      return list;
    };

    // ================== A. OVERVIEW VIEW NAVIGATION (SPATIAL 2D GRID SEARCH) ==================
    if (isSpacebarOverviewActive || isLightboxMapOpen) {
      const items = getOverviewItems();
      const allThumbs = Array.from(
        document.querySelectorAll("[data-map-thumb='true']"),
      );

      // Find the current active thumbnail in DOM
      let currentThumb = allThumbs.find(
        (el) => el.getAttribute("data-url") === url,
      );

      // Robust lookup if url is a Blob object (where data-url equals "[object Blob]" or url isn't found directly)
      if (!currentThumb && lightboxImage.gen?.result?.data) {
        const urlIdx = lightboxImage.gen.result.data.findIndex(
          (item: any) => item.url === url,
        );
        if (urlIdx !== -1) {
          currentThumb = allThumbs.find(
            (el) =>
              el.getAttribute("data-track-id") === lightboxImage.trackId &&
              el.getAttribute("data-gen-id") === lightboxImage.gen.id &&
              el.getAttribute("data-img-index") === String(urlIdx),
          );
        }
      }

      if (currentThumb && allThumbs.length > 1) {
        const currentRect = currentThumb.getBoundingClientRect();
        const scx = currentRect.left + currentRect.width / 2;
        const scy = currentRect.top + currentRect.height / 2;

        let bestCandidateThumb: Element | null = null;
        let minScore = Infinity;

        allThumbs.forEach((el) => {
          if (el === currentThumb) return;

          const rect = el.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;

          const dx = cx - scx;
          const dy = cy - scy;

          let score = Infinity;

          if (direction === "right") {
            if (dx > 5) {
              // Primary cost is horizontal progress, penalize vertical distance to favor staying on the same horizontal level
              score = dx + 2.5 * Math.abs(dy);
            }
          } else if (direction === "left") {
            if (dx < -5) {
              score = Math.abs(dx) + 2.5 * Math.abs(dy);
            }
          } else if (direction === "down") {
            if (dy > 5) {
              // Primary cost is vertical progress, penalize horizontal movement to stay in same column
              score = dy + 2.5 * Math.abs(dx);
            }
          } else if (direction === "up") {
            if (dy < -5) {
              score = Math.abs(dy) + 2.5 * Math.abs(dx);
            }
          }

          if (score < minScore) {
            minScore = score;
            bestCandidateThumb = el;
          }
        });

        let targetItem = null;
        if (bestCandidateThumb) {
          const tTrackId = bestCandidateThumb.getAttribute("data-track-id");
          const tGenId = bestCandidateThumb.getAttribute("data-gen-id");
          const tImgIdxStr = bestCandidateThumb.getAttribute("data-img-index");

          // Resolve target structurally from active configuration state to avoid string comparison issues
          const targetWs = workspaces.find((w) => w.id === tTrackId);
          const targetGen = targetWs?.generations?.find((g) => g.id === tGenId);
          if (targetWs && targetGen && tImgIdxStr !== null) {
            const indexValue = parseInt(tImgIdxStr, 10);
            const targetImgItem = targetGen.result?.data?.[indexValue];
            if (targetImgItem && targetImgItem.url) {
              targetItem = {
                url: targetImgItem.url,
                prompt: targetGen.prompt,
                gen: targetGen,
                trackId: targetWs.id,
              };
            }
          }

          // Strict fallback if state structural resolution isn't satisfied
          if (!targetItem) {
            const rawUrl = bestCandidateThumb.getAttribute("data-url");
            targetItem = items.find((item) => item.url === rawUrl);
          }
        }

        // Linear Index Fallback if spatial calculation didn't yield a match (e.g., edges)
        if (!targetItem) {
          const currentIndex = items.findIndex((img) => img.url === url);
          if (currentIndex !== -1) {
            let fallbackIndex = currentIndex;
            if (direction === "right" || direction === "down") {
              fallbackIndex = Math.min(items.length - 1, currentIndex + 1);
            } else {
              fallbackIndex = Math.max(0, currentIndex - 1);
            }
            targetItem = items[fallbackIndex];
          }
        }

        if (targetItem && targetItem.url !== url) {
          const targetImgIdx = targetItem.gen?.result?.data?.findIndex(
            (item: any) => item.url === targetItem.url,
          );
          setLightboxImage({
            url: targetItem.url,
            prompt: targetItem.gen.prompt,
            gen: targetItem.gen,
            trackId: targetItem.trackId,
            imgIndex:
              targetImgIdx !== -1 && targetImgIdx !== undefined
                ? targetImgIdx
                : undefined,
          } as any);

          // Sync scroll thumbnail inside the scroll container of Map overlay
          const finalItem = targetItem;
          setTimeout(() => {
            const updatedThumbs = Array.from(
              document.querySelectorAll("[data-map-thumb='true']"),
            );

            let targetEl = updatedThumbs.find(
              (el) => el.getAttribute("data-url") === finalItem.url,
            );

            // Robust backup lookup matching finalItem metadata
            if (!targetEl && finalItem.gen?.result?.data) {
              const urlIdx = finalItem.gen.result.data.findIndex(
                (item: any) => item.url === finalItem.url,
              );
              if (urlIdx !== -1) {
                targetEl = updatedThumbs.find(
                  (el) =>
                    el.getAttribute("data-track-id") === finalItem.trackId &&
                    el.getAttribute("data-gen-id") === finalItem.gen.id &&
                    el.getAttribute("data-img-index") === String(urlIdx),
                );
              }
            }

            if (targetEl) {
              targetEl.scrollIntoView({
                behavior: "smooth",
                block: "center",
                inline: "center",
              });
            }
          }, 40);
        }
      } else {
        // Safe linear index-based navigation fallback if page layout elements are not loaded yet
        const currentIndex = items.findIndex((img) => img.url === url);
        if (currentIndex !== -1) {
          const targetIndex =
            direction === "right" || direction === "down"
              ? currentIndex + 1
              : currentIndex - 1;
          if (targetIndex >= 0 && targetIndex < items.length) {
            const target = items[targetIndex];
            const targetImgIdx = target.gen?.result?.data?.findIndex(
              (item: any) => item.url === target.url,
            );
            setLightboxImage({
              url: target.url,
              prompt: target.gen.prompt,
              gen: target.gen,
              trackId: target.trackId,
              imgIndex:
                targetImgIdx !== -1 && targetImgIdx !== undefined
                  ? targetImgIdx
                  : undefined,
            } as any);
          }
        }
      }
      return;
    }

    // ================== B. REGULAR MULTI-COLUMN TRACKS VIEW NAVIGATION ==================
    const allWrappers = Array.from(
      document.querySelectorAll("[data-lightbox-wrapper]"),
    );

    // Find the current active wrapper in DOM by matching metadata attributes (unique & robust for blobs/URLs)
    let currentWrapper = allWrappers.find((el) => {
      const elTrackId = el.getAttribute("data-track-id");
      const elGenId = el.getAttribute("data-gen-id");
      const elImgIndexStr = el.getAttribute("data-img-index");
      const targetGenId = lightboxImage?.gen?.id;
      const targetImgIdxStr =
        lightboxImage?.imgIndex !== undefined
          ? String(lightboxImage.imgIndex)
          : "";

      if (
        elTrackId === currentTrackId &&
        elGenId === targetGenId &&
        (targetImgIdxStr === "" || elImgIndexStr === targetImgIdxStr)
      ) {
        return true;
      }
      return false;
    });

    // Fallback URL-only lookup (safely checking Blob vs string)
    if (!currentWrapper) {
      currentWrapper = allWrappers.find((el) => {
        const elUrl = el.getAttribute("data-lightbox-wrapper");
        if (url instanceof Blob) {
          return elUrl === "[object Blob]";
        }
        return elUrl === url;
      });
    }

    let spatialSuccess = false;
    if (currentWrapper && allWrappers.length > 1) {
      const currentRect = currentWrapper.getBoundingClientRect();
      const scx = currentRect.left + currentRect.width / 2;
      const scy = currentRect.top + currentRect.height / 2;

      const resolvedTrackId =
        currentTrackId || currentWrapper.getAttribute("data-track-id");
      const currentTrackIndex = workspaces.findIndex(
        (ws) => ws.id === resolvedTrackId,
      );

      // 1. Vertical Up/Down Navigation within the same Column
      if (direction === "up" || direction === "down") {
        const columnWrappers = allWrappers.filter(
          (el) =>
            el.getAttribute("data-track-id") === resolvedTrackId &&
            el !== currentWrapper,
        );

        let bestCandidateWrapper: Element | null = null;
        let minScore = Infinity;

        columnWrappers.forEach((el) => {
          const rect = el.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dx = cx - scx;
          const dy = cy - scy;

          let score = Infinity;
          if (direction === "down") {
            if (dy > 2) {
              score = dy + 0.5 * Math.abs(dx);
            }
          } else if (direction === "up") {
            if (dy < -2) {
              score = Math.abs(dy) + 0.5 * Math.abs(dx);
            }
          }

          if (score < minScore) {
            minScore = score;
            bestCandidateWrapper = el;
          }
        });

        if (bestCandidateWrapper) {
          const tTrackId = bestCandidateWrapper.getAttribute("data-track-id");
          const tGenId = bestCandidateWrapper.getAttribute("data-gen-id");
          const tImgIdxStr =
            bestCandidateWrapper.getAttribute("data-img-index");

          if (tTrackId && tGenId) {
            const targetWs = workspaces.find((w) => w.id === tTrackId);
            const targetGen = targetWs?.generations?.find(
              (g) => g.id === tGenId,
            );
            if (targetWs && targetGen) {
              const imgIdx = tImgIdxStr ? parseInt(tImgIdxStr, 10) : 0;
              const realUrl =
                targetGen.status === "generating"
                  ? `generating-${targetGen.id}`
                  : targetGen.result?.data?.[imgIdx]?.url;

              if (realUrl) {
                setLightboxImage({
                  url: realUrl,
                  prompt: targetGen.prompt,
                  gen: targetGen,
                  trackId: targetWs.id,
                  imgIndex: imgIdx,
                } as any);
                spatialSuccess = true;
              }
            }
          }
        }
      }

      // 2. Horizontal Left/Right Navigation to adjacent Columns
      if (direction === "left" || direction === "right") {
        let targetColumnId: string | null = null;
        if (currentTrackIndex !== -1) {
          let step = direction === "left" ? -1 : 1;
          let checkIndex = currentTrackIndex + step;
          while (checkIndex >= 0 && checkIndex < workspaces.length) {
            const checkTrack = workspaces[checkIndex];
            const hasImages = allWrappers.some(
              (el) => el.getAttribute("data-track-id") === checkTrack.id,
            );
            if (hasImages) {
              targetColumnId = checkTrack.id;
              break;
            }
            checkIndex += step;
          }
        }

        if (targetColumnId) {
          let memoryRestored = false;

          // Highly robust Level 1: Restore from pure React state memory based on `lastActiveImagePerTrackRef`
          if (lastActiveImagePerTrackRef.current[targetColumnId]) {
            const remembered =
              lastActiveImagePerTrackRef.current[targetColumnId];
            const targetWs = workspaces.find((w) => w.id === targetColumnId);
            if (targetWs) {
              const generationsList = targetWs.generations || [];
              let resolvedItem = null;

              // Pass 1: Match by genId + imgIndex
              if (remembered.genId) {
                const gen = generationsList.find(
                  (g) => g.id === remembered.genId,
                );
                if (gen && gen.result?.data) {
                  const idxVal =
                    remembered.imgIndex !== undefined ? remembered.imgIndex : 0;
                  const imgData = gen.result.data[idxVal];
                  if (imgData && imgData.url) {
                    resolvedItem = {
                      url: imgData.url,
                      prompt: gen.prompt,
                      gen,
                      trackId: targetWs.id,
                      imgIndex: idxVal,
                    };
                  }
                }
              }

              // Pass 2: Match by exact URL
              if (!resolvedItem && remembered.url) {
                for (const gen of generationsList) {
                  if (!gen.result?.data) continue;
                  const idx = gen.result.data.findIndex(
                    (d: any) => d.url === remembered.url,
                  );
                  if (idx !== -1) {
                    resolvedItem = {
                      url: gen.result.data[idx].url,
                      prompt: gen.prompt,
                      gen,
                      trackId: targetWs.id,
                      imgIndex: idx,
                    };
                    break;
                  }
                }
              }

              // Pass 3: Match by Generation ID alone as fallback (retrieving image at imgIndex or 0)
              if (!resolvedItem && remembered.genId) {
                const gen = generationsList.find(
                  (g) => g.id === remembered.genId,
                );
                if (gen && gen.result?.data && gen.result.data.length > 0) {
                  const idxVal =
                    remembered.imgIndex !== undefined &&
                    remembered.imgIndex < gen.result.data.length
                      ? remembered.imgIndex
                      : 0;
                  if (gen.result.data[idxVal]?.url) {
                    resolvedItem = {
                      url: gen.result.data[idxVal].url,
                      prompt: gen.prompt,
                      gen,
                      trackId: targetWs.id,
                      imgIndex: idxVal,
                    };
                  }
                }
              }

              if (resolvedItem) {
                setLightboxImage(resolvedItem as any);
                spatialSuccess = true;
                memoryRestored = true;
                console.log(
                  `[Lightbox Nav] Successfully restored memory-state in horizontal navigation to track ${targetColumnId}`,
                );
              }
            }
          }

          // Level 2 Fallback: Spatial vertical tracking (minimizing dy)
          if (!memoryRestored) {
            const targetColumnWrappers = allWrappers.filter(
              (el) => el.getAttribute("data-track-id") === targetColumnId,
            );

            let bestCandidateWrapper: Element | null = null;
            if (targetColumnWrappers.length > 0) {
              let minScore = Infinity;
              targetColumnWrappers.forEach((el) => {
                const rect = el.getBoundingClientRect();
                const cy = rect.top + rect.height / 2;
                const score = Math.abs(cy - scy);
                if (score < minScore) {
                  minScore = score;
                  bestCandidateWrapper = el;
                }
              });
            }

            if (bestCandidateWrapper) {
              const tTrackId =
                bestCandidateWrapper.getAttribute("data-track-id");
              const tGenId = bestCandidateWrapper.getAttribute("data-gen-id");
              const tImgIdxStr =
                bestCandidateWrapper.getAttribute("data-img-index");

              if (tTrackId && tGenId) {
                const targetWs = workspaces.find((w) => w.id === tTrackId);
                const targetGen = targetWs?.generations?.find(
                  (g) => g.id === tGenId,
                );
                if (targetWs && targetGen) {
                  const imgIdx = tImgIdxStr ? parseInt(tImgIdxStr, 10) : 0;
                  const realUrl =
                    targetGen.status === "generating"
                      ? `generating-${targetGen.id}`
                      : targetGen.result?.data?.[imgIdx]?.url;

                  if (realUrl) {
                    setLightboxImage({
                      url: realUrl,
                      prompt: targetGen.prompt,
                      gen: targetGen,
                      trackId: targetWs.id,
                      imgIndex: imgIdx,
                    } as any);
                    spatialSuccess = true;
                    console.log(
                      `[Lightbox Nav] No memory. Vertically aligned to spatial target in column ${targetColumnId}`,
                    );
                  }
                }
              }
            }
          }
        }
      }
    }

    if (spatialSuccess) return;

    // ================== C. DEGRADED INDEX-BASED LOGICAL NAVIGATION FALLBACKS ==================
    // 1. Handling Up/Down (Vertical) Fallback
    if (direction === "up" || direction === "down") {
      const visible = getTrackVisibleImages(workspaces[currentTrackIndex]);
      const currentIndex = visible.findIndex((img) => img.url === url);

      if (currentIndex !== -1) {
        const targetIndex =
          direction === "up" ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex >= 0 && targetIndex < visible.length) {
          const target = visible[targetIndex];
          const matchedIndexValue = target.gen?.result?.data?.findIndex(
            (item: any) => item.url === target.url,
          );
          setLightboxImage({
            ...target,
            imgIndex:
              matchedIndexValue !== -1 && matchedIndexValue !== undefined
                ? matchedIndexValue
                : undefined,
          } as any);
          return;
        }
      }
    }

    // 2. Handling Left/Right (Horizontal) Fallback
    if (direction === "left" || direction === "right") {
      let step = direction === "left" ? -1 : 1;
      let targetTrackIndex = currentTrackIndex + step;

      while (targetTrackIndex >= 0 && targetTrackIndex < workspaces.length) {
        const targetTrack = workspaces[targetTrackIndex];
        const targetVisible = getTrackVisibleImages(targetTrack);

        if (targetVisible.length > 0) {
          let targetImage = null;

          // Try to restore from track memory
          const remembered = lastActiveImagePerTrackRef.current[targetTrack.id];
          if (remembered) {
            const found = targetVisible.find((img) => {
              const imgIdx = img.gen?.result?.data?.findIndex(
                (d: any) => d.url === img.url,
              );
              return (
                (img.gen?.id === remembered.genId &&
                  imgIdx === remembered.imgIndex) ||
                img.url === remembered.url
              );
            });
            if (found) {
              targetImage = found;
            }
          }

          // Fallback to parallel index finding
          if (!targetImage) {
            const currentVisible = getTrackVisibleImages(
              workspaces[currentTrackIndex],
            );
            const currentPos = currentVisible.findIndex(
              (img) => img.url === url,
            );

            const targetPos = Math.min(
              Math.max(0, currentPos),
              targetVisible.length - 1,
            );
            targetImage = targetVisible[targetPos];
          }

          if (targetImage) {
            const matchedIndexValue = targetImage.gen?.result?.data?.findIndex(
              (item: any) => item.url === targetImage.url,
            );
            setLightboxImage({
              ...targetImage,
              imgIndex:
                matchedIndexValue !== -1 && matchedIndexValue !== undefined
                  ? matchedIndexValue
                  : undefined,
            } as any);
          }
          return;
        }
        targetTrackIndex += step;
      }
    }
  };

  // Track global mouse position to fix hover state matching after closing modals
  const latestMousePos = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      latestMousePos.current = { x: e.clientX, y: e.clientY };
      if (enterRingElRef.current) {
        enterRingElRef.current.style.left = `${Math.round(e.clientX) - 24}px`;
        enterRingElRef.current.style.top = `${Math.round(e.clientY) - 24}px`;
      }
    };
    window.addEventListener("mousemove", handleMouseMove, {
      capture: true,
      passive: true,
    });
    return () =>
      window.removeEventListener("mousemove", handleMouseMove, {
        capture: true,
      });
  }, []);

  const customSmoothScroll = (
    el: HTMLElement,
    targetLeft: number | null,
    targetTop: number | null,
    duration?: number,
  ) => {
    if (duration === 0) {
      if (targetLeft !== null) {
        el.scrollLeft = targetLeft;
      }
      if (targetTop !== null) {
        el.scrollTop = targetTop;
      }
      isSelectionPendingRef.current = false;
      if (pendingSpacebarExitRef.current) {
        pendingSpacebarExitRef.current = false;
        setPendingSpacebarExit(false);
        setIsSpacebarOverviewActive(false);
        setPanoramaCompareSourceImage(null);
        closeLightboxAndScroll();
      }
      return;
    }

    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    const maxScrollTop = el.scrollHeight - el.clientHeight;
    const clampLeft = targetLeft !== null ? Math.max(0, Math.min(maxScrollLeft, targetLeft)) : el.scrollLeft;
    const clampTop = targetTop !== null ? Math.max(0, Math.min(maxScrollTop, targetTop)) : el.scrollTop;

    isSelectionPendingRef.current = false;
    activePanoramaScrollCountRef.current++;
    setIsPanoramaScrolling(true);

    el.scrollTo({
      left: clampLeft,
      top: clampTop,
      behavior: "smooth",
    });

    setTimeout(() => {
      activePanoramaScrollCountRef.current--;
      if (activePanoramaScrollCountRef.current <= 0) {
        activePanoramaScrollCountRef.current = 0;
        setIsPanoramaScrolling(false);

        if (pendingSpacebarExitRef.current) {
          pendingSpacebarExitRef.current = false;
          setPendingSpacebarExit(false);

          setIsSpacebarOverviewActive(false);
          setPanoramaCompareSourceImage(null);
          closeLightboxAndScroll();
        }
      }
    }, 400);
  };

  const currentLightboxTrackIdRef = useRef<string | undefined>(undefined);
  const currentLightboxGenIdRef = useRef<string | undefined>(undefined);
  const previousLightboxImageRef = useRef<any>(null);

  const scrollCanvasToImage = useCallback(
    (targetImg: any, scrollDuration?: number) => {
      if (!targetImg) return;
      let scrolled = false;
      const trackViewport = document.getElementById("tracks-scroll-viewport");

      if (trackViewport && targetImg.gen?.id) {
        const trackId = targetImg.trackId;
        const scopeEl = trackId
          ? document.getElementById(`track-container-${trackId}`) ||
            trackViewport
          : trackViewport;
        const allWrappers = Array.from(
          scopeEl.querySelectorAll("[data-lightbox-wrapper]"),
        );
        const targetEl =
          allWrappers.find((el) => {
            const elUrl = el.getAttribute("data-lightbox-wrapper");
            const elTrackId = el.getAttribute("data-track-id");
            const elGenId = el.getAttribute("data-gen-id");
            return (
              elUrl === targetImg.url &&
              elTrackId === trackId &&
              elGenId === targetImg.gen?.id
            );
          }) ||
          allWrappers.find(
            (el) => el.getAttribute("data-lightbox-wrapper") === targetImg.url,
          );

        if (targetEl) {
          const viewportRect = trackViewport.getBoundingClientRect();
          const thumbRect = targetEl.getBoundingClientRect();

          const absLeft =
            thumbRect.left - viewportRect.left + trackViewport.scrollLeft;
          const targetLeft =
            absLeft - viewportRect.width / 2 + thumbRect.width / 2;
          const maxScrollLeft = trackViewport.scrollWidth - viewportRect.width;
          const finalScrollLeft = Math.max(
            0,
            Math.min(maxScrollLeft, targetLeft),
          );

          let finalScrollTop: number | null = null;
          let colScrollContainer: HTMLElement | null = null;
          if (trackId) {
            colScrollContainer = document.getElementById(
              `track-scroll-container-${trackId}`,
            );
            if (colScrollContainer) {
              const colScrollRect = colScrollContainer.getBoundingClientRect();
              const absTop =
                thumbRect.top -
                colScrollRect.top +
                colScrollContainer.scrollTop;
              const targetTop =
                absTop - colScrollRect.height / 2 + thumbRect.height / 2;
              const maxScrollTop =
                colScrollContainer.scrollHeight - colScrollRect.height;
              finalScrollTop = Math.max(0, Math.min(maxScrollTop, targetTop));
            }
          }

          customSmoothScroll(
            trackViewport,
            finalScrollLeft,
            null,
            scrollDuration,
          );
          if (colScrollContainer && finalScrollTop !== null) {
            customSmoothScroll(
              colScrollContainer,
              null,
              finalScrollTop,
              scrollDuration,
            );
          }
          scrolled = true;
        } else {
          const genCardEl = document.getElementById(
            `gen-card-${targetImg.gen.id}`,
          );
          if (genCardEl) {
            const columnEl = trackId
              ? document.getElementById(`track-container-${trackId}`)
              : null;
            const targetCol = columnEl || genCardEl;

            const viewportRect = trackViewport.getBoundingClientRect();
            const colRect = targetCol.getBoundingClientRect();
            const absLeft =
              colRect.left - viewportRect.left + trackViewport.scrollLeft;
            const targetLeft =
              absLeft - viewportRect.width / 2 + colRect.width / 2;

            const maxScrollLeft =
              trackViewport.scrollWidth - viewportRect.width;
            const finalScrollLeft = Math.max(
              0,
              Math.min(maxScrollLeft, targetLeft),
            );

            let finalScrollTop: number | null = null;
            let colScrollContainer: HTMLElement | null = null;
            if (trackId) {
              colScrollContainer = document.getElementById(
                `track-scroll-container-${trackId}`,
              );
              if (colScrollContainer) {
                const colScrollRect =
                  colScrollContainer.getBoundingClientRect();
                const cardRect = genCardEl.getBoundingClientRect();
                const absTop =
                  cardRect.top -
                  colScrollRect.top +
                  colScrollContainer.scrollTop;
                const targetTop =
                  absTop - colScrollRect.height / 2 + cardRect.height / 2;

                const maxScrollTop =
                  colScrollContainer.scrollHeight - colScrollRect.height;
                finalScrollTop = Math.max(0, Math.min(maxScrollTop, targetTop));
              }
            }

            customSmoothScroll(
              trackViewport,
              finalScrollLeft,
              null,
              scrollDuration,
            );
            if (colScrollContainer && finalScrollTop !== null) {
              customSmoothScroll(
                colScrollContainer,
                null,
                finalScrollTop,
                scrollDuration,
              );
            }
            scrolled = true;
          }
        }
      }

      if (!scrolled && targetImg.trackId) {
        const columnEl = document.getElementById(
          `track-container-${targetImg.trackId}`,
        );
        const trackViewport = document.getElementById("tracks-scroll-viewport");
        if (columnEl && trackViewport) {
          const viewportRect = trackViewport.getBoundingClientRect();
          const colRect = columnEl.getBoundingClientRect();
          const absLeft =
            colRect.left - viewportRect.left + trackViewport.scrollLeft;
          const targetLeft =
            absLeft - viewportRect.width / 2 + colRect.width / 2;
          const maxScrollLeft = trackViewport.scrollWidth - viewportRect.width;
          const finalScrollLeft = Math.max(
            0,
            Math.min(maxScrollLeft, targetLeft),
          );
          customSmoothScroll(
            trackViewport,
            finalScrollLeft,
            null,
            scrollDuration,
          );
        }
      }
    },
    [],
  );

  useEffect(() => {
    currentLightboxTrackIdRef.current = lightboxImage?.trackId;
    currentLightboxGenIdRef.current = lightboxImage?.gen?.id;

    const isImageSwitch =
      previousLightboxImageRef.current !== null &&
      lightboxImage !== null &&
      (previousLightboxImageRef.current.url !== lightboxImage.url ||
        previousLightboxImageRef.current.gen?.id !== lightboxImage?.gen?.id);

    const scrollDuration = isImageSwitch ? 0 : undefined;
    const isMapMode = isSpacebarOverviewActive || isLightboxMapOpen;

    // Never scroll the background main board while Panorama (Map) is open — it triggers
    // IntersectionObservers and layout calculations on the hidden board during the Panorama animation!
    if (
      lightboxImage &&
      !isMapMode &&
      (isImageSwitch || syncCanvasScrollOnView)
    ) {
      scrollCanvasToImage(lightboxImage, scrollDuration);
    }

    previousLightboxImageRef.current = lightboxImage;
  }, [
    lightboxImage,
    syncCanvasScrollOnView,
    isSpacebarOverviewActive,
    isLightboxMapOpen,
    scrollCanvasToImage,
  ]);

  const closeLightboxAndScroll = () => {
    const lastImg = lightboxImageRef.current;
    setLightboxImage(null);
    if (lastImg && syncCanvasScrollOnView) {
      requestAnimationFrame(() => {
        scrollCanvasToImage(lastImg, 0);
      });
    }
  };

  const handleRecenter = () => {
    const container = document.getElementById("tracks-scroll-viewport");
    if (!container) return;

    const isDesktop = window.innerWidth >= 768;
    const gapSize = isDesktop ? 24 : 16;
    const placeholderWidth = isDesktop ? 460 : window.innerWidth * 0.88;

    let totalWorkspacesWidth = 0;
    if (workspaces && workspaces.length > 0) {
      const widths = workspaces.map((w) => {
        return w.columnWidth === "wide"
          ? 840
          : w.columnWidth === "medium"
            ? 650
            : 460;
      });
      const sumWidths = widths.reduce((sum, w) => sum + w, 0);
      totalWorkspacesWidth = sumWidths + (workspaces.length - 1) * gapSize;
    } else {
      totalWorkspacesWidth = 0;
    }

    // Since Left and Right adders are symmetric:
    const targetLeft =
      workspaces && workspaces.length > 0
        ? placeholderWidth + gapSize + totalWorkspacesWidth / 2
        : placeholderWidth + gapSize / 2;

    container.scrollTo({
      left: targetLeft,
      behavior: "smooth" as ScrollBehavior,
    });
  };

  const workspacesRef = useRef(workspaces);
  workspacesRef.current = workspaces;

  const hoveredPreviewRefImgRef = useRef(hoveredPreviewRefImg);
  hoveredPreviewRefImgRef.current = hoveredPreviewRefImg;

  const isSpacebarOverviewActiveRef = useRef(isSpacebarOverviewActive);
  isSpacebarOverviewActiveRef.current = isSpacebarOverviewActive;

  const isPanoramaScrollingRef = useRef(isPanoramaScrolling);
  isPanoramaScrollingRef.current = isPanoramaScrolling;

  const isLightboxMapOpenRef = useRef(isLightboxMapOpen);
  isLightboxMapOpenRef.current = isLightboxMapOpen;

  const compareModeRef = useRef(compareMode);
  compareModeRef.current = compareMode;

  const lightboxImageRef = useRef(lightboxImage);
  lightboxImageRef.current = lightboxImage;

  const trackFiltersRef = useRef(trackFilters);
  trackFiltersRef.current = trackFilters;

  // Press Space key to activate/deactivate the universal Map Navigation (全景导航)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space") {
        const repeat = e.repeat;

        let isInputFocused =
          document.activeElement?.tagName === "INPUT" ||
          document.activeElement?.tagName === "TEXTAREA" ||
          (document.activeElement as HTMLElement)?.isContentEditable;

        if (isInputFocused) {
          let isHoveringImage = !!hoveredImageItemRef.current;
          // 仅在非 repeat 时尝试 elementFromPoint 降级逻辑
          if (!isHoveringImage && !repeat && lastMousePosRef.current) {
            const el = document.elementFromPoint(
              lastMousePosRef.current.x,
              lastMousePosRef.current.y,
            );
            isHoveringImage = !!(el && el.closest("[data-lightbox-wrapper]"));
          }
          if (isHoveringImage || lightboxImageRef.current) {
            isInputFocused = false;
          }
        }

        if (isInputFocused) {
          return;
        }

        e.preventDefault();
        if (repeat) return; // 忽略长按持续派发的重复事件

        if (!compareModeRef.current) {
          isKeyboardHoldingSpaceRef.current = true;

          // 按下空格即立即触发全景导航视图
          if (!lightboxImageRef.current) {
            // 在画布画板视图中：获取当前悬停或中心位置的默认图像，并开启全景导航模式
            const defImage =
              hoveredImageItemRef.current || getDefaultImage();
            if (defImage) {
              setLightboxImage(defImage);
              setIsSpacebarOverviewActive(true);
            }
          } else {
            // 已在大图 Lightbox 视图中：派发事件开启全景导航覆盖层
            window.dispatchEvent(new CustomEvent("spacebar-map-open"));
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space") {
        if (isKeyboardHoldingSpaceRef.current) {
          let isInputFocused =
            document.activeElement?.tagName === "INPUT" ||
            document.activeElement?.tagName === "TEXTAREA" ||
            (document.activeElement as HTMLElement)?.isContentEditable;

          if (isInputFocused) {
            let isHoveringImage = !!hoveredImageItemRef.current;
            if (!isHoveringImage && lastMousePosRef.current) {
              const el = document.elementFromPoint(
                lastMousePosRef.current.x,
                lastMousePosRef.current.y,
              );
              isHoveringImage = !!(el && el.closest("[data-lightbox-wrapper]"));
            }
            if (isHoveringImage || lightboxImageRef.current) {
              isInputFocused = false;
            }
          }

          if (!isInputFocused) {
            e.preventDefault();
          }

          isKeyboardHoldingSpaceRef.current = false;

          // 松开空格键退出全景导航视图
          if (isSpacebarOverviewActiveRef.current) {
            if (
              activePanoramaScrollCountRef.current > 0 ||
              isSelectionPendingRef.current
            ) {
              // If we are currently scrolling/animating to a location in the map,
              // don't exit yet. Mark it so we exit once animation finishes!
              pendingSpacebarExitRef.current = true;
              setPendingSpacebarExit(true);
            } else {
              // Close Canvas-based Spacebar Map Overview
              setIsSpacebarOverviewActive(false);
              setPanoramaCompareSourceImage(null);

              closeLightboxAndScroll();
            }
          } else {
            // Already in Lightbox view! Just close the Map overlay, and keep Lightbox open
            window.dispatchEvent(new CustomEvent("spacebar-map-close"));
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const handleMapOpen = () => setIsLightboxMapOpen(true);
    const handleMapClose = () => setIsLightboxMapOpen(false);

    window.addEventListener("spacebar-map-open", handleMapOpen);
    window.addEventListener("spacebar-map-close", handleMapClose);

    return () => {
      window.removeEventListener("spacebar-map-open", handleMapOpen);
      window.removeEventListener("spacebar-map-close", handleMapClose);
    };
  }, []);

  // Theme state: defaults to light version ("UI改为浅色版本")
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (isSettingsLoaded && !isDbLoading) {
      setIndexedDBItem("img_studio_theme", theme);
    }
  }, [theme, isDbLoading, isSettingsLoaded]);

  // Press Enter key to automatically scroll the hovered column to top and focus its input
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        let targetTrackId = focusedTrackId;

        // Fallback: If not found in React state, use global mouse mapping
        if (!targetTrackId) {
          const elUnderCursor = document.elementFromPoint(
            latestMousePos.current.x,
            latestMousePos.current.y,
          );
          if (elUnderCursor) {
            const trackEl = elUnderCursor.closest(
              "[data-track-container]",
            ) as HTMLElement;
            if (trackEl) {
              targetTrackId = trackEl.getAttribute("data-track-container");
            }
          }
        }

        if (targetTrackId) {
          const activeNode = document.activeElement;
          const columnContainer = document.getElementById(
            `track-container-${targetTrackId}`,
          );
          const scrollContainer = document.getElementById(
            `track-scroll-container-${targetTrackId}`,
          );
          const logoOrEditorElement = columnContainer?.querySelector(
            ".rich-prompt-input",
          ) as HTMLElement | null;

          // Check if the input element is fully visible in the scroll container
          let isInputFullyVisible = true;
          if (scrollContainer && logoOrEditorElement) {
            if (scrollContainer.scrollTop > 10) {
              isInputFullyVisible = false;
            } else {
              const elRect = logoOrEditorElement.getBoundingClientRect();
              const conRect = scrollContainer.getBoundingClientRect();
              // Allow a small buffer of 5px for precision layouts
              if (
                elRect.top < conRect.top - 5 ||
                elRect.bottom > conRect.bottom + 5
              ) {
                isInputFullyVisible = false;
              }
            }
          }

          // Check if the current focused element is already inside the hovered column container
          const isFocusInsideHoveredColumn =
            columnContainer &&
            activeNode &&
            (columnContainer === activeNode ||
              columnContainer.contains(activeNode));

          // If not focused in the hovered column, OR focused but the input box is scrolled out of view, trigger scroll of this column to top
          const shouldTrigger =
            !isFocusInsideHoveredColumn || !isInputFullyVisible;

          if (shouldTrigger) {
            e.preventDefault();
            (window as any).__preventNextPromptEnterNewline = Date.now();

            // Scroll the column's scroll portion to top
            if (scrollContainer) {
              scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
            }

            // Focus the prompt editor inner contenteditable inside this column
            if (columnContainer) {
              const editorDiv = columnContainer.querySelector(
                ".rich-prompt-input",
              ) as HTMLElement | null;
              if (editorDiv) {
                editorDiv.focus();

                // Place the text cursor at the end of contenteditable for perfect user typing experience
                try {
                  const range = document.createRange();
                  const sel = window.getSelection();
                  range.selectNodeContents(editorDiv);
                  range.collapse(false);
                  if (sel) {
                    sel.removeAllRanges();
                    sel.addRange(range);
                  }
                } catch (err) {
                  console.warn("Cursor placement warning:", err);
                }
              }
            }
          }
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [focusedTrackId]);

  const [projects, setProjects] = useState<
    { id: string; name: string; createdAt: number }[]
  >([]);
  const [activeProjectId, setActiveProjectId] = useState<string>("");
  const [loadedProjectId, setLoadedProjectId] = useState<string>("");
  const [isScrollRestored, setIsScrollRestored] = useState<boolean>(false);
  const isActualLoading = isDbLoading || activeProjectId !== loadedProjectId;
  const isViewportShowing = !isActualLoading && isScrollRestored;
  const [isProjectsLoaded, setIsProjectsLoaded] = useState(false);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isSettingsDropdownOpen, setIsSettingsDropdownOpen] = useState(false);
  const [editingProjId, setEditingProjId] = useState<string | null>(null);
  const [editingProjName, setEditingProjName] = useState("");
  const [deletingProjId, setDeletingProjId] = useState<string | null>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const settingsDropdownRef = useRef<HTMLDivElement>(null);
  const [globalReferenceImages, setGlobalReferenceImages] = useState<ImageReference[]>([]);

  useEffect(() => {
    if (isSettingsLoaded && !isActualLoading && activeProjectId) {
      setIndexedDBItem(`img_studio_global_refs_${activeProjectId}`, globalReferenceImages);
    }
  }, [globalReferenceImages, isActualLoading, isSettingsLoaded, activeProjectId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        projectDropdownRef.current &&
        !projectDropdownRef.current.contains(event.target as Node)
      ) {
        setIsProjectDropdownOpen(false);
        setEditingProjId(null);
      }
      if (
        settingsDropdownRef.current &&
        !settingsDropdownRef.current.contains(event.target as Node)
      ) {
        setIsSettingsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 0. Load Initial Global Settings (Theme, Config, etc.)
  useEffect(() => {
    async function initSettings() {
      try {
        // Request persistent storage from the browser to prevent eviction
        await requestStoragePersistence();

        const savedConfig = await getIndexedDBItem<ApiConfig>(
          "img_studio_api_config",
        );
        if (savedConfig) {
          setConfig((prev) => ({
            ...prev,
            ...savedConfig,
            qianwenApiUrl:
              savedConfig.qianwenApiUrl || prev.qianwenApiUrl,
          }));
        }

        const savedTheme = await getIndexedDBItem<string>("img_studio_theme");
        if (savedTheme === "dark" || savedTheme === "light")
          setTheme(savedTheme as any);

        const savedSyncScroll = await getIndexedDBItem<boolean>(
          "img_studio_sync_canvas_scroll",
        );
        if (typeof savedSyncScroll === "boolean")
          setSyncCanvasScrollOnView(savedSyncScroll);

        const savedZoom = await getIndexedDBItem<number>(
          "img_studio_workspace_zoom",
        );
        if (typeof savedZoom === "number" && savedZoom >= 60 && savedZoom <= 100) {
          setWorkspaceZoomLevel(savedZoom);
        }
      } catch (err) {
        console.warn("Failed to load initial settings:", err);
      } finally {
        setIsSettingsLoaded(true);
      }
    }
    initSettings();
  }, []);

  // 1. Load Projects
  useEffect(() => {
    async function initProjects() {
      try {
        let loadedProjects = await getIndexedDBItem<
          { id: string; name: string; createdAt: number }[]
        >("img_studio_projects_v2");
        let loadedActive = await getIndexedDBItem<string>(
          "img_studio_active_project_v2",
        );

        if (
          !loadedProjects ||
          !Array.isArray(loadedProjects) ||
          loadedProjects.length === 0
        ) {
          loadedProjects = [
            { id: "default", name: "默认项目", createdAt: Date.now() },
          ];
          loadedActive = "default";
          await setIndexedDBItem("img_studio_projects_v2", loadedProjects);
          await setIndexedDBItem("img_studio_active_project_v2", "default");
        }

        // 自动注入 100列1000图 性能测试项目 (含 1K/2K/4K 分辨率)
        const PERF_TEST_ID = "perf-test-100x10";
        let perfProj = loadedProjects.find((p) => p.id === PERF_TEST_ID || p.id === "perf-test-10x1000" || p.id === "perf-test-10x100");
        if (!perfProj) {
          perfProj = {
            id: PERF_TEST_ID,
            name: "⚡ 性能测试项目 (100列/1000图 1K/2K/4K)",
            createdAt: Date.now(),
          };
          loadedProjects.unshift(perfProj);
          loadedActive = PERF_TEST_ID;
          await setIndexedDBItem("img_studio_projects_v2", loadedProjects);
          await setIndexedDBItem("img_studio_active_project_v2", loadedActive);
        } else {
          if (perfProj.name !== "⚡ 性能测试项目 (100列/1000图 1K/2K/4K)") {
            perfProj.name = "⚡ 性能测试项目 (100列/1000图 1K/2K/4K)";
            await setIndexedDBItem("img_studio_projects_v2", loadedProjects);
          }
        }

        if (
          !loadedActive ||
          !loadedProjects.find((p) => p.id === loadedActive)
        ) {
          loadedActive = loadedProjects[0].id;
          await setIndexedDBItem("img_studio_active_project_v2", loadedActive);
        }

        setProjects(loadedProjects);
        setActiveProjectId(loadedActive);
      } catch (err) {
        console.error(
          "Failed to init projects. Locking DB to prevent data loss:",
          err,
        );
        setIsDbWriteLocked(true);
        setProjects([
          { id: "error", name: "⚠️ 数据库故障", createdAt: Date.now() },
        ]);
        setActiveProjectId("error");
      } finally {
        setIsProjectsLoaded(true);
      }
    }
    initProjects();
  }, []);

  // 2. Load Workspaces for Active Project
  useEffect(() => {
    if (!isProjectsLoaded || !activeProjectId) return;

    async function loadActiveWorkspaces() {
      setIsDbLoading(true);
      setIsDbWriteLocked(false); // Reset database write protection on new project load
      setWorkspaces([]); // Clear workspaces immediately to prevent exit transition overlap when new project loads!
      setIsScrollRestored(false); // Hide viewport immediately

      const wsKey = `img_studio_workspaces_v2_${activeProjectId}`;
      const backupKey = `img_studio_workspaces_v2_${activeProjectId}_backup`;
      const outboxKey = `img_studio_workspaces_v2_${activeProjectId}_outbox`;

      try {
        let dbWorkspaces: ImageWorkspace[] | null = null;
        let isCriticalDbError = false;

        // Try outbox first
        try {
          const outbox = await getIndexedDBItem<ImageWorkspace[]>(outboxKey);
          if (outbox && Array.isArray(outbox) && outbox.length > 0) {
            console.log("Found uncommitted outbox. Restoring from outbox to prevent data loss.");
            dbWorkspaces = outbox;
          }
        } catch (outboxErr) {
          console.error("IndexedDB outbox read error:", outboxErr);
        }

        // Try primary load if no outbox
        if (!dbWorkspaces) {
          try {
            dbWorkspaces = await getIndexedDBItem<ImageWorkspace[]>(wsKey);
          } catch (dbErr) {
            console.error(
              "IndexedDB critical read error on primary workspaces key:",
              dbErr,
            );
            isCriticalDbError = true;
          }
        }

        // Secondary fallback load flows if empty or exceptions occurred
        if (
          !dbWorkspaces ||
          !Array.isArray(dbWorkspaces) ||
          dbWorkspaces.length === 0
        ) {
          console.warn(
            `Workspaces key '${wsKey}' empty or load failed. Attempting rescue operations from backup...`,
          );

          // 1. Try reading from the IndexedDB backup key
          try {
            const dbBackup =
              await getIndexedDBItem<ImageWorkspace[]>(backupKey);
            if (dbBackup && Array.isArray(dbBackup) && dbBackup.length > 0) {
              console.log(
                "Successfully restored workspaces from IndexedDB backup.",
              );
              dbWorkspaces = dbBackup;
            }
          } catch (bakErr) {
            console.error("IndexedDB backup load failed:", bakErr);
            isCriticalDbError = true;
          }

          // 2. Fallback check (backup partition check only, localStorage removed)
          if (!dbWorkspaces || dbWorkspaces.length === 0) {
            console.log("Checking secondary IndexedDB backup keys...");
          }
        }

        // Backward compatibility for the default project
        if (
          activeProjectId === "default" &&
          (!dbWorkspaces || dbWorkspaces.length === 0)
        ) {
          try {
            const legacyDbWorkspaces = await getIndexedDBItem<ImageWorkspace[]>(
              "img_studio_workspaces_v2",
            );
            if (legacyDbWorkspaces && legacyDbWorkspaces.length > 0) {
              dbWorkspaces = legacyDbWorkspaces;
            }
          } catch (legacyErr) {
            console.error(
              "Failed to load legacy default workspaces:",
              legacyErr,
            );
            isCriticalDbError = true;
          }
        }

        // If this is the performance test project and data is missing or incomplete, generate 100 columns & 1000 images
        const isPerfProj = activeProjectId === "perf-test-100x10" || activeProjectId === "perf-test-10x1000" || activeProjectId === "perf-test-10x100";
        const isPerfIncomplete = isPerfProj && (!dbWorkspaces || !Array.isArray(dbWorkspaces) || dbWorkspaces.length < 100);

        if (isPerfIncomplete) {
          const perfDefaults = generatePerfTestWorkspaces();
          dbWorkspaces = perfDefaults;
          try {
            await setIndexedDBItem(wsKey, perfDefaults);
            await setIndexedDBItem(
              backupKey,
              getTrimmedWorkspacesForBackup(perfDefaults),
            );
          } catch (wErr) {
            console.warn("Failed to write perf test workspaces:", wErr);
          }
        }

        // Final reconciliation & Automatic heal
        if (
          dbWorkspaces &&
          Array.isArray(dbWorkspaces) &&
          dbWorkspaces.length > 0
        ) {
          // Pass through the self-healing and data-repair pipeline
          const healedWorkspaces = autoRepairWorkspaces(dbWorkspaces);
          setWorkspaces(healedWorkspaces);

          if (isCriticalDbError) {
            // Guard state if there was a load error (even though we temporarily loaded backup)
            // so we don't automatically overwrite anything with partial or empty saves
            setIsDbWriteLocked(true);
          }
        } else {
          // If we had a database exception (like browser locked/shutdown recovery), DO NOT OVERWRITE!
          if (isCriticalDbError) {
            console.error(
              "Critical database error encountered and no backup restored. Locking writes to prevent data loss.",
            );
            setIsDbWriteLocked(true);

            // Show a visual warning indicator to the user
            setWorkspaces([
              {
                id: `ws-err-${Date.now()}`,
                name: "数据库恢复中...",
                imagePrompt: "",
                imageModel: "gpt-image-2-all",
                imageSize: "1:1",
                callFormat: "images",
                refImages: [],
                includeUrlsInPrompt: true,
                includeUrlsInBody: true,
                generations: [
                  {
                    id: "db-err-item",
                    prompt:
                      "系统读取数据库时遇到暂时性限制，这可能是由于异常关机所致。",
                    status: "failed",
                    error:
                      "浏览器存储库 (IndexedDB) 正由系统进行自动维护或已被锁定。请勿执行写操作。推荐刷新本页面以安全恢复全部图库及运行列。",
                    createdAt: Date.now(),
                  },
                ],
                columnWidth: "narrow",
              },
            ]);
          } else {
            // Only if it was genuinely empty, with NO exception occurring (e.g. a brand new project), we can use defaults.
            const labelPrefix =
              activeProjectId === "default" ? "生图列_" : "新项目生图列_";
            const now = Date.now();
            const defaults: ImageWorkspace[] = [
              {
                id:
                  activeProjectId === "default"
                    ? "ws-default-1"
                    : `ws-${now}-1`,
                name: "生图列_01",
                imagePrompt: "",
                imageModel: "gpt-image-2-all",
                imageSize: "1:1",
                imageResolution: "1k",
                callFormat: "images",
                refImages: [],
                includeUrlsInPrompt: true,
                includeUrlsInBody: true,
                generations: [],
                columnWidth: "narrow",
              },
              {
                id:
                  activeProjectId === "default"
                    ? "ws-default-2"
                    : `ws-${now}-2`,
                name: "生图列_02",
                imagePrompt: "",
                imageModel: "gpt-image-2-all",
                imageSize: "1:1",
                imageResolution: "1k",
                callFormat: "images",
                refImages: [],
                includeUrlsInPrompt: true,
                includeUrlsInBody: true,
                generations: [],
                columnWidth: "narrow",
              },
            ];
            setWorkspaces(defaults);
            // Attempt to write defaults cleanly
            try {
              await setIndexedDBItem(wsKey, defaults);
              // Also write clean backups
              await setIndexedDBItem(
                backupKey,
                getTrimmedWorkspacesForBackup(defaults),
              );
            } catch (wErr) {
              console.warn("Failed to write initial default workspaces:", wErr);
            }
          }
        }
        
        // Load Global Refs for active project
        try {
          const projectGlobalRefs = await getIndexedDBItem<ImageReference[]>(`img_studio_global_refs_${activeProjectId}`);
          if (projectGlobalRefs && Array.isArray(projectGlobalRefs)) {
             setGlobalReferenceImages(projectGlobalRefs);
          } else if (activeProjectId === "default") {
             // fallback for backwards compatibility on default project
             const legacyGlobalRefs = await getIndexedDBItem<ImageReference[]>("img_studio_global_refs");
             setGlobalReferenceImages(legacyGlobalRefs || []);
          } else {
             setGlobalReferenceImages([]);
          }
        } catch(e) {
          console.warn("Failed to load project global refs", e);
          setGlobalReferenceImages([]);
        }

      } catch (globalErr) {
        console.error("Fatal exception in loadActiveWorkspaces:", globalErr);
        setIsDbWriteLocked(true);
      } finally {
        setLoadedProjectId(activeProjectId);
        setIsDbLoading(false);
      }
    }
    loadActiveWorkspaces();
  }, [activeProjectId, isProjectsLoaded]);

  // Scroll to center first column of new project on load or restore last view
  useEffect(() => {
    if (
      !isDbLoading &&
      activeProjectId &&
      activeProjectId === loadedProjectId &&
      activeProjectId !== centeredProjectRef.current &&
      !isSpacebarOverviewActive
    ) {
      const doRestore = async () => {
        await new Promise((r) => setTimeout(r, 50));
        const container = document.getElementById("tracks-scroll-viewport");
        if (container) {
          const savedScroll = await getIndexedDBItem<string>(
            `img_studio_scroll_position_${activeProjectId}`,
          );
          if (savedScroll !== null) {
            container.scrollTo({
              left: parseFloat(savedScroll),
              behavior: "instant" as ScrollBehavior,
            });
          } else {
            const isDesktop = window.innerWidth >= 768;
            const gapSize = isDesktop ? 24 : 16;
            const placeholderWidth = isDesktop ? 460 : window.innerWidth * 0.88;

            // Calculate total width of all active workspaces
            let totalWorkspacesWidth = 0;
            if (workspaces && workspaces.length > 0) {
              const widths = workspaces.map((w) => {
                return w.columnWidth === "wide"
                  ? 840
                  : w.columnWidth === "medium"
                    ? 650
                    : 460;
              });
              const sumWidths = widths.reduce((sum, w) => sum + w, 0);
              totalWorkspacesWidth =
                sumWidths + (workspaces.length - 1) * gapSize;
            } else {
              totalWorkspacesWidth = 460; // default fallback
            }

            const targetLeft =
              placeholderWidth + gapSize + totalWorkspacesWidth / 2;
            container.scrollTo({
              left: targetLeft,
              behavior: "instant" as ScrollBehavior,
            });
          }

          // Also restore individual vertical column scrolls in parallel
          await Promise.all(
            workspaces.map(async (ws) => {
              const trackContainer = document.getElementById(
                `track-scroll-container-${ws.id}`,
              );
              if (trackContainer) {
                const savedTrackScroll = await getIndexedDBItem<string>(
                  `img_studio_track_scroll_${activeProjectId}_${ws.id}`,
                );
                if (savedTrackScroll !== null) {
                  trackContainer.scrollTop = parseFloat(savedTrackScroll);
                }
              }
            }),
          );

          centeredProjectRef.current = activeProjectId;
          setIsScrollRestored(true);
        } else {
          setIsScrollRestored(true);
        }
      };
      doRestore();
    }
  }, [
    isDbLoading,
    activeProjectId,
    loadedProjectId,
    workspaces,
    isSpacebarOverviewActive,
  ]);

  // ---------------------------------------------------------------------------
  // 方案 2：高频滚动监听由 React 逻辑转为原生 passive 绑定 (tracks-scroll-viewport)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const el = document.getElementById("tracks-scroll-viewport");
    if (!el || !activeProjectId) return;

    const handleViewportScrollNative = () => {
      checkOffscreenGenerating();
      if (!isScrollRestored) return; // 只有在滚动位置完全恢复后，才允许把滚动行为保存至数据库！
      debouncedSetItem(
        `img_studio_scroll_position_${activeProjectId}`,
        el.scrollLeft.toString(),
      );
    };

    el.addEventListener("scroll", handleViewportScrollNative, {
      passive: true,
    });
    return () => {
      el.removeEventListener("scroll", handleViewportScrollNative);
    };
  }, [activeProjectId, isScrollRestored, checkOffscreenGenerating]);

  // Track currently expanded track reference inputs
  const [trackUrlInput, setTrackUrlInput] = useState<{
    [trackId: string]: string;
  }>({});
  const [trackUrlOpen, setTrackUrlOpen] = useState<{
    [trackId: string]: boolean;
  }>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");
  const [activeDragTrackId, setActiveDragTrackId] = useState<string | null>(
    null,
  );

  // States for copy-paste config and toast notifications
  const [copiedConfig, setCopiedConfig] = useState<{
    imagePrompt: string;
    imageModel: string;
    imageSize: string;
    imageResolution?: string;
    callFormat: "images" | "chat";
    includeUrlsInPrompt: boolean;
    includeUrlsInBody: boolean;
    refImages: { id: string; url: string; name?: string }[];
  } | null>(null);
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([]);

  const setToast = useCallback((message: string | null) => {
    if (!message) return;
    const id = Date.now().toString() + Math.random().toString();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2500);
  }, []);

  // Local interaction feedback states (each last 1.5s)
  const [justCopiedColId, setJustCopiedColId] = useState<string | null>(null);
  const [justPastedColId, setJustPastedColId] = useState<string | null>(null);
  const [justCopiedCardGenId, setJustCopiedCardGenId] = useState<string | null>(
    null,
  );
  const [justAppliedCardGenId, setJustAppliedCardGenId] = useState<
    string | null
  >(null);

  useEffect(() => {
    // legacy toast effect removed
  }, []);

  const handleCopyConfig = (ws: ImageWorkspace) => {
    setCopiedConfig({
      imagePrompt: ws.imagePrompt,
      imageModel: ws.imageModel,
      imageSize: ws.imageSize,
      imageResolution: ws.imageResolution,
      callFormat: ws.callFormat,
      includeUrlsInPrompt: ws.includeUrlsInPrompt,
      includeUrlsInBody: ws.includeUrlsInBody,
      refImages: ws.refImages.map((img) => ({
        id: img.id,
        url: img.url,
        name: img.name,
      })),
    });
    setToast(`已复制 “${ws.name}” 的全套生图配置`);
    setJustCopiedColId(ws.id);
    setTimeout(() => setJustCopiedColId(null), 1500);
  };

  const handleCopyGenConfig = (gen: GenerationItem, label: string) => {
    setCopiedConfig({
      imagePrompt: gen.prompt,
      imageModel: gen.model,
      imageSize: gen.size,
      imageResolution: gen.resolution,
      callFormat: gen.callFormat,
      includeUrlsInPrompt: true,
      includeUrlsInBody: true,
      refImages: gen.refImages.map((img, idx) => {
        if (typeof img === "string") {
          const nextId = (idx + 1).toString();
          return {
            id: nextId,
            url: img,
            name: getFilenameFromUrl(img, nextId),
          };
        }
        return {
          id: img.id || (idx + 1).toString(),
          url: img.url,
          name:
            img.name ||
            getFilenameFromUrl(img.url, img.id || (idx + 1).toString()),
        };
      }),
    });
    setToast(`已复制${label}的全套生图配置，可在任意列中选择“粘贴”`);
    setJustCopiedCardGenId(gen.id);
    setTimeout(() => setJustCopiedCardGenId(null), 1500);
  };

  const handleCopyPromptToClipboard = (promptText: string) => {
    navigator.clipboard
      .writeText(promptText)
      .then(() => {
        setToast("提示词已成功复制到剪贴板！");
      })
      .catch((err) => {
        console.error("复制失败:", err);
        setToast("复制失败，请手动选择复制。");
      });
  };

  const [pasteConfirmTrackId, setPasteConfirmTrackId] = useState<string | null>(
    null,
  );
  const [restoreConfirm, setRestoreConfirm] = useState<{
    trackId: string;
    historyItem: GenerationItem;
  } | null>(null);

  const handlePasteConfig = (targetTrackId: string, force: boolean = false) => {
    if (!copiedConfig) {
      setAlertMessage("请先在某一列点击 “复制” 按钮！");
      return;
    }

    const targetTrack = workspaces.find((w) => w.id === targetTrackId);
    if (!targetTrack) return;

    const hasExistingContent =
      targetTrack.imagePrompt.trim() !== "" || targetTrack.refImages.length > 0;

    if (hasExistingContent && !force) {
      setPasteConfirmTrackId(targetTrackId);
      return;
    }

    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id === targetTrackId) {
          return {
            ...w,
            imagePrompt: copiedConfig.imagePrompt,
            imageModel: copiedConfig.imageModel,
            imageSize: copiedConfig.imageSize,
            imageResolution: copiedConfig.imageResolution,
            callFormat: copiedConfig.callFormat,
            includeUrlsInPrompt: copiedConfig.includeUrlsInPrompt,
            includeUrlsInBody: copiedConfig.includeUrlsInBody,
            refImages: copiedConfig.refImages.map((img) => ({
              id: img.id,
              url: img.url,
              name: img.name,
            })),
          };
        }
        return w;
      }),
    );
    setPasteConfirmTrackId(null);
    setToast("已成功粘贴并复刻生图配置！");
    setJustPastedColId(targetTrackId);
    setTimeout(() => setJustPastedColId(null), 1500);
  };

  const [clearConfirmTrackId, setClearConfirmTrackId] = useState<string | null>(
    null,
  );

  const handleClearTrackConfig = (
    targetTrackId: string,
    force: boolean = false,
  ) => {
    const targetTrack = workspaces.find((w) => w.id === targetTrackId);
    if (!targetTrack) return;

    if (!force) {
      setClearConfirmTrackId(targetTrackId);
      return;
    }

    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id === targetTrackId) {
          return {
            ...w,
            imagePrompt: "",
            refImages: [],
          };
        }
        return w;
      }),
    );
    setClearConfirmTrackId(null);
    setToast("已清空生图配置！");
  };

  // States for custom delete confirmation and alert popups
  const [deleteConfirmTrackId, setDeleteConfirmTrackId] = useState<
    string | null
  >(null);
  const [deleteConfirmGen, setDeleteConfirmGen] = useState<{
    trackId: string;
    genId: string;
  } | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const handleDeleteImage = (
    trackId: string,
    genId: string,
    urlToDelete: string,
  ) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id === trackId) {
          const updatedGenerations = w.generations.map((gen) => {
            if (gen.id === genId) {
              const newData = gen.result?.data?.filter(
                (item: any) => item.url !== urlToDelete,
              );
              return {
                ...gen,
                result: {
                  ...gen.result,
                  data: newData,
                },
              };
            }
            return gen;
          });
          return {
            ...w,
            generations: updatedGenerations.filter(
              (gen) =>
                (gen.result?.data?.length ?? 0) > 0 || gen.status !== "success",
            ),
          };
        }
        return w;
      }),
    );
  };

  // States for horizontal column dragging / reordering
  const [draggableId, setDraggableId] = useState<string | null>(null);
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);

  // Track window resizing for precise dynamic centering calculation
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1200,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      checkOffscreenGenerating();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [checkOffscreenGenerating]);

  // Keep state synced with IndexedDB & localStorage using debounce to prevent main thread blocking
  const hasPendingSaveRef = useRef<boolean>(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveWorkspaceData = useCallback(
    (projId: string, data: ImageWorkspace[]) => {
      const wsKey = `img_studio_workspaces_v2_${projId}`;
      const backupKey = `img_studio_workspaces_v2_${projId}_backup`;
      const outboxKey = `img_studio_workspaces_v2_${projId}_outbox`;
      
      saveQueueRef.current = saveQueueRef.current.then(async () => {
        try {
          // Create a deep copy for safe writing to avoid React state mutation during serialization.
          // We use structuredClone to preserve Blob objects which would be destroyed by JSON stringify.
          const dataCopy = structuredClone(data);
          
          // Filter out temporary blob: URLs and empty payloads
          for (const ws of dataCopy) {
            if (ws.generations) {
              ws.generations = ws.generations.filter(gen => {
                // If it's a success generation with data, filter out invalid urls
                if (gen.status === 'success' && gen.result && Array.isArray(gen.result.data)) {
                  gen.result.data = gen.result.data.filter((item: any) => {
                    if (!item || !item.url) return false;
                    if (typeof item.url === 'string' && item.url.startsWith('blob:')) {
                      console.warn('Intercepted and removed temporary blob: URL before save.');
                      return false;
                    }
                    return true;
                  });
                  // If all images in this generation were removed (empty payload), remove the generation
                  if (gen.result.data.length === 0) return false;
                }
                return true;
              });
            }
          }

          // Write directly to primary store and trimmed backup
          await setIndexedDBItem(wsKey, dataCopy);
          const trimmed = getTrimmedWorkspacesForBackup(dataCopy);
          await setIndexedDBItem(backupKey, trimmed);
          
          hasPendingSaveRef.current = false;
        } catch (err) {
          console.error("Workspace save encountered an error:", err);
        }
      });
    },
    [],
  );

  useEffect(() => {
    if (isActualLoading || !isProjectsLoaded || !activeProjectId) return;
    if (isDbWriteLocked) {
      console.warn(
        "Database saving is locked due to loading errors. Skipping automatic saves to avoid data overwriting.",
      );
      return;
    }

    hasPendingSaveRef.current = true;
    let idleHandle: number | null = null;
    const timeout = setTimeout(() => {
      if (typeof (window as any).requestIdleCallback === "function") {
        idleHandle = (window as any).requestIdleCallback(
          () => {
            saveWorkspaceData(activeProjectId, workspaces);
          },
          { timeout: 2000 },
        );
      } else {
        saveWorkspaceData(activeProjectId, workspaces);
      }
    }, 1000);

    return () => {
      clearTimeout(timeout);
      if (
        idleHandle !== null &&
        typeof (window as any).cancelIdleCallback === "function"
      ) {
        (window as any).cancelIdleCallback(idleHandle);
      }
    };
  }, [
    workspaces,
    isActualLoading,
    isProjectsLoaded,
    activeProjectId,
    isDbWriteLocked,
    saveWorkspaceData,
  ]);

  // Prompt on page unload / refresh if there are pending saves
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasPendingSaveRef.current && activeProjectId && !isDbWriteLocked) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [activeProjectId, isDbWriteLocked]);

  // Keep projects state synced with IndexedDB
  useEffect(() => {
    if (!isProjectsLoaded) return;
    if (isDbWriteLocked) {
      console.warn(
        "Saving projects is locked because a database loading error occurred. Skipping projects update.",
      );
      return;
    }
    setIndexedDBItem("img_studio_projects_v2", projects).catch((e) => {
      console.error("Failed to sync projects to IndexedDB:", e);
    });
    if (activeProjectId) {
      setIndexedDBItem("img_studio_active_project_v2", activeProjectId).catch(
        (e) => console.warn("Failed to save active project to IndexedDB:", e),
      );
    }
  }, [projects, activeProjectId, isProjectsLoaded, isDbWriteLocked]);

  // Sync active model catalog on load
  useEffect(() => {
    fetchModels();
    setMessages([
      {
        id: "initial-system",
        role: "assistant",
        content:
          "Hello! This sandbox playground is pre-configured with your API parameters. Send any test message or click 'Run Diagnostic Check' to analyze authorization, latency, and model support.",
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  }, []);

  const handleCopy = (text: string, identifier: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(identifier);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleCopyImageToClipboard = async (url: string | Blob) => {
    try {
      const convertToPng = async (blob: Blob): Promise<Blob> => {
        if (blob.type === "image/png") return blob;
        return new Promise((resolve) => {
          const imgUrl = URL.createObjectURL(blob);
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            URL.revokeObjectURL(imgUrl);
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              canvas.toBlob((pngBlob) => {
                if (pngBlob) resolve(pngBlob);
                else resolve(blob);
              }, "image/png");
            } else {
              resolve(blob);
            }
          };
          img.onerror = () => {
            URL.revokeObjectURL(imgUrl);
            resolve(blob);
          };
          img.src = imgUrl;
        });
      };

      if (url instanceof Blob) {
        const pngBlob = await convertToPng(url);
        const item = new ClipboardItem({
          [pngBlob.type || "image/png"]: pngBlob,
        });
        await navigator.clipboard.write([item]);
        setToast("图片已成功复制到剪贴板！");
        return;
      }
      if (typeof url === "string") {
        let blob: Blob;
        if (url.startsWith("data:")) {
          blob = await (await fetch(url)).blob();
        } else {
          const response = await fetchWithRetry(url, { mode: "cors" });
          if (!response || !response.ok) throw new Error("Fetch failed");
          blob = await response.blob();
        }
        const pngBlob = await convertToPng(blob);
        const item = new ClipboardItem({
          [pngBlob.type || "image/png"]: pngBlob,
        });
        await navigator.clipboard.write([item]);
        setToast("图片已成功复制到剪贴板！");
      }
    } catch (e) {
      console.error("Copy image failed:", e);
      setToast("图片复制失败，请重试。");
    }
  };

  const handleDownloadImage = async (
    url: string | Blob,
    promptText: string,
    trackId?: string,
    genId?: string,
  ) => {
    try {
      // Clean up filename
      const cleanPrompt = (promptText || "dream-image")
        .slice(0, 30)
        .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "-");
      const filename = `${cleanPrompt || "image"}.png`;

      const downloadFallback = (targetUrl: string) => {
        window.open(targetUrl, "_blank");
      };

      const executeDownload = async () => {
        if (url instanceof Blob) {
          const blobUrl = URL.createObjectURL(url);
          const link = document.createElement("a");
          link.href = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(blobUrl);
          return true;
        }

        if (url.startsWith("data:")) {
          const link = document.createElement("a");
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          return true;
        }

        const response = await fetchWithRetry(url, { mode: "cors" }).catch(
          () => null,
        );
        if (response && response.ok) {
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(blobUrl);
          return true;
        } else {
          downloadFallback(url);
          return true;
        }
      };

      await executeDownload();

      // Update state to mark as downloaded
      if (trackId && genId) {
        setWorkspaces((prev) =>
          prev.map((w) => {
            if (w.id === trackId) {
              return {
                ...w,
                generations: w.generations.map((g) => {
                  if (g.id === genId) {
                    return {
                      ...g,
                      downloadedUrls: [...(g.downloadedUrls || []), url],
                    };
                  }
                  return g;
                }),
              };
            }
            return w;
          }),
        );
      }
    } catch (err) {
      console.error("Error downloading image:", err);
      const finalUrl = url instanceof Blob ? URL.createObjectURL(url) : url;
      window.open(finalUrl, "_blank");
    }
  };

  const addLog = (msg: string) => {
    setDiagnosticLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] ${msg}`,
    ]);
  };

  // Image helpers
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve((e.target?.result as string) || "");
      };
      reader.onerror = () => {
        resolve("");
      };
      reader.readAsDataURL(file);
    });
  };

  // Create simple track url inputs helper
  const addUrlReferenceToTrack = (trackId: string) => {
    const url = trackUrlInput[trackId]?.trim();
    if (!url) return;

    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id === trackId) {
          if (w.refImages.some((img) => img.url === url)) return w;
          const nextId = (
            Math.max(
              ...w.refImages.map((img) => parseInt(img.id, 10) || 0),
              0,
            ) + 1
          ).toString();
          return {
            ...w,
            refImages: [
              ...w.refImages,
              { id: nextId, url, name: getFilenameFromUrl(url, nextId) },
            ],
          };
        }
        return w;
      }),
    );
    setTrackUrlInput((prev) => ({ ...prev, [trackId]: "" }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleTrackDragOver = (trackId: string, e: React.DragEvent) => {
    e.preventDefault();
    // Allow dragging standard files or plain text URLs
    const hasFiles = e.dataTransfer.types.includes("Files");
    const hasText =
      e.dataTransfer.types.includes("text/plain") ||
      e.dataTransfer.types.includes("image-url");
    if (hasFiles || hasText) {
      if (activeDragTrackId !== trackId) {
        setActiveDragTrackId(trackId);
      }
    }
  };

  const handleTrackDropFile = async (trackId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveDragTrackId(null);

    // 1. Try dealing with internal/external image URLs (e.g. dragged from generated outputs)
    const draggedItemUrl = draggedImageItemRef.current?.url;
    const imageUrl =
      draggedItemUrl ||
      e.dataTransfer.getData("image-url") ||
      e.dataTransfer.getData("text/plain");

    const isDraggedInternalItem = !!draggedItemUrl;

    if (
      imageUrl instanceof Blob ||
      isDraggedInternalItem ||
      (typeof imageUrl === "string" &&
        (imageUrl.startsWith("http://") ||
          imageUrl.startsWith("https://") ||
          imageUrl.startsWith("blob:") ||
          imageUrl.startsWith("data:image/") ||
          imageUrl.startsWith("/")))
    ) {
      setWorkspaces((prev) =>
        prev.map((w) => {
          if (w.id === trackId) {
            if (w.refImages.length >= 16) return w;
            if (w.refImages.some((img) => img.url === imageUrl)) return w;
            const nextId = (
              Math.max(
                ...w.refImages.map((img) => parseInt(img.id, 10) || 0),
                0,
              ) + 1
            ).toString();
            return {
              ...w,
              refImages: [
                ...w.refImages,
                {
                  id: nextId,
                  url: imageUrl,
                  name: getFilenameFromUrl(imageUrl, nextId),
                },
              ],
            };
          }
          return w;
        }),
      );
      return;
    }

    // 2. Deal with file uploads
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await uploadFilesToTrack(trackId, files);
    }
  };

  const uploadFilesToTrack = async (
    trackId: string,
    files: FileList | File[],
  ) => {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const thumb = await createThumbnailToBase64(file, 160);
        setWorkspaces((prev) =>
          prev.map((w) => {
            if (w.id === trackId) {
              if (w.refImages.length >= 16) return w;
              // Simple check for same object not perfect but usually okay for manual uploads
              if (w.refImages.some((img) => img.url === file)) return w;
              const nextId = (
                Math.max(
                  ...w.refImages.map((img) => parseInt(img.id, 10) || 0),
                  0,
                ) + 1
              ).toString();
              return {
                ...w,
                refImages: [
                  ...w.refImages,
                  { id: nextId, url: file, name: file.name, thumbnail: thumb },
                ],
              };
            }
            return w;
          }),
        );
      } catch (err) {
        console.error("Failed to add reference image as blob:", err);
      }
    }
  };

  // Remove Reference Image
  const removeRefImage = (trackId: string, indexToRemove: number) => {
    // Clear hover state as the image might be removed while hovered, preventing ghost previews
    setHoveredPreviewRefImg(null);

    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id === trackId) {
          const imageToRemove = w.refImages[indexToRemove];
          if (!imageToRemove) return w;

          // Automatically remove the corresponding @refId tag from prompt
          const regex = new RegExp(`\\s?@${imageToRemove.id}(?!\\d)\\s?`, "g");
          const updatedPrompt = w.imagePrompt
            .split("\n")
            .map((line) => {
              if (line.trim() === `@${imageToRemove.id}`) {
                return "";
              }
              return line.replace(regex, "");
            })
            .join("\n");

          return {
            ...w,
            imagePrompt: updatedPrompt,
            refImages: w.refImages.filter((_, idx) => idx !== indexToRemove),
          };
        }
        return w;
      }),
    );
  };

  // Insert a new track explicitly at a given index
  const insertTrackAt = (index: number) => {
    const newId = `ws-${Date.now()}`;
    const newWs: ImageWorkspace = {
      id: newId,
      name: `生图列_${String(workspaces.length + 1).padStart(2, "0")}`,
      imagePrompt: "",
      imageModel: "gpt-image-2-all",
      imageSize: "1:1",
      imageResolution: "1k",
      callFormat: "images",
      refImages: [],
      includeUrlsInPrompt: true,
      includeUrlsInBody: true,
      generations: [],
      columnWidth: "narrow",
    };

    setWorkspaces((prev) => {
      const arr = [...prev];
      arr.splice(index, 0, newWs);
      return arr;
    });

    setTimeout(() => {
      const el = document.getElementById(`track-container-${newId}`);
      if (el) {
        el.scrollIntoView({
          behavior: "smooth",
          inline: "center",
          block: "nearest",
        });
      }
    }, 100);
  };

  // Add a new track (Panel)
  const addNewTrack = (direction: "left" | "right" = "right") => {
    const newId = `ws-${Date.now()}`;
    const newWs: ImageWorkspace = {
      id: newId,
      name: `生图列_${String(workspaces.length + 1).padStart(2, "0")}`,
      imagePrompt: "",
      imageModel: "gpt-image-2-all",
      imageSize: "1:1",
      imageResolution: "1k",
      callFormat: "images",
      refImages: [],
      includeUrlsInPrompt: true,
      includeUrlsInBody: true,
      generations: [],
      columnWidth: "narrow",
    };

    const container = document.getElementById("tracks-scroll-viewport");

    if (direction === "left") {
      let updated: ImageWorkspace[] = [];
      const currentS = container ? container.scrollLeft : 0;

      flushSync(() => {
        setWorkspaces((prev) => {
          updated = [newWs, ...prev];
          return updated;
        });
      });

      if (container) {
        const viewportWidth = container.clientWidth || window.innerWidth;
        const isDesktop = window.innerWidth >= 768;
        const gapSize = isDesktop ? 24 : 16;
        const adderWidth = isDesktop
          ? 460
          : Math.max(325, window.innerWidth * 0.88);
        const leftPadding = window.innerWidth / 2;
        const newColWidth = isDesktop
          ? 460
          : Math.max(325, window.innerWidth * 0.88);

        // Coordinates after inserting
        const L_leftAdder = leftPadding;
        const R_leftAdder = leftPadding + adderWidth;
        const L_new = R_leftAdder + gapSize;
        const R_new = L_new + newColWidth;

        // Check if already sufficiently visible
        const isNewColumnVisible =
          currentS <= L_new && currentS + viewportWidth >= R_new;
        const isAdderVisiblePartially =
          currentS <= L_leftAdder + adderWidth * 0.7; // At least 30% visible

        if (isNewColumnVisible && isAdderVisiblePartially) {
          // Already fully visible, no need to adapt scroll position
          return;
        }

        // Otherwise, smoothly scroll to optimal position
        const S_pref_left = L_leftAdder + adderWidth * 0.5;
        const S_target = Math.max(
          R_new - viewportWidth + 16,
          Math.min(L_new - 16, S_pref_left),
        );

        setTimeout(() => {
          container.scrollTo({ left: S_target, behavior: "smooth" });
        }, 100);
      }
    } else {
      let updated: ImageWorkspace[] = [];
      const currentS = container ? container.scrollLeft : 0;

      flushSync(() => {
        setWorkspaces((prev) => {
          updated = [...prev, newWs];
          return updated;
        });
      });

      if (container) {
        const viewportWidth = container.clientWidth || window.innerWidth;
        const isDesktop = window.innerWidth >= 768;
        const gapSize = isDesktop ? 24 : 16;
        const adderWidth = isDesktop
          ? 460
          : Math.max(325, window.innerWidth * 0.88);
        const leftPadding = window.innerWidth / 2;
        const newColWidth = isDesktop
          ? 460
          : Math.max(325, window.innerWidth * 0.88);

        // Calculate total workspaces width
        let totalWorkspacesWidth = 0;
        const widths = updated.map((w) => {
          return w.columnWidth === "wide"
            ? 840
            : w.columnWidth === "medium"
              ? 650
              : 460;
        });
        const sumWidths = widths.reduce((sum, w) => sum + w, 0);
        totalWorkspacesWidth = sumWidths + (updated.length - 1) * gapSize;

        // Coordinates
        const R_new = leftPadding + adderWidth + gapSize + totalWorkspacesWidth;
        const L_new = R_new - newColWidth;
        const L_rightAdder = R_new + gapSize;

        // Check if already sufficiently visible
        const isNewColumnVisible =
          currentS <= L_new && currentS + viewportWidth >= R_new;
        const isAdderVisiblePartially =
          currentS + viewportWidth >= L_rightAdder + adderWidth * 0.3; // At least 30% visible

        if (isNewColumnVisible && isAdderVisiblePartially) {
          // Already fully visible, no need to adapt scroll position
          return;
        }

        // Target scroll to keep Right Adder partially visible and New Column fully visible
        const S_pref_right = L_rightAdder + adderWidth * 0.5 - viewportWidth;
        const S_target = Math.max(
          R_new - viewportWidth + 16,
          Math.min(L_new - 16, S_pref_right),
        );

        setTimeout(() => {
          container.scrollTo({ left: S_target, behavior: "smooth" });
        }, 100);
      }
    }
  };

  // Update specific workspace properties
  const updateTrackField = useCallback(
    (trackId: string, field: keyof ImageWorkspace, value: any) => {
      setWorkspaces((prev) =>
        prev.map((w) => {
          if (w.id === trackId) {
            return { ...w, [field]: value };
          }
          return w;
        }),
      );
    },
    [],
  );

  // Inline rename logic
  const triggerRenameMode = useCallback(
    (trackId: string, currentName: string) => {
      setRenamingId(trackId);
      setRenameValue(currentName);
    },
    [],
  );

  const saveRenameAction = useCallback(
    (trackId: string) => {
      setRenameValue((currentValue) => {
        if (currentValue.trim()) {
          updateTrackField(trackId, "name", currentValue.trim());
        }
        return currentValue;
      });
      setRenamingId(null);
    },
    [updateTrackField],
  );

  // Delete Track
  const deleteTrack = useCallback((trackId: string) => {
    setWorkspaces((prev) => {
      if (prev.length <= 1) {
        setAlertMessage("请妥善保留，至少需要有一个生图列。");
        return prev;
      }
      setDeleteConfirmTrackId(trackId);
      return prev;
    });
  }, []);

  const confirmDeleteTrack = useCallback(() => {
    setDeleteConfirmTrackId((currentId) => {
      if (currentId) {
        setWorkspaces((prev) => prev.filter((w) => w.id !== currentId));
      }
      return null;
    });
  }, []);

  // Rollback Action: Restore prompt, model, aspect ratio, reference images
  const restoreRollbackParams = (
    trackId: string,
    historyItem: GenerationItem,
    force: boolean = false,
  ) => {
    const targetTrack = workspaces.find((w) => w.id === trackId);
    if (!targetTrack) return;

    const hasExistingContent =
      targetTrack.imagePrompt.trim() !== "" || targetTrack.refImages.length > 0;

    if (hasExistingContent && !force) {
      setRestoreConfirm({ trackId, historyItem });
      return;
    }

    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id === trackId) {
          return {
            ...w,
            imagePrompt: historyItem.prompt,
            refImages: historyItem.refImages.map((img, idx) => {
              if (typeof img === "string") {
                const nextId = (idx + 1).toString();
                return {
                  id: nextId,
                  url: img,
                  name: getFilenameFromUrl(img, nextId),
                };
              }
              return {
                id: img.id || (idx + 1).toString(),
                url: img.url,
                name:
                  img.name ||
                  getFilenameFromUrl(img.url, img.id || (idx + 1).toString()),
              };
            }),
            imageModel: historyItem.model,
            imageSize: historyItem.size,
            imageResolution: historyItem.resolution || "1k",
            callFormat: historyItem.callFormat,
          };
        }
        return w;
      }),
    );
    setRestoreConfirm(null);
    setToast("已成功应用该图的历史生图配置！");
    setJustAppliedCardGenId(historyItem.id);
    setTimeout(() => setJustAppliedCardGenId(null), 1500);
  };

  // Insert tag into prompt cursor position (or append if not focused)
  const insertPromptTag = (trackId: string, tag: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id === trackId) {
          let currentPrompt = w.imagePrompt;
          const editorDom = document.getElementById(`prompt-input-${trackId}`);
          if (editorDom) {
            currentPrompt = htmlToPrompt(editorDom);
          }

          return {
            ...w,
            imagePrompt: currentPrompt ? `${currentPrompt} ${tag}` : tag,
          };
        }
        return w;
      }),
    );
  };

  // Clean Generations action
  const clearTrackGenerations = (trackId: string) => {
    if (confirm("是否清空当前生图列的历史画作记录？")) {
      updateTrackField(trackId, "generations", []);
    }
  };

  // Delete individual generation item
  const deleteGenerationItem = (trackId: string, genId: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id === trackId) {
          return {
            ...w,
            generations: w.generations.filter((g) => g.id !== genId),
          };
        }
        return w;
      }),
    );
  };

  // Toggle star/favorite status on single generation item
  const toggleStarGeneration = useCallback((trackId: string, genId: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id === trackId) {
          return {
            ...w,
            generations: (w.generations || []).map((g) => {
              if (g.id === genId) {
                return { ...g, isStarred: !g.isStarred };
              }
              return g;
            }),
          };
        }
        return w;
      }),
    );

    setLightboxImage((prev) => {
      if (prev && prev.gen && prev.gen.id === genId) {
        return {
          ...prev,
          gen: { ...prev.gen, isStarred: !prev.gen.isStarred },
        };
      }
      return prev;
    });

    setCompareMode((prev) => {
      if (!prev) return prev;
      let changed = false;
      const nextA = { ...prev.imageA };
      const nextB = { ...prev.imageB };
      if (nextA.gen && nextA.gen.id === genId) {
        nextA.gen = { ...nextA.gen, isStarred: !nextA.gen.isStarred };
        changed = true;
      }
      if (nextB.gen && nextB.gen.id === genId) {
        nextB.gen = { ...nextB.gen, isStarred: !nextB.gen.isStarred };
        changed = true;
      }
      return changed ? { imageA: nextA, imageB: nextB } : prev;
    });
  }, []);

  useEffect(() => {
    const handleToggleStarShortcut = (e: any) => {
      const { trackId, genId } = e.detail;
      toggleStarGeneration(trackId, genId);
    };
    window.addEventListener(
      "toggle-star-shortcut",
      handleToggleStarShortcut as any,
    );
    return () =>
      window.removeEventListener(
        "toggle-star-shortcut",
        handleToggleStarShortcut as any,
      );
  }, [toggleStarGeneration]);

  // ---------------------------------------------------------------------------
  // Concurrently Run Draw Generation on Selected Track
  // ---------------------------------------------------------------------------
  const runTrackGeneration = async (
    trackId: string,
    retryGenId?: string,
    overrideOptions?: {
      prompt?: string;
      model?: string;
      refImages?: ImageReference[];
      size?: string;
      resolution?: string;
      callFormat?: string;
    },
  ) => {
    const ws = workspaces.find((w) => w.id === trackId);
    if (!ws) return;

    requestNotificationPermission();

    const existingGen = retryGenId
      ? ws.generations.find((g) => g.id === retryGenId)
      : undefined;

    let currentPrompt = ws.imagePrompt;
    if (!existingGen) {
      const editorDom = document.getElementById(`prompt-input-${ws.id}`);
      if (editorDom) {
        currentPrompt = htmlToPrompt(editorDom);
      }
    }

    const promptToUse =
      overrideOptions?.prompt ||
      (existingGen ? existingGen.prompt : currentPrompt);
    const refImagesToUse =
      overrideOptions?.refImages ||
      (existingGen ? existingGen.refImages : ws.refImages);
    const modelToUse =
      overrideOptions?.model ||
      (existingGen ? existingGen.model : ws.imageModel);
    const sizeToUse =
      overrideOptions?.size || (existingGen ? existingGen.size : ws.imageSize);
    const callFormatToUse =
      overrideOptions?.callFormat ||
      (existingGen ? existingGen.callFormat : ws.callFormat);
    const resolutionToUse =
      overrideOptions?.resolution ||
      (existingGen && existingGen.resolution
        ? existingGen.resolution
        : ws.imageResolution || "1k");

    if (!promptToUse.trim()) return;

    // Trigger loader state for this track
    const genId = retryGenId || `gen-${Date.now()}`;
    const newGen: GenerationItem = {
      id: genId,
      prompt: promptToUse,
      refImages: refImagesToUse.map((img) => ({
        id: img.id,
        url: img.url,
        name: img.name,
      })),
      model: modelToUse,
      size: sizeToUse,
      resolution: resolutionToUse,
      callFormat: callFormatToUse,
      status: "generating",
      timestamp: new Date().toLocaleTimeString(),
      createdAt: Date.now(),
    };

    // Stagger to front of the array or update existing
    setWorkspaces((prev) =>
      prev.map((w) => {
        if (w.id === trackId) {
          if (retryGenId) {
            return {
              ...w,
              generations: w.generations.map((g) => {
                if (g.id === retryGenId) {
                  return {
                    ...g,
                    status: "generating",
                    error: undefined,
                    result: undefined,
                    timestamp: new Date().toLocaleTimeString(),
                    createdAt: Date.now(),
                    model: modelToUse,
                    prompt: promptToUse,
                    size: sizeToUse,
                    resolution: resolutionToUse,
                    callFormat: callFormatToUse,
                    refImages: refImagesToUse.map((img) => ({
                      id: img.id,
                      url: img.url,
                      name: img.name,
                    })),
                  };
                }
                return g;
              }),
            };
          } else {
            return {
              ...w,
              imagePrompt: currentPrompt,
              generations: [newGen, ...w.generations],
            };
          }
        }
        return w;
      }),
    );

    let finalPrompt = promptToUse;

    // Process @id references in prompt to match correct images regardless of their index order
    const refRegex = /@(\d+)/g;
    finalPrompt = finalPrompt.replace(refRegex, (match, idStr) => {
      const refItem = refImagesToUse.find((img) => img.id === idStr);
      if (refItem) {
        if (
          typeof refItem.url === "string" &&
          (refItem.url.startsWith("http://") ||
            refItem.url.startsWith("https://"))
        ) {
          // Replace with web URL literally to assist the engine
          return refItem.url;
        } else {
          // Replace base64 references with structured labels that correspond to body payloads
          const idx = refImagesToUse.findIndex((img) => img.id === idStr);
          return `input_image_${idx + 1}`;
        }
      }
      return match;
    });

    if (ws.includeUrlsInPrompt && refImagesToUse.length > 0) {
      // Find URLs that are NOT already substituted/mentioned in finalPrompt
      const webUrls = refImagesToUse
        .map((img) => img.url)
        .filter(
          (url) =>
            typeof url === "string" &&
            (url.startsWith("http://") || url.startsWith("https://")) &&
            !finalPrompt.includes(url),
        );
      if (webUrls.length > 0) {
        finalPrompt = `${webUrls.join(" ")} ${finalPrompt}`;
      }
    }

    const start = Date.now();
    try {
      let resData: any;
      if (callFormatToUse === "images") {
        const modelSelected = modelToUse;
        const resolutionSelected = resolutionToUse;

        const sizeMap: Record<string, string> = {
          "1:1": "1024x1024",
          "16:9": "1280x720",
          "9:16": "720x1280",
          "3:2": "1280x853",
          "2:3": "853x1280",
          "4:3": "1024x768",
          "3:4": "768x1024",
          "2:1": "1280x640",
          "1:2": "640x1280",
          "21:9": "1680x720",
          "9:21": "720x1680",
        };
        const resolvedSize1K = sizeMap[sizeToUse] || "1024x1024";

        const get2KSize = (size1k: string): string => {
          const match = size1k.match(/^(\d+)x(\d+)$/);
          if (match) {
            const w = parseInt(match[1]) * 2;
            const h = parseInt(match[2]) * 2;
            return `${w}x${h}`;
          }
          return "2048x2048";
        };
        const resolvedSize2K = get2KSize(resolvedSize1K);

        const apiBase =
          config.requestMode === "client"
            ? config.baseUrl.trim().replace(/\/+$/, "")
            : "/api/t8star";

        // Pre-fetch reference images as blobs
        const refBlobs: { blob: Blob; filename: string }[] = [];
        for (let i = 0; i < refImagesToUse.length; i++) {
          try {
            const refUrl = refImagesToUse[i].url;
            if (!refUrl) continue;

            if (refUrl instanceof Blob) {
              refBlobs.push({
                blob: refUrl,
                filename: refImagesToUse[i].name || `reference_${i}.png`,
              });
            } else {
              let fetchUrl = refUrl;
              const headers: Record<string, string> = {};
              if (refUrl.startsWith("https://ai.t8star.org")) {
                fetchUrl = refUrl.replace("https://ai.t8star.org", apiBase);
                headers["Authorization"] = `Bearer ${config.apiKey}`;
              } else if (
                refUrl.startsWith("http://") ||
                refUrl.startsWith("https://")
              ) {
                fetchUrl = `/api/proxy-image?url=${encodeURIComponent(refUrl)}`;
              }
              const fetchRes = await fetch(fetchUrl, { headers });
              const blob = await fetchRes.blob();
              refBlobs.push({ blob, filename: `reference_${i}.png` });
            }
          } catch (e) {
            console.warn(`Failed to load reference image ${i} as blob`, e);
          }
        }

        if (refBlobs.length === 0) {
          const canvas = document.createElement("canvas");
          canvas.width = 1024;
          canvas.height = 1024;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, 1024, 1024);
          }
          const blankBlob = await new Promise<Blob>((resolve) =>
            canvas.toBlob((b) => resolve(b!), "image/png"),
          );
          refBlobs.push({ blob: blankBlob, filename: "image_0.png" });
        }

        const getGeminiAspectRatio = (sizeVal: string): string => {
          const approved = [
            "1:1",
            "1:4",
            "1:8",
            "2:3",
            "3:2",
            "3:4",
            "4:1",
            "4:3",
            "4:5",
            "5:4",
            "8:1",
            "9:16",
            "16:9",
            "21:9",
          ];
          if (approved.includes(sizeVal)) {
            return sizeVal;
          }
          if (sizeVal === "9:21") return "21:9";
          if (sizeVal === "2:1") return "21:9";
          if (sizeVal === "1:2") return "9:16";
          return "1:1";
        };

        // Helper to submit image task and poll for status
        const performImageTask = async (
          modelName: string,
          sizeStr: string,
          blobs: { blob: Blob; filename: string }[],
          aspectRatioStr?: string,
          customPrompt?: string,
          resolutionStr?: string,
          abortSignal?: AbortSignal,
        ): Promise<any> => {
          if (modelName === "gpt-image-2-2in1") {
            const ac = new AbortController();
            if (abortSignal) {
              abortSignal.addEventListener("abort", () => ac.abort());
            }
            const models = ["gpt-image-2-low", "gpt-image-2-all"];
            const promises = models.map((m) =>
              performImageTask(
                m,
                sizeStr,
                blobs,
                aspectRatioStr,
                customPrompt,
                resolutionStr,
                ac.signal,
              ).then((res) => ({ url: res, model: m })),
            );
            try {
              const result = await Promise.any(promises);
              ac.abort();
              return result.url;
            } catch (err: any) {
              if (err.name === "AggregateError") {
                throw new Error(
                  "All models for 2in1 failed: " +
                    err.errors.map((e: any) => e.message).join(", "),
                );
              }
              throw err;
            }
          }

          let attemptsLeft = 2;
          while (attemptsLeft > 0) {
            attemptsLeft--;
            try {
              const taskPrompt =
                customPrompt !== undefined ? customPrompt : promptToUse;

              const isQwen21Pro =
                modelName === "qwen-image-2.1-pro" ||
                modelName.toLowerCase().includes("qwen-image-2.1") ||
                modelName.toLowerCase().includes("qwen-2.1");

              if (isQwen21Pro) {
                const qianwenKey = config.qianwenApiKey?.trim() || "";
                if (!qianwenKey) {
                  throw new Error(
                    "请先在右上角「设置」中填入 Qwen-Image-2.1-Pro 专用 API Key (DASHSCOPE_API_KEY)"
                  );
                }

                let qianwenUrl = (
                  config.qianwenApiUrl?.trim() ||
                  "https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation"
                );
                if (!qianwenUrl.includes("/generation")) {
                  qianwenUrl = qianwenUrl.replace(/\/+$/, "") + "/api/v1/services/aigc/multimodal-generation/generation";
                }

                const actualRefBlobs = blobs.filter(
                  (b) =>
                    b &&
                    b.filename !== "image_0.png" &&
                    b.blob &&
                    b.blob.size > 0
                );

                const contentItems: any[] = [];
                if (actualRefBlobs.length > 0) {
                  for (let i = 0; i < Math.min(actualRefBlobs.length, 10); i++) {
                    const base64Data = await blobToBase64(actualRefBlobs[i].blob);
                    contentItems.push({ image: base64Data });
                  }
                }
                contentItems.push({ text: taskPrompt.trim() });

                const resVal = (
                  resolutionStr ||
                  resolutionSelected ||
                  "1k"
                ).toLowerCase();
                const ratioVal = (
                  aspectRatioStr ||
                  sizeToUse ||
                  "1:1"
                ).trim();

                const is2k = resVal === "2k" || resVal === "4k";
                const qwenSizes1k: Record<string, string> = {
                  "1:1": "1024*1024",
                  "16:9": "1280*720",
                  "9:16": "720*1280",
                  "4:3": "1152*864",
                  "3:4": "864*1152",
                  "3:2": "1216*832",
                  "2:3": "832*1216",
                  "5:4": "1120*896",
                  "4:5": "896*1120",
                  "2:1": "1440*720",
                  "1:2": "720*1440",
                  "21:9": "1536*640",
                  "9:21": "640*1536",
                };
                const qwenSizes2k: Record<string, string> = {
                  "1:1": "2048*2048",
                  "16:9": "2560*1440",
                  "9:16": "1440*2560",
                  "4:3": "2304*1728",
                  "3:4": "1728*2304",
                  "3:2": "2432*1664",
                  "2:3": "1664*2432",
                  "5:4": "2240*1792",
                  "4:5": "1792*2240",
                  "2:1": "2880*1440",
                  "1:2": "1440*2880",
                  "21:9": "3072*1280",
                  "9:21": "1280*3072",
                };
                const targetSize = is2k
                  ? qwenSizes2k[ratioVal] || "2048*2048"
                  : qwenSizes1k[ratioVal] || "1024*1024";

                const payload: any = {
                  model: "qwen-image-2.1-pro",
                  input: {
                    messages: [
                      {
                        role: "user",
                        content: contentItems,
                      },
                    ],
                  },
                  parameters: {
                    prompt_extend: true,
                    size: targetSize,
                    n: 1,
                  },
                };

                const response = await fetchWithRetry("/api/qianwen-generation", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    apiUrl: qianwenUrl,
                    apiKey: qianwenKey,
                    payload,
                  }),
                  signal: abortSignal,
                });

                const textResponse = await response.text();
                let parseData: any;
                try {
                  parseData = JSON.parse(textResponse);
                } catch {
                  throw new Error(
                    `千问生图服务返回了非 JSON 数据(HTTP ${response.status}):\n${textResponse.slice(0, 150)}`
                  );
                }

                if (!response.ok) {
                  throw new Error(
                    parseData.message ||
                      parseData.error?.message ||
                      parseData.error ||
                      `千问任务提交失败(HTTP ${response.status}): ${textResponse.slice(0, 150)}`
                  );
                }

                let finalUrl = "";
                const outputObj = parseData.output || parseData;

                if (outputObj.choices && outputObj.choices.length > 0) {
                  const content = outputObj.choices[0]?.message?.content;
                  if (Array.isArray(content)) {
                    const imgItem = content.find((c: any) => c.image || c.url);
                    if (imgItem) finalUrl = imgItem.image || imgItem.url;
                  } else if (typeof content === "string" && content.startsWith("http")) {
                    finalUrl = content;
                  }
                }

                if (!finalUrl && outputObj.results && outputObj.results.length > 0) {
                  finalUrl = outputObj.results[0].url || outputObj.results[0].image_url;
                }

                if (!finalUrl && outputObj.urls && outputObj.urls.length > 0) {
                  finalUrl = outputObj.urls[0];
                }

                if (!finalUrl && (outputObj.url || outputObj.image_url || parseData.url || parseData.image_url)) {
                  finalUrl = outputObj.url || outputObj.image_url || parseData.url || parseData.image_url;
                }

                if (!finalUrl && parseData.data && parseData.data.length > 0) {
                  finalUrl = parseData.data[0].url;
                }

                const taskId =
                  outputObj.task_id ||
                  parseData.task_id ||
                  outputObj.id ||
                  parseData.id;

                if (!finalUrl && taskId && outputObj.task_status !== "SUCCEEDED") {
                  let attempts = 0;
                  while (attempts < 120) {
                    attempts++;
                    await new Promise((r) => setTimeout(r, 3000));

                    const statusRes = await fetchWithRetry("/api/qianwen-task", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        taskId,
                        taskUrl: qianwenUrl.replace(
                          /multimodal-generation\/generation.*$/,
                          `tasks/${taskId}`
                        ),
                        apiKey: qianwenKey,
                      }),
                      signal: abortSignal,
                    });

                    const statusText = await statusRes.text();
                    let statusData: any;
                    try {
                      statusData = JSON.parse(statusText);
                    } catch {
                      continue;
                    }

                    const taskOutput =
                      statusData.output || statusData.data || statusData;
                    const taskState = (
                      taskOutput.task_status ||
                      taskOutput.status ||
                      ""
                    ).toUpperCase();

                    if (
                      taskState === "SUCCEEDED" ||
                      taskState === "SUCCESS" ||
                      taskState === "COMPLETED"
                    ) {
                      if (taskOutput.choices && taskOutput.choices.length > 0) {
                        const content = taskOutput.choices[0]?.message?.content;
                        if (Array.isArray(content)) {
                          const imgItem = content.find(
                            (c: any) => c.image || c.url
                          );
                          if (imgItem) finalUrl = imgItem.image || imgItem.url;
                        }
                      }
                      if (
                        !finalUrl &&
                        taskOutput.results &&
                        taskOutput.results.length > 0
                      ) {
                        finalUrl =
                          taskOutput.results[0].url ||
                          taskOutput.results[0].image_url;
                      }
                      if (
                        !finalUrl &&
                        taskOutput.urls &&
                        taskOutput.urls.length > 0
                      ) {
                        finalUrl = taskOutput.urls[0];
                      }
                      if (!finalUrl) {
                        finalUrl =
                          taskOutput.url || taskOutput.image_url || "";
                      }
                      if (finalUrl) break;
                    } else if (
                      taskState === "FAILED" ||
                      taskState === "FAILURE"
                    ) {
                      throw new Error(
                        `千问生图失败: ${taskOutput.message || taskOutput.error?.message || taskOutput.error || "任务执行失败"}`
                      );
                    }
                  }
                }

                if (!finalUrl) {
                  throw new Error("千问生图请求超时，未返回有效图片 URL (Timeout)");
                }

                return finalUrl;
              }

              const isSeedream5Pro =
                modelName === "seedream5.0Pro" ||
                modelName === "seedream-5.0-pro" ||
                modelName.toLowerCase().includes("seedream5") ||
                modelName.toLowerCase().includes("seedream-5");
              const isQwen3Pro =
                (modelName === "Qwen_Image_3.0Pro" ||
                  modelName === "d_Qwen_Image_3.0Pro" ||
                  modelName === "a_Qwen_Image_3.0Pro" ||
                  modelName === "Qwen3.0Pro" ||
                  modelName === "qwen-3.0-pro" ||
                  modelName.toLowerCase().includes("qwen")) &&
                !isQwen21Pro;

              const isDirectExtend =
                modelName === "d_Qwen_Image_3.0Pro" ||
                modelName.toLowerCase().startsWith("d_qwen");
              const isAgentExtend =
                modelName === "a_Qwen_Image_3.0Pro" ||
                modelName.toLowerCase().startsWith("a_qwen");
              const isPromptExtend = isDirectExtend || isAgentExtend;
              const extendMode = isAgentExtend
                ? "agent"
                : isDirectExtend
                  ? "direct"
                  : undefined;

              if (isSeedream5Pro || isQwen3Pro) {
                const seedanceKey = (
                  config.seedanceApiKey?.trim() ||
                  config.apiKey?.trim() ||
                  ""
                );
                if (!seedanceKey) {
                  throw new Error(
                    "请先在右上角「设置」中填入 Seedream / Qwen 的专用 API Key (api.seedance.nz)"
                  );
                }

                // Always route through /api/seedance to prevent browser CORS / Failed to fetch errors
                const seedanceBase = "/api/seedance";

                // Filter out placeholder blank canvas
                const actualRefBlobs = blobs.filter(
                  (b) =>
                    b &&
                    b.filename !== "image_0.png" &&
                    b.blob &&
                    b.blob.size > 0
                );
                const isI2I = actualRefBlobs.length > 0;

                let targetModel = "";
                if (isSeedream5Pro) {
                  targetModel = isI2I
                    ? "seedream-v5-pro-i2i"
                    : "seedream-v5-pro-t2i";
                } else {
                  targetModel = isI2I
                    ? "qwen-image-3.0-pro-i2i"
                    : "qwen-image-3.0-pro-t2i";
                }

                // If real reference images exist (i2i), upload them to /v1/files/upload via server proxy to get public URLs
                let uploadedUrls: string[] = [];
                if (isI2I) {
                  for (let i = 0; i < actualRefBlobs.length; i++) {
                    const b = actualRefBlobs[i];
                    const base64Data = await blobToBase64(b.blob);
                    const upRes = await fetchWithRetry("/api/seedance-upload", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        fileBase64: base64Data,
                        filename: b.filename || `ref_${i}.png`,
                        apiKey: seedanceKey,
                      }),
                      signal: abortSignal,
                    });
                    const upText = await upRes.text();
                    let upData: any;
                    try {
                      upData = JSON.parse(upText);
                    } catch {
                      throw new Error(
                        `参考素材上传失败(HTTP ${upRes.status}): ${upText.slice(0, 150)}`
                      );
                    }
                    if (!upRes.ok || !upData.url) {
                      throw new Error(
                        `上传参考图失败: ${upData.message || upData.error?.message || upData.error || upData.detail || upText.slice(0, 150)}`
                      );
                    }
                    uploadedUrls.push(upData.url);
                  }
                }

                const resVal = (
                  resolutionStr ||
                  resolutionSelected ||
                  "1k"
                ).toLowerCase();
                const ratioVal = (
                  aspectRatioStr ||
                  sizeToUse ||
                  "1:1"
                ).trim();

                let metadataObj: any = {};
                if (isSeedream5Pro) {
                  // Seedream 5.0 Pro requires metadata.width and metadata.height (240~8192)
                  // When resolution is passed, it overrides width/height and ratio is not supported for Seedream
                  const presets1k: Record<string, { width: number; height: number }> = {
                    "1:1": { width: 1024, height: 1024 },
                    "16:9": { width: 1344, height: 768 },
                    "9:16": { width: 768, height: 1344 },
                    "4:3": { width: 1152, height: 864 },
                    "3:4": { width: 864, height: 1152 },
                    "3:2": { width: 1216, height: 832 },
                    "2:3": { width: 832, height: 1216 },
                    "5:4": { width: 1120, height: 896 },
                    "4:5": { width: 896, height: 1120 },
                    "2:1": { width: 1440, height: 720 },
                    "1:2": { width: 720, height: 1440 },
                    "21:9": { width: 1536, height: 640 },
                    "9:21": { width: 640, height: 1536 },
                  };

                  const presets2k: Record<string, { width: number; height: number }> = {
                    "1:1": { width: 2048, height: 2048 },
                    "16:9": { width: 2688, height: 1536 },
                    "9:16": { width: 1536, height: 2688 },
                    "4:3": { width: 2304, height: 1728 },
                    "3:4": { width: 1728, height: 2304 },
                    "3:2": { width: 2432, height: 1664 },
                    "2:3": { width: 1664, height: 2432 },
                    "5:4": { width: 2240, height: 1792 },
                    "4:5": { width: 1792, height: 2240 },
                    "2:1": { width: 2880, height: 1440 },
                    "1:2": { width: 1440, height: 2880 },
                    "21:9": { width: 3072, height: 1280 },
                    "9:21": { width: 1280, height: 3072 },
                  };

                  const is2k = resVal === "2k";
                  const table = is2k ? presets2k : presets1k;
                  let dims = table[ratioVal];
                  if (!dims) {
                    const match = ratioVal.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
                    if (match) {
                      const rw = parseFloat(match[1]);
                      const rh = parseFloat(match[2]);
                      if (rw > 0 && rh > 0) {
                        const totalPixels = is2k ? 2048 * 2048 : 1024 * 1024;
                        const w = Math.round(Math.sqrt((totalPixels * rw) / rh) / 16) * 16;
                        const h = Math.round(Math.sqrt((totalPixels * rh) / rw) / 16) * 16;
                        dims = {
                          width: Math.max(240, Math.min(8192, w)),
                          height: Math.max(240, Math.min(8192, h)),
                        };
                      }
                    }
                  }
                  if (!dims) {
                    dims = is2k ? { width: 2048, height: 2048 } : { width: 1024, height: 1024 };
                  }

                  metadataObj = {
                    width: dims.width,
                    height: dims.height,
                    output_format: "jpeg",
                  };
                } else {
                  // Qwen-Image 3.0 Pro supports metadata.ratio, metadata.resolution, metadata.prompt_extend_mode
                  metadataObj = {
                    resolution: resVal === "2k" ? "2k" : "1k",
                    output_format: "jpeg",
                  };
                  if (ratioVal && ratioVal !== "Auto") {
                    metadataObj.ratio = ratioVal;
                  }
                  if (isPromptExtend && extendMode) {
                    metadataObj.prompt_extend_mode = extendMode;
                    metadataObj.prompt_extend = true;
                  }
                }

                let seedancePrompt = taskPrompt.trim();
                if (seedancePrompt.length < 5) {
                  seedancePrompt = (seedancePrompt + "，高质量细节画面。").trim();
                  while (seedancePrompt.length < 5) {
                    seedancePrompt += "。";
                  }
                }
                if (seedancePrompt.length > 2000) {
                  seedancePrompt = seedancePrompt.slice(0, 2000);
                }

                const payload: any = {
                  model: targetModel,
                  prompt: seedancePrompt,
                  metadata: metadataObj,
                };
                if (isPromptExtend) {
                  payload.prompt_extend = true;
                }
                if (uploadedUrls.length > 0) {
                  payload.images = uploadedUrls;
                }

                const response = await fetchWithRetry(
                  "/api/seedance-generation",
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      apiKey: seedanceKey,
                      payload,
                    }),
                    signal: abortSignal,
                  }
                );

                const textResponse = await response.text();
                let parseData: any;
                try {
                  parseData = JSON.parse(textResponse);
                } catch {
                  throw new Error(
                    `生图服务返回了非 JSON 数据(HTTP ${response.status}):\n${textResponse.slice(0, 150)}`
                  );
                }

                if (!response.ok) {
                  throw new Error(
                    parseData.message ||
                      parseData.error?.message ||
                      parseData.error ||
                      parseData.detail ||
                      `任务提交失败(HTTP ${response.status}): ${textResponse.slice(0, 150)}`
                  );
                }

                const taskId =
                  parseData.task_id ||
                  parseData.id ||
                  parseData.data?.task_id ||
                  (typeof parseData.data === "string" ? parseData.data : null);
                if (!taskId) {
                  throw new Error("未获取到任务 ID (No task_id returned)");
                }

                let attempts = 0;
                let finalUrl = "";
                while (attempts < 120) {
                  attempts++;
                  await new Promise((r) => setTimeout(r, 3000));

                  const statusRes = await fetchWithRetry(
                    "/api/seedance-task",
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        taskId,
                        apiKey: seedanceKey,
                      }),
                      signal: abortSignal,
                    }
                  );

                  const statusText = await statusRes.text();
                  let statusData: any;
                  try {
                    statusData = JSON.parse(statusText);
                  } catch {
                    continue;
                  }

                  const inner = statusData.data || statusData || {};
                  const state = (
                    inner.status ||
                    statusData.status ||
                    ""
                  ).toUpperCase();

                  if (
                    state === "SUCCESS" ||
                    state === "SUCCEEDED" ||
                    state === "COMPLETED"
                  ) {
                    finalUrl =
                      inner.result_url ||
                      inner.data?.content?.image_url ||
                      inner.data?.content?.image_urls?.[0] ||
                      inner.image_url ||
                      inner.url ||
                      statusData.result_url ||
                      statusData.url ||
                      "";
                    if (finalUrl) break;
                  } else if (
                    state === "FAILURE" ||
                    state === "FAILED"
                  ) {
                    throw new Error(
                      `生成失败: ${inner.fail_reason || inner.error?.message || inner.error || statusData.message || "未知原因"}`
                    );
                  }
                }

                if (!finalUrl) {
                  throw new Error("生图请求超时，未返回URL (Timeout)");
                }

                return finalUrl;
              }

              if (modelName.includes("doubao")) {
                // Use sync /v1/images/generations for doubao
                let sizeVal: string = (
                  resolutionStr ||
                  resolutionSelected ||
                  "1k"
                ).toUpperCase();
                if (modelName === "doubao-seedream-4-0-250828") {
                  const ratio = (aspectRatioStr || sizeToUse || "1:1").trim();
                  const res = (
                    resolutionStr ||
                    resolutionSelected ||
                    "1k"
                  ).toLowerCase();
                  const key = `${ratio}-${res}`;
                  const doubao40Map: Record<string, string> = {
                    "1:1-1k": "1024x1024",
                    "1:1-2k": "2048x2048",
                    "1:1-4k": "4096x4096",
                    "4:3-1k": "1152x864",
                    "4:3-2k": "2304x1728",
                    "4:3-4k": "4704x3520",
                    "3:4-1k": "864x1152",
                    "3:4-2k": "1728x2304",
                    "3:4-4k": "3520x4704",
                    "16:9-1k": "1280x720",
                    "16:9-2k": "2848x1600",
                    "16:9-4k": "5504x3040",
                    "9:16-1k": "720x1280",
                    "9:16-2k": "1600x2848",
                    "9:16-4k": "3040x5504",
                    "3:2-1k": "1248x832",
                    "3:2-2k": "2496x1664",
                    "3:2-4k": "4992x3328",
                    "2:3-1k": "832x1248",
                    "2:3-2k": "1664x2496",
                    "2:3-4k": "3328x4992",
                    "21:9-1k": "1512x648",
                    "21:9-2k": "3136x1344",
                    "21:9-4k": "6240x2656",
                    "5:4-1k": "1120x896",
                    "5:4-2k": "2240x1792",
                    "5:4-4k": "4480x3584",
                    "4:5-1k": "896x1120",
                    "4:5-2k": "1792x2240",
                    "4:5-4k": "3584x4480",
                    "2:1-1k": "1440x720",
                    "2:1-2k": "2880x1440",
                    "2:1-4k": "5760x2880",
                    "1:2-1k": "720x1440",
                    "1:2-2k": "1440x2880",
                    "1:2-4k": "2880x5760",
                  };
                  sizeVal =
                    doubao40Map[key] ||
                    (res === "4k"
                      ? "4096x4096"
                      : res === "2k"
                        ? "2048x2048"
                        : "1024x1024");
                }

                const payload: any = {
                  model: modelName,
                  prompt: taskPrompt,
                  response_format: "url",
                  size: sizeVal,
                };

                if (blobs.length > 0 && blobs[0].filename !== "image_0.png") {
                  // For doubao reference images, we need them as URLs or base64.
                  // We will convert blobs to base64 data URLs.
                  const b64Images = await Promise.all(
                    blobs.map(async (b) => {
                      return await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () =>
                          resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(b.blob);
                      });
                    }),
                  );
                  payload.image = b64Images;
                }

                const response = await fetchWithRetry(
                  `${apiBase}/v1/images/generations`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${config.apiKey}`,
                    },
                    body: JSON.stringify(payload),
                    signal: abortSignal,
                  },
                );

                const textResponse = await response.text();
                let parseData: any;
                try {
                  parseData = JSON.parse(textResponse);
                } catch (e) {
                  throw new Error(
                    `Invalid JSON: ${textResponse.slice(0, 100)}`,
                  );
                }

                if (!response.ok) {
                  throw new Error(
                    parseData.message ||
                      parseData.error?.message ||
                      `HTTP ${response.status}`,
                  );
                }
                const url = parseData.data?.[0]?.url;
                if (!url)
                  throw new Error("No URL returned from doubao generation");
                return url;
              }


              let isFal =
                modelName === "gpt-image-2-medium" ||
                modelName === "gpt-image-2-high" ||
                modelName === "gpt-image-2-love";

              if (isFal) {
                const quality =
                  modelName === "gpt-image-2-love"
                    ? "low"
                    : modelName === "gpt-image-2-medium"
                      ? "medium"
                      : "high";
                const ratio = (aspectRatioStr || sizeToUse || "1:1").trim();
                const res = (
                  resolutionStr ||
                  resolutionSelected ||
                  "1k"
                ).toLowerCase();
                const gptImage2Map: Record<string, string> = {
                  "1:1-1k": "1024x1024",
                  "1:1-2k": "2048x2048",
                  "1:1-4k": "2880x2880",
                  "16:9-1k": "1280x720",
                  "16:9-2k": "2048x1152",
                  "16:9-4k": "3840x2160",
                  "9:16-1k": "720x1280",
                  "9:16-2k": "1152x2048",
                  "9:16-4k": "2160x3840",
                  "3:2-1k": "1248x832",
                  "3:2-2k": "2048x1360",
                  "3:2-4k": "3456x2304",
                  "2:3-1k": "832x1248",
                  "2:3-2k": "1360x2048",
                  "2:3-4k": "2304x3456",
                  "4:3-1k": "1024x768",
                  "4:3-2k": "2048x1536",
                  "4:3-4k": "3200x2400",
                  "3:4-1k": "768x1024",
                  "3:4-2k": "1536x2048",
                  "3:4-4k": "2400x3200",
                  "5:4-1k": "1120x896",
                  "5:4-2k": "1920x1536",
                  "5:4-4k": "3200x2560",
                  "4:5-1k": "896x1120",
                  "4:5-2k": "1536x1920",
                  "4:5-4k": "2560x3200",
                  "2:1-1k": "1440x720",
                  "2:1-2k": "2048x1024",
                  "2:1-4k": "3840x1920",
                  "1:2-1k": "720x1440",
                  "1:2-2k": "1024x2048",
                  "1:2-4k": "1920x3840",
                  "21:9-1k": "1536x640",
                  "21:9-2k": "2560x1088",
                  "21:9-4k": "3840x1600",
                  "9:21-1k": "640x1536",
                  "9:21-2k": "1088x2560",
                  "9:21-4k": "1600x3840",
                };
                const finalSizeStr =
                  gptImage2Map[`${ratio}-${res}`] ||
                  gptImage2Map[`1:1-${res}`] ||
                  "1024x1024";
                const [wStr, hStr] = finalSizeStr.split("x");

                const payload: any = {
                  prompt: taskPrompt,
                  quality: quality,
                  num_images: 1,
                  output_format: "png",
                  image_size: {
                    width: parseInt(wStr, 10),
                    height: parseInt(hStr, 10),
                  },
                };

                const playgroundApiBase =
                  config.requestMode === "client"
                    ? "https://ai.t8star.org"
                    : "/api/t8star";
                let requestUrl = `${playgroundApiBase}/fal/openai/gpt-image-2`;
                if (blobs.length > 0 && blobs[0].filename !== "image_0.png") {
                  const fileUploadBase =
                    config.requestMode === "client"
                      ? "https://ai.t8star.org"
                      : "/api/t8star";
                  const uploadUrl = `${fileUploadBase}/v1/files`;

                  const getUUID = () => {
                    if (
                      typeof crypto !== "undefined" &&
                      typeof crypto.randomUUID === "function"
                    ) {
                      return crypto.randomUUID();
                    }
                    return `${Math.random().toString(36).substring(2, 10)}-${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 14)}`;
                  };

                  const imageUrls = await Promise.all(
                    blobs.map(async (b) => {
                      const formData = new FormData();
                      const ext = b.filename.split(".").pop() || "jpg";
                      formData.append("file", b.blob, `${getUUID()}.${ext}`);

                      const uploadRes = await fetch(uploadUrl, {
                        method: "POST",
                        headers: {
                          Authorization: `Bearer ${config.apiKey}`,
                        },
                        body: formData,
                        signal: abortSignal,
                      });

                      const uploadData = await uploadRes.json();
                      if (!uploadRes.ok) {
                        throw new Error(
                          `Upload failed: ${JSON.stringify(uploadData)}`,
                        );
                      }
                      return uploadData.url;
                    }),
                  );

                  payload.image_urls = imageUrls;
                  requestUrl = `${playgroundApiBase}/fal/openai/gpt-image-2/edit`;
                }
                if (false) {
                  const b64Images = await Promise.all(
                    blobs.map(async (b) => {
                      return await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () =>
                          resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(b.blob);
                      });
                    }),
                  );
                  payload.image_urls = b64Images;
                  requestUrl = `${playgroundApiBase}/fal/openai/gpt-image-2/edit`;
                }

                const response = await fetchWithRetry(requestUrl, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${config.apiKey}`,
                  },
                  body: JSON.stringify(payload),
                  signal: abortSignal,
                });

                const textResponse = await response.text();
                let parseData: any;
                try {
                  parseData = JSON.parse(textResponse);
                } catch (e) {
                  throw new Error(
                    `Invalid JSON: ${textResponse.slice(0, 100)}`,
                  );
                }
                if (!response.ok) {
                  throw new Error(
                    parseData.message ||
                      parseData.error?.message ||
                      `HTTP ${response.status}`,
                  );
                }

                if (
                  parseData.status === "IN_QUEUE" &&
                  parseData.status_url &&
                  parseData.response_url
                ) {
                  let statusUrl = parseData.status_url;
                  let responseUrl = parseData.response_url;

                  if (config.requestMode === "server") {
                    try {
                      const parsedStatus = new URL(statusUrl);
                      statusUrl = `/api/t8star${parsedStatus.pathname}`;
                      const parsedResp = new URL(responseUrl);
                      responseUrl = `/api/t8star${parsedResp.pathname}`;
                    } catch (e) {}
                  }

                  let attempts = 0;
                  let isComplete = false;
                  let maxAttempts = requestUrl.includes("/edit") ? 120 : 60;
                  if (isFal) {
                    maxAttempts = 600;
                  }
                  while (attempts < maxAttempts) {
                    attempts++;
                    await new Promise((r) => setTimeout(r, 2000));
                    const statusRes = await fetch(statusUrl, {
                      headers: { Authorization: `Bearer ${config.apiKey}` },
                      signal: abortSignal,
                    });

                    const statusText = await statusRes.text();
                    let statusData;
                    try {
                      statusData = JSON.parse(statusText);
                    } catch (e) {
                      continue;
                    }
                    if (statusData.status === "COMPLETED") {
                      if (false) {
                        parseData = statusData.data;
                        isComplete = true;
                        break;
                      } else if (false) {
                        parseData = statusData;
                        isComplete = true;
                        break;
                      }
                      const resultRes = await fetch(responseUrl, {
                        headers: { Authorization: `Bearer ${config.apiKey}` },
                        signal: abortSignal,
                      });
                      const resultText = await resultRes.text();
                      try {
                        parseData = JSON.parse(resultText);
                        isComplete = true;
                        break;
                      } catch (e) {
                        throw new Error(
                          `Invalid JSON in final response: ${resultText.substring(0, 100)}`,
                        );
                      }
                    }
                    if (statusData.status === "FAILED") {
                      throw new Error(
                        `FAL task failed: ${JSON.stringify(statusData)}`,
                      );
                    }
                  }
                  if (!isComplete)
                    throw new Error("Timed out waiting for FAL queue.");
                }
                const url = parseData.images?.[0]?.url;
                if (!url)
                  throw new Error(
                    "No URL returned from gpt-image-2-fal generation",
                  );
                return url;
              }

              const formData = new FormData();
              formData.append("prompt", taskPrompt);

              let actualModelName = modelName === "gpt-image-2-low" ? "gpt-image-2" : modelName;
              if (modelName === "gpt-image-2.5-flare" || modelName === "gpt-image-2.5-sunburst") {
                const res = (resolutionStr || resolutionSelected || "1k").toLowerCase();
                if (res !== "1k") {
                  actualModelName = `${modelName}-${res}`;
                }
              }
              formData.append("model", actualModelName);
              formData.append("n", "1");
              formData.append(
                "quality",
                modelName === "gpt-image-2-low" ? "low" : "high",
              );

              let finalSizeStr = sizeStr;
              if (modelName.includes("gpt-image-2")) {
                const ratio = (aspectRatioStr || sizeToUse || "1:1").trim();
                const res = (
                  resolutionStr ||
                  resolutionSelected ||
                  "1k"
                ).toLowerCase();
                const gptImage2Map: Record<string, string> = {
                  "1:1-1k": "1024x1024",
                  "1:1-2k": "2048x2048",
                  "1:1-4k": "2880x2880",
                  "16:9-1k": "1280x720",
                  "16:9-2k": "2048x1152",
                  "16:9-4k": "3840x2160",
                  "9:16-1k": "720x1280",
                  "9:16-2k": "1152x2048",
                  "9:16-4k": "2160x3840",
                  "3:2-1k": "1248x832",
                  "3:2-2k": "2048x1360",
                  "3:2-4k": "3456x2304",
                  "2:3-1k": "832x1248",
                  "2:3-2k": "1360x2048",
                  "2:3-4k": "2304x3456",
                  "4:3-1k": "1024x768",
                  "4:3-2k": "2048x1536",
                  "4:3-4k": "3200x2400",
                  "3:4-1k": "768x1024",
                  "3:4-2k": "1536x2048",
                  "3:4-4k": "2400x3200",
                  "5:4-1k": "1120x896",
                  "5:4-2k": "1920x1536",
                  "5:4-4k": "3200x2560",
                  "4:5-1k": "896x1120",
                  "4:5-2k": "1536x1920",
                  "4:5-4k": "2560x3200",
                  "2:1-1k": "1440x720",
                  "2:1-2k": "2048x1024",
                  "2:1-4k": "3840x1920",
                  "1:2-1k": "720x1440",
                  "1:2-2k": "1024x2048",
                  "1:2-4k": "1920x3840",
                  "21:9-1k": "1536x640",
                  "21:9-2k": "2560x1088",
                  "21:9-4k": "3840x1600",
                  "9:21-1k": "640x1536",
                  "9:21-2k": "1088x2560",
                  "9:21-4k": "1600x3840",
                };
                finalSizeStr =
                  gptImage2Map[`${ratio}-${res}`] ||
                  gptImage2Map[`1:1-${res}`] ||
                  "1024x1024";
              }

              if (
                modelName === "nano-banana-pro" ||
                modelName === "gemini-3.1-flash-image-preview"
              ) {
                const resVal = resolutionStr || resolutionSelected || "1k";
                formData.append("image_size", resVal.toUpperCase());
              } else if (!modelName.includes("banana")) {
                formData.append("size", finalSizeStr);
              }

              if (
                modelName.includes("banana") ||
                modelName === "gemini-3.1-flash-image-preview"
              ) {
                const ratio = aspectRatioStr || getGeminiAspectRatio(sizeToUse);
                formData.append("aspect_ratio", ratio);
              }

              blobs.forEach((item) => {
                formData.append("image", item.blob, item.filename);
              });

              const response = await fetchWithRetry(
                `${apiBase}/v1/images/edits?async=true`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${config.apiKey}`,
                  },
                  body: formData,
                  signal: abortSignal,
                },
              );

              const textResponse = await response.text();
              let parseData: any;
              try {
                parseData = JSON.parse(textResponse);
              } catch (e) {
                throw new Error(
                  `生图服务器返回了非 JSON 数据(HTTP ${response.status}):\n${textResponse.slice(0, 150)}`,
                );
              }

              if (!response.ok) {
                throw new Error(
                  parseData.message ||
                    parseData.error?.message ||
                    `接口网络请求失败并返回状态代码 HTTP ${response.status}`,
                );
              }

              const taskId = parseData.task_id || parseData.data?.task_id || (typeof parseData.data === 'string' ? parseData.data : null);
              if (!taskId) throw new Error("No task ID returned");

              let attempts = 0;
              let finalUrl = "";
              while (attempts < 60) {
                attempts++;
                await new Promise((r) => setTimeout(r, 5000));

                const statusRes = await fetchWithRetry(
                  `${apiBase}/v1/images/tasks/${taskId}`,
                  {
                    headers: { Authorization: `Bearer ${config.apiKey}` },
                    signal: abortSignal,
                  },
                );

                const statusText = await statusRes.text();
                let statusData: any;
                try {
                  statusData = JSON.parse(statusText);
                } catch (e) {
                  continue;
                }

                const inner = statusData.data || {};
                const state = inner.status;

                if (state === "SUCCESS") {
                  finalUrl = inner.data?.data?.[0]?.url || "";
                  break;
                } else if (state === "FAILURE") {
                  throw new Error(`生成失败: ${inner.fail_reason}`);
                }
              }

              if (!finalUrl) {
                throw new Error("生图请求超时，未返回URL (Timeout)");
              }

              return finalUrl;
            } catch (err: any) {
              const isFetchError =
                err &&
                err.message &&
                typeof err.message === "string" &&
                (err.message.toLowerCase().includes("failed to fetch") ||
                  err.message.toLowerCase().includes("fetch failed") ||
                  err.name === "TypeError");

              if (isFetchError && attemptsLeft > 0) {
                console.warn(
                  "Image generation encountered 'Failed to fetch', automatic retrying once...",
                  err,
                );
                await new Promise((resolve) => setTimeout(resolve, 1000));
                continue;
              }
              throw err;
            }
          }
          throw new Error(
            "Failed to generate image due to unforeseen error in retry loop",
          );
        };

        const getCorsSafeUrl = (url: string) => {
          if (url.startsWith("https://ai.t8star.org")) {
            return url.replace("https://ai.t8star.org", apiBase);
          }
          if (url.startsWith("http://") || url.startsWith("https://")) {
            return `/api/proxy-image?url=${encodeURIComponent(url)}`;
          }
          return url;
        };

        const fetchBlobWithAuth = async (url: string): Promise<Blob> => {
          const corsSafe = getCorsSafeUrl(url);
          const headers: Record<string, string> = {};
          if (
            corsSafe.startsWith(apiBase) ||
            corsSafe.startsWith("/api/t8star")
          ) {
            headers["Authorization"] = `Bearer ${config.apiKey}`;
          }
          const res = await fetchWithRetry(corsSafe, { headers });
          if (!res.ok) {
            throw new Error(`Failed to fetch image: ${res.statusText}`);
          }
          return await res.blob();
        };

        const blobToDataURL = (blob: Blob): Promise<string> => {
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              if (reader.result) {
                resolve(reader.result as string);
              } else {
                reject(new Error("Failed to convert blob to data URL"));
              }
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        };

        const rotateImageBlob = async (
          imageBlob: Blob,
          angleDegrees: number,
        ): Promise<Blob> => {
          return new Promise<Blob>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
              const canvas = document.createElement("canvas");
              if (angleDegrees === 90 || angleDegrees === 270) {
                canvas.width = img.height;
                canvas.height = img.width;
              } else {
                canvas.width = img.width;
                canvas.height = img.height;
              }
              const ctx = canvas.getContext("2d");
              if (!ctx) {
                reject(new Error("Failed to get 2D context"));
                return;
              }
              if (angleDegrees === 90) {
                ctx.translate(canvas.width, 0);
                ctx.rotate((90 * Math.PI) / 180);
              } else if (angleDegrees === 270) {
                ctx.translate(0, canvas.height);
                ctx.rotate((270 * Math.PI) / 180);
              } else if (angleDegrees === 180) {
                ctx.translate(canvas.width, canvas.height);
                ctx.rotate((180 * Math.PI) / 180);
              }
              ctx.drawImage(img, 0, 0);
              canvas.toBlob((b) => {
                if (b) {
                  resolve(b);
                } else {
                  reject(new Error("Failed to convert canvas to blob"));
                }
              }, "image/png");
              URL.revokeObjectURL(img.src);
            };
            img.onerror = (e) => {
              reject(new Error("Failed to load image for rotation"));
              URL.revokeObjectURL(img.src);
            };
            img.src = URL.createObjectURL(imageBlob);
          });
        };

        let resultUrl = "";

        if (
          modelSelected.includes("banana") ||
          modelSelected === "gemini-3.1-flash-image-preview" ||
          modelSelected.includes("doubao") ||
          modelSelected.includes("flare") ||
          modelSelected.includes("sunburst") ||
          modelSelected.toLowerCase().includes("qwen") ||
          modelSelected.toLowerCase().includes("seedream")
        ) {
          // Native multi-resolution via image_size/size parameter (1k, 2k, 4k)
          // Banana models require horizontal generation for 9:21
          if (
            sizeToUse === "9:21" &&
            (modelSelected.includes("banana") ||
              modelSelected === "gemini-3.1-flash-image-preview")
          ) {
            // Step 1: Generate vertical 9:16 at 1k
            const url1K916 = await performImageTask(
              modelSelected,
              "720x1280",
              refBlobs,
              "9:16",
              undefined,
              "1k",
            );
            const blob1K916 = await fetchBlobWithAuth(url1K916);

            // Step 2: Rotate to horizontal (16:9) and use as reference to generate 21:9
            const rotatedBlob916To169 = await rotateImageBlob(blob1K916, 90);
            const urlHorizontal = await performImageTask(
              modelSelected,
              "1680x720",
              [{ blob: rotatedBlob916To169, filename: "reference_0.png" }],
              "21:9",
              "保持原图方向不变，根据原图重新生成，高清化为8k图像",
              modelSelected === "nano-banana-pro-2k"
                ? undefined
                : resolutionSelected,
            );
            const blobHorizontal = await fetchBlobWithAuth(urlHorizontal);

            // Step 3: Rotate back to vertical (9:21)
            const rotatedBlobVertical = await rotateImageBlob(
              blobHorizontal,
              270,
            );
            resultUrl = await blobToDataURL(rotatedBlobVertical);
          } else {
            resultUrl = await performImageTask(
              modelSelected,
              modelSelected === "nano-banana-pro-2k"
                ? resolvedSize2K
                : resolvedSize1K,
              refBlobs,
              modelSelected.includes("banana") ||
                modelSelected === "gemini-3.1-flash-image-preview"
                ? getGeminiAspectRatio(sizeToUse)
                : sizeToUse,
              undefined,
              modelSelected === "nano-banana-pro-2k"
                ? undefined
                : resolutionSelected,
            );
          }
        } else {
          // Model is non-banana (gpt-image-2-all, gpt-image-2, etc.)
          if (resolutionSelected === "2k" || resolutionSelected === "4k") {
            if (sizeToUse === "9:21") {
              // Step 1: Generate 1K with selected model
              const url1K = await performImageTask(
                modelSelected,
                resolvedSize1K,
                refBlobs,
              );
              // Step 2: Fetch 1K and rotate to horizontal (21:9)
              const blob1K = await fetchBlobWithAuth(url1K);
              const rotatedBlob1K = await rotateImageBlob(blob1K, 90);
              // Step 3: Upscale to 2K/4K via nano-banana-pro using horizontal size "3360x1440"
              let urlUpHorizontal: string;
              try {
                urlUpHorizontal = await performImageTask(
                  "nano-banana-pro",
                  "3360x1440",
                  [{ blob: rotatedBlob1K, filename: "reference_0.png" }],
                  "21:9",
                  "保持原图元素不变，4k高清化，增加自然的细节，清晰锐利",
                  resolutionSelected,
                );
              } catch (upscaleErr) {
                console.warn(
                  "nano-banana-pro upscale failed, falling back to gemini-3.1-flash-image-preview",
                  upscaleErr,
                );
                urlUpHorizontal = await performImageTask(
                  "gemini-3.1-flash-image-preview",
                  "3360x1440",
                  [{ blob: rotatedBlob1K, filename: "reference_0.png" }],
                  "21:9",
                  "保持原图元素不变，4k高清化，增加自然的细节，清晰锐利",
                  resolutionSelected,
                );
              }
              // Step 4: Fetch Upscaled horizontal and rotate back to vertical (9:21)
              const blobUpHorizontal = await fetchBlobWithAuth(urlUpHorizontal);
              const rotatedBlobUpVertical = await rotateImageBlob(
                blobUpHorizontal,
                270,
              );
              resultUrl = await blobToDataURL(rotatedBlobUpVertical);
            } else {
              // Step 1: Generate 1K with selected model
              const url1K = await performImageTask(
                modelSelected,
                resolvedSize1K,
                refBlobs,
              );
              // Step 2: Fetch 1K and upscale to 2K/4K via nano-banana-pro
              const blob1K = await fetchBlobWithAuth(url1K);
              try {
                resultUrl = await performImageTask(
                  "nano-banana-pro",
                  resolvedSize1K,
                  [{ blob: blob1K, filename: "reference_0.png" }],
                  getGeminiAspectRatio(sizeToUse),
                  "保持原图元素不变，4k高清化，增加自然的细节，清晰锐利",
                  resolutionSelected,
                );
              } catch (upscaleErr) {
                console.warn(
                  "nano-banana-pro upscale failed, falling back to gemini-3.1-flash-image-preview",
                  upscaleErr,
                );
                resultUrl = await performImageTask(
                  "gemini-3.1-flash-image-preview",
                  resolvedSize1K,
                  [{ blob: blob1K, filename: "reference_0.png" }],
                  getGeminiAspectRatio(sizeToUse),
                  "保持原图元素不变，4k高清化，增加自然的细节，清晰锐利",
                  resolutionSelected,
                );
              }
            }
          } else {
            // Direct 1K
            resultUrl = await performImageTask(
              modelSelected,
              resolvedSize1K,
              refBlobs,
            );
          }
        }

        resData = {
          data: [{ url: resultUrl }],
          raw: { success: true },
        };
      } else {
        // Chat format fallback logic
        const payload: any = {
          ...config,
          model: modelToUse,
          messages: [{ role: "user", content: finalPrompt }],
          temperature,
          maxTokens,
        };

        if (ws.includeUrlsInBody && refImagesToUse.length > 0) {
          const rawUrls = await Promise.all(
            refImagesToUse.map(async (img) => {
              if (img.url instanceof Blob) {
                return await blobToBase64(img.url);
              }
              return img.url;
            }),
          );
          payload.images = rawUrls;
          payload.ref_images = rawUrls;
          payload.references = rawUrls;
          payload.prompt_images = rawUrls;
        }

        let response: Response;
        if (config.requestMode === "client") {
          const directUrl = getEndpointUrl(config.baseUrl, "chat");
          const directPayload: any = {
            model: modelToUse,
            messages: [{ role: "user", content: finalPrompt }],
            temperature,
            max_tokens: maxTokens,
          };
          if (ws.includeUrlsInBody && refImagesToUse.length > 0) {
            const rawUrls = await Promise.all(
              refImagesToUse.map(async (img) => {
                if (img.url instanceof Blob) {
                  return await blobToBase64(img.url);
                }
                return img.url;
              }),
            );
            directPayload.images = rawUrls;
            directPayload.ref_images = rawUrls;
            directPayload.references = rawUrls;
            directPayload.prompt_images = rawUrls;
          }
          response = await fetchWithRetry(directUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify(directPayload),
          });
        } else {
          response = await fetchWithRetry("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }

        const textResponse = await response.text();
        try {
          resData = JSON.parse(textResponse);
        } catch (e) {
          throw new Error(
            `生图服务器返回了非 JSON 聊天数据 (HTTP ${response.status})`,
          );
        }

        if (!response.ok) {
          throw new Error(
            resData.error?.message ||
              resData.error ||
              `HTTP Status ${response.status}`,
          );
        }

        const responseText = resData.choices?.[0]?.message?.content || "";
        const imageMarkdownRegex = /!\[.*?\]\((https?:\/\/.*?)\)/gi;
        const rawUrlRegex =
          /(https?:\/\/[^\s\(\)]+?\.(?:png|jpg|jpeg|gif|webp))/gi;

        let urls: string[] = [];
        let match;

        while ((match = imageMarkdownRegex.exec(responseText)) !== null) {
          urls.push(match[1]);
        }

        if (urls.length === 0) {
          while ((match = rawUrlRegex.exec(responseText)) !== null) {
            urls.push(match[1]);
          }
        }

        if (urls.length > 0) {
          resData = {
            data: urls.map((url) => ({ url })),
            raw: resData,
          };
        } else {
          resData = {
            textValue: responseText,
            raw: resData,
          };
        }
      }

      if (resData?.data && Array.isArray(resData.data)) {
        const fallbackApiBase =
          config.requestMode === "client"
            ? config.baseUrl.trim().replace(/\/+$/, "")
            : "/api/t8star";

        const localGetCorsSafeUrl = (url: string) => {
          if (url.startsWith("https://ai.t8star.org")) {
            return url.replace("https://ai.t8star.org", fallbackApiBase);
          }
          if (url.startsWith("http://") || url.startsWith("https://")) {
            return `/api/proxy-image?url=${encodeURIComponent(url)}`;
          }
          return url;
        };

        const localFetchBlobWithAuth = async (url: string): Promise<Blob> => {
          const corsSafe = localGetCorsSafeUrl(url);
          const headers: Record<string, string> = {};
          if (
            corsSafe.startsWith(fallbackApiBase) ||
            corsSafe.startsWith("/api/t8star")
          ) {
            headers["Authorization"] = `Bearer ${config.apiKey}`;
          }
          const res = await fetchWithRetry(corsSafe, { headers });
          if (!res.ok) {
            throw new Error(`Failed to fetch image: ${res.statusText}`);
          }
          return await res.blob();
        };

        const localBlobToDataURL = (blob: Blob): Promise<string> => {
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              if (reader.result) {
                resolve(reader.result as string);
              } else {
                reject(new Error("Failed to convert blob to data URL"));
              }
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        };

        resData.data = await Promise.all(
          resData.data.map(async (img: any) => {
            let processedUrl = img.url;
            if (img.b64_json) {
              // Usually b64_json is already a base64 string without data:image prefix, but just to be safe
              const fullB64 = img.b64_json.startsWith("data:")
                ? img.b64_json
                : `data:image/png;base64,${img.b64_json}`;

              const blob = await base64ToBlob(fullB64);
              const thumb = await createThumbnailToBase64(fullB64);
              const thumb1k =
                resolutionToUse === "4k"
                  ? await createThumbnailToBase64(fullB64, 2560)
                  : undefined;
              return {
                ...img,
                url: blob,
                thumbnail_url: thumb,
                thumbnail_url_1k: thumb1k,
              };
            }
            if (
              processedUrl &&
              typeof processedUrl === "string" &&
              !processedUrl.startsWith("data:")
            ) {
              try {
                // Use fetchBlobWithAuth to ensure Authorization header is passed and CORS is bypassed correctly
                const fetchedBlob = await localFetchBlobWithAuth(processedUrl);
                const fullB64 = await localBlobToDataURL(fetchedBlob);
                const thumb = await createThumbnailToBase64(fullB64);
                const thumb1k =
                  resolutionToUse === "4k"
                    ? await createThumbnailToBase64(fullB64, 2560)
                    : undefined;
                return {
                  ...img,
                  url: fetchedBlob,
                  thumbnail_url: thumb,
                  thumbnail_url_1k: thumb1k,
                };
              } catch (e: any) {
                // Ignore fallback network fetch issues when converting images to blobs.
                // The URL will just be stored as an external URL String rather than an internal Blob string.
                if (!(
                  e &&
                  e.message &&
                  e.message.includes("Failed to fetch")
                )) {
                  console.warn(
                    "Failed to convert image to blob before saving state",
                    e,
                  );
                }
                return img;
              }
            } else if (
              processedUrl &&
              typeof processedUrl === "string" &&
              processedUrl.startsWith("data:")
            ) {
              const blob = await base64ToBlob(processedUrl);
              const thumb = await createThumbnailToBase64(processedUrl);
              const thumb1k =
                resolutionToUse === "4k"
                  ? await createThumbnailToBase64(processedUrl, 2560)
                  : undefined;
              return {
                ...img,
                url: blob,
                thumbnail_url: thumb,
                thumbnail_url_1k: thumb1k,
              };
            }
            return img;
          }),
        );
      }

      const latency = Date.now() - start;

      playSound("success");
      updateSystemStatus("success");
      sendDesktopNotification("✅ 生成成功", {
        body: "您的图像已生成完毕，快来看看吧！",
      });

      // Update generation target with success response
      setWorkspaces((prev) =>
        prev.map((w) => {
          if (w.id === trackId) {
            const exists = w.generations.some((g) => g.id === genId);
            if (!exists) return w; // Aborted and ignored
            return {
              ...w,
              generations: w.generations.map((g) => {
                if (g.id === genId) {
                  return {
                    ...g,
                    status: "success",
                    result: resData,
                    latency,
                  };
                }
                return g;
              }),
            };
          }
          return w;
        }),
      );
    } catch (err: any) {
      if (err.name !== "AbortError" && err.message !== "Failed to fetch") {
        playSound("error");
        updateSystemStatus("error");
        sendDesktopNotification("❌ 生成失败", {
          body: err.message || "图像生成遇到问题，请重试。",
        });
      }

      const errorMsg =
        err.message || "请求服务器接口超时或参数错误，未能成功返回图片图像。";
      setWorkspaces((prev) =>
        prev.map((w) => {
          if (w.id === trackId) {
            const exists = w.generations.some((g) => g.id === genId);
            if (!exists) return w; // Aborted and ignored
            return {
              ...w,
              generations: w.generations.map((g) => {
                if (g.id === genId) {
                  return {
                    ...g,
                    status: "error",
                    error: errorMsg,
                  };
                }
                return g;
              }),
            };
          }
          return w;
        }),
      );
    }
  };

  const handleRedrawDetails = async () => {
    if (!imageContextMenu) return;
    const { url, prompt, gen, trackId } = imageContextMenu;
    setImageContextMenu(null);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let blurPx = 8;
        if (gen.resolution === "2k") {
          blurPx = 16;
        } else if (gen.resolution === "4k") {
          blurPx = 32;
        }
        ctx.filter = `blur(${blurPx}px)`;
        ctx.drawImage(img, 0, 0);
        const blurredDataUrl = canvas.toDataURL("image/jpeg", 0.9);

        let cleanBasePrompt = prompt || "";
        cleanBasePrompt = cleanBasePrompt.replace(
          /严格按照@\d+，保持原图的光影效果和氛围，生成以下图像\n\n/g,
          "",
        );
        cleanBasePrompt = cleanBasePrompt.replace(
          /将@\d+进行4k高清化，还原@\d+的构图，光影效果和氛围\n\n参考提示词\n/g,
          "",
        );
        cleanBasePrompt = cleanBasePrompt.replace(
          /高清化为4k图像，保持@\d+的设计和光影效果和氛围，/g,
          "",
        );

        const cleanPromptStr = (cleanBasePrompt || "dream-image")
          .slice(0, 30)
          .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "-");
        const filename = `${cleanPromptStr || "image"}.png`;

        const refId = "1";
        const refImages: ImageReference[] = [
          {
            id: refId,
            url: blurredDataUrl,
            name: filename,
          },
        ];

        runTrackGeneration(trackId, undefined, {
          prompt: `将@${refId}进行4k高清化，还原@${refId}的构图，光影效果和氛围\n\n参考提示词\n${cleanBasePrompt}`,
          model: "nano-banana-pro",
          refImages: refImages,
          size: gen.size,
          resolution: "2k",
          callFormat: gen.callFormat,
        });
      } catch (err) {
        console.error("Canvas taint error", err);
        setToast("无法处理该图片（跨域限制），请重试或更换图片。");
      }
    };
    img.onerror = () => {
      setToast("获取原图失败，无法进行重绘！");
    };

    if (typeof url === "string") {
      if (url.startsWith("data:") || url.startsWith("blob:")) {
        img.src = url;
      } else {
        img.src = `/api/proxy-image?url=${encodeURIComponent(url)}`;
      }
    } else if (url instanceof Blob) {
      img.src = URL.createObjectURL(url);
    } else {
      setToast("无法处理该图片");
    }
  };

  // ---------------------------------------------------------------------------
  // Expert interface diagnostics suite
  // ---------------------------------------------------------------------------
  const runFullDiagnostics = async () => {
    setDiagnosticStatus("running");
    setDiagnosticLogs([]);
    addLog("开始测试并检测接口连通性...");
    addLog(`目标接口基址： ${config.baseUrl}`);
    addLog(
      `当前模式：${config.requestMode === "client" ? "🖥️ 浏览器直连 (Client Direct)" : "🌐 服务器代理 (Server Proxy)"}`,
    );

    if (config.requestMode === "client") {
      try {
        const modelsUrl = getEndpointUrl(config.baseUrl, "models");
        addLog(`正在连接模型名录接口：${modelsUrl}`);

        const startPing = Date.now();
        let modelsResponse: Response;
        try {
          modelsResponse = await fetchWithRetry(modelsUrl, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              Accept: "application/json",
            },
          });
        } catch (err: any) {
          addLog(
            `❌ 直连节点通讯失败：${err.message}. 正在尝试不包含 /v1 根目录的路径寻址备选方案...`,
          );
          const fallbackUrl =
            config.baseUrl.trim().replace(/\/+$/, "") + "/models";
          modelsResponse = await fetchWithRetry(fallbackUrl, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              Accept: "application/json",
            },
          });
        }

        const pingLatency = Date.now() - startPing;
        if (!modelsResponse.ok) {
          const errText = await modelsResponse.text();
          throw new Error(
            `模型获取失败：HTTP ${modelsResponse.status} - ${errText}`,
          );
        }

        const modelsData = await modelsResponse.json();
        const models = modelsData.data || [];
        setModelsList(models);

        addLog(`✅ 双向握手成功！(网络往返延迟： ${pingLatency}ms)`);
        addLog(`✅ 身份鉴权验证成功：密钥有效，享有完整存取权。`);
        addLog(`✅ 已成功获取模型名录：共 ${models.length} 项支持。`);

        const testSummary: DiagnosticSummary = {
          pingOk: true,
          pingLatency,
          modelsCount: models.length,
          modelsList: models.slice(0, 15),
          completionOk: false,
        };

        if (models.length > 0) {
          const selectedModel =
            models.find(
              (m: any) =>
                m.id.toLowerCase().includes("gpt-3.5-turbo") ||
                m.id.toLowerCase().includes("gpt-4o-mini") ||
                m.id.toLowerCase().includes("deepseek-chat") ||
                m.id.toLowerCase().includes("deepseek-coder"),
            )?.id || models[0].id;

          const chatUrl = getEndpointUrl(config.baseUrl, "chat");
          addLog(
            `正在从客户端测试聊天补全接口：${chatUrl} (测试模型: ${selectedModel})`,
          );

          const startChat = Date.now();
          const chatResponse = await fetchWithRetry(chatUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
              model: selectedModel,
              messages: [
                {
                  role: "system",
                  content:
                    "You are a connectivity test script. Reply with exactly 'OK' and nothing else.",
                },
                { role: "user", content: "test" },
              ],
              max_tokens: 10,
              temperature: 0.1,
            }),
          });

          const completionLatency = Date.now() - startChat;
          if (chatResponse.ok) {
            const chatData = await chatResponse.json();
            const content =
              chatData.choices?.[0]?.message?.content ||
              JSON.stringify(chatData);
            addLog(
              `✅ 接口基底内容生成校验：成功！(文本生成开销： ${completionLatency}ms)`,
            );
            addLog(`📝 解码样文摘要： "${content?.substring(0, 50)}..."`);

            testSummary.completionOk = true;
            testSummary.completionContent = content;
            testSummary.completionLatency = completionLatency;
          } else {
            const errText = await chatResponse.text();
            addLog(
              `❌ 文本生成可用性验证：失败。(HTTPStatus ${chatResponse.status})`,
            );
            testSummary.error = `Completion endpoint returned HTTP ${chatResponse.status}: ${errText}`;
          }
        } else {
          testSummary.error =
            "Handshake was successful but the models list was empty.";
        }

        setDiagnostics(testSummary);
        if (testSummary.error) {
          setDiagnosticStatus("error");
        } else {
          addLog("✅ 平台链路接口完整性自检结束，未检测出致命阻塞性问题。");
          setDiagnosticStatus("success");
        }
      } catch (err: any) {
        addLog(`❌ 浏览器直连处理异常： ${err.message}`);
        addLog(
          `⚠️ 温馨提示：如果直连抛出 "Failed to fetch"，高度可能是目标接口不支持浏览器跨域(CORS)访问。此时需要求助接口提供商，或在左侧切换至 [服务器代理] 模式进行网络中转。`,
        );
        setDiagnosticStatus("error");
        setDiagnostics({
          pingOk: false,
          modelsCount: 0,
          modelsList: [],
          completionOk: false,
          error: err.message || "CORS or Network issue.",
        });
      }
    } else {
      try {
        addLog("正在发送握手数据包，尝试同步接口的模型列表目录...");
        const response = await fetchWithRetry("/api/diagnose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        });

        if (!response.ok) {
          throw new Error(
            `服务器响应失败并拒绝连接，状态码 ${response.status}`,
          );
        }

        const resData: DiagnosticSummary = await response.json();
        setDiagnostics(resData);

        if (resData.pingOk) {
          addLog(`✅ 双向握手成功！(网络往返延迟： ${resData.pingLatency}ms)`);
          addLog(`✅ 身份鉴权验证成功：密钥有效，享有完整存取权。`);
          addLog(`✅ 已成功获取模型名录：共 ${resData.modelsCount} 项支持。`);
          if (resData.modelsList.length > 0) {
            setModelsList(resData.modelsList);
          }
        } else {
          addLog(`❌ 网络握手失败。请检查 API Base URL、网络连通或代理节点。`);
        }

        if (resData.completionOk) {
          addLog(
            `✅ 接口基底内容生成校验：成功！(文本生成开销： ${resData.completionLatency}ms)`,
          );
          addLog(
            `📝 解码样文摘要： "${resData.completionContent?.substring(0, 50)}..."`,
          );
        } else {
          addLog(`❌ 文本生成可用性验证：失败。`);
        }

        if (resData.error) {
          addLog(`⚠️ 问题警告记录： ${resData.error}`);
          setDiagnosticStatus("error");
        } else {
          addLog("✅ 平台链路接口完整性自检结束，未检测出致命阻塞性问题。");
          setDiagnosticStatus("success");
        }
      } catch (err: any) {
        addLog(`❌ 内部处理异常： ${err.message || "未知代理服务器错误"}`);
        setDiagnosticStatus("error");
        setDiagnostics({
          pingOk: false,
          modelsCount: 0,
          modelsList: [],
          completionOk: false,
          error: err.message || "An exception occurred.",
        });
      }
    }
  };

  const fetchModels = async () => {
    setIsFetchingModels(true);
    setModelsError(null);
    try {
      let data: any;
      if (config.requestMode === "client") {
        const endpointUrl = getEndpointUrl(config.baseUrl, "models");
        const response = await fetchWithRetry(endpointUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            Accept: "application/json",
          },
        });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`获取模型失败 HTTP ${response.status}: ${errText}`);
        }
        data = await response.json();
      } else {
        const response = await fetchWithRetry("/api/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        });

        data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }
      }

      if (data.data && Array.isArray(data.data)) {
        setModelsList(data.data);
      }
    } catch (err: any) {
      setModelsError(
        err.message ||
          "无法拉取模型表单。这不影响您的画作体验，也可切换调试页面手动检测。",
      );
    } finally {
      setIsFetchingModels(false);
    }
  };

  const sendChatMessage = async () => {
    if (!inputMessage.trim() || isGenerating) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: "user",
      content: inputMessage,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    setIsGenerating(true);

    try {
      const messagePayload = messages
        .filter((m) => m.id !== "initial-system")
        .map((m) => ({ role: m.role, content: m.content }));

      messagePayload.push({ role: "user", content: inputMessage });

      let data: any;
      if (config.requestMode === "client") {
        const endpointUrl = getEndpointUrl(config.baseUrl, "chat");
        const response = await fetchWithRetry(endpointUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: messagePayload,
            temperature,
            max_tokens: maxTokens,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errText}`);
        }
        const json = await response.json();
        data = {
          choices: json.choices,
          usage: json.usage,
          latency: 0,
          raw: json,
        };
      } else {
        const response = await fetchWithRetry("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...config,
            model: selectedModel,
            messages: messagePayload,
            temperature,
            maxTokens,
            systemPrompt,
          }),
        });

        data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }
      }

      setLastRawResponse(data);

      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        role: "assistant",
        content: data.choices?.[0]?.message?.content || JSON.stringify(data),
        timestamp: new Date().toLocaleTimeString(),
        modelUsed: selectedModel,
        latency: data.latency,
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: `❌ 请求超时或鉴权失败: ${err.message}`,
        timestamp: new Date().toLocaleTimeString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Predefined models for drop-down selection
  const imageModelsPreset = [
    { value: "gpt-image-2-2in1", label: "gpt-image-2-2in1" },
    { value: "gpt-image-2-low", label: "gpt-image-2-low" },
    { value: "gpt-image-2-medium", label: "gpt-image-2-medium" },
    { value: "gpt-image-2-high", label: "gpt-image-2-high" },
    { value: "gpt-image-2-all", label: "gpt-image-2-all (中英双语高级强化)" },
    { value: "gpt-image-2.5-flare", label: "gpt-image-2.5-flare" },
    { value: "gpt-image-2.5-sunburst", label: "gpt-image-2.5-sunburst" },
    { value: "nano-banana-pro", label: "nano-banana-pro (极速多分辨率)" },
    { value: "gemini-3.1-flash-image-preview", label: "nano-banana-2" },
    {
      value: "doubao-seedream-4-0-250828",
      label: "doubao-seedream-4-0-250828 (即梦4)",
    },
    {
      value: "seedream5.0Pro",
      label: "seedream5.0Pro",
    },
    {
      value: "Qwen_Image_3.0Pro",
      label: "Qwen_Image_3.0Pro",
    },
    {
      value: "d_Qwen_Image_3.0Pro",
      label: "d_Qwen_Image_3.0Pro (直接扩写)",
    },
    {
      value: "a_Qwen_Image_3.0Pro",
      label: "a_Qwen_Image_3.0Pro (Agent深度扩写)",
    },
    {
      value: "qwen-image-2.1-pro",
      label: "qwen-image-2.1-pro",
    },
  ];

  const aspectRatios = [
    { value: "Auto", label: "Auto" },
    { value: "1:1", label: "1:1" },
    { value: "3:2", label: "3:2" },
    { value: "2:3", label: "2:3" },
    { value: "4:3", label: "4:3" },
    { value: "3:4", label: "3:4" },
    { value: "5:4", label: "5:4" },
    { value: "4:5", label: "4:5" },
    { value: "16:9", label: "16:9" },
    { value: "9:16", label: "9:16" },
    { value: "2:1", label: "2:1" },
    { value: "1:2", label: "1:2" },
    { value: "21:9", label: "21:9" },
    { value: "9:21", label: "9:21" },
  ];

  // Dynamic design geometry to center existing columns excluding the "new column" card
  const isDesktop = windowWidth >= 768;
  const GAP_SIZE = isDesktop ? 24 : 16; // md:gap-6 is 24px, gap-4 is 16px
  const N_COLUMN = workspaces.length;
  const activeColumnsWidth =
    workspaces.reduce((sum, w) => {
      const wWidth =
        w.columnWidth === "wide" ? 840 : w.columnWidth === "medium" ? 650 : 460;
      return sum + wWidth;
    }, 0) +
    (N_COLUMN - 1) * GAP_SIZE;
  const horizontalPadding = 48; // px-6 on both sides has 48px total padding
  const availableViewportWidth = windowWidth - horizontalPadding;
  const leftCenteringOffset = isDesktop
    ? Math.max(0, (availableViewportWidth - activeColumnsWidth) / 2)
    : 0;

  const columnVariants = {
    initial: { opacity: 0, scale: 0.8 },
    animate: {
      opacity: 1,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 260,
        damping: 24,
        delay: 0,
      },
    },
    exit: {
      opacity: 0,
      scale: 0.8,
      transition: {
        duration: 0.2,
      },
    },
  };

  return (
    <div
      id="app_container"
      className={`h-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col antialiased font-sans ${theme}`}
    >
      <AnimatePresence>
        {draggedImageItem &&
          !draggedImageItem.isFromStaging &&
          !isSpacebarOverviewActive &&
          !compareMode && (
            <motion.div
              initial={{ y: "-100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "-100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className={`absolute top-0 left-0 right-0 max-w-6xl mx-auto h-32 z-[100] flex gap-4 p-4`}
            >
              {/* Left Box: Panorama Compare */}
              <div
                className={`flex-1 rounded-2xl border flex flex-col items-center justify-center border-dashed shadow-2xl backdrop-blur-xl transition-colors ${
                  draggedImageItem
                    ? theme === "dark"
                      ? "bg-slate-900/90 border-indigo-500/80 hover:bg-slate-800/90"
                      : "bg-white/90 border-indigo-400 hover:bg-indigo-50/90"
                    : theme === "dark"
                      ? "bg-slate-900/50 border-slate-700/50 opacity-90"
                      : "bg-white/50 border-slate-300 opacity-90"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const draggedItem = draggedImageItemRef.current;
                  if (draggedItem) {
                    setPanoramaCompareSourceImage(draggedItem);
                    setLightboxImage(draggedItem);
                    setIsSpacebarOverviewActive(true);
                    setDraggedImageItem(null);
                    draggedImageItemRef.current = null;
                  }
                }}
              >
                <div
                  className={`flex items-center gap-3 ${theme === "dark" ? "text-indigo-400" : "text-indigo-600"}`}
                >
                  <GitCompare
                    className={`w-8 h-8 ${!draggedImageItem && "opacity-60"}`}
                  />
                  <span
                    className={`font-semibold tracking-wide text-xl ${!draggedImageItem && "opacity-60"}`}
                  >
                    {draggedImageItem
                      ? "拖至此处进入全景双图对比"
                      : "全景双图对比区"}
                  </span>
                </div>
              </div>

              {/* Right Box: Staging Area */}
              <div
                className={`flex-1 overflow-hidden rounded-2xl border flex flex-col items-center justify-center border-dashed shadow-2xl backdrop-blur-xl transition-colors ${
                  theme === "dark"
                    ? "bg-slate-800/90 border-teal-500/80 hover:bg-slate-700/90 text-teal-400"
                    : "bg-teal-50/90 border-teal-400 hover:bg-teal-100/90 text-teal-600"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const draggedItem = draggedImageItemRef.current;
                  if (draggedItem) {
                    setStagedReferenceImages((prev) => {
                      if (prev.find((img) => img.url === draggedItem.url))
                        return prev;
                      return [
                        ...prev,
                        { ...draggedItem, id: crypto.randomUUID() },
                      ];
                    });
                    setDraggedImageItem(null);
                    draggedImageItemRef.current = null;
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  <ImageIcon className="w-8 h-8" />
                  <span className="font-semibold tracking-wide text-xl">
                    拖至此处暂存参考图
                  </span>
                </div>
              </div>
            </motion.div>
          )}
      </AnimatePresence>

      {/* Global reusable squircle clipPath using objectBoundingBox coordinates */}
      <svg
        width="0"
        height="0"
        className="absolute pointer-events-none select-none"
        style={{ position: "absolute", width: 0, height: 0 }}
      >
        <defs>
          <clipPath id="squircle-clip" clipPathUnits="objectBoundingBox">
            <path d="M 0.5,0 C 0.15,0 0,0.15 0,0.5 C 0,0.85 0.15,1 0.5,1 C 0.85,1 1,0.85 1,0.5 C 1,0.15 0.85,0 0.5,0 Z" />
          </clipPath>
        </defs>
      </svg>

      {/* ================= HEADER CONTROL PANEL ================= */}
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-[95] px-6 py-3.5 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Brand Identity Block */}
          <div className="flex items-center gap-3 select-none">
            <div className="relative group cursor-pointer">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl blur opacity-30 group-hover:opacity-60 transition duration-300"></div>
              <div
                className="relative bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 w-9 h-9 shadow-md text-white flex items-center justify-center flex-shrink-0 border border-indigo-400/30"
                style={{ clipPath: "url(#squircle-clip)" }}
              >
                <SharpStar className="w-4.5 h-4.5 text-white fill-white drop-shadow-[0_0_8px_rgba(255,255,255,0.95)] animate-pulse" />
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="flex items-center text-base sm:text-lg font-black tracking-tight text-white leading-none">
                <span>贞贞</span>
                <span className="ml-0.5 bg-gradient-to-r from-indigo-300 via-purple-300 to-indigo-200 bg-clip-text text-transparent font-black">
                  Pro
                </span>
              </div>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 text-[11px] font-mono font-semibold tracking-wide shadow-sm backdrop-blur-sm">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
                </span>
                v1.7.0
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Project Selector */}
            <div className="relative" ref={projectDropdownRef}>
              <button
                onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer border shadow-sm ${
                  theme === "light"
                    ? "bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200"
                    : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                }`}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-0.5"></div>
                <span className="max-w-[100px] truncate">
                  {projects.find((p) => p.id === activeProjectId)?.name ||
                    "默认项目"}
                </span>
                <ChevronDown className="w-3.5 h-3.5 opacity-70" />
              </button>

              <AnimatePresence>
                {isProjectDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -5, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -5, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className={`absolute top-full left-0 mt-2 w-56 rounded-xl shadow-xl z-[9999] overflow-hidden border ${
                      theme === "light"
                        ? "bg-white border-slate-200"
                        : "bg-slate-800 border-slate-700"
                    }`}
                  >
                    <div className="p-2 space-y-1 max-h-60 overflow-y-auto scrollbar-custom">
                      {projects.map((proj) => (
                        <div
                          key={proj.id}
                          className={`flex items-center justify-between group rounded-md ${
                            activeProjectId === proj.id
                              ? theme === "light"
                                ? "bg-indigo-50"
                                : "bg-slate-700"
                              : theme === "light"
                                ? "hover:bg-slate-100"
                                : "hover:bg-slate-700/50"
                          }`}
                        >
                          {editingProjId === proj.id ? (
                            <form
                              className="flex-1 px-2 py-1.5"
                              onSubmit={(e) => {
                                e.preventDefault();
                                if (editingProjName.trim()) {
                                  setProjects((prev) =>
                                    prev.map((p) =>
                                      p.id === proj.id
                                        ? { ...p, name: editingProjName.trim() }
                                        : p,
                                    ),
                                  );
                                }
                                setEditingProjId(null);
                              }}
                            >
                              <input
                                autoFocus
                                value={editingProjName}
                                onChange={(e) =>
                                  setEditingProjName(e.target.value)
                                }
                                onBlur={() => {
                                  if (editingProjName.trim()) {
                                    setProjects((prev) =>
                                      prev.map((p) =>
                                        p.id === proj.id
                                          ? {
                                              ...p,
                                              name: editingProjName.trim(),
                                            }
                                          : p,
                                      ),
                                    );
                                  }
                                  setEditingProjId(null);
                                }}
                                className={`w-full text-xs px-2 py-1 rounded outline-none border focus:border-indigo-500/50 ${
                                  theme === "light"
                                    ? "bg-white text-slate-800 border-slate-300"
                                    : "bg-slate-900 text-white border-slate-600"
                                }`}
                              />
                            </form>
                          ) : deletingProjId === proj.id ? (
                            <div className="flex-1 flex justify-between items-center py-1.5 px-2">
                              <span
                                className={`text-[10px] truncate mr-2 font-bold ${
                                  theme === "light"
                                    ? "text-red-500"
                                    : "text-red-300"
                                }`}
                              >
                                确认删除？
                              </span>
                              <div className="flex gap-1.5 shrink-0">
                                <button
                                  className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                                    theme === "light"
                                      ? "bg-slate-200 hover:bg-slate-300 text-slate-700"
                                      : "bg-slate-600 hover:bg-slate-500 text-white"
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeletingProjId(null);
                                  }}
                                >
                                  取消
                                </button>
                                <button
                                  className="text-[10px] bg-red-500/90 hover:bg-red-500 text-white px-1.5 py-0.5 rounded transition-colors shadow-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const nextProjList = projects.filter(
                                      (p) => p.id !== proj.id,
                                    );
                                    if (nextProjList.length === 0) {
                                      const defaultProj = {
                                        id: "default",
                                        name: "默认项目",
                                        createdAt: Date.now(),
                                      };
                                      setProjects([defaultProj]);
                                      setActiveProjectId("default");
                                    } else {
                                      setProjects(nextProjList);
                                      if (activeProjectId === proj.id) {
                                        setActiveProjectId(nextProjList[0].id);
                                      }
                                    }
                                    setDeletingProjId(null);
                                  }}
                                >
                                  确认
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setActiveProjectId(proj.id);
                                setIsProjectDropdownOpen(false);
                              }}
                              className={`flex flex-1 items-center px-3 py-2 text-xs transition-colors rounded-md text-left ${
                                activeProjectId === proj.id
                                  ? theme === "light"
                                    ? "font-bold text-indigo-700"
                                    : "font-bold !text-white"
                                  : theme === "light"
                                    ? "text-slate-600 hover:text-slate-900 font-medium"
                                    : "text-slate-300 hover:text-white font-medium"
                              }`}
                            >
                              <span className="truncate w-full pr-2 text-left block">
                                {proj.name}
                              </span>
                            </button>
                          )}

                          {editingProjId !== proj.id &&
                            deletingProjId !== proj.id && (
                              <div className="p-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center pr-2 gap-1 shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingProjName(proj.name);
                                    setEditingProjId(proj.id);
                                  }}
                                  className={`transition-colors cursor-pointer ${
                                    theme === "light"
                                      ? "text-slate-400 hover:text-indigo-600"
                                      : "text-slate-400 hover:text-indigo-400"
                                  }`}
                                  title="重命名项目"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeletingProjId(proj.id);
                                  }}
                                  className={`transition-colors cursor-pointer ${
                                    theme === "light"
                                      ? "text-slate-400 hover:text-red-500"
                                      : "text-slate-400 hover:text-red-400"
                                  }`}
                                  title="删除项目"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                        </div>
                      ))}

                      {editingProjId === "new" && (
                        <div
                          className={`flex items-center group rounded-md px-2 py-1.5 ${
                            theme === "light"
                              ? "bg-slate-100"
                              : "bg-slate-700/50"
                          }`}
                        >
                          <form
                            className="flex-1"
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (editingProjName.trim()) {
                                const newProj = {
                                  id: `proj-${Date.now()}`,
                                  name: editingProjName.trim(),
                                  createdAt: Date.now(),
                                };
                                setProjects((prev) => [...prev, newProj]);
                                setActiveProjectId(newProj.id);
                              }
                              setEditingProjId(null);
                            }}
                          >
                            <input
                              autoFocus
                              value={editingProjName}
                              onChange={(e) =>
                                setEditingProjName(e.target.value)
                              }
                              onBlur={() => {
                                if (editingProjName.trim()) {
                                  const newProj = {
                                    id: `proj-${Date.now()}`,
                                    name: editingProjName.trim(),
                                    createdAt: Date.now(),
                                  };
                                  setProjects((prev) => [...prev, newProj]);
                                  setActiveProjectId(newProj.id);
                                }
                                setEditingProjId(null);
                              }}
                              placeholder="新项目名称..."
                              className={`w-full text-xs px-2 py-1 rounded outline-none border focus:border-indigo-500/50 ${
                                theme === "light"
                                  ? "bg-white text-slate-800 border-slate-300"
                                  : "bg-slate-900 text-white border-slate-600"
                              }`}
                            />
                          </form>
                        </div>
                      )}
                    </div>

                    <div
                      className={`p-2 border-t ${
                        theme === "light"
                          ? "border-slate-200 bg-slate-50"
                          : "border-slate-700/80 bg-slate-850"
                      }`}
                    >
                      <button
                        onClick={() => {
                          setEditingProjName("");
                          setEditingProjId("new");
                        }}
                        className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm cursor-pointer ${
                          theme === "light"
                            ? "text-indigo-600 hover:text-white hover:bg-indigo-600 bg-indigo-50 border border-indigo-200"
                            : "text-indigo-400 hover:text-white hover:bg-indigo-600 bg-indigo-500/10 border border-indigo-500/20"
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        新建项目
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* --- Staged Images in Header --- */}
        <div
          id="top-staging-area"
          className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex h-full items-center gap-0 overflow-x-auto max-w-[40%] min-w-[120px]"
        >
          {stagedReferenceImages.map((img, idx) => (
            <div key={img.id} className="relative group h-full flex-shrink-0">
              <SmartImage
                src={img.url}
                className="h-full w-auto object-contain pointer-events-none"
              />

              <div
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.dataTransfer.effectAllowed = "copy";

                  const urlStr = img.url instanceof Blob ? "" : img.url;
                  e.dataTransfer.setData("image-url", urlStr);
                  e.dataTransfer.setData("text/plain", urlStr);

                  const itemData = {
                    url: img.url,
                    prompt: img.prompt || "",
                    gen: img.gen || ({} as any),
                    trackId: img.trackId || "",
                    isFromStaging: true,
                  };
                  setDraggedImageItem(itemData as any);
                  draggedImageItemRef.current = itemData as any;
                }}
                onDragEnd={() => {
                  setDraggedImageItem(null);
                  draggedImageItemRef.current = null;
                }}
                className="absolute inset-0 cursor-grab active:cursor-grabbing"
              />

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setStagedReferenceImages((prev) =>
                    prev.filter((i) => i.id !== img.id),
                  );
                }}
                className={`absolute -top-1 -right-1 w-4 h-4 p-0 opacity-0 group-hover:opacity-100 transition-all z-10 rounded-full flex items-center justify-center shadow-md border ${
                  theme === "light"
                    ? "bg-rose-500 hover:bg-rose-600 text-white border-rose-400/30"
                    : "bg-rose-600 hover:bg-rose-500 text-white border-white/20"
                }`}
                title="移除参考图"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          {/* Diagnostic status indicator */}
          {isDevEnvironment && (
            <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
              <span>
                接口状态: <b>正常联通</b>
              </span>
            </div>
          )}

          {isDevEnvironment && (
            <>
              <button
                onClick={() => {
                  setIsDiagnosticsMode(!isDiagnosticsMode);
                  if (!isDiagnosticsMode) setIsApi2Mode(false);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer shadow-sm ${
                  isDiagnosticsMode
                    ? "bg-amber-600 hover:bg-amber-700 text-white"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                {isDiagnosticsMode ? "返回多轨看板大厅" : "接口1"}
              </button>

              <button
                onClick={() => {
                  setIsApi2Mode(!isApi2Mode);
                  if (!isApi2Mode) setIsDiagnosticsMode(false);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer shadow-sm ${
                  isApi2Mode
                    ? "bg-amber-600 hover:bg-amber-700 text-white"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                {isApi2Mode ? "返回多轨看板大厅" : "接口2"}
              </button>
            </>
          )}

          {!isDiagnosticsMode && !isApi2Mode && (
            <button
              onClick={handleRecenter}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-755 hover:text-white shadow-sm"
              title="将所有创意列水平居中显示"
            >
              <AlignHorizontalJustifyCenter className="w-3.5 h-3.5 text-indigo-400" />
              <span>居中看板</span>
            </button>
          )}

          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 shadow-sm"
            title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
          >
            {theme === "dark" ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>浅色模式</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
                <span>深色模式</span>
              </>
            )}
          </button>

          {/* Settings Dropdown Button / Popup */}
          <div className="relative flex-shrink-0" ref={settingsDropdownRef}>
            <button
              onClick={() => setIsSettingsDropdownOpen(!isSettingsDropdownOpen)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer border shadow-sm ${
                isSettingsDropdownOpen
                  ? "bg-indigo-600 border-indigo-505 text-white hover:bg-indigo-500"
                  : theme === "light"
                    ? "bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200"
                    : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
              }`}
              title="设置首选项"
            >
              <Settings
                className={`w-3.5 h-3.5 ${isSettingsDropdownOpen ? "rotate-90" : "hover:rotate-45"} transition-transform duration-305 text-indigo-400`}
              />
              <span>设置</span>
            </button>

            <AnimatePresence>
              {isSettingsDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className={`absolute top-full right-0 mt-2 w-84 sm:w-96 max-h-[85vh] overflow-y-auto rounded-xl shadow-2xl z-[9999] border p-4 ${
                    theme === "light"
                      ? "bg-white border-slate-200 text-slate-850"
                      : "bg-slate-800 border-slate-750 text-slate-200"
                  }`}
                  style={{ textShadow: "none" }}
                >
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3.5 flex items-center gap-1.5 select-none">
                    <Settings className="w-3.5 h-3.5 text-indigo-400" />
                    个性化设置 / Settings
                  </h3>

                  <div className="space-y-4">
                    <div
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                        theme === "light"
                          ? "bg-slate-50 border-slate-100"
                          : "bg-slate-900/40 border-slate-750/30"
                      }`}
                    >
                      <div className="flex flex-col gap-0.5 select-none text-left">
                        <span className="text-[12px] font-bold leading-snug">
                          单图看图联动位置
                        </span>
                        <span
                          className={`text-[10px] leading-normal ${
                            theme === "light"
                              ? "text-slate-500"
                              : "text-slate-400"
                          }`}
                        >
                          全屏单独切图预览时，下方画板视图将同步滚动定位至相应作品卡片。
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          toggleSyncCanvasScroll(!syncCanvasScrollOnView)
                        }
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          syncCanvasScrollOnView
                            ? "bg-indigo-600"
                            : "bg-slate-650"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            syncCanvasScrollOnView
                              ? "translate-x-4"
                              : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    <div
                      className={`p-3 rounded-xl border flex flex-col gap-2 ${
                        theme === "light"
                          ? "bg-slate-50 border-slate-100"
                          : "bg-slate-900/40 border-slate-750/30"
                      }`}
                    >
                      <div className="flex flex-col gap-1 select-none text-left w-full">
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-bold leading-snug">
                            生图列缩放比例
                          </span>
                          <span className="text-[12px] font-mono text-indigo-500 font-bold">
                            {workspaceZoomLevel}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="60"
                          max="100"
                          step="10"
                          value={workspaceZoomLevel}
                          onChange={(e) => handleZoomChange(parseInt(e.target.value))}
                          className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 mt-1"
                        />
                      </div>
                    </div>

                    <div
                      className={`p-3 rounded-xl border flex flex-col gap-2 ${
                        theme === "light"
                          ? "bg-slate-50 border-slate-100"
                          : "bg-slate-900/40 border-slate-750/30"
                      }`}
                    >
                      <div className="flex flex-col gap-0.5 select-none text-left">
                        <span className="text-[12px] font-bold leading-snug">
                          接口 API Key
                        </span>
                        <span
                          className={`text-[10px] leading-normal ${
                            theme === "light"
                              ? "text-slate-500"
                              : "text-slate-400"
                          }`}
                        >
                          设置生图列和 API 2 调用的密钥 (自动保存)
                        </span>
                      </div>
                      <div className="relative mt-1">
                        <input
                          type={showKey ? "text" : "password"}
                          value={config.apiKey}
                          onChange={(e) =>
                            setConfig({ ...config, apiKey: e.target.value })
                          }
                          placeholder="sk-..."
                          className={`w-full pl-3 pr-8 py-1.5 border rounded-lg text-[11px] font-mono outline-none focus:ring-1 focus:ring-indigo-500 transition-colors ${
                            theme === "light"
                              ? "bg-white border-slate-300 text-slate-800"
                              : "bg-slate-950 border-slate-700 text-slate-200"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className={`absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-md transition-colors ${
                            theme === "light"
                              ? "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                              : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                          }`}
                          title={showKey ? "隐藏" : "显示"}
                        >
                          {showKey ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div
                      className={`p-3 rounded-xl border flex flex-col gap-2 ${
                        theme === "light"
                          ? "bg-slate-50 border-slate-100"
                          : "bg-slate-900/40 border-slate-750/30"
                      }`}
                    >
                      <div className="flex flex-col gap-0.5 select-none text-left">
                        <span className="text-[12px] font-bold leading-snug">
                          Seedream / Qwen API Key
                        </span>
                        <span
                          className={`text-[10px] leading-normal ${
                            theme === "light"
                              ? "text-slate-500"
                              : "text-slate-400"
                          }`}
                        >
                          用于 seedream 与 Qwen 系列模型 (api.seedance.nz 专用密钥)
                        </span>
                      </div>
                      <div className="relative mt-1">
                        <input
                          type={showSeedanceKey ? "text" : "password"}
                          value={config.seedanceApiKey || ""}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              seedanceApiKey: e.target.value,
                            })
                          }
                          placeholder="sk-..."
                          className={`w-full pl-3 pr-8 py-1.5 border rounded-lg text-[11px] font-mono outline-none focus:ring-1 focus:ring-indigo-500 transition-colors ${
                            theme === "light"
                              ? "bg-white border-slate-300 text-slate-800"
                              : "bg-slate-950 border-slate-700 text-slate-200"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowSeedanceKey(!showSeedanceKey)}
                          className={`absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-md transition-colors ${
                            theme === "light"
                              ? "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                              : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                          }`}
                          title={showSeedanceKey ? "隐藏" : "显示"}
                        >
                          {showSeedanceKey ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div
                      className={`p-3 rounded-xl border flex flex-col gap-2.5 ${
                        theme === "light"
                          ? "bg-slate-50 border-slate-100"
                          : "bg-slate-900/40 border-slate-750/30"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col gap-0.5 select-none text-left">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[12px] font-bold leading-snug">
                              Qwen-Image-2.1-Pro 接口配置
                            </span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                              NEW
                            </span>
                          </div>
                          <span
                            className={`text-[10px] leading-normal ${
                              theme === "light"
                                ? "text-slate-500"
                                : "text-slate-400"
                            }`}
                          >
                            用于千问统一生图与编辑模型 qwen-image-2.1-pro
                          </span>
                        </div>
                        <a
                          href="https://www.qianwenai.com/models/qwen-image-2.1-pro#api-reference"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 flex items-center gap-1 text-[10px] text-indigo-500 hover:text-indigo-400 underline decoration-indigo-400/40 hover:decoration-indigo-400 transition-colors"
                          title="查看官方 API 参考文档"
                        >
                          <span>API 参考</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      {/* API 接口地址 */}
                      <div className="flex flex-col gap-1 text-left">
                        <div className="flex items-center justify-between">
                          <label
                            className={`text-[10px] font-medium ${
                              theme === "light"
                                ? "text-slate-600"
                                : "text-slate-300"
                            }`}
                          >
                            API 接口地址 (Endpoint URL)
                          </label>
                          {config.qianwenApiUrl &&
                            config.qianwenApiUrl !==
                              "https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation" && (
                              <button
                                type="button"
                                onClick={() =>
                                  setConfig({
                                    ...config,
                                    qianwenApiUrl:
                                      "https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation",
                                  })
                                }
                                className="text-[9px] text-slate-400 hover:text-indigo-400 transition-colors"
                              >
                                恢复默认
                              </button>
                            )}
                        </div>
                        <input
                          type="text"
                          value={
                            config.qianwenApiUrl ||
                            "https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation"
                          }
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              qianwenApiUrl: e.target.value,
                            })
                          }
                          placeholder="https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation"
                          className={`w-full px-2.5 py-1.5 border rounded-lg text-[11px] font-mono outline-none focus:ring-1 focus:ring-indigo-500 transition-colors ${
                            theme === "light"
                              ? "bg-white border-slate-300 text-slate-800"
                              : "bg-slate-950 border-slate-700 text-slate-200"
                          }`}
                        />
                      </div>

                      {/* Qwen API Key */}
                      <div className="flex flex-col gap-1 text-left">
                        <label
                          className={`text-[10px] font-medium ${
                            theme === "light"
                              ? "text-slate-600"
                              : "text-slate-300"
                          }`}
                        >
                          Qwen API Key (DASHSCOPE_API_KEY)
                        </label>
                        <div className="relative">
                          <input
                            type={showQianwenKey ? "text" : "password"}
                            value={config.qianwenApiKey || ""}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                qianwenApiKey: e.target.value,
                              })
                            }
                            placeholder="sk-..."
                            className={`w-full pl-2.5 pr-8 py-1.5 border rounded-lg text-[11px] font-mono outline-none focus:ring-1 focus:ring-indigo-500 transition-colors ${
                              theme === "light"
                                ? "bg-white border-slate-300 text-slate-800"
                                : "bg-slate-950 border-slate-700 text-slate-200"
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowQianwenKey(!showQianwenKey)}
                            className={`absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-md transition-colors ${
                              theme === "light"
                                ? "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                            }`}
                            title={showQianwenKey ? "隐藏" : "显示"}
                          >
                            {showQianwenKey ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* ================= MAIN INTERACTION CONTAINER ================= */}
      <main className="flex-1 flex flex-col min-h-0 relative">
        {isApi2Mode ? (
          /* ==================== SCREEN 1.5: API 2 ==================== */
          <div className="flex-1 w-full h-full relative overflow-y-auto bg-slate-950">
            <NetworkDebugApp apiKey={config.apiKey} onApiKeyChange={(key) => setConfig({ ...config, apiKey: key })} />
          </div>
        ) : isDiagnosticsMode ? (
          /* ==================== SCREEN 1: EXPERT SYSTEM DIAGNOSTICS ==================== */
          <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
            {/* Left Parameters form */}
            <section className="lg:col-span-4 space-y-6">
              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xs relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.2 h-full bg-indigo-500" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
                  <Database className="w-4 h-4 text-slate-500" />
                  API 接口配置
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      接口基地址 (API Base URL)
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                        <Link2 className="w-3.5 h-3.5" />
                      </span>
                      <input
                        type="text"
                        value={config.baseUrl}
                        onChange={(e) =>
                          setConfig({ ...config, baseUrl: e.target.value })
                        }
                        className="w-full pl-9 pr-3 py-2 border border-slate-800 rounded-lg text-xs bg-slate-950 focus:bg-slate-950 focus:ring-1 focus:ring-indigo-500 text-slate-200 font-mono outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center justify-between">
                      <span>授权凭证秘钥 (API Key)</span>
                      <span className="text-[9px] text-emerald-500 font-medium flex items-center gap-0.5">
                        <Lock className="w-2.5 h-2.5" /> 已保护
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type={showKey ? "text" : "password"}
                        value={config.apiKey}
                        onChange={(e) =>
                          setConfig({ ...config, apiKey: e.target.value })
                        }
                        className="w-full pl-3 pr-10 py-2 border border-slate-800 rounded-lg text-xs bg-slate-950 focus:bg-slate-950 focus:ring-1 focus:ring-indigo-500 text-slate-200 font-mono outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300"
                      >
                        {showKey ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                      <span>接口请求模式 (Request Mode)</span>
                      <span className="text-[10px] text-indigo-400 font-bold font-mono">
                        {config.requestMode === "client"
                          ? "🖥️ 浏览器直连"
                          : "🌐 服务器代理"}
                      </span>
                    </label>
                    <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-lg border border-slate-850">
                      <button
                        type="button"
                        onClick={() =>
                          setConfig({ ...config, requestMode: "client" })
                        }
                        className={`py-1.5 rounded-md px-2 text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                          config.requestMode === "client"
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <Laptop className="w-3.5 h-3.5" />
                        浏览器直连
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfig({ ...config, requestMode: "server" })
                        }
                        className={`py-1.5 rounded-md px-2 text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                          config.requestMode === "server"
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <Globe className="w-3.5 h-3.5" />
                        服务器代理
                      </button>
                    </div>
                    <p className="mt-1.5 text-[10px] text-slate-500 leading-relaxed">
                      💡 <b>直连模式（推荐）：</b>{" "}
                      绕过谷歌云端容器代理，由本地浏览器向接口直接发起请求，适合打通受
                      GCP 网限、出口节点限制的 API 通路；若直连因 CORS
                      原因请求失败，则可中转代理请求。
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={fetchModels}
                      disabled={isFetchingModels}
                      className="w-full py-2 bg-slate-800 hover:bg-slate-755 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isFetchingModels ? "animate-spin" : ""}`}
                      />
                      {isFetchingModels
                        ? "更新目录中..."
                        : "立刻同步支持模型名录"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Advanced Playground Hyperparameters */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xs">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  非生图单聊辅助参数
                </h2>

                <div className="space-y-4 text-xs">
                  <div>
                    <div className="flex justify-between font-semibold text-slate-400 mb-1">
                      <span>Temperature (多样性控制)</span>
                      <span className="font-mono text-indigo-400 font-bold">
                        {temperature}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="1.5"
                      step="0.1"
                      value={temperature}
                      onChange={(e) =>
                        setTemperature(parseFloat(e.target.value))
                      }
                      className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between font-semibold text-slate-400 mb-1">
                      <span>Max Tokens (最大词元)</span>
                      <span className="font-mono text-indigo-400 font-bold">
                        {maxTokens}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="4000"
                      step="50"
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                      className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">
                      System context prompt (系统提示词)
                    </label>
                    <textarea
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      rows={2}
                      className="w-full px-2.5 py-1.5 border border-slate-800 rounded-lg bg-slate-950 focus:bg-slate-950 text-slate-300 outline-none focus:border-slate-700"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Right Interactive Diagnostic tabs */}
            <section className="lg:col-span-8 flex flex-col space-y-6">
              <div className="bg-slate-900 p-1.5 rounded-xl border border-slate-800 flex gap-2 shadow-xs">
                {["diagnostics", "playground", "models"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab as any)}
                    className={`flex-1 py-1.5 text-center rounded-lg font-semibold text-xs transition-all flex items-center justify-center gap-1.5 capitalize cursor-pointer ${
                      activeTab === tab
                        ? "bg-indigo-650 text-white shadow-md"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-850"
                    }`}
                  >
                    {tab === "diagnostics" && (
                      <Activity className="w-3.5 h-3.5" />
                    )}
                    {tab === "playground" && (
                      <Terminal className="w-3.5 h-3.5" />
                    )}
                    {tab === "models" && <Layers className="w-3.5 h-3.5" />}
                    {tab === "diagnostics"
                      ? "自动化接口诊断"
                      : tab === "playground"
                        ? "纯文本聊天测试"
                        : "所有内置模型名录"}
                  </button>
                ))}
              </div>

              {/* Subtab content: diagnostics */}
              {activeTab === "diagnostics" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xs flex items-start gap-4">
                      <div
                        className={`p-2.5 rounded-xl flex-shrink-0 ${diagnostics?.pingOk ? "bg-emerald-900/30 text-emerald-400" : "bg-slate-800 text-slate-600"}`}
                      >
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          握手连通性
                        </p>
                        <p className="text-md font-bold text-slate-200">
                          {diagnostics
                            ? diagnostics.pingOk
                              ? "握手联通成功"
                              : "握手失败或拒绝连接"
                            : "待检测"}
                        </p>
                        <p className="text-xs text-slate-400">
                          网络回应开销:{" "}
                          <span className="font-mono text-indigo-400 font-semibold">
                            {diagnostics?.pingLatency || "--"} ms
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xs flex items-start gap-4">
                      <div
                        className={`p-2.5 rounded-xl flex-shrink-0 ${diagnostics && diagnostics.modelsCount > 0 ? "bg-indigo-900/30 text-indigo-400" : "bg-slate-800 text-slate-600"}`}
                      >
                        <Layers className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          同步可用模型
                        </p>
                        <p className="text-md font-bold text-slate-200">
                          {diagnostics
                            ? `${diagnostics.modelsCount} 个可用模型`
                            : "未校验"}
                        </p>
                        <p className="text-xs text-slate-400">
                          Claims 凭据提取成功
                        </p>
                      </div>
                    </div>

                    {/* Completion benchmark */}
                    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xs md:col-span-2 flex items-start gap-4">
                      <div
                        className={`p-3 rounded-xl flex-shrink-0 ${diagnostics?.completionOk ? "bg-teal-900/30 text-teal-400" : "bg-slate-800 text-slate-600"}`}
                      >
                        <Sparkles className="w-6 h-6" />
                      </div>
                      <div className="flex-1 space-y-1 min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          文本跑分耗时基准
                        </p>
                        <p className="text-md font-bold text-slate-200">
                          {diagnostics
                            ? diagnostics.completionOk
                              ? "文本生成成功"
                              : "耗时检验失败"
                            : "等待命令运行"}
                        </p>
                        {diagnostics?.completionOk && (
                          <div className="bg-slate-950 border border-slate-850 rounded-lg p-2.5 mt-2">
                            <p className="text-xs text-slate-500 font-semibold mb-1">
                              解码字符:
                            </p>
                            <p className="font-mono text-xs text-emerald-400 break-all">
                              "{diagnostics.completionContent}"
                            </p>
                          </div>
                        )}
                        {diagnostics?.error && (
                          <div className="bg-red-950/20 border border-red-900/50 rounded-lg p-2.5 mt-2 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <span className="text-xs text-red-400 font-bold">
                                异常堆栈日志:
                              </span>
                              <p className="text-xs text-slate-300 font-mono break-all mt-1">
                                {diagnostics.error}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-md">
                    <div className="bg-slate-850 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                      <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 bg-red-500 rounded-full inline-block" />
                        <span className="w-2.5 h-2.5 bg-yellow-500 rounded-full inline-block" />
                        <span className="w-2.5 h-2.5 bg-green-500 rounded-full inline-block" />
                        实时接口诊断总览流数据
                      </span>
                      <button
                        onClick={() => runFullDiagnostics()}
                        className="px-3.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                      >
                        {diagnosticStatus === "running" ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            诊断运行中...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3 h-3" />
                            立刻执行自测
                          </>
                        )}
                      </button>
                    </div>
                    <div className="p-4 font-mono text-[11px] leading-relaxed text-indigo-300 h-64 overflow-y-auto space-y-1 bg-slate-950 scrollbar-thin">
                      {diagnosticLogs.length === 0 ? (
                        <div className="text-slate-500 h-full flex items-center justify-center flex-col gap-2">
                          <Terminal className="w-6 h-6 text-slate-850" />
                          <span>
                            控制台目前无流数据输出。请点击右上角开展校验。
                          </span>
                        </div>
                      ) : (
                        diagnosticLogs.map((log, idx) => (
                          <p key={idx} className="break-all">
                            {log}
                          </p>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Subtab content: chat playground */}
              {activeTab === "playground" && (
                <div className="bg-slate-900 rounded-2xl border border-slate-800 flex flex-col h-[520px] shadow-xs overflow-hidden animate-fadeIn">
                  <div className="bg-slate-850 px-4 py-3 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300">
                    <div className="flex items-center gap-2">
                      <span>文本验证机型:</span>
                      <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="pl-2 pr-6 py-1 bg-slate-950 border border-slate-850 rounded font-mono text-xs text-indigo-300 focus:outline-none"
                      >
                        {modelsList.length > 0 ? (
                          modelsList.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.id}
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="gpt-4o-mini">gpt-4o-mini</option>
                            <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                          </>
                        )}
                      </select>
                    </div>
                    <span>消息数: {messages.length}</span>
                  </div>

                  <div className="flex-grow p-4 overflow-y-auto space-y-4 bg-slate-950 scrollbar-thin">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-xl p-3 text-xs ${msg.role === "user" ? "bg-indigo-600 text-white" : "bg-slate-900 text-slate-300 border border-slate-800"}`}
                        >
                          <div className="text-[10px] text-slate-500 mb-1">
                            {msg.role === "user" ? "用户提问" : "代理应答"} •{" "}
                            {msg.timestamp}
                          </div>
                          <p className="font-mono whitespace-pre-wrap">
                            {msg.content}
                          </p>
                          {msg.latency && (
                            <p className="text-[9px] text-indigo-400 mt-2 font-mono">
                              耗时: {msg.latency}ms
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendChatMessage();
                    }}
                    className="p-3 bg-slate-900 border-t border-slate-800 flex gap-2"
                  >
                    <input
                      type="text"
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      placeholder="发送任意指令开始测试底座并发与速率..."
                      className="flex-1 px-3 py-2 bg-slate-950 border border-slate-850 focus:border-slate-700 outline-none rounded text-xs text-slate-200"
                    />
                    <button
                      type="submit"
                      disabled={isGenerating}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-505 text-white font-bold rounded text-xs flex items-center gap-1 cursor-pointer"
                    >
                      {isGenerating ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Send className="w-3 h-3" />
                      )}
                      测试发送
                    </button>
                  </form>
                </div>
              )}

              {/* Subtab content: models list */}
              {activeTab === "models" && (
                <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between border-b border-slate-850 pb-3">
                    <div>
                      <h4 className="text-xs font-bold font-mono text-slate-300">
                        服务端所探测授权的所有机型
                      </h4>
                      <p className="text-[10px] text-slate-500 font-mono">
                        从 api_key 鉴权令牌中成功读取到的拥有的所有可用模型
                      </p>
                    </div>
                    <input
                      type="text"
                      placeholder="过滤关键字..."
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      className="px-2.5 py-1 text-[11px] bg-slate-950 border border-slate-850 rounded text-slate-300 focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono max-h-96 overflow-y-auto scrollbar-thin">
                    {modelsList.length === 0 ? (
                      <p className="text-slate-500 py-4 italic col-span-2 text-center text-xs">
                        暂无同步数据，可先点击右上角“立刻执行自测”抓取最新底座
                      </p>
                    ) : (
                      modelsList
                        .filter((m) =>
                          m.id
                            .toLowerCase()
                            .includes(modelSearch.toLowerCase()),
                        )
                        .map((m) => (
                          <div
                            key={m.id}
                            className="p-3 border border-slate-800 bg-slate-950 rounded flex flex-col justify-between hover:border-slate-700"
                          >
                            <span className="font-bold text-indigo-300 truncate">
                              {m.id}
                            </span>
                            <span className="text-[10px] text-slate-500 mt-2">
                              服务商: {m.owned_by}
                            </span>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : (
          /* ==================== SCREEN 2: BREATHTAKING SCHEME A (Kstyle Kanban Parallel Tracks) ==================== */
          <div className="flex-1 flex flex-row min-h-0 relative w-full">
            <AnimatePresence>
              {!isViewportShowing && (
                <motion.div
                  key="loading-transition-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className={`absolute inset-0 z-[100] flex flex-col items-center justify-center backdrop-blur-md p-8 font-mono text-xs gap-4 ${
                    theme === "light"
                      ? "bg-white/70 text-slate-800"
                      : "bg-slate-950/70 text-slate-100"
                  }`}
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.2,
                      ease: "linear",
                    }}
                  >
                    <RefreshCw className="w-5 h-5 text-indigo-500" />
                  </motion.div>
                  <div className="flex flex-col items-center gap-1.5 text-center">
                    <span
                      className={`font-semibold tracking-wide ${theme === "light" ? "text-slate-700" : "text-slate-300"}`}
                    >
                      {isActualLoading
                        ? "正在切换项目阵图..."
                        : "正在重构并对齐画布..."}
                    </span>
                    <span className="text-[10px] text-slate-400 opacity-80">
                      {isActualLoading
                        ? "正在重构并载入 IndexedDB 海量缓存底座..."
                        : "对齐滚动中..."}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <GlobalReferencePanel
              theme={theme}
              images={globalReferenceImages}
              onImagesChange={setGlobalReferenceImages}
              onSaveToTopStaging={(base64) => {
                setStagedReferenceImages((prev) => [
                  ...prev,
                  { id: crypto.randomUUID(), url: base64 }
                ]);
              }}
              projectId={activeProjectId}
              isViewportShowing={isViewportShowing}
            />
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden pr-6 pt-4 pb-2 justify-center relative">
            <AnimatePresence>
              {indicators.length > 0 && (
                <div className="fixed inset-0 z-[120] pointer-events-none">
                  <AnimatePresence>
                    {indicators.map((ind) => (
                      <motion.div
                        key={ind.id}
                        initial={{
                          opacity: 0,
                          scale: 0.5,
                          left: ind.x,
                          top: ind.y,
                        }}
                        animate={{
                          opacity: 1,
                          scale: 1,
                          left: ind.x,
                          top: ind.y,
                        }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{
                          type: "spring",
                          stiffness: 200,
                          damping: 25,
                        }}
                        onClick={() => handleScrollToGenId(ind.id)}
                        className="absolute pointer-events-auto -ml-3.5 -mt-3.5 w-7 h-7 drop-shadow-md cursor-pointer"
                      >
                        {ind.status === "generating" && (
                          <div
                            className="absolute -inset-1.5 bg-indigo-500 animate-ping opacity-30"
                            style={{
                              animationDuration: "2s",
                              clipPath: "url(#squircle-clip)",
                            }}
                          ></div>
                        )}
                        <div
                          className={`relative w-full h-full flex items-center justify-center backdrop-blur-sm transition-colors z-10 ${
                            ind.status === "generating"
                              ? theme === "light"
                                ? "bg-indigo-600 text-white shadow-md"
                                : "bg-indigo-600/90 hover:bg-indigo-500 text-white"
                              : ind.status === "success"
                                ? "bg-emerald-600/90 hover:bg-emerald-500 text-white"
                                : "bg-rose-600/90 hover:bg-rose-500 text-white"
                          }`}
                          style={{ clipPath: "url(#squircle-clip)" }}
                        >
                          {ind.status === "generating" && (
                            <RefreshCw
                              className={`w-4 h-4 animate-spin ${theme === "light" ? "text-white" : ""}`}
                            />
                          )}
                          {ind.status === "success" && (
                            <Check
                              className={`w-4 h-4 ${theme === "light" ? "text-white" : ""}`}
                            />
                          )}
                          {ind.status === "error" && (
                            <X
                              className={`w-4 h-4 ${theme === "light" ? "text-white" : ""}`}
                            />
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </AnimatePresence>

            {/* Horizontal Track Board Wrapper */}
            <div
              id="tracks-scroll-viewport"
              className={`flex-1 flex items-stretch overflow-x-auto pb-4 scroll-smooth scrollbar-thin min-h-0 ${isViewportShowing ? "" : "pointer-events-none"}`}
            >
              <div className="flex-shrink-0 min-w-full flex justify-start items-stretch h-full min-h-0">
                {/* Provide huge padding space so ANY item can be scrolled precisely to the center of viewport */}
                <div className="flex-shrink-0 pointer-events-none w-[50vw]" />

                {/* Extra add visual placeholder column block at the left end */}
                <div 
                  className="flex-shrink-0 flex items-stretch gap-4 md:gap-6 h-full min-h-0 transform-origin-left"
                  style={{ zoom: workspaceZoomLevel === 100 ? undefined : `${workspaceZoomLevel}%` }}
                >
                  <motion.div
                    onClick={() => addNewTrack("left")}
                    initial={{ opacity: 0 }}
                    animate={
                      isViewportShowing
                        ? { opacity: 1 }
                        : { opacity: 0 }
                    }
                    transition={{
                      duration: 0.2,
                      ease: "easeOut",
                    }}
                    className="w-[88vw] md:w-[460px] max-w-[460px] min-w-[325px] h-full min-h-0 flex-shrink-0 flex flex-col items-center justify-center bg-transparent border border-dashed border-slate-800/15 hover:border-indigo-500/20 hover:bg-slate-950/10 rounded-2xl transition-all duration-300 cursor-pointer group select-none relative"
                  >
                    <div className="flex flex-col items-center justify-center opacity-10 group-hover:opacity-75 transition-opacity duration-300">
                      <Plus className="w-8 h-8 text-slate-400" />
                      <div className="space-y-1 text-center mt-3 scale-95">
                        <p className="text-xs font-bold text-slate-400 tracking-wider">
                          新建生图创意列
                        </p>
                        <p className="text-[10px] text-slate-500 max-w-[180px] mx-auto leading-relaxed">
                          测试另一个并行方向
                        </p>
                      </div>
                    </div>
                  </motion.div>

                  <AnimatePresence key={activeProjectId}>
                    {workspaces.map((ws, trIdx) => (
                      <React.Fragment key={`${activeProjectId}-${ws.id}-wrap`}>
                        {/* Insert Button Between Columns */}
                        {trIdx > 0 && (
                          <div className="w-0 z-[60] flex items-start justify-center flex-shrink-0 -mx-2 md:-mx-3 group">
                            <div
                              onClick={() => insertTrackAt(trIdx)}
                              className="w-8 h-[80px] flex items-start justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                              title="在两列之间插入新创意列"
                            >
                              <div className="bg-slate-800 border border-t-[0] border-slate-700 text-slate-300 w-6 h-6 rounded-b-lg flex justify-center items-center hover:bg-indigo-500 hover:text-white shadow-lg transition-all hover:scale-110">
                                <Plus className="w-4 h-4" />
                              </div>
                            </div>
                          </div>
                        )}
                        <VirtualTrackColumn
                          key={`${activeProjectId}-${ws.id}`}
                          ws={ws}
                          trIdx={trIdx}
                          theme={theme}
                          isViewportShowing={isViewportShowing}
                          activeProjectId={activeProjectId}
                          draggedTrackId={draggedTrackId}
                          setDraggedTrackId={setDraggedTrackId}
                          focusedTrackId={focusedTrackId}
                          setFocusedTrackId={setFocusedTrackId}
                          setDraggableId={setDraggableId}
                          renamingId={renamingId}
                          setRenamingId={setRenamingId}
                          renameValue={renameValue}
                          setRenameValue={setRenameValue}
                          triggerRenameMode={triggerRenameMode}
                          saveRenameAction={saveRenameAction}
                          updateTrackField={updateTrackField}
                          deleteTrack={deleteTrack}
                          confirmDeleteTrack={confirmDeleteTrack}
                          deleteConfirmTrackId={deleteConfirmTrackId}
                          setDeleteConfirmTrackId={setDeleteConfirmTrackId}
                          clearConfirmTrackId={clearConfirmTrackId}
                          setClearConfirmTrackId={setClearConfirmTrackId}
                          handleClearTrackConfig={handleClearTrackConfig}
                          pasteConfirmTrackId={pasteConfirmTrackId}
                          setPasteConfirmTrackId={setPasteConfirmTrackId}
                          handlePasteConfig={handlePasteConfig}
                          justCopiedColId={justCopiedColId}
                          justPastedColId={justPastedColId}
                          handleCopyConfig={handleCopyConfig}
                          handleCopyGenConfig={handleCopyGenConfig}
                          justCopiedCardGenId={justCopiedCardGenId}
                          copiedConfig={copiedConfig}
                          restoreConfirm={restoreConfirm}
                          setRestoreConfirm={setRestoreConfirm}
                          restoreRollbackParams={restoreRollbackParams}
                          handleTrackDropFile={handleTrackDropFile}
                          uploadFilesToTrack={uploadFilesToTrack}
                          removeRefImage={removeRefImage}
                          trackUrlOpen={trackUrlOpen}
                          setTrackUrlOpen={setTrackUrlOpen}
                          trackUrlInput={trackUrlInput}
                          setTrackUrlInput={setTrackUrlInput}
                          addUrlReferenceToTrack={addUrlReferenceToTrack}
                          hoveredPreviewRefImg={hoveredPreviewRefImg}
                          setHoveredPreviewRefImg={setHoveredPreviewRefImg}
                          holdingEnterTrackId={holdingEnterTrackId}
                          setHoldingEnterTrackId={setHoldingEnterTrackId}
                          enterHoldProgress={enterHoldProgress}
                          setEnterHoldProgress={setEnterHoldProgress}
                          runTrackGeneration={runTrackGeneration}
                          setWorkspaces={setWorkspaces}
                          columnVariants={columnVariants}
                          trackFilters={trackFilters}
                          setTrackFilters={setTrackFilters}
                          setCompareMode={setCompareMode}
                          compareMode={compareMode}
                          setLightboxImage={setLightboxImage}
                          lightboxImage={lightboxImage}
                          toggleStarGeneration={toggleStarGeneration}
                          handleDownloadImage={handleDownloadImage}
                          handleCopyImageToClipboard={
                            handleCopyImageToClipboard
                          }
                          deleteConfirmGen={deleteConfirmGen}
                          setDeleteConfirmGen={setDeleteConfirmGen}
                          dragOverImageId={dragOverImageId}
                          setDragOverImageId={setDragOverImageId}
                          draggedImageItem={draggedImageItem}
                          setDraggedImageItem={setDraggedImageItem}
                          hoveredImageItemRef={hoveredImageItemRef}
                          draggedImageItemRef={draggedImageItemRef}
                          dragLeaveTimerRef={dragLeaveTimerRef}
                          handleCopyPromptToClipboard={
                            handleCopyPromptToClipboard
                          }
                          hoveredGenRef={hoveredGenRef}
                          setHoveredGenRef={setHoveredGenRef}
                          setToast={setToast}
                        />
                      </React.Fragment>
                    ))}
                  </AnimatePresence>

                  {/* Extra add visual placeholder column block at the right end */}
                  <motion.div
                    onClick={() => addNewTrack("right")}
                    initial={{ opacity: 0 }}
                    animate={
                      isViewportShowing
                        ? { opacity: 1 }
                        : { opacity: 0 }
                    }
                    transition={{
                      duration: 0.2,
                      ease: "easeOut",
                    }}
                    className="w-[88vw] md:w-[460px] max-w-[460px] min-w-[325px] h-full min-h-0 flex-shrink-0 flex flex-col items-center justify-center bg-transparent border border-dashed border-slate-800/15 hover:border-indigo-500/20 hover:bg-slate-950/10 rounded-2xl transition-all duration-300 cursor-pointer group select-none relative"
                  >
                    <div className="flex flex-col items-center justify-center opacity-10 group-hover:opacity-75 transition-opacity duration-300">
                      <Plus className="w-8 h-8 text-slate-400" />
                      <div className="space-y-1 text-center mt-3 scale-95">
                        <p className="text-xs font-bold text-slate-400 tracking-wider">
                          新建生图创意列
                        </p>
                        <p className="text-[10px] text-slate-500 max-w-[180px] mx-auto leading-relaxed">
                          测试另一个并行方向
                        </p>
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* Right padding to allow the very last column to reach screen center */}
                <div className="flex-shrink-0 pointer-events-none w-[50vw]" />
              </div>
            </div>
          </div>
          </div>
        )}
      </main>

      {/* ================= LIGHTBOX IMAGE VIEW DIALOG PORTAL ================= */}
      <AnimatePresence>
        {lightboxImage && !compareMode && (
          <ImageLightbox
            url={lightboxImage.url}
            prompt={lightboxImage.prompt}
            trackId={lightboxImage.trackId}
            genId={lightboxImage.gen?.id}
            imgIndex={lightboxImage.imgIndex}
            onClose={() => {
              closeLightboxAndScroll();
              setIsSpacebarOverviewActive(false);
              setPanoramaCompareSourceImage(null);
            }}
            onDownload={(url, prompt) =>
              handleDownloadImage(
                url,
                prompt,
                lightboxImage.trackId,
                lightboxImage.gen?.id,
              )
            }
            onCopy={(text, id) => handleCopy(text, id)}
            copiedText={copiedText}
            onCopyConfig={() => {
              if (lightboxImage.gen) {
                handleCopyGenConfig(lightboxImage.gen, "该画作");
              } else {
                navigator.clipboard.writeText(lightboxImage.prompt);
                setToast("已复制提示词");
              }
            }}
            isStarred={lightboxImage.gen?.isStarred}
            onToggleStar={() => {
              if (lightboxImage.gen && (lightboxImage as any).trackId) {
                toggleStarGeneration(
                  (lightboxImage as any).trackId,
                  lightboxImage.gen.id,
                );
              }
            }}
            onNavigate={handleLightboxNavigate}
            workspaces={workspaces}
            trackFilters={trackFilters}
            onSelectImage={(
              targetUrl,
              targetPrompt,
              targetGen,
              targetTrackId,
            ) => {
              if (panoramaCompareSourceImage) {
                setCompareMode({
                  imageA: panoramaCompareSourceImage,
                  imageB: {
                    url: targetUrl,
                    prompt: targetPrompt,
                    gen: targetGen,
                    trackId: targetTrackId,
                    imgIndex: targetGen?.result?.data?.findIndex(
                      (d: any) => d.url === targetUrl,
                    ),
                  },
                });
                setPanoramaCompareSourceImage(null);
                setIsSpacebarOverviewActive(false);
                setLightboxImage(null);
              } else {
                isSelectionPendingRef.current = true;
                setLightboxImage({
                  url: targetUrl,
                  prompt: targetPrompt,
                  gen: targetGen,
                  trackId: targetTrackId,
                  imgIndex: targetGen?.result?.data?.findIndex(
                    (d: any) => d.url === targetUrl,
                  ),
                });
              }
            }}
            isSpacebarOverviewMode={isSpacebarOverviewActive}
            panoramaCompareSourceImage={panoramaCompareSourceImage}
            theme={theme}
            onPanoramaScrollStateChange={(isScrolling) => {
              if (isScrolling) {
                activePanoramaScrollCountRef.current = 1;
                setIsPanoramaScrolling(true);
              } else {
                activePanoramaScrollCountRef.current = 0;
                isSelectionPendingRef.current = false;
                setIsPanoramaScrolling(false);
                if (pendingSpacebarExitRef.current) {
                  pendingSpacebarExitRef.current = false;
                  setPendingSpacebarExit(false);
                  setIsSpacebarOverviewActive(false);
                  setPanoramaCompareSourceImage(null);
                  closeLightboxAndScroll();
                }
              }
            }}
          />
        )}

        {compareMode && (
          <ImageCompareLightbox
            imageA={compareMode.imageA as any}
            imageB={compareMode.imageB as any}
            onClose={() => setCompareMode(null)}
            onDownload={(url, prompt, trackId, genId) =>
              handleDownloadImage(url, prompt, trackId, genId)
            }
            onCopy={(text, id) => handleCopy(text, id)}
            copiedText={copiedText}
            onCopyConfig={(gen) => {
              handleCopyGenConfig(gen, "该画作");
            }}
            onToggleStar={(trackId, genId) => {
              toggleStarGeneration(trackId, genId);
            }}
            theme={theme}
          />
        )}
      </AnimatePresence>

      {/* Custom Alert Message Modal */}
      <AnimatePresence>
        {alertMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-400">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">温馨提示</h3>
                  <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                    {alertMessage}
                  </p>
                </div>
                <div className="w-full pt-2">
                  <button
                    onClick={() => setAlertMessage(null)}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                  >
                    我知道了
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isGlobalFilterViewOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 bg-slate-950 text-slate-200 overflow-hidden font-mono flex flex-col"
          >
            {/* Header */}
            <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50 px-6 py-3.5 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <div
                  className="bg-indigo-600 w-9 h-9 text-indigo-100 flex items-center justify-center flex-shrink-0 shadow-sm"
                  style={{ clipPath: "url(#squircle-clip)" }}
                >
                  <Library className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  资产收纳箱
                </h2>
              </div>

              <div className="flex items-center justify-center absolute md:static left-1/2 -translate-x-1/2 md:translate-x-0">
                <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 p-1 rounded-lg">
                  <button
                    onClick={() => setGlobalFilterMode("starred")}
                    className={`px-4 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 ${
                      globalFilterMode === "starred"
                        ? "bg-slate-800 text-yellow-500"
                        : "text-slate-500 hover:text-yellow-500/80 hover:bg-slate-800/30"
                    }`}
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${globalFilterMode === "starred" ? "fill-yellow-500" : ""}`}
                    />
                    已备选
                  </button>
                  <button
                    onClick={() => setGlobalFilterMode("downloaded")}
                    className={`px-4 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 ${
                      globalFilterMode === "downloaded"
                        ? "bg-slate-800 text-emerald-400"
                        : "text-slate-500 hover:text-emerald-400/80 hover:bg-slate-800/30"
                    }`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    已下载
                  </button>
                </div>
              </div>

              <div className="flex items-center">
                <button
                  onClick={() => setIsGlobalFilterViewOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </header>

            {/* Grid content */}
            <div className="flex-1 overflow-y-auto p-6 scrollbar-custom bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900/40 via-slate-950 to-slate-950">
              <div className="max-w-[2560px] mx-auto h-full">
                {(() => {
                  const items: {
                    gen: GenerationItem;
                    trackId: string;
                    url: string;
                    thumbnail_url?: string;
                    thumbnail_url_1k?: string;
                    imgIndex: number;
                  }[] = [];
                  workspaces.forEach((ws) => {
                    const gens = ws.generations || [];
                    gens.forEach((g) => {
                      if (g.status === "success" && g.result?.data) {
                        if (globalFilterMode === "starred" && g.isStarred) {
                          g.result.data.forEach((img: any, imgIdx: number) => {
                            if (img.url || img.b64_json) {
                              items.push({
                                gen: g,
                                trackId: ws.id,
                                url:
                                  img.url ||
                                  `data:image/png;base64,${img.b64_json}`,
                                thumbnail_url: img.thumbnail_url,
                                thumbnail_url_1k: img.thumbnail_url_1k,
                                imgIndex: imgIdx,
                              });
                            }
                          });
                        } else if (
                          globalFilterMode === "downloaded" &&
                          g.downloadedUrls &&
                          g.downloadedUrls.length > 0
                        ) {
                          g.downloadedUrls.forEach((url) => {
                            const foundIdx = g.result?.data?.findIndex(
                              (d: any) => d.url === url,
                            );
                            const imgIdx =
                              foundIdx !== -1 && foundIdx !== undefined
                                ? foundIdx
                                : 0;
                            const matchImg =
                              foundIdx !== -1 && foundIdx !== undefined
                                ? g.result.data[foundIdx]
                                : null;
                            items.push({
                              gen: g,
                              trackId: ws.id,
                              url,
                              thumbnail_url: matchImg?.thumbnail_url,
                              thumbnail_url_1k: matchImg?.thumbnail_url_1k,
                              imgIndex: imgIdx,
                            });
                          });
                        }
                      }
                    });
                  });

                  if (items.length === 0) {
                    return (
                      <div className="h-full flex flex-col items-center justify-center text-center space-y-6 max-w-md mx-auto min-h-[500px]">
                        <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center border border-slate-800">
                          {globalFilterMode === "starred" ? (
                            <Star className="w-10 h-10 text-yellow-600/30" />
                          ) : (
                            <Download className="w-10 h-10 text-emerald-600/30" />
                          )}
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-slate-200 font-bold text-xl tracking-wide">
                            暂无
                            {globalFilterMode === "starred" ? "备选" : "下载"}
                            的画作
                          </h3>
                          <p className="text-sm text-slate-500 leading-relaxed max-w-[280px] mx-auto">
                            {globalFilterMode === "starred"
                              ? "浏览你的创作流，点击满意的画作右上角的星号，即可将其收藏至此处的选片台统一对比。"
                              : "你下载过的高清原图会在这里留存快捷访问入口，方便回顾。"}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 gap-3 space-y-3">
                      {items.map((item, idx) => (
                        <div
                          key={`${item.gen.id}-${idx}`}
                          className="relative break-inside-avoid group cursor-pointer overflow-hidden bg-slate-900"
                          data-lightbox-wrapper={item.url}
                          data-track-id={item.trackId}
                          data-gen-id={item.gen.id}
                          data-img-index={item.imgIndex}
                          onClick={() => {
                            setLightboxImage({
                              url: item.url,
                              prompt: item.gen.prompt,
                              gen: item.gen,
                              trackId: item.trackId,
                              imgIndex: item.imgIndex,
                            });
                          }}
                          onMouseEnter={() => {
                            hoveredImageItemRef.current = {
                              url: item.url,
                              prompt: item.gen.prompt,
                              gen: item.gen,
                              trackId: item.trackId,
                              imgIndex: item.imgIndex,
                            };
                          }}
                          onMouseLeave={() => {
                            hoveredImageItemRef.current = null;
                          }}
                          draggable={true}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("image-url", item.url);
                            e.dataTransfer.setData("text/plain", item.url);
                            setCustomDragImage(e, item.url, item.thumbnail_url);
                            const itemData = {
                              url: item.url,
                              prompt: item.gen.prompt,
                              gen: item.gen,
                              trackId: item.trackId,
                              imgIndex: item.gen?.result?.data?.findIndex(
                                (d: any) => d.url === item.url,
                              ),
                            };
                            setDraggedImageItem(itemData);
                            draggedImageItemRef.current = itemData;
                          }}
                          onDragEnd={() => {
                            setDraggedImageItem(null);
                            draggedImageItemRef.current = null;
                            setDragOverImageId(null);
                          }}
                          onDragEnter={(e) => {
                            const draggedItem = draggedImageItemRef.current;
                            if (draggedItem && draggedItem.url !== item.url) {
                              e.preventDefault();
                              if (dragLeaveTimerRef.current) {
                                clearTimeout(dragLeaveTimerRef.current);
                                dragLeaveTimerRef.current = null;
                              }
                              setDragOverImageId(
                                `global-${item.gen.id}-${idx}`,
                              );
                            }
                          }}
                          onDragOver={(e) => {
                            const draggedItem = draggedImageItemRef.current;
                            if (draggedItem && draggedItem.url !== item.url) {
                              e.preventDefault();
                              if (dragLeaveTimerRef.current) {
                                clearTimeout(dragLeaveTimerRef.current);
                                dragLeaveTimerRef.current = null;
                              }
                              if (
                                dragOverImageId !==
                                `global-${item.gen.id}-${idx}`
                              ) {
                                setDragOverImageId(
                                  `global-${item.gen.id}-${idx}`,
                                );
                              }
                            }
                          }}
                          onDragLeave={() => {
                            if (dragLeaveTimerRef.current)
                              clearTimeout(dragLeaveTimerRef.current);
                            dragLeaveTimerRef.current = setTimeout(
                              () => setDragOverImageId(null),
                              50,
                            );
                          }}
                          onDrop={(e) => {
                            const draggedItem = draggedImageItemRef.current;
                            if (draggedItem && draggedItem.url !== item.url) {
                              e.preventDefault();

                              const imageA = draggedItem;
                              const imageB = {
                                url: item.url,
                                prompt: item.gen.prompt,
                                gen: item.gen,
                                trackId: item.trackId,
                                imgIndex: item.gen?.result?.data?.findIndex(
                                  (d: any) => d.url === item.url,
                                ),
                              };

                              if (dragLeaveTimerRef.current) {
                                clearTimeout(dragLeaveTimerRef.current);
                                dragLeaveTimerRef.current = null;
                              }

                              setDragOverImageId(null);
                              setDraggedImageItem(null);
                              hoveredImageItemRef.current = imageB;

                              setCompareMode({ imageA, imageB });
                            }
                          }}
                        >
                          <SmartImage
                            src={
                              item.thumbnail_url ||
                              item.thumbnail_url_1k ||
                              item.url
                            }
                            alt={`Gen ${idx}`}
                            data-track-id={item.trackId}
                            data-gen-id={item.gen.id}
                            data-img-index={item.gen?.result?.data?.findIndex(
                              (d: any) => d.url === item.url,
                            )}
                            referrerPolicy="no-referrer"
                            draggable={false}
                            className={`lightbox-thumb w-full h-auto block transform transition-transform duration-[400ms] ease-out ${dragOverImageId === `global-${item.gen.id}-${idx}` ? "scale-105" : "group-hover:scale-105"}`}
                            data-lightbox-src={item.url}
                          />

                          {/* Compare entry overly */}
                          <AnimatePresence>
                            {dragOverImageId ===
                              `global-${item.gen.id}-${idx}` && (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0 }}
                                className="absolute inset-0 bg-indigo-500/80 z-30 flex items-center justify-center backdrop-blur-sm pointer-events-none"
                              >
                                <motion.div
                                  initial={{ scale: 0.8, rotate: -3 }}
                                  animate={{ scale: 1.1, rotate: 0 }}
                                  transition={{
                                    type: "spring",
                                    stiffness: 500,
                                    damping: 10,
                                    mass: 1,
                                  }}
                                  className="bg-white px-4 py-2 rounded-full font-bold text-indigo-600 flex items-center gap-2 shadow-xl shrink-0"
                                >
                                  <GitCompare className="w-5 h-5" />
                                  进入全屏对比
                                </motion.div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          <div className="absolute inset-x-0 bottom-0 p-4 pt-12 pointer-events-none bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <p className="text-xs text-white/90 line-clamp-3 leading-relaxed font-sans drop-shadow-sm">
                              {item.gen.prompt}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Mouse Cursor Enter-Hold Progress Ring with Theme Masking */}
      {holdingEnterTrackId !== null && enterHoldProgress > 0 && (
        <div
          ref={enterRingElRef}
          className="fixed pointer-events-none z-[9999] w-12 h-12 flex items-center justify-center transition-transform duration-75"
          style={{
            left: Math.round(latestMousePos.current.x) - 24,
            top: Math.round(latestMousePos.current.y) - 24,
          }}
        >
          <svg
            className="w-12 h-12 -rotate-90 select-none"
            viewBox="0 0 100 100"
            shapeRendering="geometricPrecision"
          >
            {/* Background track circle (no solid fill) */}
            <circle
              cx="50"
              cy="50"
              r="42"
              className={
                theme === "light" ? "text-indigo-600/10" : "text-indigo-500/15"
              }
              stroke="currentColor"
              strokeWidth="12"
              fill="transparent"
            />
            {/* Active animating progress ring overlay */}
            <circle
              cx="50"
              cy="50"
              r="42"
              className={
                theme === "light" ? "text-indigo-600" : "text-indigo-500"
              }
              strokeWidth="12"
              strokeDasharray="263.89"
              strokeDashoffset={263.89 - (263.89 * enterHoldProgress) / 100}
              strokeLinecap="round"
              stroke="currentColor"
              fill="transparent"
            />
          </svg>
        </div>
      )}

      {/* Toast Notification */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[99999] flex flex-col-reverse items-center gap-3 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              className={`flex items-center gap-2 px-4 py-3 border rounded-2xl shadow-2xl backdrop-blur-md max-w-md ${
                theme === "light"
                  ? "bg-white/95 border-slate-200 text-slate-800"
                  : "bg-slate-900/95 border-slate-800 text-slate-100"
              }`}
            >
              <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-semibold tracking-wide leading-tight">
                {t.message}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {imageContextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={`fixed z-[9999] p-1 rounded-xl shadow-xl border overflow-hidden backdrop-blur-md ${
              theme === "light"
                ? "bg-white/90 border-slate-200"
                : "bg-slate-900/90 border-slate-700"
            }`}
            style={{
              top: imageContextMenu.y,
              left: imageContextMenu.x,
            }}
          >
            <button
              onClick={handleRedrawDetails}
              className={`w-full text-left px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors ${
                theme === "light"
                  ? "text-slate-700 hover:bg-slate-100"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <Sparkles className="w-4 h-4 text-indigo-500" />
              重绘细节
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {isDevEnvironment && <PerformanceMonitor />}
    </div>
  );
}
