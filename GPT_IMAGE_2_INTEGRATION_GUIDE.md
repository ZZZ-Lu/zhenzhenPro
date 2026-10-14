# 智能生图列 (Generation Column) 与 GPT-Image-2 接口集成技术方案

本文档详细说明了本项目中使用的“智能生图列”前端架构，以及如何对接 `gpt-image-2` 异步生图接口（包括 2in1 竞速模式）。本方案旨在提供一个健壮、不阻塞 UI、且支持本地持久化的完整生图解决方案，供其他项目复刻参考。

---

## 1. 架构概述

整个生图流程采用 **「前端提交构建 + 后端代理转发 + 异步轮询获取」** 的架构：
1. **防跨域代理 (Node.js)**：前端不直接请求 API，而是通过本地服务器（如 Express `http-proxy-middleware`）转发请求到 `https://ai.t8star.org`，并重写 `Host` 头，解决浏览器 CORS 限制和 SSL 证书校验问题。
2. **白图兜底机制**：`/v1/images/edits` 接口强制要求上传 `image`（参考图）。如果用户纯文本生图，前端会用 Canvas 动态绘制一张白底纯色图转成 Blob 传给后端。
3. **异步任务队列**：采用 `?async=true` 参数提交任务，获取 `task_id`，然后每 5 秒轮询一次任务状态，防止请求超时（Timeout）。
4. **大文件本地化存储**：生成的图片转为 Blob 存入浏览器的 `IndexedDB`，避免 `localStorage` 5MB 限制，同时在组件中通过 `URL.createObjectURL` 渲染。

---

## 2. 核心 API 接口说明

### 2.1 提交生图任务 (POST)
- **Endpoint**: `/api/t8star/v1/images/edits?async=true`
- **Content-Type**: `multipart/form-data`
- **Payload**:
  - `prompt` (String): 提示词
  - `model` (String): 模型名称，如 `gpt-image-2`
  - `n` (String): 生成数量，固定为 `"1"`
  - `quality` (String): `"high"` 或 `"low"`
  - `size` (String): 目标尺寸，如 `"1024x1024"`。*注：如果是 nano-banana 系列，使用 `image_size` 和 `aspect_ratio`。*
  - `image` (File/Blob): 参考图。可传多张。如果没有参考图，**必须传一张空白图**。

### 2.2 轮询任务状态 (GET)
- **Endpoint**: `/api/t8star/v1/images/tasks/{task_id}`
- **响应状态**:
  - `SUCCESS`: 生成成功，可以在 `data.data[0].url` 中获取图片地址。
  - `FAILURE`: 生成失败，错误信息在 `fail_reason` 中。
  - `IN_QUEUE` / 其他: 继续等待。

---

## 3. 前端技术实现细节与代码复刻

### 3.1 步骤一：处理参考图与“白图兜底”

在构建 `FormData` 前，需要把所有参考图 URL 转换为 Blob。如果用户没有提供参考图，前端自动用 Canvas 画一张白图：

```typescript
// targetW 和 targetH 为目标生成的宽高，例如 1024
let imageBlobs: { blob: Blob; name: string }[] = [];

// 1. 如果有参考图，先将其 Fetch 为 Blob
if (refImages.length > 0) {
  for (let i = 0; i < refImages.length; i++) {
    const fetchRes = await fetch(refImages[i]); // 跨域图片需走前端代理
    const blob = await fetchRes.blob();
    imageBlobs.push({ blob, name: `reference_${i}.png` });
  }
}

// 2. 关键：如果没有参考图，生成白图占位，满足接口必须传图的强校验
if (imageBlobs.length === 0) {
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, targetW, targetH);
  }
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (blob) imageBlobs.push({ blob, name: 'image_0.png' });
}
```

### 3.2 步骤二：构造 FormData 并提交任务

