//Users/apple/sanqinMVP/apps/web/src/app/[locale]/thank-you/[order]/ClearCartOnMount.tsx

"use client";

import { useEffect } from "react";
import { usePersistentCart } from "@/lib/cart";

export function ClearCartOnMount() {
  const { clearCart } = usePersistentCart();

  useEffect(() => {
    clearCart();
  }, [clearCart]);

  // 这个组件只负责副作用，不需要渲染任何内容
  return null;
}
