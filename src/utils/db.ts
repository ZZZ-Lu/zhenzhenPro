const DB_NAME = "ImageStudioDB";
const STORE_NAME = "KeyValStore";
const DB_VERSION = 1;

// Global fallback in memory store in case IndexedDB is restricted/blocked in sandboxed iframe environment
const memoryStore = new Map<string, any>();
let isDbPermanentlyFailed = false;
let dbInstancePromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize IndexedDB and return the cached singleton IDBDatabase instance
 */
function openDB(): Promise<IDBDatabase> {
  if (dbInstancePromise) {
    return dbInstancePromise;
  }

  dbInstancePromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      dbInstancePromise = null;
      reject(new Error("IndexedDB is not supported in this environment."));
      return;
    }

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        try {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        } catch (err) {
          console.warn("IndexedDB onupgradeneeded failed:", err);
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onclose = () => {
          dbInstancePromise = null;
        };
        db.onversionchange = () => {
          db.close();
          dbInstancePromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        dbInstancePromise = null;
        reject(request.error || new Error("Failed to open IndexedDB"));
      };
    } catch (e) {
      dbInstancePromise = null;
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });

  return dbInstancePromise;
}

/**
 * Retrieve a value from IndexedDB by key. Falls back to in-memory store if DB is inaccessible.
 */
export async function getIndexedDBItem<T>(key: string): Promise<T | null> {
  if (isDbPermanentlyFailed) {
    return (memoryStore.get(key) as T) || null;
  }

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        let resolved = false;

        request.onsuccess = () => {
          const result = request.result as T;
          if (result !== undefined && result !== null) {
            memoryStore.set(key, result);
          }
          resolved = true;
          resolve(result || null);
        };

        request.onerror = (err) => {
          console.error(`IndexedDB read error for key: ${key}. Rejecting to prevent data overwrite.`, err);
          reject(request.error || new Error(`IndexedDB read error for ${key}`));
        };

        transaction.onabort = () => {
          if (!resolved) reject(new Error("Transaction aborted"));
        };

        transaction.onerror = () => {
          if (!resolved) reject(transaction.error || new Error("Transaction error"));
        };
      } catch (err) {
        dbInstancePromise = null;
        console.error(`IndexedDB transaction failed for key: ${key}. Rejecting to prevent data overwrite.`, err);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  } catch (err) {
    console.error(`Failed to open IndexedDB on get: ${key}.`, err);
    if (err instanceof Error && (err.name === "SecurityError" || err.message.includes("denied") || err.message.includes("not allowed"))) {
      isDbPermanentlyFailed = true;
      return (memoryStore.get(key) as T) || null;
    }
    throw err;
  }
}

/**
 * Store/Update a value in IndexedDB by key. Falls back to in-memory store if DB is inaccessible.
 */
export async function setIndexedDBItem<T>(key: string, value: T): Promise<void> {
  // Always update in-memory state
  memoryStore.set(key, value);

  if (isDbPermanentlyFailed) {
    throw new Error("Database permanently failed, cannot persist data");
  }

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(value, key);

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onerror = () => {
          reject(transaction.error || new Error("Transaction error"));
        };

        transaction.onabort = () => {
          reject(new Error("Transaction aborted"));
        };

        request.onerror = () => {
          // Handled by transaction.onerror
        };
      } catch (err) {
        dbInstancePromise = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "SecurityError" || err.message.includes("denied") || err.message.includes("not allowed"))) {
      isDbPermanentlyFailed = true;
    }
    throw err;
  }
}

/**
 * Remove an item from IndexedDB by key.
 */
export async function removeIndexedDBItem(key: string): Promise<void> {
  memoryStore.delete(key);
  if (isDbPermanentlyFailed) return;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        store.delete(key);
        transaction.oncomplete = () => {
          resolve();
        };
        transaction.onerror = () => {
          resolve();
        };
      } catch (e) {
        dbInstancePromise = null;
        resolve();
      }
    });
  } catch (e) {
    // Fallback safely
  }
}

/**
 * Utility to convert base64 to Blob
 */
export async function base64ToBlob(base64: string, mime?: string): Promise<Blob> {
  // If it's already a blob-like URL or web URL, we might need a different approach, 
  // but usually it's a data URL from the API.
  if (base64.startsWith("data:")) {
    const res = await fetch(base64);
    return await res.blob();
  }
  
  // Minimal fallback for raw base64 if needed
  const contentType = mime || "image/png";
  const sliceSize = 512;
  const byteCharacters = atob(base64);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  return new Blob(byteArrays, { type: contentType });
}

/**
 * Utility to convert Blob to base64
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Request persistent storage permission from the browser so that
 * IndexedDB data is not automatically cleared under disk pressure.
 */
export async function requestStoragePersistence(): Promise<boolean> {
  if (typeof window === "undefined" || !navigator.storage) {
    return false;
  }

  try {
    // 1. Check if already persisted
    let isPersisted = await navigator.storage.persisted();
    if (isPersisted) {
      console.log("Storage is already persistent.");
      return true;
    }

    // 2. Request persistence if not already granted
    if (navigator.storage.persist) {
      isPersisted = await navigator.storage.persist();
      if (isPersisted) {
        console.log("Persistent storage permission GRANTED by browser.");
      } else {
        console.warn("Persistent storage permission DENIED/NOT SUPPORTED by browser.");
      }
      return isPersisted;
    }
  } catch (err) {
    console.warn("Failed to request persistent storage:", err);
  }
  return false;
}


export const createThumbnailToBase64 = async (
  input: string | Blob,
  maxDim: number = 256,
): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    let objectUrl = "";
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        resolve(typeof input === "string" ? input : ""); // Fallback
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);
      const result = canvas.toDataURL("image/jpeg", 0.6);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(result);
    };
    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(typeof input === "string" ? input : "");
    };
    if (input instanceof Blob) {
      objectUrl = URL.createObjectURL(input);
      img.src = objectUrl;
    } else {
      img.src = input;
    }
  });
};
