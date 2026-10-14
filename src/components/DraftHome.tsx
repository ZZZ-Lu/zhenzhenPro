import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  FilePlus, 
  FolderOpen, 
  Trash2, 
  Copy, 
  Edit3, 
  Search, 
  LayoutGrid, 
  List, 
  ArrowUpDown, 
  X, 
  Check, 
  Image as ImageIcon,
  RotateCw,
  Sparkles,
  Sparkle,
  Layers,
  Plus
} from "lucide-react";
import { getIndexedDBItem, setIndexedDBItem, removeIndexedDBItem } from "../utils/db";
import { SharpStar } from "./SharpStar";

export interface DraftProject {
  id: string;
  name: string;
  thumbnail: string;
  updatedAt: number;
  width: number;
  height: number;
  aspectRatioLabel?: string;
  bgColor?: string;
}

interface DraftHomeProps {
  onOpenProject: (id: string) => void;
  onNewProject: (width: number, height: number, bgSrc?: string, name?: string, bgColor?: string) => void;
  theme: "light" | "dark";
  onCloseModal?: () => void;
}

// Aspect ratio presets for new canvas
export const ASPECT_RATIO_PRESETS = [
  {
    id: "1:1",
    label: "正方形 (1:1)",
    subLabel: "社交头像 / 贴纸 / 徽标",
    w: 1024,
    h: 1024,
    ratio: "1:1"
  },
  {
    id: "16:9",
    label: "横向宽屏 (16:9)",
    subLabel: "高清壁纸 / 电脑桌面 / 视频封面",
    w: 1920,
    h: 1080,
    ratio: "16:9"
  },
  {
    id: "9:16",
    label: "竖屏长图 (9:16)",
    subLabel: "手机壁纸 / 故事 / 竖版海报",
    w: 1080,
    h: 1920,
    ratio: "9:16"
  },
  {
    id: "4:3",
    label: "标准横向 (4:3)",
    subLabel: "经典插画 / 平板显示 / 演示",
    w: 1440,
    h: 1080,
    ratio: "4:3"
  },
  {
    id: "3:4",
    label: "标准纵向 (3:4)",
    subLabel: "传统画报 / 艺术肖像 / 杂志",
    w: 1080,
    h: 1440,
    ratio: "3:4"
  },
  {
    id: "3:2",
    label: "摄影横幅 (3:2)",
    subLabel: "单反相机标准画幅 / 摄影作品",
    w: 1500,
    h: 1000,
    ratio: "3:2"
  },
  {
    id: "2:3",
    label: "摄影竖幅 (2:3)",
    subLabel: "人物半身像 / 摄影竖构图",
    w: 1000,
    h: 1500,
    ratio: "2:3"
  },
  {
    id: "21:9",
    label: "超宽电影感 (21:9)",
    subLabel: "全景横卷 / 电影比例",
    w: 1680,
    h: 720,
    ratio: "21:9"
  }
];

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);
  
  if (diffSec < 60) return "刚刚";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}天前`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}个月前`;
  const diffYear = Math.floor(diffDay / 365);
  return `${diffYear}年前`;
}

