"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CartEntry } from "@/lib/order/shared";

const STORAGE_KEY = "sanqin-cart";

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

function readInitialCart(): CartEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return sanitizeCart(parsed);
  } catch {
    return [];
  }
}

export function usePersistentCart() {
  const [items, setItems] = useState<CartEntry[]>(() => readInitialCart());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore write errors (e.g. private mode)
    }
  }, [items]);

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
