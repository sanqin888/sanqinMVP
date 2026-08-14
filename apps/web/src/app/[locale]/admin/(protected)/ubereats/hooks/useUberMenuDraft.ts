"use client";
import { useCallback } from 'react';
import { loadMenuDraft } from '../api/uberAdminApi';
import type { UberMenuDraftDiffResponse, UberMenuDraftResponse } from '../types';
import { useVisibleResource } from './useVisibleResource';
export function useUberMenuDraft(storeId: string, visible: boolean) {
  const loader = useCallback(async (signal: AbortSignal) => {
    if (!storeId) return { draft: null, diff: null };
    return loadMenuDraft(storeId, signal);
  }, [storeId]);
  const resource = useVisibleResource(visible && Boolean(storeId), loader, { draft: null, diff: null } as { draft: UberMenuDraftResponse | null; diff: UberMenuDraftDiffResponse | null });
  const loadStoreMenuDraft = (targetStoreId?: string, options?: { keepSelection?: boolean }) => { void targetStoreId; void options; return resource.retry(); };
  return { menuDraft: resource.data.draft, menuDiff: resource.data.diff, menuLoading: resource.loading, menuFetchedAt: resource.lastUpdated, menuError: resource.error, loadMenuDraft: loadStoreMenuDraft };
}
