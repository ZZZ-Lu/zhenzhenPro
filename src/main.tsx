import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {startPerfSampler} from './utils/perfSampler';
import {applyRenderIsolation} from './utils/renderIsolation';
import {installGateDevHook} from './utils/imageLoadGate';

// 开发期帧率采样：把帧率/长任务/可见性定期写入 console，便于在页面很重、探针取不到
// 数据时仍能从落盘的 console 日志中读取真实帧数（仅 DEV 生效）。
startPerfSampler();

// 阶段一：渲染隔离（P0）。给 <html> 挂标记类，样式表据此让离屏的列与卡片跳过
// 布局与绘制。开关与常量见 src/utils/renderIsolation.ts。
applyRenderIsolation();

// 阶段二：图片加载闸门（每帧/每秒放行配额；同时已加载上限与最远优先释放默认关闭，
// 理由见该文件头部）。挂开发钩子便于 A/B 对照；开关与常量见 src/utils/imageLoadGate.ts。
installGateDevHook();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
