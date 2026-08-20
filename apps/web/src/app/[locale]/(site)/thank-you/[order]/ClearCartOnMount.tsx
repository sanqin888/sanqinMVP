//Users/apple/sanqinMVP/apps/web/src/app/[locale]/thank-you/[order]/ClearCartOnMount.tsx

"use client";

import { useEffect } from "react";

const STORAGE_KEY = "sanqin-cart"; // ✅ 和 cart.ts 里的一致

export function ClearCartOnMount() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      // 清空本地持久化购物车，下次进入 order 页面就是空的
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  // 这个组件只负责副作用，不需要渲染任何内容
  return null;
}
