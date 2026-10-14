import React, { useState, useEffect, useRef } from 'react';
import { Play, Sparkles, AlertCircle, RefreshCw, Film, Image as ImageIcon, Music, Download, Clipboard, Check, ChevronRight, History, X } from 'lucide-react';

interface GenerationHistory {
  id: string;
  url: string;
  prompt: string;
  timestamp: number;
}

export default function Playground({ apiKey: propApiKey, onApiKeyChange }: { apiKey?: string, onApiKeyChange?: (k: string) => void } = {}) {
  const [localApiKey, setLocalApiKey] = useState(() => localStorage.getItem('Playground_apiKey') || '');
  const apiKey = propApiKey !== undefined ? propApiKey : localApiKey;

  const handleApiKeyChange = (val: string) => {
    setLocalApiKey(val);
    if (onApiKeyChange) {
      onApiKeyChange(val);
    }
  };

  const [prompt, setPrompt] = useState(() => localStorage.getItem('Playground_prompt') || 'A stunning cinematic portrait of actress Go YounJung in neon-lit cyberpunk Seoul streets, masterwork, 8k resolution');
  const [model, setModel] = useState(() => localStorage.getItem('Playground_model') || 'gpt-image-2');
  const [quality, setQuality] = useState(() => localStorage.getItem('Playground_quality') || 'auto');
  const [aspectRatio, setAspectRatio] = useState(() => localStorage.getItem('Playground_aspectRatio') || '16:9');
  const [resolution, setResolution] = useState(() => localStorage.getItem('Playground_resolution') || '2k');
  const [requestMode, setRequestMode] = useState<'client' | 'server'>(() => {
    return (localStorage.getItem('Playground_requestMode') as 'client' | 'server') || 'client';
  });
  const [refImagePreviews, setRefImagePreviews] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('Playground_refImagePreviews');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  
  const [logs, setLogs] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultImg, setResultImg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [history, setHistory] = useState<GenerationHistory[]>(() => {
    try {
      const saved = localStorage.getItem('Playground_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  useEffect(() => { localStorage.setItem('Playground_apiKey', apiKey); }, [apiKey]);
  useEffect(() => { localStorage.setItem('Playground_prompt', prompt); }, [prompt]);
  useEffect(() => { localStorage.setItem('Playground_model', model); }, [model]);
  useEffect(() => { localStorage.setItem('Playground_quality', quality); }, [quality]);
  useEffect(() => { localStorage.setItem('Playground_aspectRatio', aspectRatio); }, [aspectRatio]);
  useEffect(() => { localStorage.setItem('Playground_resolution', resolution); }, [resolution]);
  useEffect(() => { localStorage.setItem('Playground_history', JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem('Playground_requestMode', requestMode); }, [requestMode]);

  const processFiles = (files: FileList | File[]) => {
    const newFiles = Array.from(files);
    
    newFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setRefImagePreviews(prev => {
          if (prev.length >= 16) return prev;
          const newPreviews = [...prev, result];
          try {
            localStorage.setItem('Playground_refImagePreviews', JSON.stringify(newPreviews));
          } catch (err) {
            console.warn("Could not save image to localStorage, size might be too large");
          }
          return newPreviews;
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRefImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files) as File[];
      const images = filesArray.filter(f => f.type.startsWith('image/'));
      if (images.length > 0) {
        processFiles(images);
      }
    }
  };

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, msg]);
  };

  const executeApiTest = async () => {
    if (!apiKey) {
      alert('Please enter your API Key');
      return;
    }
    
    setIsGenerating(true);
    setLogs([]);
    setResultImg(null);
    
    try {
      addLog(`Starting test for ${model}...`);
      
      const sizeMap: Record<string, string> = {
        "1:1-1k": "1024x1024", "1:1-2k": "2048x2048", "1:1-4k": "2880x2880",
        "16:9-1k": "1280x720", "16:9-2k": "2560x1440", "16:9-4k": "3840x2160",
        "9:16-1k": "720x1280", "9:16-2k": "1440x2560", "9:16-4k": "2160x3840",
        "3:2-1k": "1248x832", "3:2-2k": "2496x1664", "3:2-4k": "3744x2496",
        "2:3-1k": "832x1248", "2:3-2k": "1664x2496", "2:3-4k": "2496x3744",
        "4:3-1k": "1024x768", "4:3-2k": "2048x1536", "4:3-4k": "3072x2304",
        "3:4-1k": "768x1024", "3:4-2k": "1536x2048", "3:4-4k": "2304x3072",
        "5:4-1k": "1120x896", "5:4-2k": "2240x1792", "5:4-4k": "3360x2688",
        "4:5-1k": "896x1120", "4:5-2k": "1792x2240", "4:5-4k": "2688x3360",
        "2:1-1k": "1280x640", "2:1-2k": "2560x1280", "2:1-4k": "3840x1920",
        "1:2-1k": "640x1280", "1:2-2k": "1280x2560", "1:2-4k": "1920x3840",
        "21:9-1k": "1680x720", "21:9-2k": "3360x1440", "21:9-4k": "5040x2160"
      };
      const sizeStr = sizeMap[`${aspectRatio}-${resolution}`] || "1024x1024";

      addLog(`Calculated Size: ${sizeStr}`);
      addLog(`Quality: ${quality}`);
      
      const [wStr, hStr] = sizeStr.split('x');
      const targetW = parseInt(wStr, 10);
      const targetH = parseInt(hStr, 10);

      let imageBlobs: {blob: Blob, name: string}[] = [];

      if (refImagePreviews.length > 0) {
        addLog(`Using ${refImagePreviews.length} uploaded reference image(s)...`);
        for (let i = 0; i < refImagePreviews.length; i++) {
          try {
            const fetchRes = await fetch(refImagePreviews[i]);
            const blob = await fetchRes.blob();
            imageBlobs.push({blob, name: `reference_${i}.png`});
          } catch (e) {
            addLog(`Failed to load reference image ${i}.`);
          }
        }
      }

      if (imageBlobs.length === 0) {
        addLog(`No reference image provided. Generating ${targetW}x${targetH} blank canvas.`);
        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        if(ctx) {
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, targetW, targetH);
        }
        
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error("Failed to create blank image");
        imageBlobs.push({blob, name: 'image_0.png'});
      }

      if (model === 'gpt-image-2-fal') {
        const payload: any = {
          prompt: prompt,
          quality: quality,
          num_images: 1,
          output_format: "png"
        };
        const [wStr, hStr] = sizeStr.split('x');
        payload.image_size = { width: parseInt(wStr, 10), height: parseInt(hStr, 10) };
        
        const apiBase = requestMode === 'client' ? 'https://ai.t8star.org' : '/api/t8star';
        let requestUrl = `${apiBase}/fal/openai/gpt-image-2`;
        if (refImagePreviews.length > 0 && imageBlobs.length > 0) {
          addLog("Uploading reference image(s) to T8star files service...");
          const fileUploadBase = requestMode === 'client' ? 'https://ai.t8star.org' : '/api/t8star';
          const uploadUrl = `${fileUploadBase}/v1/files`;

          const getUUID = () => {
            if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
              return crypto.randomUUID();
            }
            return `${Math.random().toString(36).substring(2, 10)}-${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 14)}`;
          };

          const imageUrls = await Promise.all(
            imageBlobs.map(async (item) => {
              const formData = new FormData();
              const ext = item.name.split('.').pop() || 'jpg';
              formData.append("file", item.blob, `${getUUID()}.${ext}`);

              const uploadRes = await fetch(uploadUrl, {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${apiKey}`
                },
                body: formData
              });

              const uploadData = await uploadRes.json();
              if (!uploadRes.ok) {
                throw new Error(`Upload failed: ${JSON.stringify(uploadData)}`);
              }
              addLog(`Uploaded reference image. Live URL: ${uploadData.url}`);
              return uploadData.url;
            })
          );

          payload.image_urls = imageUrls;
          requestUrl = `${apiBase}/fal/openai/gpt-image-2/edit`;
        }

        addLog(`Sending POST ${requestUrl} (JSON)...`);
        
        const res = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(payload)
        });

        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch(e) {
          throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
        }
        
        addLog(`Response Status: ${res.status}`);
        
        if (!res.ok) {
           throw new Error(`API Error: ${data.message || data.error?.message || res.statusText}`);
        }
        
        if (data.status === "IN_QUEUE" && data.status_url && data.response_url) {
          let statusUrl = data.status_url;
          let responseUrl = data.response_url;

          if (requestMode === 'server') {
             try {
               const parsedStatus = new URL(statusUrl);
               statusUrl = `/api/t8star${parsedStatus.pathname}`;
               const parsedResp = new URL(responseUrl);
               responseUrl = `/api/t8star${parsedResp.pathname}`;
             } catch(e) {}
          }
          
          let attempts = 0;
          let isComplete = false;
          let maxAttempts = 600;
          while (attempts < maxAttempts) {
             attempts++;
             await new Promise(r => setTimeout(r, 5000));
             addLog(`Polling FAL status... (Attempt ${attempts})`);
             
             const statusRes = await fetch(statusUrl, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
             });
             
             const statusText = await statusRes.text();
             let statusData;
             try {
                statusData = JSON.parse(statusText);
             } catch(e) {
                continue;
             }
             
             if (statusData.status === "COMPLETED") {
                const resultRes = await fetch(responseUrl, {
                   headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                const resultText = await resultRes.text();
                try {
                   data = JSON.parse(resultText);
                   isComplete = true;
                   break;
                } catch(e) {
                   throw new Error(`Invalid JSON in final response: ${resultText.substring(0, 100)}`);
                }
             }
             
             if (statusData.status === "FAILED") {
                throw new Error(`FAL task failed: ${JSON.stringify(statusData)}`);
             }
          }
          if (!isComplete) throw new Error("Timed out waiting for FAL queue.");
        }
        
        if (data.images && data.images.length > 0 && data.images[0].url) {
           const resUrl = data.images[0].url;
           setResultImg(resUrl);
           addLog(`Final URL: ${resUrl}`);
           const newHistoryItem: GenerationHistory = {
             id: Date.now().toString(),
             url: resUrl,
             prompt: prompt,
             timestamp: Date.now()
           };
           setHistory(prev => [newHistoryItem, ...prev].slice(0, 50));
        } else {
           throw new Error(`Unexpected Data structure: ${JSON.stringify(data).substring(0, 200)}`);
        }

      } else if (model === 'qwen-image-2.1-pro') {
        const is2k = resolution.toLowerCase() === '2k' || resolution.toLowerCase() === '4k';
        const qwenSizes1k: Record<string, string> = {
          "1:1": "1024*1024", "16:9": "1280*720", "9:16": "720*1280", "4:3": "1152*864", "3:4": "864*1152",
          "3:2": "1216*832", "2:3": "832*1216", "5:4": "1120*896", "4:5": "896*1120", "2:1": "1440*720",
          "1:2": "720*1440", "21:9": "1536*640", "9:21": "640*1536"
        };
        const qwenSizes2k: Record<string, string> = {
          "1:1": "2048*2048", "16:9": "2560*1440", "9:16": "1440*2560", "4:3": "2304*1728", "3:4": "1728*2304",
          "3:2": "2432*1664", "2:3": "1664*2432", "5:4": "2240*1792", "4:5": "1792*2240", "2:1": "2880*1440",
          "1:2": "1440*2880", "21:9": "3072*1280", "9:21": "1280*3072"
        };
        const targetSize = is2k ? (qwenSizes2k[aspectRatio] || "2048*2048") : (qwenSizes1k[aspectRatio] || "1024*1024");
        const contentItems: any[] = [];
        if (refImagePreviews.length > 0) {
          refImagePreviews.forEach(img => contentItems.push({ image: img }));
        }
        contentItems.push({ text: prompt });

        const qwenPayload = {
          model: "qwen-image-2.1-pro",
          input: {
            messages: [{ role: "user", content: contentItems }]
          },
          parameters: {
            prompt_extend: true,
            size: targetSize,
            n: 1
          }
        };

        addLog(`Submitting task to Qianwen /api/qianwen-generation (Target: https://maas.qianwenaiapi.com)...`);
        const res = await fetch("/api/qianwen-generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiUrl: "https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation",
            apiKey: apiKey,
            payload: qwenPayload
          })
        });

        const text = await res.text();
        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
        }

        if (!res.ok) {
          throw new Error(data.message || data.error?.message || `HTTP ${res.status}`);
        }

        let resUrl = "";
        const outputObj = data.output || data;
        if (outputObj.choices?.[0]?.message?.content) {
          const c = outputObj.choices[0].message.content;
          if (Array.isArray(c)) {
            const img = c.find((item: any) => item.image || item.url);
            if (img) resUrl = img.image || img.url;
          } else if (typeof c === "string" && c.startsWith("http")) {
            resUrl = c;
          }
        }
        if (!resUrl && outputObj.results?.[0]) {
          resUrl = outputObj.results[0].url || outputObj.results[0].image_url;
        }
        if (!resUrl && outputObj.urls?.[0]) {
          resUrl = outputObj.urls[0];
        }
        if (!resUrl && (outputObj.url || outputObj.image_url)) {
          resUrl = outputObj.url || outputObj.image_url;
        }

        if (resUrl) {
          setResultImg(resUrl);
          addLog(`Final URL: ${resUrl}`);
          const newHistoryItem: GenerationHistory = {
            id: Date.now().toString(),
            url: resUrl,
            prompt: prompt,
            timestamp: Date.now()
          };
          setHistory(prev => [newHistoryItem, ...prev].slice(0, 50));
        } else {
          throw new Error(`Unexpected Qianwen response: ${JSON.stringify(data).substring(0, 200)}`);
        }
      } else if (model.includes('nano-banana') || model === 'gemini-3.1-flash-image-preview' || model.includes('doubao')) {
        const payload: any = {
          model: model,
          prompt: prompt,
          response_format: 'url'
        };

        if (model.includes('doubao')) {
          if (model === "doubao-seedream-4-0-250828") {
            const doubao40Map: Record<string, string> = {
              "1:1-1k": "1024x1024", "1:1-2k": "2048x2048", "1:1-4k": "4096x4096",
              "4:3-1k": "1152x864",  "4:3-2k": "2304x1728", "4:3-4k": "4704x3520",
              "3:4-1k": "864x1152",  "3:4-2k": "1728x2304", "3:4-4k": "3520x4704",
              "16:9-1k": "1280x720", "16:9-2k": "2848x1600", "16:9-4k": "5504x3040",
              "9:16-1k": "720x1280", "9:16-2k": "1600x2848", "9:16-4k": "3040x5504",
              "3:2-1k": "1248x832",  "3:2-2k": "2496x1664", "3:2-4k": "4992x3328",
              "2:3-1k": "832x1248",  "2:3-2k": "1664x2496", "2:3-4k": "3328x4992",
              "21:9-1k": "1512x648", "21:9-2k": "3136x1344", "21:9-4k": "6240x2656",
              "5:4-1k": "1120x896",  "5:4-2k": "2240x1792", "5:4-4k": "4480x3584",
              "4:5-1k": "896x1120",  "4:5-2k": "1792x2240", "4:5-4k": "3584x4480",
              "2:1-1k": "1440x720",  "2:1-2k": "2880x1440", "2:1-4k": "5760x2880",
              "1:2-1k": "720x1440",  "1:2-2k": "1440x2880", "1:2-4k": "2880x5760"
            };
            const key = `${aspectRatio}-${resolution.toLowerCase()}`;
            payload.size = doubao40Map[key] || "2048x2048";
          } else {
            payload.size = resolution.toUpperCase(); // size is e.g. 1K, 2K, 4K
          }
          if (refImagePreviews.length > 0) {
            payload.image = refImagePreviews;
          }
        } else {
          payload.aspect_ratio = aspectRatio;
          if (model === 'nano-banana-pro' || model === 'gemini-3.1-flash-image-preview') {
            payload.image_size = resolution.toUpperCase();
          }
          if (refImagePreviews.length > 0) {
            payload.image = refImagePreviews;
          }
        }

        const apiBase = requestMode === 'client' ? 'https://ai.t8star.org' : '/api/t8star';
        addLog(`Sending POST ${apiBase}/v1/images/generations (JSON)...`);
        
        const res = await fetch(`${apiBase}/v1/images/generations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(payload)
        });
        
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
        }
        
        addLog(`Response Status: ${res.status}`);
        addLog(`Response: ${JSON.stringify(data).substring(0, 200)}...`);
        
        if (!res.ok) {
          throw new Error(`API Error: ${data.message || data.error?.message || res.statusText}`);
        }
        
        if (data.data && data.data.length > 0 && data.data[0].url) {
          const resUrl = data.data[0].url;
          setResultImg(resUrl);
          addLog(`Final URL: ${resUrl}`);
          
          const newHistoryItem: GenerationHistory = {
            id: Date.now().toString(),
            url: resUrl,
            prompt: prompt,
            timestamp: Date.now()
          };
          setHistory(prev => [newHistoryItem, ...prev].slice(0, 50));
        } else {
          throw new Error(`Unexpected Data structure: ${JSON.stringify(data)}`);
        }
      } else {
        const formData = new FormData();
        formData.append('prompt', prompt);
        formData.append('model', model);
        formData.append('n', '1');
        formData.append('quality', quality);
        
        if (model === 'nano-banana-pro' || model === 'gemini-3.1-flash-image-preview') {
          formData.append('image_size', resolution.toUpperCase());
        } else {
          let finalSizeStr = sizeStr;
          if (model.includes('gpt-image-2')) {
            const gptImage2Map: Record<string, string> = {
                "1:1-1k": "1024x1024", "1:1-2k": "2048x2048", "1:1-4k": "2880x2880",
                "16:9-1k": "1280x720", "16:9-2k": "2048x1152", "16:9-4k": "3840x2160",
                "9:16-1k": "720x1280", "9:16-2k": "1152x2048", "9:16-4k": "2160x3840",
                "3:2-1k": "1248x832", "3:2-2k": "2048x1360", "3:2-4k": "3456x2304",
                "2:3-1k": "832x1248", "2:3-2k": "1360x2048", "2:3-4k": "2304x3456",
                "4:3-1k": "1024x768", "4:3-2k": "2048x1536", "4:3-4k": "3200x2400",
                "3:4-1k": "768x1024", "3:4-2k": "1536x2048", "3:4-4k": "2400x3200",
                "5:4-1k": "1120x896", "5:4-2k": "1920x1536", "5:4-4k": "3200x2560",
                "4:5-1k": "896x1120", "4:5-2k": "1536x1920", "4:5-4k": "2560x3200",
                "2:1-1k": "1440x720", "2:1-2k": "2048x1024", "2:1-4k": "3840x1920",
                "1:2-1k": "720x1440", "1:2-2k": "1024x2048", "1:2-4k": "1920x3840",
                "21:9-1k": "1536x640", "21:9-2k": "2560x1088", "21:9-4k": "3840x1600",
                "9:21-1k": "640x1536", "9:21-2k": "1088x2560", "9:21-4k": "1600x3840",
            };
            finalSizeStr = gptImage2Map[`${aspectRatio}-${resolution}`] || gptImage2Map[`1:1-${resolution}`] || "1024x1024";
          }
          formData.append('size', finalSizeStr);
        }
        
        imageBlobs.forEach(item => {
          formData.append('image', item.blob, item.name);
        });
        
        const apiBase = requestMode === 'client' ? 'https://ai.t8star.org' : '/api/t8star';
        addLog(`Sending POST ${apiBase}/v1/images/edits?async=true...`);
        
        const res = await fetch(`${apiBase}/v1/images/edits?async=true`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`
          },
          body: formData
        });
        
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          addLog(`Failed to parse response: ${text.substring(0, 150)}`);
          throw new Error("Invalid JSON response");
        }
        
        addLog(`Response Status: ${res.status}`);
        addLog(`Response: ${JSON.stringify(data).substring(0, 200)}...`);
        
        if (!res.ok) {
          throw new Error(`API Error: ${data.message || data.error?.message || res.statusText}`);
        }
        
        const taskId = data.task_id || data.data?.task_id || (typeof data.data === 'string' ? data.data : null);
        if (!taskId) {
          throw new Error('No task ID returned');
        }
        
        addLog(`Task submitted. ID: ${taskId}`);
        
        let attempts = 0;
        while (attempts < 60) {
          attempts++;
          await new Promise(r => setTimeout(r, 5000));
          addLog(`Polling status... (Attempt ${attempts})`);
          
          const apiBase = requestMode === 'client' ? 'https://ai.t8star.org' : '/api/t8star';
          const statusRes = await fetch(`${apiBase}/v1/images/tasks/${taskId}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          });
          
          const statusText = await statusRes.text();
          let statusData;
          try {
            statusData = JSON.parse(statusText);
          } catch(e) {
            addLog("Parsing error in status response");
            continue;
          }

          const inner = statusData.data || {};
          const state = inner.status;
          addLog(`Status: ${state} | Progress: ${inner.progress || '0%'}`);
          
          if (state === 'SUCCESS') {
            addLog("SUCCESS! Resolving Image...");
            const resData = inner.data?.data?.[0];
            if (resData && resData.url) {
              setResultImg(resData.url);
              addLog(`Final URL: ${resData.url}`);
              
              // Add to history
              const newHistoryItem: GenerationHistory = {
                id: taskId,
                url: resData.url,
                prompt: prompt,
                timestamp: Date.now()
              };
              setHistory(prev => [newHistoryItem, ...prev].slice(0, 50)); // keep last 50
            } else {
               addLog(`Unexpected Data structure: ${JSON.stringify(inner.data).substring(0, 200)}`);
            }
            break;
          } else if (state === 'FAILURE') {
            addLog(`Task failed: ${inner.fail_reason}`);
            break;
          }
        }
      }

    } catch (err: any) {
      addLog(`Error: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 md:p-8 cursor-zoom-out"
          onClick={() => setZoomedImage(null)}
        >
          <img 
            src={zoomedImage} 
            alt="Zoomed output" 
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl mix-blend-screen"
          />
          <button 
            className="absolute top-6 right-6 text-zinc-400 hover:text-white bg-zinc-900/50 p-2 rounded-full transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setZoomedImage(null);
            }}
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <div className="col-span-1 lg:col-span-5 bg-zinc-950/80 border border-zinc-800 rounded-xl p-5 space-y-6 text-left">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 font-mono">Real API Tester</h3>
          <h2 className="text-lg font-semibold text-zinc-100 mt-1">Zhenzhen Live Test</h2>
        </div>

        <div className="space-y-4 pt-3 border-t border-zinc-950">
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono text-zinc-500 uppercase">API Key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder="sk-..."
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 focus:outline-none rounded-lg p-2.5 text-xs font-mono text-zinc-300"
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-[10px] font-mono text-zinc-500 uppercase flex items-center justify-between">
              <span>Request Mode / 请求模式</span>
              <span className="text-[10px] text-violet-400 font-bold">
                {requestMode === "client" ? "🖥️ Client Direct" : "🌐 Server Proxy"}
              </span>
            </span>
            <div className="grid grid-cols-2 gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
              <button
                type="button"
                onClick={() => setRequestMode("client")}
                className={`py-1.5 rounded-md text-[10px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-all ${
                  requestMode === "client"
                    ? "bg-violet-600 text-white shadow"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                浏览器直连
              </button>
              <button
                type="button"
                onClick={() => setRequestMode("server")}
                className={`py-1.5 rounded-md text-[10px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-all ${
                  requestMode === "server"
                    ? "bg-violet-600 text-white shadow"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                服务器代理
              </button>
            </div>
            <p className="text-[9px] text-zinc-500 leading-normal">
              💡 <b>直连推荐：</b>解决服务器访问接口带来的 `ECONNREFUSED` 或连接受限问题。
            </p>
          </div>

          <div className="space-y-1.5">
            <span className="text-[10px] font-mono text-zinc-500 uppercase">Prompt (STRING)</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-500 rounded-lg p-3 text-xs font-mono text-zinc-300"
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-[10px] font-mono text-zinc-500 uppercase">Reference Images (Optional, up to 16)</span>
            {refImagePreviews.length > 0 ? (
              <div className="flex flex-wrap gap-3 mt-2">
                {refImagePreviews.map((preview, idx) => (
                  <div key={idx} className="relative inline-block">
                    <img 
                      src={preview} 
                      alt={`Reference ${idx + 1}`} 
                      className="w-20 h-20 object-cover rounded-lg border border-zinc-800 cursor-pointer" 
                      onClick={() => setZoomedImage(preview)}
                    />
                    <button
                      onClick={() => {
                        setRefImagePreviews(prev => {
                          const newPreviews = prev.filter((_, i) => i !== idx);
                          if (newPreviews.length > 0) {
                            localStorage.setItem('Playground_refImagePreviews', JSON.stringify(newPreviews));
                          } else {
                            localStorage.removeItem('Playground_refImagePreviews');
                          }
                          return newPreviews;
                        });
                      }}
                      className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 w-5 h-5 flex items-center justify-center text-[10px] shadow-lg hover:bg-red-500 z-10"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {refImagePreviews.length < 16 && (
                  <div 
                    className={`flex items-center justify-center w-20 h-20 border-2 border-dashed rounded-lg transition-colors cursor-pointer relative overflow-hidden ${
                      isDragging ? 'border-violet-500 bg-violet-500/10' : 'border-zinc-800 hover:border-violet-500/50'
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <div className="flex flex-col items-center justify-center text-zinc-500 pointer-events-none">
                      <ImageIcon className={`w-5 h-5 mb-1 ${isDragging ? 'text-violet-400' : ''}`} />
                      <span className="text-[10px] font-mono text-center leading-tight">{isDragging ? 'Drop' : 'Add'}</span>
                    </div>
                    <input type="file" multiple accept="image/*" onChange={handleRefImageChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                  </div>
                )}
              </div>
            ) : (
              <div 
                className={`flex items-center justify-center w-full h-24 border-2 border-dashed rounded-lg transition-colors cursor-pointer relative overflow-hidden ${
                  isDragging ? 'border-violet-500 bg-violet-500/10' : 'border-zinc-800 hover:border-violet-500/50'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="flex flex-col items-center justify-center text-zinc-500 pointer-events-none">
                  <ImageIcon className={`w-6 h-6 mb-2 ${isDragging ? 'text-violet-400' : ''}`} />
                  <span className="text-xs font-mono">{isDragging ? 'Drop here' : 'Click or Drag Images (Up to 16)'}</span>
                </div>
                <input type="file" multiple accept="image/*" onChange={handleRefImageChange} className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono text-zinc-500 uppercase">Model</span>
              <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded-lg text-xs font-mono">
                <option value="gpt-image-2">gpt-image-2</option>
                <option value="gpt-image-2-all">gpt-image-2-all</option>
                <option value="gpt-image-2.5-flare">gpt-image-2.5-flare</option>
                <option value="gpt-image-2.5-sunburst">gpt-image-2.5-sunburst</option>
                <option value="gpt-image-2-fal">gpt-image-2-fal</option>
                <option value="nano-banana-pro-2k">nano-banana-pro-2k</option>
                <option value="nano-banana-pro">nano-banana-pro</option>
                <option value="gemini-3.1-flash-image-preview">gemini-3.1-flash-image-preview</option>
                <option value="doubao-seedream-4-0-250828">doubao-seedream-4-0-250828</option>
                <option value="qwen-image-2.1-pro">qwen-image-2.1-pro</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono text-zinc-500 uppercase">Quality</span>
              <select value={quality} onChange={(e) => setQuality(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded-lg text-xs font-mono">
                <option value="auto">auto</option>
                <option value="high">high</option>
                <option value="hd">hd</option>
                <option value="standard">standard</option>
                <option value="medium">medium</option>
                <option value="low">low</option>
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono text-zinc-500 uppercase">Aspect Ratio</span>
              <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded-lg text-xs font-mono">
                <option value="1:1">1:1</option>
                <option value="3:2">3:2</option>
                <option value="2:3">2:3</option>
                <option value="4:3">4:3</option>
                <option value="3:4">3:4</option>
                <option value="5:4">5:4</option>
                <option value="4:5">4:5</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="2:1">2:1</option>
                <option value="1:2">1:2</option>
                <option value="21:9">21:9</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono text-zinc-500 uppercase">Resolution</span>
              <select value={resolution} onChange={(e) => setResolution(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded-lg text-xs font-mono">
                <option value="1k">1k</option>
                <option value="2k">2k</option>
                <option value="4k">4k</option>
              </select>
            </div>
          </div>
        </div>

        <button
          onClick={executeApiTest}
          disabled={isGenerating}
          className="w-full py-3 px-4 rounded-lg font-mono text-xs font-semibold cursor-pointer text-zinc-100 flex items-center justify-center space-x-2 bg-violet-600 hover:bg-violet-500"
        >
          {isGenerating ? <RefreshCw className="h-4 w-4 animate-spin text-violet-400" /> : <Sparkles className="h-4 w-4 text-violet-300" />}
          <span>{isGenerating ? 'Testing API...' : 'Run Test'}</span>
        </button>
      </div>

      <div className="col-span-1 lg:col-span-7 space-y-6">
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl flex flex-col" style={{ minHeight: '400px' }}>
          <div className="bg-zinc-900/50 border-b border-zinc-800/80 p-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className={`h-2.5 w-2.5 rounded-full ${isGenerating ? 'bg-amber-500 animate-pulse' : 'bg-zinc-700'}`}></div>
              <span className="font-mono text-xs text-zinc-300 font-semibold uppercase">API Terminal</span>
            </div>
          </div>

          <div className="p-4 font-mono text-[10px] text-zinc-400 bg-zinc-950 space-y-1.5 text-left overflow-y-auto max-h-[300px]">
            {logs.map((log, idx) => (
              <div key={idx} className="flex gap-2">
                <span className="text-zinc-600">[{new Date().toLocaleTimeString()}]</span>
                <span className={log.includes('Error') || log.includes('failed') ? 'text-red-400' : log.includes('SUCCESS') ? 'text-green-400' : ''}>{log}</span>
              </div>
            ))}
            {resultImg && (
              <div className="mt-4 p-2 bg-zinc-900 border border-zinc-800 rounded-lg flex justify-center">
                <img 
                  src={resultImg} 
                  alt="result" 
                  className="max-h-64 object-contain rounded cursor-zoom-in" 
                  onClick={() => setZoomedImage(resultImg)}
                />
              </div>
            )}
          </div>
        </div>

        {/* History Panel */}
        <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-5 text-left">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2 text-zinc-400">
              <History className="w-4 h-4" />
              <h3 className="text-xs font-semibold uppercase tracking-wider font-mono">Generation History</h3>
            </div>
            {history.length > 0 && (
              <button 
                onClick={() => setHistory([])}
                className="text-[10px] font-mono text-zinc-500 hover:text-red-400 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>
          
          {history.length === 0 ? (
            <div className="text-center py-8 text-zinc-600 text-xs font-mono border border-dashed border-zinc-800 rounded-lg">
              No generations yet. Images will be saved here automatically.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {history.map((item) => (
                <div key={item.id} className="group relative aspect-square bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden flex-shrink-0 cursor-zoom-in" onClick={() => setZoomedImage(item.url)}>
                  <img src={item.url} alt={item.prompt} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                    <p className="text-[10px] text-white font-mono line-clamp-2" title={item.prompt}>{item.prompt}</p>
                    <p className="text-[9px] text-zinc-400 font-mono mt-1">{new Date(item.timestamp).toLocaleTimeString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
