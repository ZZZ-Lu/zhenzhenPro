# 前端生图列 (Generation Column) 调用 API 2 的 React 代码参考

本文档提取了项目中「生图列」组件（`GenerationColumns`）调用 GPT-Image-2 接口的核心 React 代码。
此方案完美结合了 **React 状态管理**、**AbortController 请求中断**、**Promise.any 竞速（2in1 模型）** 以及 **IndexedDB 图片持久化**。

其他项目可以直接复刻这套函数来实现一个工业级、可中断、不会因页面刷新丢失数据的生图组件。

---

## 1. 核心状态与 Ref 定义

在组件内部，我们需要管理每一列的状态，以及用于中断请求的控制器。

```tsx
import { useState, useRef, useCallback } from 'react';

// 列配置数据结构
interface ColumnConfig {
  id: string;
  model: string;
  prompt: string;
  refImages: string[];
  isGenerating: boolean;
  results: ResultItem[];
  // ... 其他属性
}

// React 状态
const [columns, setColumns] = useState<ColumnConfig[]>([]);

// 用于随时中断生成任务的控制器集合 (Key: pending 任务的 ID)
const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

// 更新单列状态的 Helper 函数
const updateColumn = useCallback((colId, patch) => {
  setColumns(prev => prev.map(c => c.id === colId ? { ...c, ...patch } : c));
}, []);
```

## 2. 核心 `generate` 调用函数

触发生成时，我们需要生成一个 `pendingId` 用于占位，并创建 `AbortController` 绑定到该请求。

```tsx
const generate = useCallback(async (col: ColumnConfig) => {
  const startTime = Date.now();
  const pendingId = `img_${startTime}_${Math.random().toString(36).slice(2, 8)}`;
  
  // 1. 注册中断控制器
  const abortController = new AbortController();
  abortControllersRef.current.set(pendingId, abortController);
  const signal = abortController.signal;

  // 2. 更新 UI，插入一个 Generating 状态的骨架屏占位
  updateColumn(col.id, {
    isGenerating: true,
    results: [{
      id: pendingId,
      model: col.model,
      prompt: col.prompt,
      timestamp: startTime,
      duration: 0,
    }, ...col.results]
  });

  try {
    let finalUrl = '';

    // 3. 区分 2in1 竞速模式与单模型模式
    if (col.model === 'gpt-image-2-2in1') {
      // 竞速模式：同时请求，谁快用谁，抛弃慢的
      finalUrl = await Promise.any([
        runSingleModel('gpt-image-2', col, signal),
        runSingleModel('gpt-image-2-all', col, signal),
      ]);
      // 赢者决出后，立刻中断输掉的网络请求
      abortController.abort(); 
    } else {
      // 单模型模式
      finalUrl = await runSingleModel(col.model, col, signal);
    }

    // 4. 将线上 URL 下载为 Blob 并存入 IndexedDB (防刷新丢失，突破 localStorage 5MB 限制)
    const imageId = await saveImageBlob(finalUrl, pendingId);
    
    // 5. 更新状态：替换占位卡片为真实图片
    updateColumn(col.id, (prev) => ({
      results: prev.results.map(r => r.id === pendingId ? {
        ...r,
        imageUrl: finalUrl,
        duration: Math.round((Date.now() - startTime) / 1000),
      } : r)
    }));

  } catch (err: any) {
    // 6. 异常处理：区分用户手动中断和真实报错
    if (err.name === 'AbortError') {
      console.log('用户手动取消了生图');
    } else {
      const errMsg = err.message || 'Unknown error';
      updateColumn(col.id, (prev) => ({
        results: prev.results.map(r => r.id === pendingId ? {
          ...r,
          errorMessage: errMsg,
        } : r)
      }));
    }
  } finally {
    // 7. 清理控制器并恢复按钮状态
    abortControllersRef.current.delete(pendingId);
    updateColumn(col.id, { isGenerating: false });
  }
}, [updateColumn]);
```

## 3. 封装的基础请求函数 `runSingleModel`

该函数负责构造 `FormData`，提交 `async=true` 任务，并执行 `while` 轮询。

```tsx
const runSingleModel = async (modelName: string, col: ColumnConfig, signal: AbortSignal) => {
  // 3.1 处理参考图片转 Blob 和白图兜底 (详见 API 文档)
  const imageBlobs = await processRefImagesToBlobs(col.refImages);

  const formData = new FormData();
  formData.append('prompt', col.prompt);
  formData.append('model', modelName);
  formData.append('size', '1024x1024');
  imageBlobs.forEach(item => formData.append('image', item.blob, item.name));

  // 3.2 提交任务
  const res = await fetch('/api/t8star/v1/images/edits?async=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${YOUR_API_KEY}` },
    body: formData,
    signal, // 绑定 abort signal
  });
  const data = await res.json();
  const taskId = data.task_id || data.data?.task_id || (typeof data.data === 'string' ? data.data : null);
  if (!taskId) throw new Error("No task ID");

  // 3.3 轮询任务状态
  let attempts = 0;
  while (attempts < 60) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    attempts++;
    await new Promise(r => setTimeout(r, 5000));
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const statusRes = await fetch(`/api/t8star/v1/images/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${YOUR_API_KEY}` },
      signal,
    });
    const statusData = await statusRes.json();
    const state = statusData.data?.status;

    if (state === 'SUCCESS') {
      return statusData.data.data.data[0].url; // 返回真实图片 URL
    } else if (state === 'FAILURE') {
      throw new Error(`Failed: ${statusData.data.fail_reason}`);
    }
  }
  throw new Error("Timeout (60 attempts)");
};
```

## 4. 如何触发中断生成

通过 UI 上的“取消”按钮，根据正在生成的 `pendingId` 去触发 `abort()`：

```tsx
const abortGenerate = useCallback((pendingId: string, colId: string) => {
  // 触发原生 AbortController
  abortControllersRef.current.get(pendingId)?.abort();
  abortControllersRef.current.delete(pendingId);
  
  // 在 UI 层面移除那个生成中的骨架屏占位
  updateColumn(colId, (prev) => ({
    isGenerating: false,
    results: prev.results.filter(r => r.id !== pendingId),
  }));
}, [updateColumn]);
```

## 5. UI 渲染与 Blob (防抖/快速加载)

项目中生成的图片 URL 在跨域或防盗链环境下可能加载较慢。最佳实践是在第 2 步中将其转换为 Blob 存入 IndexedDB，然后用 `URL.createObjectURL(blob)` 在 UI 中渲染：

```tsx
// UI 渲染示例
<img 
  src={imageUrls[item.id] || item.imageUrl} // 优先使用本地转换的 Blob Object URL
  alt="Generated Result" 
  className="w-full h-auto object-contain"
/>
```
