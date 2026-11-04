/**
 * 单项目数据导出 / 导入。
 *
 * 设计目标：
 *  - 以「单个项目」为粒度，把该项目在 IndexedDB 中的全部数据（画布列/作品、
 *    全局参考图、项目元信息）打包成 **一个压缩包**，便于备份、迁移与分享；
 *  - 图片以原始二进制存放（不转 base64），并且同一 Blob 对象只存一份，
 *    避免性能测试项目这类「一张图被上千张卡片复用」的数据被重复写入。
 *
 * 归档结构（内部为标准 zip）：
 *   manifest.json      —— 元信息 + 结构化数据（图片位置以 {@link BlobRef} 占位）
 *   assets/<assetId>   —— 图片原始字节
 */
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import type { ImageReference, ImageWorkspace } from "../types";

// --- IndexedDB 键（与 App.tsx 保持一致）------------------------------------
export const PROJECTS_KEY = "img_studio_projects_v2";
export const ACTIVE_PROJECT_KEY = "img_studio_active_project_v2";
export const workspaceKey = (projectId: string) =>
  `img_studio_workspaces_v2_${projectId}`;
export const workspaceBackupKey = (projectId: string) =>
  `img_studio_workspaces_v2_${projectId}_backup`;
export const globalRefsKey = (projectId: string) =>
  `img_studio_global_refs_${projectId}`;

export const PROJECT_ARCHIVE_FORMAT = "zhenzhenpro-project";
export const PROJECT_ARCHIVE_VERSION = 1;

const MANIFEST_ENTRY = "manifest.json";
const ASSET_PREFIX = "assets/";

/** 项目元信息（与 App.tsx 中的 projects 列表项一致）。 */
export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
}

/** 结构化数据中代表一个图片资源的占位符。 */
interface BlobRef {
  __zzBlob: string;
  type: string;
}

/** manifest 中登记的图片资源条目。 */
interface AssetRecord {
  id: string;
  type: string;
  size: number;
}

export interface ProjectArchiveInput {
  project: ProjectMeta;
  workspaces: ImageWorkspace[];
  globalRefs: ImageReference[];
}

export interface ParsedProjectArchive {
  project: ProjectMeta;
  workspaces: ImageWorkspace[];
  globalRefs: ImageReference[];
  meta: {
    exportedAt?: string;
    formatVersion: number;
    assetCount: number;
    workspaceCount: number;
    generationCount: number;
  };
}

// --- Blob 感知的序列化 / 反序列化 ------------------------------------------

interface SerializeState {
  assets: Map<string, Blob>;
  ids: Map<Blob, string>;
  records: AssetRecord[];
  index: number;
}

const withBlobRefs = (value: any, state: SerializeState): any => {
  if (value === null || value === undefined) return value;

  // Blob / File：登记一份原始字节，结构里只保留引用。
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    let id = state.ids.get(value);
    if (!id) {
      state.index += 1;
      id = `asset-${String(state.index).padStart(5, "0")}`;
      state.ids.set(value, id);
      state.assets.set(id, value);
      state.records.push({
        id,
        type: value.type || "application/octet-stream",
        size: value.size,
      });
    }
    const ref: BlobRef = {
      __zzBlob: id,
      type: value.type || "application/octet-stream",
    };
    return ref;
  }

  if (Array.isArray(value)) {
    return value.map((item) => withBlobRefs(item, state));
  }

  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      out[key] = withBlobRefs((value as Record<string, any>)[key], state);
    }
    return out;
  }

  return value;
};

const isBlobRef = (value: any): value is BlobRef =>
  !!value &&
  typeof value === "object" &&
  typeof (value as BlobRef).__zzBlob === "string";

const reviveBlobRefs = (
  value: any,
  assets: Map<string, Uint8Array>,
  missing: Set<string>,
  cache: Map<string, Blob>,
): any => {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => reviveBlobRefs(item, assets, missing, cache));
  }

  if (isBlobRef(value)) {
    // 同一个 assetId 只还原成一个 Blob 实例：原工程里同一张图会被大量卡片复用，
    // 保持实例一致才能让 blobUrl 缓存（WeakMap）继续命中。
    const cached = cache.get(value.__zzBlob);
    if (cached) return cached;

    const bytes = assets.get(value.__zzBlob);
    if (!bytes) {
      missing.add(value.__zzBlob);
      return null;
    }
    // 复制一份，保证 Blob 持有的 Uint8Array 类型与 BlobPart 兼容。
    const blob = new Blob([new Uint8Array(bytes)], {
      type: value.type || "application/octet-stream",
    });
    cache.set(value.__zzBlob, blob);
    return blob;
  }

  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      out[key] = reviveBlobRefs(
        (value as Record<string, any>)[key],
        assets,
        missing,
        cache,
      );
    }
    return out;
  }

  return value;
};

// --- 文件名 ---------------------------------------------------------------

