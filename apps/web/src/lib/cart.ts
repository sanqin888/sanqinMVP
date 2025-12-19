//Users/apple/sanqinMVP/apps/web/src/lib/cart.ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CartEntry } from "@/lib/order/shared";

type CartItemOptions = CartEntry["options"];

const STORAGE_KEY = "sanqin-cart";

/**
 * 把任何乱七八糟的数据，变成一个「干净的 CartEntry[]」
 */
function normalizeOptions(input?: CartItemOptions): CartItemOptions | undefined {
  if (!input || typeof input !== "object") return undefined;

  const normalized: Record<string, string[]> = {};
  Object.entries(input).forEach(([groupId, value]) => {
    if (!groupId) return;
    const values = Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string")
      : typeof value === "string"
        ? [value]
        : [];
    const deduped = Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
    if (deduped.length > 0) {
      normalized[groupId] = deduped.sort();
    }
  });

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function buildOptionsSignature(options?: CartItemOptions) {
  if (!options) return "";
  const sortedEntries = Object.entries(options)
    .map(([groupId, values]) => [groupId, [...values].sort()] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return sortedEntries
    .map(([groupId, values]) => `${groupId}:${values.join(",")}`)
    .join("|");
}

function hashString(input: string) {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function buildCartLineId(productStableId: string, options?: CartItemOptions) {
  const signature = buildOptionsSignature(options);
  if (!signature) return productStableId;
  return `${productStableId}::${hashString(signature)}`;
}

function sanitizeCart(raw: unknown): CartEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;

      const { productStableId, stableId, quantity, notes, options, cartLineId } =
        entry as Partial<CartEntry> & {
        productStableId?: unknown;
        stableId?: unknown;
        quantity?: unknown;
        notes?: unknown;
        options?: unknown;
        cartLineId?: unknown;
      };

      const resolvedProductStableId =
        typeof productStableId === "string" && productStableId.length > 0
          ? productStableId
          : typeof stableId === "string"
            ? stableId
            : "";

      if (resolvedProductStableId.length === 0) {
        throw new Error(
          "[cart] missing productStableId in cart entry (legacy itemId is not supported anymore)",
        );
      }

      const numericQuantity =
        typeof quantity === "number"
          ? quantity
          : typeof quantity === "string"
            ? Number(quantity)
            : NaN;

      const safeQuantity = Number.isFinite(numericQuantity)
        ? Math.max(1, Math.floor(numericQuantity))
        : 1;

      const safeOptions = normalizeOptions(
        options && typeof options === "object"
          ? (options as CartItemOptions)
          : undefined,
      );

      const safeCartLineId =
        typeof cartLineId === "string" && cartLineId.length > 0
          ? cartLineId
          : buildCartLineId(resolvedProductStableId, safeOptions);

      return {
        cartLineId: safeCartLineId,
        productStableId: resolvedProductStableId,
        quantity: safeQuantity,
        notes: typeof notes === "string" ? notes : "",
        options: safeOptions,
      };
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

  const addItem = useCallback(
    (productStableId: string, options?: CartItemOptions) => {
    const normalizedOptions = normalizeOptions(options);
    const cartLineId = buildCartLineId(productStableId, normalizedOptions);
    setItems((prev) => {
      const existing = prev.find(
        (entry) => entry.cartLineId === cartLineId,
      );
      if (existing) {
        return prev.map((entry) =>
          entry.cartLineId === cartLineId
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry,
        );
      }
      return [
        ...prev,
        {
          cartLineId,
          productStableId,
          quantity: 1,
          notes: "",
          options: normalizedOptions,
        },
      ];
    });
  },
  [],
  );

  const updateQuantity = useCallback((cartLineId: string, delta: number) => {
    if (!delta) return;
    setItems((prev) =>
      prev
        .map((entry) =>
          entry.cartLineId === cartLineId
            ? { ...entry, quantity: entry.quantity + delta }
            : entry,
        )
        .filter((entry) => entry.quantity > 0),
    );
  }, []);

  const updateNotes = useCallback((cartLineId: string, notes: string) => {
    setItems((prev) =>
      prev.map((entry) =>
        entry.cartLineId === cartLineId ? { ...entry, notes } : entry,
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
