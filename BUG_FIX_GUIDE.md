# 复刻项目生图报错修复指南

致 负责该项目的 Agent：

根据对两个项目代码逻辑的比对，在当前项目中“上传参考图后生图”能够正常运行，而你的项目会出现报错。这主要源于**接口调用方式（JSON vs FormData）**和**特定模型参数**上的重大差异。请仔细阅读并根据以下指南修改代码。

## 核心差异与修改建议

### 1. nano-banana 模型的提交方式错误 (致命错误)
**问题：** 
在你的代码中，对于 `nano-banana` 模型（直接 JSON 提交）存在根本性的逻辑错误。该服务端 API 在处理带有参考图的 `nano-banana-pro` 或 `nano-banana-2` 模型时，**必须使用 FormData 提交，而不是 JSON**。

**如何修改：**
- 请将 `nano-banana` 模型的逻辑与 `2in1` 模型、普通 `gpt-image-2` 模型的逻辑合并，**统一使用 FormData 的方式提交给 `/v1/images/edits?async=true` 接口**。
- 将生成的 `Blob` 放入 `imageBlobs` 数组，然后执行：
  ```javascript
  imageBlobs.forEach(item => formData.append('image', item.blob, item.name));
  ```

### 2. nano-banana 模型的 FormData 专属字段要求
当统一改为 FormData 提交后，注意 `nano-banana` 系列模型所需的参数键值与 `gpt-image-2` **完全不同**。

**如何修改：**
在往 `formData` append 其它参数时，需做如下判断：
```javascript
// 1. 尺寸参数：nano-banana 必须使用 image_size (且大写如 "1K", "2K", "4K")，普通模型使用 size (如 "1024x1024")
if (modelName.includes("banana")) {
  formData.append("image_size", "1K"); // 注意大写，1K/2K/4K
} else {
  formData.append("size", "1024x1024"); // 普通模型填绝对尺寸
}

// 2. 比例参数：nano-banana 必须显式传递 aspect_ratio
if (modelName.includes("banana")) {
  formData.append("aspect_ratio", "16:9"); // 根据实际情况传入，例如 1:1, 16:9
}
```

### 3. 参考图抓取 (fetch) 的稳健性处理
**问题：**
在你的代码中，对于参考图的抓取仅简单写了 `const fetchRes = await fetch(col.refImages[i]);`。由于 `handleUseAsRef` 会将图片转为 `base64`（Data URL），过长的 base64 直接做 `fetch()` 在部分运行环境（或特定的框架限制中）可能会导致网络引擎崩溃或 `Failed to fetch`。
另外，如果是普通 URL 链接，直接 `fetch` 会因为 CORS 跨域问题被浏览器拦截。

**如何修改：**
请增强 `fetch` 阶段的代码鲁棒性（参考当前标准项目的做法）：
- 检查 `refImages[i]` 是否带有正确的 `data:image/png;base64,` 前缀。
- 如果不是 base64 而是在线 URL（`http` 开头），则需要走跨域代理或带上 `Authorization` 请求头：
```javascript
let fetchUrl = col.refImages[i];
const headers = {};

if (fetchUrl.startsWith("https://ai.t8star.org")) {
  // 必须带鉴权
  headers["Authorization"] = `Bearer ${config.apiKey}`;
  fetchUrl = fetchUrl.replace("https://ai.t8star.org", config.apiBase); // 替换为真实 API baseUrl
} else if (fetchUrl.startsWith("http")) {
  // CORS 代理
  fetchUrl = `/api/proxy-image?url=${encodeURIComponent(fetchUrl)}`;
}

const fetchRes = await fetch(fetchUrl, { headers });
const blob = await fetchRes.blob();
```

### 4. 没有参考图时的 “占位白图” 逻辑 (可选防错)
你的代码中已经包含了生成白色 Canvas 转 Blob 并命名为 `image_0.png` 的逻辑，这是正确的，请**务必保留**。在 FormData 的 `/edits` 接口中，即使是纯生图任务，也需要这个白色占位图作为基底。

## 总结行动清单
1. 将 `nano-banana` 系列模型从 JSON 改为使用 FormData。
2. 为 `nano-banana` 添加 `image_size` 和 `aspect_ratio` 字段。
3. 加强 `fetch(refImage)` 过程对不同图片格式的容错（跨域处理或 header 添加）。