const sanitizeFileName = (name: string): string => {
  const cleaned = (name || "project")
    .replace(/[\\/:*?"<>|\r\n\t]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
  return cleaned || "project";
};

const timestampTag = (date: Date = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
};

// --- 导出 -----------------------------------------------------------------

export interface ExportResult {
  blob: Blob;
  fileName: string;
  assetCount: number;
  workspaceCount: number;
}

/**
 * 打包单个项目为一个 zip 归档（供下载）。
 * 全过程只读，不修改任何既有数据。
 */
export async function exportProjectArchive(
  input: ProjectArchiveInput,
): Promise<ExportResult> {
  const workspaces = Array.isArray(input.workspaces) ? input.workspaces : [];
  const globalRefs = Array.isArray(input.globalRefs) ? input.globalRefs : [];

  const state: SerializeState = {
    assets: new Map(),
    ids: new Map(),
    records: [],
    index: 0,
  };

  const serializedWorkspaces = withBlobRefs(workspaces, state);
  const serializedRefs = withBlobRefs(globalRefs, state);

  const generationCount = workspaces.reduce(
    (sum, ws) => sum + (Array.isArray(ws?.generations) ? ws.generations.length : 0),
    0,
  );

  const manifest = {
    format: PROJECT_ARCHIVE_FORMAT,
    version: PROJECT_ARCHIVE_VERSION,
    app: "zhenzhenPro",
    exportedAt: new Date().toISOString(),
    project: input.project,
    counts: {
      workspaces: workspaces.length,
      generations: generationCount,
      assets: state.records.length,
    },
    assets: state.records,
    workspaces: serializedWorkspaces,
    globalRefs: serializedRefs,
  };

  const files: Record<string, Uint8Array> = {
    [MANIFEST_ENTRY]: strToU8(JSON.stringify(manifest)),
  };

  for (const [id, blob] of state.assets) {
    const buffer = new Uint8Array(await blob.arrayBuffer());
    files[`${ASSET_PREFIX}${id}`] = buffer;
  }

  // level 0：图片本身已是压缩格式，再压缩收益低且耗时。
  const zipped = zipSync(files, { level: 0 });
  const blob = new Blob([new Uint8Array(zipped)], { type: "application/zip" });

  return {
    blob,
    fileName: `${sanitizeFileName(input.project?.name || "project")}-${timestampTag()}.zzp.zip`,
    assetCount: state.records.length,
    workspaceCount: workspaces.length,
  };
}

/** 触发浏览器下载。 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// --- 导入 -----------------------------------------------------------------

const isLikelyArchiveName = (name: string) =>
  /\.(zip|zzp|zzp\.zip|zhenzhenproj)$/i.test(name);

export { isLikelyArchiveName };

/**
 * 解析项目归档文件。任何格式错误都会抛出带中文说明的 Error，
 * 便于界面直接提示用户。
 */
export async function parseProjectArchive(
  file: File | Blob,
): Promise<ParsedProjectArchive> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch {
    throw new Error("无法读取该文件：不是有效的项目数据包（zip 解析失败）。");
  }

  const manifestBytes = unzipped[MANIFEST_ENTRY];
  if (!manifestBytes) {
    throw new Error("该项目数据包缺少 manifest.json，可能不是本应用导出的文件。");
  }

  let manifest: any;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes));
  } catch {
    throw new Error("项目数据包已损坏：manifest.json 解析失败。");
  }

  if (!manifest || manifest.format !== PROJECT_ARCHIVE_FORMAT) {
    throw new Error("文件格式不受支持：不是本应用导出的项目数据包。");
  }

  const formatVersion =
    typeof manifest.version === "number" ? manifest.version : 0;
  if (formatVersion > PROJECT_ARCHIVE_VERSION) {
    throw new Error(
      `项目数据版本（v${formatVersion}）高于当前应用支持的版本（v${PROJECT_ARCHIVE_VERSION}），请升级后再导入。`,
    );
  }

  const rawProject = manifest.project;
  if (!rawProject || typeof rawProject.id !== "string" || !rawProject.id) {
    throw new Error("项目数据包缺少有效的项目标识。");
  }

  const assets = new Map<string, Uint8Array>();
  for (const key of Object.keys(unzipped)) {
    if (key.startsWith(ASSET_PREFIX) && key.length > ASSET_PREFIX.length) {
      assets.set(key.slice(ASSET_PREFIX.length), unzipped[key]);
    }
  }

  const missing = new Set<string>();
  const blobCache = new Map<string, Blob>();
  const workspaces = reviveBlobRefs(
    manifest.workspaces ?? [],
    assets,
    missing,
    blobCache,
  );
  if (!Array.isArray(workspaces)) {
    throw new Error("项目数据包中的画布数据无效。");
  }
  const globalRefs = reviveBlobRefs(
    manifest.globalRefs ?? [],
    assets,
    missing,
    blobCache,
  );
  if (missing.size > 0) {
    throw new Error(
      `项目数据包不完整：缺少 ${missing.size} 个图片资源文件。`,
    );
  }

  const generationCount = workspaces.reduce(
    (sum: number, ws: any) =>
      sum + (Array.isArray(ws?.generations) ? ws.generations.length : 0),
    0,
  );

  return {
    project: {
      id: rawProject.id,
      name:
        typeof rawProject.name === "string" && rawProject.name.trim()
          ? rawProject.name
          : "未命名项目",
      createdAt:
        typeof rawProject.createdAt === "number"
          ? rawProject.createdAt
          : Date.now(),
    },
    workspaces: workspaces as ImageWorkspace[],
    globalRefs: (Array.isArray(globalRefs) ? globalRefs : []) as ImageReference[],
    meta: {
      exportedAt:
        typeof manifest.exportedAt === "string" ? manifest.exportedAt : undefined,
      formatVersion,
      assetCount: assets.size,
      workspaceCount: workspaces.length,
      generationCount,
    },
  };
}