```typescript
const formData = new FormData();
formData.append('prompt', promptText);
formData.append('model', 'gpt-image-2');
formData.append('n', '1');
formData.append('quality', 'auto');
formData.append('size', '1024x1024');

// 将上面准备好的 Blob 追加进去
imageBlobs.forEach(item => formData.append('image', item.blob, item.name));

const res = await fetch('/api/t8star/v1/images/edits?async=true', {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}` },
  body: formData,
  signal: abortController.signal // 支持用户手动中断
});

const parseData = await res.json();

// 【Bug 修复点】：严格校验并提取 taskId，防止被解析成 [object Object]
const taskId = parseData.task_id || parseData.data?.task_id || (typeof parseData.data === 'string' ? parseData.data : null);
if (!taskId) throw new Error("No task ID returned");
```

### 3.3 步骤三：异步轮询任务结果

```typescript
let attempts = 0;
while (attempts < 60) { // 最多轮询 5 分钟
  attempts++;
  await new Promise(r => setTimeout(r, 5000)); // 每 5 秒轮询一次
  
  if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

  const statusRes = await fetch(`/api/t8star/v1/images/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: abortController.signal
  });
  
  const statusData = await statusRes.json();
  const inner = statusData.data || {};
  const state = inner.status;

  if (state === 'SUCCESS') {
    const finalUrl = inner.data?.data?.[0]?.url;
    // ... 将 finalUrl 展示给用户或存入 IndexedDB
    return finalUrl;
  } else if (state === 'FAILURE') {
    throw new Error(`Failed: ${inner.fail_reason}`);
  }
  // 其他状态则继续循环
}
throw new Error("Timeout (60 attempts)");
```

---

## 4. 高阶功能：2in1 竞速模式 (Racing Mode)

对于 `gpt-image-2-2in1` 模型，本项目采用的方案并非在后端实现，而是**前端触发两次并发请求**，分别请求 `gpt-image-2` 和 `gpt-image-2-all`，谁先返回就用谁的，并自动取消较慢的请求。这极大提高了出图速度。

```typescript
// 包装单个生图请求为 Promise
const runSingle = async (modelName: string, signal: AbortSignal) => {
  // ... 执行上述步骤二和步骤三
  return imageUrl;
};

// 使用 Promise.any 进行竞速
const abortController = new AbortController();
try {
  const winnerUrl = await Promise.any([
    runSingle('gpt-image-2', abortController.signal),
    runSingle('gpt-image-2-all', abortController.signal),
  ]);
  
  // 谁先赢了，立刻取消另一个正在轮询的任务
  abortController.abort(); 
  
  return winnerUrl;
} catch (err) {
  // Promise.any 抛出 AggregateError 说明两个都失败了
  throw new Error("Both models failed");
}
```

---

## 5. 前端代理配置 (Express 示例)

为了确保本地环境和部署环境都不会产生跨域问题，建议在 Node 服务侧添加如下代理：

```typescript
import { createProxyMiddleware } from "http-proxy-middleware";

app.use(
  "/api/t8star",
  createProxyMiddleware({
    target: "https://ai.t8star.org",
    changeOrigin: true,
    secure: false, // 忽略自签名证书校验
    servername: "ai.t8star.org", // 强制 SNI
    pathRewrite: { "^/api/t8star": "" }, // 剔除代理前缀
    onProxyReq: (proxyReq) => {
      proxyReq.setHeader("Host", "ai.t8star.org"); // 解决 Cloudflare 等反代拦截
    },
  })
);
```

## 6. 总结

该架构最核心的设计理念：
1. **通过 `canvas` 解决无图报错的问题**：巧妙绕过 OpenAI edits 接口强校验。
2. **异步非阻塞**：利用 `async=true` 和 `taskId` 将同步的大耗时阻塞操作变成了轻量级轮询。
3. **Promise.any 竞速**：榨干多模型并发的极速体验。
4. **Blob 化处理**：本地保存和展示速度极快，防抖动。

其他项目只需要照搬以上 `FormData` 拼接和 `while` 轮询逻辑，即可零痛点复刻此超级生图列。
