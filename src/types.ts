export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  seedanceApiKey?: string;
  qianwenApiUrl?: string;
  qianwenApiKey?: string;
  requestMode?: "server" | "client";
}

export interface ModelInfo {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface TestResult {
  step: string;
  status: 'pending' | 'success' | 'error' | 'running';
  details?: string;
  duration?: number;
}

export interface DiagnosticSummary {
  pingOk: boolean;
  pingLatency?: number;
  modelsCount: number;
  modelsList: ModelInfo[];
  completionOk: boolean;
  completionContent?: string;
  completionLatency?: number;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: string;
  modelUsed?: string;
  latency?: number;
  promptTokens?: number;
  completionTokens?: number;
}

export interface GenerationItem {
  id: string;
  prompt: string;
  refImages: (string | ImageReference)[];
  model: string;
  size: string;
  resolution?: string;
  callFormat: "images" | "chat";
  status: "idle" | "generating" | "success" | "error";
  result?: any;
  latency?: number;
  error?: string;
  timestamp: string;
  createdAt?: number;
  isStarred?: boolean;
  downloadedUrls?: string[];
}

/**
 * 生成结果中单张图片的渲染载荷。
 *
 * 三类载荷用途严格区分：
 *  - `url`：全尺寸原图 Blob（灯箱主视图 / 下载 / 发往模型时才转 base64）。
 *  - `display_url`：最长边 1600px 的显示图 Blob，供生图列渲染；原图最长边
 *    本身不超过 1600px 时不生成该字段，卡片回退到 `url`。
 *  - `thumbnail_url` / `thumbnail_url_1k`：256px / 2560px 缩略图 Blob，
 *    仅用于全景导航视图（灯箱底部导航条、图片地图总览），不作生图列显示源。
 */
export interface GeneratedImage {
  url: string | Blob;
  display_url?: string | Blob;
  thumbnail_url?: string | Blob;
  thumbnail_url_1k?: string | Blob;
  revised_prompt?: string;
}

export interface ImageReference {
  id: string; // Persistent ID for @ referencing (e.g., "1", "2", "3")
  url: string | Blob; // Base64, image URL, or Blob
  name?: string; // Original filename of reference image
  thumbnail?: string | Blob; // Thumbnail for faster list rendering (Blob -> Object URL)
}

export interface ImageWorkspace {
  id: string;
  name: string;
  imagePrompt: string;
  imageModel: string;
  imageSize: string;
  callFormat: "images" | "chat";
  refImages: ImageReference[];
  includeUrlsInPrompt: boolean;
  includeUrlsInBody: boolean;
  generations: GenerationItem[];
  columnWidth?: "narrow" | "medium" | "wide";
  imageResolution?: string;
}

export interface PerformanceLagEvent {
  id: string;
  duration: number;
  timestamp: string;
  recentOperations: string[];
}
