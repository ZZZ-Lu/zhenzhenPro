let originalTitle = "贞贞Pro_1.6";
let originalFavicon = "";

export const setupNotifications = () => {
  if (typeof document !== "undefined") {
    originalTitle = document.title;
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (link) {
      originalFavicon = link.href;
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        if (
          document.title === "✅ 生成成功！" ||
          document.title === "❌ 生成失败！"
        ) {
          updateSystemStatus("idle");
        }
      }
    });
  }
};

export const requestNotificationPermission = async () => {
  if ("Notification" in window && Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch (e) {
      console.warn("Notification permission request failed", e);
    }
  }
};

const setFavicon = (url: string) => {
  let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url;
};

const FAVICON_GENERATING =
  "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⏳</text></svg>";
const FAVICON_SUCCESS =
  "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>✅</text></svg>";
const FAVICON_ERROR =
  "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>❌</text></svg>";

let statusResetTimeout: any = null;

export const updateSystemStatus = (
  status: "idle" | "generating" | "success" | "error",
  count: number = 0,
) => {
  // 浏览器标签页不用显示生图中的状态
};

export const sendDesktopNotification = (
  title: string,
  options?: NotificationOptions,
) => {
  if (
    document.visibilityState === "hidden" &&
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    const notification = new Notification(title, options);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }
};