export const DraftHome: React.FC<DraftHomeProps> = ({ 
  onOpenProject, 
  onNewProject, 
  theme, 
  onCloseModal 
}) => {
  const [projects, setProjects] = useState<DraftProject[]>([]);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"updatedAt" | "name" | "size">("updatedAt");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [projectToDelete, setProjectToDelete] = useState<DraftProject | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reloadProjects = async () => {
    try {
      const list = await getIndexedDBItem<DraftProject[]>("editor_projects") || [];
      setProjects(list);
    } catch (e) {
      console.warn("Failed to load editor_projects from DB", e);
    }
  };

  useEffect(() => {
    reloadProjects();
  }, []);

  const handleDuplicate = async (e: React.MouseEvent, proj: DraftProject) => {
    e.stopPropagation();
    try {
      const newId = `draft_${Date.now()}`;
      const newProj: DraftProject = {
        ...proj,
        id: newId,
        name: `${proj.name} (副本)`,
        updatedAt: Date.now()
      };

      const bgData = await getIndexedDBItem(`editor_bg_${proj.id}`);
      const layerData = await getIndexedDBItem(`editor_layer_${proj.id}`);
      if (bgData) await setIndexedDBItem(`editor_bg_${newId}`, bgData);
      if (layerData) await setIndexedDBItem(`editor_layer_${newId}`, layerData);

      const list = await getIndexedDBItem<DraftProject[]>("editor_projects") || [];
      const updated = [newProj, ...list];
      await setIndexedDBItem("editor_projects", updated);
      setProjects(updated);
    } catch (err) {
      console.error("Duplicate failed", err);
    }
  };

  const handleDelete = (e: React.MouseEvent, proj: DraftProject) => {
    e.stopPropagation();
    e.preventDefault();
    setProjectToDelete(proj);
  };

  const confirmDeleteProject = async (id: string) => {
    try {
      const list = await getIndexedDBItem<DraftProject[]>("editor_projects") || [];
      const updated = list.filter(p => p.id !== id);
      await setIndexedDBItem("editor_projects", updated);
      await removeIndexedDBItem(`editor_bg_${id}`);
      await removeIndexedDBItem(`editor_layer_${id}`);
      setProjects(updated);
    } catch (err) {
      console.error("Delete failed", err);
    } finally {
      setProjectToDelete(null);
    }
  };

  const handleStartRename = (e: React.MouseEvent, proj: DraftProject) => {
    e.stopPropagation();
    setEditingId(proj.id);
    setEditingName(proj.name);
  };

  const handleSaveRename = async (id: string) => {
    if (!editingName.trim()) {
      setEditingId(null);
      return;
    }
    try {
      const list = await getIndexedDBItem<DraftProject[]>("editor_projects") || [];
      const updated = list.map(p => p.id === id ? { ...p, name: editingName.trim() } : p);
      await setIndexedDBItem("editor_projects", updated);
      setProjects(updated);
    } catch (err) {
      console.error("Rename failed", err);
    } finally {
      setEditingId(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      if (!src) return;
      const img = new Image();
      img.onload = () => {
        const cleanName = file.name.replace(/\.[^/.]+$/, "");
        onNewProject(img.naturalWidth, img.naturalHeight, src, `${cleanName}.psd`);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const displayProjects = projects
    .filter(p => {
      if (!searchQuery.trim()) return true;
      return p.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === "updatedAt") {
        comparison = b.updatedAt - a.updatedAt;
      } else if (sortBy === "name") {
        comparison = a.name.localeCompare(b.name, "zh-CN");
      } else if (sortBy === "size") {
        const sizeA = a.width * a.height;
        const sizeB = b.width * b.height;
        comparison = sizeB - sizeA;
      }
      return sortOrder === "desc" ? comparison : -comparison;
    });

  const isDark = theme !== "light";

  return (
    <div className={`w-full h-full flex flex-col ${isDark ? 'bg-neutral-950 text-neutral-100' : 'bg-neutral-50 text-neutral-800'} select-none relative overflow-hidden font-sans`}>
      {/* Top Application Header Bar (Matching App.tsx Header) */}
      <header className={`h-14 px-6 flex items-center justify-between border-b shrink-0 backdrop-blur-md z-20 ${
        isDark 
          ? 'bg-neutral-900/90 border-neutral-800 text-white' 
          : 'bg-white/95 border-neutral-200 text-neutral-850'
      }`}>
        <div className="flex items-center gap-3">
          {/* Brand Identity Block */}
          <div className="flex items-center gap-3 select-none">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl blur opacity-30"></div>
              <div
                className="relative bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 w-8 h-8 shadow-md text-white flex items-center justify-center flex-shrink-0 border border-blue-400/30"
                style={{ clipPath: "url(#squircle-clip)" }}
              >
                <SharpStar className="w-4 h-4 text-white fill-white drop-shadow-[0_0_6px_rgba(255,255,255,0.9)] animate-pulse" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center text-sm sm:text-base font-black tracking-tight leading-none">
                <span className={isDark ? "text-white" : "text-neutral-900"}>贞贞</span>
                <span className="ml-0.5 bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent font-black">
                  Pro
                </span>
              </div>

              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${
                isDark ? "bg-neutral-800 text-neutral-300 border border-neutral-700/60" : "bg-neutral-100 text-neutral-600 border border-neutral-200"
              }`}>
                画布工作台
              </span>

              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold tracking-wide ${
                isDark ? "bg-blue-500/10 border border-blue-500/25 text-blue-300" : "bg-blue-50 border border-blue-200 text-blue-600"
              }`}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
                </span>
                v1.7.0
              </span>
            </div>
          </div>
        </div>

        {/* Right close modal button */}
        {onCloseModal && (
          <button
            onClick={onCloseModal}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer border ${
              isDark 
                ? 'border-neutral-700 bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-750' 
                : 'border-neutral-200 bg-neutral-100 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200'
            }`}
            title="关闭窗口"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar (Matching App.tsx style) */}
        <div className={`w-56 shrink-0 p-4 flex flex-col justify-between border-r ${
          isDark 
            ? 'bg-neutral-900/70 border-neutral-800' 
            : 'bg-white border-neutral-200'
        }`}>
          <div className="space-y-3">
            {/* Primary Accent Button: 新建画布 */}
            <button
              onClick={() => setIsNewDialogOpen(true)}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-xs tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 border border-neutral-500/50 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>新建画布工程</span>
            </button>

            {/* Secondary Action: 打开本地图片 */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all border shadow-sm cursor-pointer ${
                isDark 
                  ? 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-750 hover:text-white' 
                  : 'border-neutral-300 bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5 text-neutral-400" />
              <span>打开本地图片</span>
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*" 
              className="hidden" 
            />

            <div className={`w-full h-px my-2 ${isDark ? 'bg-neutral-800' : 'bg-neutral-200'}`} />

            {/* Navigation Tabs */}
            <div className="space-y-1">
              <button className={`w-full text-left px-3 py-2 rounded-xl flex items-center gap-2.5 text-xs font-bold transition-all ${
                isDark 
                  ? 'bg-neutral-800 text-white border border-neutral-700/80 shadow-sm' 
                  : 'bg-neutral-50 text-neutral-700 border border-neutral-100 shadow-sm'
              }`}>
                <div className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
                <Layers className="w-3.5 h-3.5 text-neutral-400" />
                <span>全部画布工程</span>
              </button>
            </div>
          </div>

          {/* Bottom status badge */}
          <div className={`p-3 rounded-xl text-xs flex items-center justify-between border ${
            isDark 
              ? 'bg-neutral-900/60 border-neutral-800/80 text-neutral-400' 
              : 'bg-neutral-50 border-neutral-200 text-neutral-600'
          }`}>
            <span className="flex items-center gap-1.5 text-[11px] font-medium">
              <Sparkles className="w-3.5 h-3.5 text-neutral-400" />
              <span>本地储存空间</span>
            </span>
            <span className="font-mono font-bold text-[11px] text-neutral-400">
              {projects.length} 件草稿
            </span>
          </div>
        </div>

        {/* Main Content Area */}
        <div className={`flex-1 flex flex-col overflow-hidden ${isDark ? 'bg-neutral-950/40' : 'bg-transparent'}`}>
          {/* Header Row: Title & Filter Controls */}
          <div className="px-8 pt-6 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3">
              <h2 className={`text-lg font-bold tracking-tight ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                最近使用项
              </h2>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold border ${
                isDark 
                  ? 'bg-neutral-800 border-neutral-700 text-neutral-400' 
                  : 'bg-neutral-100 border-neutral-200 text-neutral-600'
              }`}>
                {displayProjects.length}
              </span>
            </div>

            {/* Right Controls: Search, Sort & View Mode */}
            <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap">
              {/* Search Box */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索工程名称..."
                  className={`pl-8 pr-7 py-1.5 text-xs rounded-xl border outline-none transition-all w-40 sm:w-48 ${
                    isDark 
                      ? 'bg-neutral-900 border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:border-neutral-500' 
                      : 'bg-white border-neutral-300 text-neutral-800 placeholder-neutral-400 focus:border-neutral-500'
                  }`}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Sort selector */}
              <div className={`flex items-center rounded-xl border px-2 py-1 text-xs font-bold gap-1 shadow-sm ${
                isDark ? 'bg-neutral-900 border-neutral-700 text-neutral-300' : 'bg-white border-neutral-300 text-neutral-700'
              }`}>
                <ArrowUpDown className="w-3 h-3 text-neutral-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent outline-none cursor-pointer text-xs"
                >
                  <option value="updatedAt" className={isDark ? 'bg-neutral-900' : 'bg-white'}>按编辑时间</option>
                  <option value="name" className={isDark ? 'bg-neutral-900' : 'bg-white'}>按名称</option>
                  <option value="size" className={isDark ? 'bg-neutral-900' : 'bg-white'}>按尺寸</option>
                </select>
                <button
                  onClick={() => setSortOrder(prev => prev === "desc" ? "asc" : "desc")}
                  className="ml-1 text-neutral-400 hover:text-neutral-400 transition-colors"
                  title={sortOrder === "desc" ? "当前降序，点击升序" : "当前升序，点击降序"}
                >
                  {sortOrder === "desc" ? "↓" : "↑"}
                </button>
              </div>

              {/* View Mode Toggle */}
              <div className={`flex items-center p-0.5 rounded-xl border shadow-sm ${
                isDark ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-neutral-300'
              }`}>
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 rounded-lg transition-all ${
                    viewMode === "grid" 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                  title="网格平铺"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-lg transition-all ${
                    viewMode === "list" 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                  title="列表详情"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Projects Body Area */}
          <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar">
            {displayProjects.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 min-h-[360px]">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 border ${
                  isDark ? 'bg-neutral-900 border-neutral-800 text-neutral-600' : 'bg-neutral-100 border-neutral-200 text-neutral-400'
                }`}>
                  <ImageIcon className="w-8 h-8 opacity-60" />
                </div>
                <h3 className={`text-sm font-bold mb-1 ${isDark ? 'text-neutral-200' : 'text-neutral-800'}`}>
                  {searchQuery ? "未找到匹配的画布" : "暂无历史画布工程"}
                </h3>
                <p className="text-xs text-neutral-500 max-w-xs mb-5">
                  {searchQuery ? "请尝试使用其他关键词搜索" : "点击下方按钮立即新建一张空白画布或导入图片"}
                </p>
                {!searchQuery && (
                  <button
                    onClick={() => setIsNewDialogOpen(true)}
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold inline-flex items-center gap-2 shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    立即新建画布
                  </button>
                )}
              </div>
            ) : viewMode === "grid" ? (
              /* Grid View with Polished Cards */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {displayProjects.map((p) => {
                  return (
                    <div
                      key={p.id}
                      onClick={() => onOpenProject(p.id)}
                      className={`group relative rounded-2xl overflow-hidden cursor-pointer flex flex-col border transition-all duration-200 ${
                        isDark 
                          ? 'bg-neutral-900/80 border-neutral-800 hover:border-neutral-500/50 hover:bg-neutral-800 hover:shadow-xl hover:shadow-neutral-500/5' 
                          : 'bg-white border-neutral-200 hover:border-neutral-400 hover:shadow-md'
                      }`}
                    >
                      {/* Image Thumbnail Container */}
                      <div className={`aspect-[4/3] w-full ${isDark ? "bg-neutral-950 border-neutral-800/80" : "bg-neutral-100 border-neutral-200"} relative flex items-center justify-center overflow-hidden border-b`}>
                        {/* Transparency Checkerboard background */}
                        <div 
                          className="absolute inset-0 opacity-10 pointer-events-none" 
                          style={{
                            backgroundImage: 'repeating-linear-gradient(45deg, #FFF 25%, transparent 25%, transparent 75%, #FFF 75%, #FFF), repeating-linear-gradient(45deg, #FFF 25%, transparent 25%, transparent 75%, #FFF 75%, #FFF)',
                            backgroundPosition: '0 0, 6px 6px',
                            backgroundSize: '12px 12px'
                          }} 
                        />
                        
                        {p.thumbnail ? (
                          <img
                            src={p.thumbnail}
                            alt={p.name}
                            className="w-full h-full object-contain p-2.5 group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-neutral-600">
                            <ImageIcon className="w-8 h-8 mb-1 opacity-40" />
                            <span className="text-[10px] font-mono text-neutral-500">{p.width} × {p.height}</span>
                          </div>
                        )}

                        {/* Top Right Quick Actions on Hover */}
                        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-neutral-900/85 backdrop-blur-md rounded-xl p-1 border border-neutral-700/80 shadow-lg z-10">
                          <button
                            onClick={(e) => handleStartRename(e, p)}
                            className="p-1 rounded-lg hover:bg-neutral-750 text-neutral-300 hover:text-white transition-colors"
                            title="重命名"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDuplicate(e, p)}
                            className="p-1 rounded-lg hover:bg-neutral-750 text-neutral-300 hover:text-white transition-colors"
                            title="创建副本"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDelete(e, p)}
                            className="p-1 rounded-lg hover:bg-rose-500/20 text-neutral-300 hover:text-rose-400 transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Aspect Ratio Badge (Bottom Left) */}
                        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-neutral-900/80 backdrop-blur-sm text-[9px] font-mono font-bold text-neutral-300 border border-neutral-700/60 pointer-events-none">
                          {p.width} × {p.height}
                        </div>
                      </div>

                      {/* Card Info Footer */}
                      <div className="p-3.5 flex flex-col justify-between flex-1">
                        {editingId === p.id ? (
                          <div className="flex items-center gap-1.5 mb-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveRename(p.id);
                                if (e.key === "Escape") setEditingId(null);
                              }}
                              autoFocus
                              className={`w-full text-xs px-2 py-1 rounded-lg outline-none border font-medium ${
                                isDark 
                                  ? 'bg-neutral-950 border-neutral-500 text-white' 
                                  : 'bg-white border-neutral-500 text-neutral-800'
                              }`}
                            />
                            <button
                              onClick={() => handleSaveRename(p.id)}
                              className="p-1 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <h3 
                            className={`font-bold text-xs truncate ${isDark ? 'text-neutral-200 group-hover:text-neutral-400' : 'text-neutral-800 group-hover:text-neutral-600'} transition-colors`}
                            title={p.name}
                          >
                            {p.name}
                          </h3>
                        )}
                        <div className="flex items-center justify-between mt-2 text-[10px] text-neutral-500 font-mono">
                          <span>{formatRelativeTime(p.updatedAt)}</span>
                          <span className="text-neutral-400 font-semibold">{p.aspectRatioLabel || "画布"}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* List View */
              <div className={`rounded-2xl border overflow-hidden shadow-md ${
                isDark ? 'bg-neutral-900/80 border-neutral-800' : 'bg-white border-neutral-200'
              }`}>
                <table className="w-full text-left text-xs">
                  <thead className={`border-b font-bold ${
                    isDark ? 'bg-neutral-800/80 border-neutral-800 text-neutral-400' : 'bg-neutral-50 border-neutral-200 text-neutral-600'
                  }`}>
                    <tr>
                      <th className="py-3 px-4">缩略图与名称</th>
                      <th className="py-3 px-4">画布尺寸</th>
                      <th className="py-3 px-4">最近修改时间</th>
                      <th className="py-3 px-4 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-neutral-800/80' : 'divide-neutral-100'}`}>
                    {displayProjects.map((p) => (
                      <tr 
                        key={p.id}
                        onClick={() => onOpenProject(p.id)}
                        className={`cursor-pointer transition-colors ${
                          isDark ? 'hover:bg-neutral-800/60 text-neutral-300' : 'hover:bg-neutral-50 text-neutral-800'
                        }`}
                      >
                        <td className="py-2.5 px-4 flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center shrink-0 border ${isDark ? "bg-neutral-950 border-neutral-800" : "bg-neutral-100 border-neutral-200"}`}>
                            {p.thumbnail ? (
                              <img src={p.thumbnail} alt={p.name} className="w-full h-full object-contain" />
                            ) : (
                              <ImageIcon className="w-4 h-4 text-neutral-600" />
                            )}
                          </div>
                          <div>
                            <span className="font-bold hover:text-neutral-400 transition-colors">{p.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-neutral-400">
                          {p.width} × {p.height}
                        </td>
                        <td className="py-2.5 px-4 text-neutral-500">
                          {formatRelativeTime(p.updatedAt)} ({new Date(p.updatedAt).toLocaleDateString()})
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={(e) => handleStartRename(e, p)}
                              className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white"
                              title="重命名"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDuplicate(e, p)}
                              className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white"
                              title="创建副本"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDelete(e, p)}
                              className="p-1.5 rounded-lg hover:bg-rose-500/20 text-neutral-400 hover:text-rose-400 transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Project Dialog */}
      <AnimatePresence>
        {isNewDialogOpen && (
          <NewCanvasDialog
            theme={theme}
            existingCount={projects.length}
            onClose={() => setIsNewDialogOpen(false)}
            onCreate={(w, h, name, bgColor) => {
              setIsNewDialogOpen(false);
              onNewProject(w, h, undefined, name, bgColor);
            }}
          />
        )}
      </AnimatePresence>

      {/* Delete Project Confirmation Modal */}
      <AnimatePresence>
        {projectToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`w-full max-w-sm rounded-2xl p-5 border shadow-2xl ${
                isDark ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-200 text-neutral-850'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-rose-500" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">删除画布工程</h3>
                  <p className="text-[11px] text-neutral-400">此操作不可逆，将永久删除相关数据</p>
                </div>
              </div>
              <p className="text-xs text-neutral-300 mb-5 leading-relaxed">
                确定要删除工程 <span className="font-bold text-white">“{projectToDelete.name}”</span> 吗？
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setProjectToDelete(null)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    isDark 
                      ? 'border-neutral-700 bg-neutral-800 hover:bg-neutral-750 text-neutral-300 hover:text-white' 
                      : 'border-neutral-200 bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                  }`}
                >
                  取消
                </button>
                <button
                  onClick={() => confirmDeleteProject(projectToDelete.id)}
                  className="px-4 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white shadow-lg shadow-rose-600/20 transition-all cursor-pointer"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// New Canvas Dialog with Aspect Ratio Presets
interface NewCanvasDialogProps {
  theme: "light" | "dark";
  existingCount: number;
  onClose: () => void;
  onCreate: (width: number, height: number, name: string, bgColor: string) => void;
}

const NewCanvasDialog: React.FC<NewCanvasDialogProps> = ({
  theme,
  existingCount,
  onClose,
  onCreate
}) => {
  const [name, setName] = useState(`画布工程-${existingCount + 1}`);
  const [selectedPresetId, setSelectedPresetId] = useState("16:9");
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [bgColor, setBgColor] = useState("#FFFFFF");

  const isDark = theme !== "light";

  const handleSelectPreset = (preset: typeof ASPECT_RATIO_PRESETS[0]) => {
    setSelectedPresetId(preset.id);
    setWidth(preset.w);
    setHeight(preset.h);
  };

  const handleSwapOrientation = () => {
    setWidth(height);
    setHeight(width);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-neutral-950/80 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className={`w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col border ${
          isDark 
            ? 'bg-neutral-900 border-neutral-800 text-neutral-100' 
            : 'bg-white border-neutral-200 text-neutral-850'
        }`}
      >
        {/* Modal Header */}
        <div className={`h-14 px-6 flex items-center justify-between border-b shrink-0 ${
          isDark ? 'bg-neutral-800/90 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
        }`}>
          <div className="flex items-center gap-2.5">
            <div
              className="bg-blue-600 w-7 h-7 rounded-lg text-white flex items-center justify-center shadow-sm"
              style={{ clipPath: "url(#squircle-clip)" }}
            >
              <FilePlus className="w-4 h-4" />
            </div>
            <span className="font-bold text-sm tracking-tight">新建画布工程</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-500/15 text-neutral-400 font-mono font-bold border border-neutral-500/20">
              比例预设
            </span>
          </div>
          <button
            onClick={onClose}
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
              isDark ? 'hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'hover:bg-neutral-200 text-neutral-500'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden max-h-[70vh]">
          {/* Left: Aspect Ratio Presets Grid */}
          <div className={`flex-1 p-5 overflow-y-auto custom-scrollbar border-b md:border-b-0 md:border-r ${
            isDark ? 'border-neutral-800 bg-neutral-950/50' : 'border-neutral-200 bg-neutral-50/50'
          }`}>
            <h4 className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-3">
              选择画布比例预设
            </h4>

            <div className="columns-1 sm:columns-2 gap-2.5 space-y-2.5 pb-4">
              {ASPECT_RATIO_PRESETS.map((preset) => {
                const isSelected = selectedPresetId === preset.id && width === preset.w && height === preset.h;
                return (
                  <div
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset)}
                    className={`p-2.5 w-full break-inside-avoid rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      isSelected
                        ? "border-blue-500 bg-blue-500/15 text-white shadow-md ring-1 ring-blue-500"
                        : isDark
                        ? "border-neutral-800 bg-neutral-900 hover:border-neutral-700 hover:bg-neutral-800 text-neutral-300"
                        : "border-neutral-200 bg-white hover:border-neutral-300 text-neutral-700"
                    }`}
                    style={{ aspectRatio: `${preset.w}/${preset.h}` }}
                  >
                    <div className="flex-1 flex items-center justify-center min-h-[40px]">
                      <span className={`font-black text-3xl tracking-tighter ${isSelected ? 'text-blue-400' : isDark ? 'text-neutral-200' : 'text-neutral-700'}`}>
                        {preset.ratio}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-neutral-400 font-bold self-end mt-1">
                      {preset.w} × {preset.h} px
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Detailed Settings */}
          <div className={`w-full md:w-80 p-5 flex flex-col justify-between shrink-0 text-xs ${
            isDark ? 'bg-neutral-900' : 'bg-white'
          }`}>
            <div className="space-y-4">
              <h4 className="font-bold text-neutral-400 uppercase tracking-wider text-[11px]">
                参数设置
              </h4>

              {/* Document Name */}
              <div>
                <label className="block text-neutral-400 font-semibold mb-1">工程名称</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl outline-none border font-medium ${
                    isDark 
                      ? 'bg-neutral-950 border-neutral-700 focus:border-neutral-500 text-white' 
                      : 'bg-neutral-50 border-neutral-300 focus:border-neutral-500 text-neutral-800'
                  }`}
                />
              </div>

              {/* Dimensions: Width & Height */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-neutral-400 font-semibold">
                  <span>像素尺寸 (Pixels)</span>
                  <button
                    onClick={handleSwapOrientation}
                    className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-300 cursor-pointer"
                    title="交换宽高（切换横纵向）"
                  >
                    <RotateCw className="w-3 h-3" />
                    <span>翻转方向</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">宽度 (W)</label>
                    <input
                      type="number"
                      value={width}
                      min={100}
                      max={8192}
                      onChange={(e) => {
                        setWidth(Math.max(100, Number(e.target.value)));
                        setSelectedPresetId("custom");
                      }}
                      className={`w-full px-3 py-1.5 rounded-xl outline-none font-mono border ${
                        isDark 
                          ? 'bg-neutral-950 border-neutral-700 focus:border-neutral-500 text-white' 
                          : 'bg-neutral-50 border-neutral-300 focus:border-neutral-500'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-500 mb-1">高度 (H)</label>
                    <input
                      type="number"
                      value={height}
                      min={100}
                      max={8192}
                      onChange={(e) => {
                        setHeight(Math.max(100, Number(e.target.value)));
                        setSelectedPresetId("custom");
                      }}
                      className={`w-full px-3 py-1.5 rounded-xl outline-none font-mono border ${
                        isDark 
                          ? 'bg-neutral-950 border-neutral-700 focus:border-neutral-500 text-white' 
                          : 'bg-neutral-50 border-neutral-300 focus:border-neutral-500'
                      }`}
                    />
                  </div>
                </div>

                {/* Aspect Ratio summary indicator */}
                <div className={`p-2.5 rounded-xl border text-[11px] flex items-center justify-between font-mono ${
                  isDark ? 'bg-neutral-950 border-neutral-800 text-neutral-400' : 'bg-neutral-50 border-neutral-200 text-neutral-600'
                }`}>
                  <span>画幅比例:</span>
                  <span className="text-neutral-400 font-bold">
                    {(width / height).toFixed(2)} : 1
                  </span>
                </div>
              </div>

              {/* Background Color */}
              <div>
                <label className="block text-neutral-400 font-semibold mb-1.5">背景填充</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setBgColor("#FFFFFF")}
                    className={`py-1.5 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer ${
                      bgColor === "#FFFFFF" 
                        ? 'border-neutral-500 bg-neutral-500/20 text-neutral-300 ring-1 ring-neutral-500' 
                        : isDark ? 'border-neutral-800 hover:bg-neutral-800 text-neutral-400' : 'border-neutral-200 hover:bg-neutral-100 text-neutral-600'
                    }`}
                  >
                    白色
                  </button>
                  <button
                    onClick={() => setBgColor("#0B0F17")}
                    className={`py-1.5 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer ${
                      bgColor === "#0B0F17" 
                        ? 'border-neutral-500 bg-neutral-500/20 text-neutral-300 ring-1 ring-neutral-500' 
                        : isDark ? 'border-neutral-800 hover:bg-neutral-800 text-neutral-400' : 'border-neutral-200 hover:bg-neutral-100 text-neutral-600'
                    }`}
                  >
                    深黑
                  </button>
                  <button
                    onClick={() => setBgColor("transparent")}
                    className={`py-1.5 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer ${
                      bgColor === "transparent" 
                        ? 'border-neutral-500 bg-neutral-500/20 text-neutral-300 ring-1 ring-neutral-500' 
                        : isDark ? 'border-neutral-800 hover:bg-neutral-800 text-neutral-400' : 'border-neutral-200 hover:bg-neutral-100 text-neutral-600'
                    }`}
                  >
                    透明
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-5 border-t border-neutral-800">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer font-semibold"
              >
                取消
              </button>
              <button
                onClick={() => onCreate(width, height, name, bgColor)}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>创建画布</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default DraftHome;
