import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();
const PORT = 3000;

// Proxy API requests - MUST be registered before body-parsers to avoid stream truncation with multipart data
app.use(
  "/api/t8star",
  createProxyMiddleware({
    target: "https://ai.t8star.org",
    changeOrigin: true,
    secure: false, // Bypass strict SSL certificate validation chain error under containers
    servername: "ai.t8star.org", // Force the Server Name Indication (SNI) to match target
    pathRewrite: {
      "^/api/t8star": "", // remove base path
    },
    on: {
      proxyReq: (proxyReq, req, res) => {
        // Enforce the Host header to match the SNI of our Cloudflare target
        proxyReq.setHeader("Host", "ai.t8star.org");
        console.log(`[Proxy Request] Url: ${req.url} -> Target: https://ai.t8star.org${proxyReq.path}`);
      },
      proxyRes: (proxyRes, req, res) => {
        console.log(`[Proxy Response] Status: ${proxyRes.statusCode} for Url: ${req.url}`);
      },
      error: (err, req, res) => {
        console.error(`[Proxy Error] Fail to proxy ${req.url}:`, err);
        if (res && "status" in res) {
          (res as any).status(502).json({ error: "Proxy error", details: err.message });
        }
      },
    },
  } as any)
);

app.use(
  "/api/seedance",
  createProxyMiddleware({
    target: "https://api.seedance.nz",
    changeOrigin: true,
    secure: false,
    servername: "api.seedance.nz",
    pathRewrite: {
      "^/api/seedance": "",
    },
    on: {
      proxyReq: (proxyReq, req, res) => {
        proxyReq.setHeader("Host", "api.seedance.nz");
        console.log(`[Seedance Proxy Request] Url: ${req.url} -> Target: https://api.seedance.nz${proxyReq.path}`);
      },
      proxyRes: (proxyRes, req, res) => {
        console.log(`[Seedance Proxy Response] Status: ${proxyRes.statusCode} for Url: ${req.url}`);
      },
      error: (err, req, res) => {
        console.error(`[Seedance Proxy Error] Fail to proxy ${req.url}:`, err);
        if (res && "status" in res) {
          (res as any).status(502).json({ error: "Seedance Proxy error", details: err.message });
        }
      },
    },
  } as any)
);

app.use(
  "/api/qianwen",
  createProxyMiddleware({
    target: "https://maas.qianwenaiapi.com",
    changeOrigin: true,
    secure: false,
    servername: "maas.qianwenaiapi.com",
    pathRewrite: {
      "^/api/qianwen": "",
    },
    on: {
      proxyReq: (proxyReq, req, res) => {
        proxyReq.setHeader("Host", "maas.qianwenaiapi.com");
        console.log(`[Qianwen Proxy Request] Url: ${req.url} -> Target: https://maas.qianwenaiapi.com${proxyReq.path}`);
      },
      proxyRes: (proxyRes, req, res) => {
        console.log(`[Qianwen Proxy Response] Status: ${proxyRes.statusCode} for Url: ${req.url}`);
      },
      error: (err, req, res) => {
        console.error(`[Qianwen Proxy Error] Fail to proxy ${req.url}:`, err);
        if (res && "status" in res) {
          (res as any).status(502).json({ error: "Qianwen Proxy error", details: err.message });
        }
      },
    },
  } as any)
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Helper function to normalise base URL and build endpoint URLs
function getEndpointUrl(baseUrl: string, endpoint: string): string {
  let cleanedBase = baseUrl.trim();
  // Remove trailing slashes
  cleanedBase = cleanedBase.replace(/\/+$/, "");

  if (endpoint === "models") {
    // If user provided a URL ending in /v1, we use that. Otherwise, try appending /v1 or use directly.
    if (cleanedBase.endsWith("/v1")) {
      return `${cleanedBase}/models`;
    }
    return `${cleanedBase}/v1/models`;
  } else if (endpoint === "chat") {
    if (cleanedBase.endsWith("/v1")) {
      return `${cleanedBase}/chat/completions`;
    }
    return `${cleanedBase}/v1/chat/completions`;
  } else if (endpoint === "images") {
    if (cleanedBase.endsWith("/v1")) {
      return `${cleanedBase}/images/generations`;
    }
    return `${cleanedBase}/v1/images/generations`;
  }
  return cleanedBase;
}

// Ensure error payloads can be nicely parsed
async function getErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text);
      return parsed.error?.message || parsed.error || text;
    } catch {
      return text || `HTTP Status ${response.status}`;
    }
  } catch {
    return `HTTP Status ${response.status}`;
  }
}

