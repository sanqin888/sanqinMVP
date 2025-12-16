// apps/web/src/lib/pos-display.ts
import type { Locale } from "@/lib/order/shared";

export const POS_DISPLAY_STORAGE_KEY = "sanqin-pos-display-v1";

export type PosDisplayItem = {
  stableId: string;
  nameZh: string;
  nameEn: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

export type PosDisplaySnapshot = {
  items: PosDisplayItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

export function readPosDisplaySnapshot(): PosDisplaySnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(POS_DISPLAY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PosDisplaySnapshot;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePosDisplaySnapshot(snapshot: PosDisplaySnapshot): void {
  if (typeof window === "undefined") return;
  try {
    if (!snapshot.items.length) {
      window.localStorage.removeItem(POS_DISPLAY_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        POS_DISPLAY_STORAGE_KEY,
        JSON.stringify(snapshot),
      );
    }
  } catch (err) {
    console.warn("Failed to write POS display snapshot:", err);
  }
}

export function clearPosDisplaySnapshot(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(POS_DISPLAY_STORAGE_KEY);
  } catch {
    // ignore
  }
}
