import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Capacitor } from "@capacitor/core";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add("platform-android");
  // Android APK 使用本地打包资源，不需要 PWA 缓存。清掉旧 service worker，避免手机继续显示旧表格版页面。
  const clearNativeCache = async () => {
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      if (!sessionStorage.getItem("lbc-native-cache-cleared-v2")) {
        sessionStorage.setItem("lbc-native-cache-cleared-v2", "1");
        window.location.reload();
      }
    } catch {
      // 忽略缓存清理错误，不影响应用启动。
    }
  };
  void clearNativeCache();

  const scrollFocusedInputIntoView = (event: FocusEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
    window.setTimeout(() => {
      target.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });
    }, 80);
  };
  document.addEventListener("focusin", scrollFocusedInputIntoView);
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