// 1. Diagnostic endpoint that tests the interface thoroughly
app.post("/api/diagnose", async (req, res) => {
  const { baseUrl, apiKey } = req.body;

  if (!baseUrl || !apiKey) {
    return res.status(400).json({ error: "Missing baseUrl or apiKey parameters." });
  }

  const results: any = {
    pingOk: false,
    pingLatency: 0,
    modelsCount: 0,
    modelsList: [],
    completionOk: false,
    completionContent: "",
    completionLatency: 0,
    error: null,
  };

  try {
    // Stage 1: Ping / Models fetch check
    const modelsUrl = getEndpointUrl(baseUrl, "models");
    console.log(`[Diagnostic] Fetching models from: ${modelsUrl}`);

    const startPing = Date.now();
    let modelsResponse: Response;

    try {
      modelsResponse = await fetch(modelsUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Accept": "application/json",
        },
      });
    } catch (err: any) {
      // Fallback: maybe there is no /v1 in their URL but server expects it literally, or vice versa
      console.log(`[Diagnostic] Direct route failed: ${err.message}. Trying literal baseUrl fallback.`);
      const fallbackUrl = baseUrl.trim().replace(/\/+$/, "") + "/models";
      modelsResponse = await fetch(fallbackUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Accept": "application/json",
        },
      });
    }

    results.pingLatency = Date.now() - startPing;

    if (!modelsResponse.ok) {
      const errMsg = await getErrorDetail(modelsResponse);
      throw new Error(`Models endpoint returned status ${modelsResponse.status}: ${errMsg}`);
    }

    const modelsData = await modelsResponse.json();
    const models = modelsData.data || [];
    results.pingOk = true;
    results.modelsCount = models.length;
    results.modelsList = models.slice(0, 15); // Return top 15 models to keep payload clean

    // Stage 2: Pick a default model and run a minor completions test
    // Usually, we'll try to find an GPT model, Claude, or Deepseek, or fallback to the first model in the list
    if (models.length > 0) {
      const selectedModel = models.find((m: any) => 
        m.id.toLowerCase().includes("gpt-3.5-turbo") || 
        m.id.toLowerCase().includes("gpt-4o-mini") ||
        m.id.toLowerCase().includes("deepseek-chat") ||
        m.id.toLowerCase().includes("deepseek-coder")
      )?.id || models[0].id;

      const chatUrl = getEndpointUrl(baseUrl, "chat");
      console.log(`[Diagnostic] Testing Completion endpoint: ${chatUrl} with model: ${selectedModel}`);

      const startChat = Date.now();
      const chatResponse = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: "system", content: "You are a connectivity test script. Reply with exactly 'OK' and nothing else." },
            { role: "user", content: "test" }
          ],
          max_tokens: 10,
          temperature: 0.1,
        }),
      });

      results.completionLatency = Date.now() - startChat;

      if (chatResponse.ok) {
        const chatData = await chatResponse.json();
        results.completionOk = true;
        results.completionContent = chatData.choices?.[0]?.message?.content || JSON.stringify(chatData);
      } else {
        const errMsg = await getErrorDetail(chatResponse);
        results.completionOk = false;
        results.error = `Completion endpoint failed: ${errMsg}`;
      }
    } else {
      results.error = "Handshake was successful but the models list returned was empty.";
    }

  } catch (err: any) {
    results.error = err.message || "An unexpected network or connectivity error occurred.";
  }

  res.json(results);
});

// 2. Proxied standard Models getter
app.post("/api/models", async (req, res) => {
  const { baseUrl, apiKey } = req.body;

  if (!baseUrl || !apiKey) {
    return res.status(400).json({ error: "Missing baseUrl or apiKey parameters." });
  }

  try {
    const modelsUrl = getEndpointUrl(baseUrl, "models");
    const response = await fetch(modelsUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errMsg = await getErrorDetail(response);
      return res.status(response.status).json({ error: errMsg });
    }

    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch models list." });
  }
});

// 3. Proxied Chat Completion router
app.post("/api/chat", async (req, res) => {
  const { baseUrl, apiKey, model, messages, temperature = 0.7, maxTokens = 1000, systemPrompt } = req.body;

  if (!baseUrl || !apiKey || !model || !messages) {
    return res.status(400).json({ error: "Missing required chat completion parameters (baseUrl, apiKey, model, messages)." });
  }

  try {
    const chatUrl = getEndpointUrl(baseUrl, "chat");
    
    // Inject custom system prompt if supplied and wasn't already in messages
    const finalMessages = [...messages];
    if (systemPrompt && !finalMessages.find(msg => msg.role === "system")) {
      finalMessages.unshift({ role: "system", content: systemPrompt });
    }

    const start = Date.now();
    const response = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: finalMessages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    const latency = Date.now() - start;

    if (!response.ok) {
      const errMsg = await getErrorDetail(response);
      return res.status(response.status).json({ error: errMsg });
    }

    const data = await response.json();
    
    // Parse response cleanly and append custom diagnostic metrics
    res.json({
      choices: data.choices,
      usage: data.usage,
      latency,
      raw: data
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Chat completion proxy failed." });
  }
});

// 4. Proxied Image Generation Router
app.post("/api/images", async (req, res) => {
  const { baseUrl, apiKey, model, prompt, size = "1024x1024", n = 1 } = req.body;

  if (!baseUrl || !apiKey || !prompt) {
    return res.status(400).json({ error: "Missing required parameter (baseUrl, apiKey, prompt)." });
  }

  try {
    const imagesUrl = getEndpointUrl(baseUrl, "images");
    console.log(`[ImageGen] Proxying request to: ${imagesUrl} with model: ${model || "default"}`);
    
    // Forward extra properties like ref_images, images, prompt_images etc., if passed in the body
    const { baseUrl: _, apiKey: __, ...forwardPayload } = req.body;

    const start = Date.now();
    const response = await fetch(imagesUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-image-2-all",
        prompt,
        size,
        n,
        ...forwardPayload,
      }),
    });

    const latency = Date.now() - start;

    if (!response.ok) {
      const errMsg = await getErrorDetail(response);
      return res.status(response.status).json({ error: errMsg });
    }

    const data = await response.json();
    res.json({
      data: data.data,
      created: data.created,
      latency,
      raw: data
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Image generation proxy failed." });
  }
});

// 5. Generic Image proxy to bypass CORS restrictions for the frontend
app.get("/api/proxy-image", async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl || typeof imageUrl !== "string") {
    return res.status(400).json({ error: "Missing required query parameter 'url'." });
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return res.status(response.status).json({ error: `Failed to fetch image: ${response.statusText}` });
    }

    const contentType = response.headers.get("content-type") || "image/png";
    res.setHeader("Content-Type", contentType);
    
    // Read the body as an ArrayBuffer and convert to a Buffer for express to respond
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (err: any) {
    console.error("[CORS Proxy Error]", err);
    res.status(500).json({ error: err.message || "Failed to proxy image." });
  }
});

