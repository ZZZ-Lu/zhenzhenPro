# 生图接口参考代码（供 Agent 复刻使用）

这是当前项目中运行正常的核心生图逻辑代码，涵盖了如何构造 `FormData`、处理不同模型的专属参数（`image_size`、`aspect_ratio`、`size` 等）、如何抓取参考图（转为 blob）、以及最后如何提交任务并轮询 `taskId`：

```typescript
// 1. 抓取参考图片转为 Blob
let blobs: { blob: Blob; filename: string }[] = [];
if (refImages.length > 0) {
  for (let i = 0; i < refImages.length; i++) {
    let fetchUrl = refImages[i];
    const headers: Record<string, string> = {};
    if (fetchUrl.startsWith("https://ai.t8star.org")) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
      fetchUrl = fetchUrl.replace("https://ai.t8star.org", config.apiBase);
    } else if (fetchUrl.startsWith("http")) {
      fetchUrl = `/api/proxy-image?url=${encodeURIComponent(fetchUrl)}`;
    }
    const fetchRes = await fetch(fetchUrl, { headers });
    const blob = await fetchRes.blob();
    blobs.push({ blob, filename: `reference_${i}.png` });
  }
}
// 如果没有参考图，必须生成一个白图占位
if (blobs.length === 0) {
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, targetW, targetH);
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (blob) blobs.push({ blob, filename: "image_0.png" });
}

// 2. 构造 FormData
const formData = new FormData();
formData.append("prompt", finalPrompt);
formData.append("model", modelName);
formData.append("n", "1");
formData.append("quality", modelName === "gpt-image-2-low" ? "low" : "high");

// 尺寸参数处理
if (modelName === "nano-banana-pro" || modelName === "gemini-3.1-flash-image-preview") {
  // banana 模型必须使用 image_size
  const resVal = resolutionStr || resolutionSelected || "1k";
  formData.append("image_size", resVal.toUpperCase());
} else if (!modelName.includes("banana")) {
  // 普通模型使用绝对尺寸 size
  formData.append("size", finalSizeStr); // e.g. "1024x1024"
}

// 比例参数处理
if (modelName.includes("banana") || modelName === "gemini-3.1-flash-image-preview") {
  const ratio = aspectRatioStr || getGeminiAspectRatio(sizeToUse);
  formData.append("aspect_ratio", ratio);
}

// Append 参考图
blobs.forEach((item) => {
  formData.append("image", item.blob, item.filename);
});

// 3. 提交任务
const response = await fetch(`${apiBase}/v1/images/edits?async=true`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${config.apiKey}`,
  },
  body: formData,
});

const parseData = await response.json();
if (!response.ok) {
  throw new Error(parseData.message || `HTTP ${response.status}`);
}

// 4. 正确提取 taskId（防止被解析成 object）
const taskId = parseData.task_id || parseData.data?.task_id || (typeof parseData.data === 'string' ? parseData.data : null);
if (!taskId) throw new Error("No task ID returned");

// 5. 轮询结果
let attempts = 0;
let finalUrl = "";
while (attempts < 60) {
  attempts++;
  await new Promise((r) => setTimeout(r, 5000));
  const statusRes = await fetch(`${apiBase}/v1/images/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` }
  });
  const statusData = await statusRes.json();
  const inner = statusData.data || {};
  const state = inner.status;
  
  if (state === "SUCCESS") {
    finalUrl = inner.data?.data?.[0]?.url || "";
    break;
  } else if (state === "FAILURE") {
    throw new Error(`生成失败: ${inner.fail_reason}`);
  }
}
```
