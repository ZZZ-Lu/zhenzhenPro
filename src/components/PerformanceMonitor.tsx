import React, { useState, useEffect, useRef } from 'react';
import { Activity, ChevronDown, AlertTriangle, Cpu, Layers, HelpCircle, Sparkles, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PerformanceLagEvent } from '../types';

export const PerformanceMonitor: React.FC = () => {
  const [fps, setFps] = useState(0);
  const [lagEvents, setLagEvents] = useState<PerformanceLagEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'issues' | 'diagnostic'>('issues');
  const [domCount, setDomCount] = useState({ total: 0, images: 0 });
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = localStorage.getItem('PerformanceMonitor_expanded');
    return saved !== null ? saved === 'true' : false;
  });

  useEffect(() => {
    localStorage.setItem('PerformanceMonitor_expanded', isExpanded ? 'true' : 'false');
  }, [isExpanded]);
  
  const recentOpsRef = useRef<string[]>([]);
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(performance.now());

  // Capture image decoding events
  useEffect(() => {
    const handleDecodeTime = (e: any) => {
      const { duration, src } = e.detail || {};
      if (duration > 16) {
        const op = `Image Decode: ${duration}ms (${src})`;
        recentOpsRef.current = [op, ...recentOpsRef.current].slice(0, 15);
        if (duration > 32) {
          setLagEvents((prev) => [
            {
              id: Math.random().toString(36).substr(2, 9),
              duration: Math.round(duration),
              timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
              recentOperations: [`主线程图像解码阻塞 (${src})`, ...recentOpsRef.current.slice(0, 3)],
            },
            ...prev,
          ].slice(0, 40));
        }
      }
    };

    window.addEventListener('image-decode-time', handleDecodeTime);
    return () => window.removeEventListener('image-decode-time', handleDecodeTime);
  }, []);

  // Monitor DOM counts periodically when expanded
  useEffect(() => {
    if (!isExpanded) return;
    const interval = setInterval(() => {
      const total = document.querySelectorAll('*').length;
      const images = document.querySelectorAll('img').length;
      setDomCount({ total, images });
    }, 1000);
    return () => clearInterval(interval);
  }, [isExpanded]);

  // Capture events for recent operations context
  useEffect(() => {
    const addOp = (op: string) => {
      if (recentOpsRef.current[0] === op) return;
      recentOpsRef.current = [op, ...recentOpsRef.current].slice(0, 15);
    };

    const handleEvent = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target || !target.tagName) return;

      const id = target.id ? `#${target.id}` : "";
      const className = (target.className && typeof target.className === 'string') 
        ? `.${target.className.split(' ').filter(c => c && !c.includes(':'))[0] || ""}`
        : "";
      const tagName = target.tagName.toLowerCase();
      
      let details = "";
      
      if (e instanceof KeyboardEvent) {
        const key = e.key === " " ? "Space" : e.key;
        details = ` [${key}] on ${tagName}${id}${className === "." ? "" : className}`;
      } else if (e instanceof MouseEvent || e.type.startsWith('touch')) {
        const text = target.textContent?.trim().slice(0, 12);
        const textLabel = text ? ` ("${text}...")` : "";
        details = ` on ${tagName}${id}${className === "." ? "" : className}${textLabel}`;
      } else if (e.type === 'input' || e.type === 'change') {
        const val = (target as HTMLInputElement).value;
        details = ` in ${tagName}${id} (len: ${val?.length || 0})`;
      } else {
        details = ` on ${tagName}${id}${className === "." ? "" : className}`;
      }
      
      addOp(`${e.type}${details}`);
    };

    const events = ['click', 'keydown', 'mousedown', 'touchstart', 'input', 'change', 'submit'];
    events.forEach(type => window.addEventListener(type, handleEvent, { capture: true, passive: true }));

    const mutationObserver = new MutationObserver((mutations) => {
      const externalMutations = mutations.filter((m) => {
        const target = m.target as HTMLElement;
        return !target.closest || !target.closest("#perf-monitor-root");
      });
      const changedNodes = externalMutations.reduce((acc, m) => acc + m.addedNodes.length + m.removedNodes.length, 0);
      if (changedNodes > 10) {
        addOp(`DOM Update: ~${changedNodes} nodes changed`);
      }
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    let observer: PerformanceObserver | null = null;
    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes && PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 32) {
            const event: PerformanceLagEvent = {
              id: Math.random().toString(36).substr(2, 9),
              duration: Math.round(entry.duration),
              timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
              recentOperations: [...recentOpsRef.current]
            };
            setLagEvents(prev => [event, ...prev].slice(0, 40));
          }
        }
      });
      try {
        observer.observe({ entryTypes: ['longtask'] });
      } catch (e) {
        console.warn('Long Tasks API observe failed', e);
      }
    }

    return () => {
      events.forEach(type => window.removeEventListener(type, handleEvent, { capture: true }));
      mutationObserver.disconnect();
      if (observer) observer.disconnect();
    };
  }, []);

  // Frame monitoring for FPS calculation
  useEffect(() => {
    let rafId: number;
    const checkFrame = (time: number) => {
      frameCountRef.current++;
      if (time - lastFpsUpdateRef.current > 500) {
        setFps(Math.round((frameCountRef.current * 1000) / (time - lastFpsUpdateRef.current)));
        frameCountRef.current = 0;
        lastFpsUpdateRef.current = time;
      }
      rafId = requestAnimationFrame(checkFrame);
    };
    rafId = requestAnimationFrame(checkFrame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const clearRecords = () => {
    recentOpsRef.current = [];
    setLagEvents([]);
  };

  return (
    <div id="perf-monitor-root" className="fixed bottom-4 left-4 z-50 w-80 font-sans origin-bottom-left scale-[0.75]">

      <div className="bg-[#18181b] rounded-[24px] shadow-2xl overflow-hidden border border-white/10">
        {/* Header */}
        <div 
          className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors border-b border-white/5"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            <span className="text-white font-semibold text-sm tracking-tight whitespace-nowrap">视口剔除与多图渲染性能诊断</span>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 rounded-lg border border-green-500/20">
              <span className="text-[9px] text-green-500/70 font-black uppercase tracking-tighter">FPS</span>
              <span className="text-sm text-green-400 font-mono font-bold leading-none min-w-[2ch]">{fps}</span>
            </div>

            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all duration-300 ${
              lagEvents.length > 0 
                ? "bg-red-500/15 border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.1)]" 
                : "bg-white/5 border-white/10"
            }`}>
              <span className={`text-[9px] font-black uppercase tracking-tighter ${
                lagEvents.length > 0 ? "text-red-500" : "text-gray-500"
              }`}>Issues</span>
              <span className={`text-sm font-mono font-bold leading-none min-w-[1ch] ${
                lagEvents.length > 0 ? "text-red-400" : "text-gray-400"
              }`}>{lagEvents.length}</span>
            </div>

            <motion.div
              animate={{ rotate: isExpanded ? 0 : -180 }}
              transition={{ duration: 0.2 }}
              className="ml-1"
            >
              <ChevronDown className="w-4 h-4 text-gray-500" />
            </motion.div>
          </div>
        </div>

        {/* Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              {/* Tab Selector */}
              <div className="flex items-center border-b border-white/10 bg-black/30 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('issues')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                    activeTab === 'issues' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>卡顿监视 ({lagEvents.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('diagnostic')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                    activeTab === 'diagnostic' ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/30' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                  <span>多图为什么还卡？</span>
                </button>
              </div>

              {/* Realtime Stats Bar */}
              <div className="grid grid-cols-2 gap-2 p-3 bg-white/5 border-b border-white/5 text-[11px] font-mono">
                <div className="flex items-center gap-1.5 text-gray-300">
                  <Layers className="w-3.5 h-3.5 text-sky-400" />
                  <span>DOM 节点: <strong className="text-white">{domCount.total}</strong> (Img: {domCount.images})</span>
                </div>
                <div className="flex items-center gap-1.5 text-gray-300">
                  <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                  <span>预估显存: <strong className="text-emerald-300">~{Math.round(domCount.images * 8.5)}MB</strong></span>
                </div>
              </div>

              <div className="px-4 py-3 space-y-3 max-h-[360px] overflow-y-auto custom-scrollbar">
                {activeTab === 'issues' ? (
                  lagEvents.length === 0 ? (
                    <div className="py-8 text-center space-y-1">
                      <p className="text-emerald-400 text-xs font-semibold">渲染运行非常流畅</p>
                      <p className="text-gray-500 text-[11px]">滚动时长任务均维持在 32ms 安全帧预算内</p>
                    </div>
                  ) : (
                    lagEvents.map((event) => (
                      <div key={event.id} className="bg-white/5 rounded-xl p-3 border border-white/5">
                        <div className="flex justify-between items-start mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                            <span className="text-rose-400 font-semibold text-xs">长任务卡顿 {event.duration}ms</span>
                          </div>
                          <span className="text-gray-500 text-[10px] font-mono">{event.timestamp}</span>
                        </div>
                        
                        <div className="mt-2">
                          <p className="text-gray-400 text-[11px] mb-1">近期触发归因:</p>
                          <ul className="space-y-0.5 ml-3 list-disc text-gray-300 text-[11px]">
                            {event.recentOperations.map((op, idx) => (
                              <li key={idx} className="opacity-90">
                                {op}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))
                  )
                ) : (
                  <div className="space-y-3 text-xs leading-relaxed text-gray-300">
                    <div className="bg-indigo-950/40 border border-indigo-500/20 rounded-xl p-3">
                      <h4 className="font-bold text-indigo-300 mb-1 flex items-center gap-1 text-xs">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> 核心结论：视口剔除≠零开销
                      </h4>
                      <p className="text-[11px] text-gray-300">
                        视口剔除（IntersectionObserver / 虚拟列表）仅解决了<strong>DOM 节点过多</strong>的问题，但多图场景下真正的性能瓶颈往往在<strong>图像解码</strong>、<strong>显存（VRAM）上传</strong>和<strong>重排抖动</strong>。
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="p-2.5 bg-white/5 rounded-lg border border-white/5">
                        <div className="font-bold text-white text-[11px] mb-0.5">1. 主线程图像解码（Image Decode Jank）</div>
                        <p className="text-[10px] text-gray-400">
                          即使节点进入视口才插入DOM，浏览器必须将压缩图解码为 RGBA 位图（单张 2K 图耗时 20~80ms 主线程）。多图同时进入视口即卡顿。
                          <span className="block mt-1 text-emerald-400 font-mono">✅ 解法：使用 decoding="async" 或 img.decode() 异步预解码</span>
                        </p>
                      </div>

                      <div className="p-2.5 bg-white/5 rounded-lg border border-white/5">
                        <div className="font-bold text-white text-[11px] mb-0.5">2. GPU 显存爆满与纹理频繁换页（VRAM Thrashing）</div>
                        <p className="text-[10px] text-gray-400">
                          一张 4K RGBA 位图占用约 33MB 显存。视口内几十张高精图会导致显存爆满，触发系统内存与显存频繁 Texture Swapping。
                          <span className="block mt-1 text-emerald-400 font-mono">✅ 解法：列表视图仅载入 compressed Thumbnail 缩略图，大图只在 Lightbox 弹窗加载</span>
                        </p>
                      </div>

                      <div className="p-2.5 bg-white/5 rounded-lg border border-white/5">
                        <div className="font-bold text-white text-[11px] mb-0.5">3. DOM 频繁 Mount/Unmount 与 GC 停顿</div>
                        <p className="text-[10px] text-gray-400">
                          快速滚动时 IntersectionObserver 频繁挂载和卸载 React 组件，触发大量 JS 对象创建与 GC 垃圾回收暂停。
                          <span className="block mt-1 text-emerald-400 font-mono">✅ 解法：使用 CSS content-visibility: auto 或固定 aspect-ratio 占位符</span>
                        </p>
                      </div>

                      <div className="p-2.5 bg-white/5 rounded-lg border border-white/5">
                        <div className="font-bold text-white text-[11px] mb-0.5">4. Layout Thrashing（高度塌陷与布局重排）</div>
                        <p className="text-[10px] text-gray-400">
                          剔除未进入视口的图片时，若占位盒尺寸未固定，引起容器高度塌陷与 Layout 强制重绘，导致滚动抖动。
                          <span className="block mt-1 text-emerald-400 font-mono">✅ 解法：利用 CSS aspect-ratio 在剔除时强行锁定高宽比</span>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {activeTab === 'issues' && (
                <div className="p-3 border-t border-white/5 bg-[#18181b]">
                  <button
                    onClick={clearRecords}
                    className="w-full py-2 bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium rounded-xl transition-all border border-white/5 active:scale-[0.98]"
                  >
                    清空卡顿记录
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      `}</style>
    </div>
  );
};

