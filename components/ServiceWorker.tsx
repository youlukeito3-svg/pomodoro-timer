"use client";

import { useEffect } from "react";
import { asset } from "@/lib/basePath";

/**
 * Service Worker を登録して、圏外でもアプリを開けるようにする。
 *
 * 開発中は登録しない（キャッシュが変更の確認を邪魔するため）。
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register(asset("/sw.js"), { scope: asset("/") })
        .catch((err) => console.warn("Service Worker の登録に失敗しました", err));
    };

    // 初期表示の帯域を奪わないよう、読み込み完了後に登録する
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
