//Users/apple/sanqinMVP/apps/web/src/lib/cart.ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CartEntry } from "@/lib/order/shared";

const STORAGE_KEY = "sanqin-cart";

/**
 * 把任何乱七八糟的数据，变成一个「干净的 CartEntry[]」
 */
function sanitizeCart(raw: unknown): CartEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;

      const { itemId, quantity, notes } = entry as Partial<CartEntry> & {
        itemId?: unknown;
        quantity?: unknown;
        notes?: unknown;
      };

      if (typeof itemId !== "string" || itemId.length === 0) return null;

      let numericQuantity: number;
      if (typeof quantity === "number") {
        numericQuantity = quantity;
      } else if (typeof quantity === "string") {
        numericQuantity = Number.parseInt(quantity, 10);
      } else {
        numericQuantity = 0;
      }

      if (!Number.isFinite(numericQuantity)) {
        numericQuantity = 0;
      }

      const safeQuantity = Math.max(1, Math.floor(numericQuantity));

      return {
        itemId,
        quantity: safeQuantity,
        notes: typeof notes === "string" ? notes : "",
      } satisfies CartEntry;
    })
    .filter((entry): entry is CartEntry => Boolean(entry));
}

/**
 * 读取本地存储里的购物车：
 * - 解析失败时会直接清掉这条 localStorage，避免以后再炸 JSON.parse
 */
function readInitialCart(): CartEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    return sanitizeCart(parsed);
  } catch (err) {
    // 一旦发现坏 JSON，下次就别再解析它了，直接删掉
    console.warn("Failed to parse cart from localStorage, reset to empty:", err);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore remove errors
    }
    return [];
  }
}

export function usePersistentCart() {
  const [items, setItems] = useState<CartEntry[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // 首次挂载时从 localStorage 读取
  useEffect(() => {
    setItems(readInitialCart());
    setIsInitialized(true);
  }, []);

  // 每次 items 变化，写回 localStorage（首帧未初始化时不写）
  useEffect(() => {
    if (!isInitialized || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore write errors (e.g. private mode / quota exceeded)
    }
  }, [isInitialized, items]);

  const addItem = useCallback((itemId: string) => {
    setItems((prev) => {
      const existing = prev.find((entry) => entry.itemId === itemId);
      if (existing) {
        return prev.map((entry) =>
          entry.itemId === itemId
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry,
        );
      }
      return [...prev, { itemId, quantity: 1, notes: "" }];
    });
  }, []);

  const updateQuantity = useCallback((itemId: string, delta: number) => {
    if (!delta) return;
    setItems((prev) =>
      prev
        .map((entry) =>
          entry.itemId === itemId
            ? { ...entry, quantity: entry.quantity + delta }
            : entry,
        )
        .filter((entry) => entry.quantity > 0),
    );
  }, []);

  const updateNotes = useCallback((itemId: string, notes: string) => {
    setItems((prev) =>
      prev.map((entry) =>
        entry.itemId === itemId ? { ...entry, notes } : entry,
      ),
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const totalQuantity = useMemo(
    () => items.reduce((sum, entry) => sum + entry.quantity, 0),
    [items],
  );

  return {
    items,
    addItem,
    updateQuantity,
    updateNotes,
    clearCart,
    totalQuantity,
  };
}