// 6. Qianwen Image Generation proxy router (supports custom endpoints & default maas.qianwenaiapi.com)
app.post("/api/qianwen-generation", async (req, res) => {
  const { apiUrl, apiKey, payload } = req.body;
  if (!apiKey || !payload) {
    return res.status(400).json({ error: "Missing required parameters (apiKey, payload)." });
  }

  const targetUrl = (apiUrl && apiUrl.trim()) ? apiUrl.trim() : "https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation";
  console.log(`[QianwenGen] Forwarding request to: ${targetUrl}`);

  try {
    const start = Date.now();
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const latency = Date.now() - start;
    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(response.status).send(text);
    }

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(response.status).json({
      ...data,
      latency,
    });
  } catch (err: any) {
    console.error("[QianwenGen Error]", err);
    return res.status(500).json({ error: err.message || "Failed to call Qianwen generation API." });
  }
});

// 7. Qianwen Task Polling proxy
app.post("/api/qianwen-task", async (req, res) => {
  const { taskId, taskUrl, apiKey } = req.body;
  if (!taskId || !apiKey) {
    return res.status(400).json({ error: "Missing required parameters (taskId, apiKey)." });
  }

  const targetUrl = (taskUrl && taskUrl.trim()) ? taskUrl.trim() : `https://maas.qianwenaiapi.com/api/v1/tasks/${taskId}`;
  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
    });

    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(response.status).send(text);
    }
    return res.status(response.status).json(data);
  } catch (err: any) {
    console.error("[QianwenTask Error]", err);
    return res.status(500).json({ error: err.message || "Failed to query Qianwen task status." });
  }
});

// 8. Seedance File Upload proxy router (accepts base64 and forwards multipart to api.seedance.nz)
app.post("/api/seedance-upload", async (req, res) => {
  const { fileBase64, filename, apiKey } = req.body;
  if (!apiKey || !fileBase64) {
    return res.status(400).json({ error: "Missing required parameters (apiKey, fileBase64)." });
  }

  try {
    const rawData = fileBase64.replace(/^data:[^;]+;base64,/, "");
    const mimeMatch = fileBase64.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
    const buffer = Buffer.from(rawData, "base64");

    const formData = new FormData();
    const blob = new Blob([buffer], { type: mimeType });
    formData.append("file", blob, filename || "ref.png");

    const response = await fetch("https://api.seedance.nz/v1/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(response.status).send(text);
    }
    return res.status(response.status).json(data);
  } catch (err: any) {
    console.error("[SeedanceUpload Error]", err);
    return res.status(500).json({ error: err.message || "Failed to upload reference image to Seedance." });
  }
});

// 9. Seedance Generation proxy router
app.post("/api/seedance-generation", async (req, res) => {
  const { apiKey, payload } = req.body;
  if (!apiKey || !payload) {
    return res.status(400).json({ error: "Missing required parameters (apiKey, payload)." });
  }

  try {
    const response = await fetch("https://api.seedance.nz/v1/image/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(response.status).send(text);
    }
    return res.status(response.status).json(data);
  } catch (err: any) {
    console.error("[SeedanceGen Error]", err);
    return res.status(500).json({ error: err.message || "Failed to submit Seedance generation task." });
  }
});

// 10. Seedance Task Polling proxy router
app.post("/api/seedance-task", async (req, res) => {
  const { taskId, apiKey } = req.body;
  if (!taskId || !apiKey) {
    return res.status(400).json({ error: "Missing required parameters (taskId, apiKey)." });
  }

  try {
    const response = await fetch(`https://api.seedance.nz/v1/image/generations/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(response.status).send(text);
    }
    return res.status(response.status).json(data);
  } catch (err: any) {
    console.error("[SeedanceTask Error]", err);
    return res.status(500).json({ error: err.message || "Failed to query Seedance task status." });
  }
});

async function startServer() {
  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
