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

export interface ImageReference {
  id: string; // Persistent ID for @ referencing (e.g., "1", "2", "3")
  url: string | Blob; // Base64, image URL, or Blob
  name?: string; // Original filename of reference image
  thumbnail?: string; // Base64 thumbnail string for faster list rendering
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
