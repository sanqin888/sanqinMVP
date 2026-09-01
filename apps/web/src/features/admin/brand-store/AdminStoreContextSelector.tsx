'use client';

import { Plus, Store, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  createAdminStore,
  fetchStaffStoreConfig,
  fetchStaffStores,
  type StoreDirectoryEntryView,
} from '@/lib/api/brand-store';
import type { Locale } from '@/lib/i18n/locales';

const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function AdminStoreContextSelector({
  locale,
  context,
  canCreateStore,
}: {
  locale: Locale;
  context: 'store' | 'catalog' | 'operations';
  canCreateStore: boolean;
}) {
  const isZh = locale === 'zh';
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stores, setStores] = useState<StoreDirectoryEntryView[]>([]);
  const [configuredStoreStableId, setConfiguredStoreStableId] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [storeStableId, setStoreStableId] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);

    void Promise.all([fetchStaffStores(), fetchStaffStoreConfig()])
      .then(([storeList, configuredStore]) => {
        if (cancelled) return;
        setStores(storeList);
        setConfiguredStoreStableId(configuredStore.storeStableId);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const requestedStoreStableId = searchParams.get('store')?.trim() ?? '';
  const selectedStoreStableId = useMemo(() => {
    if (
      requestedStoreStableId &&
      stores.some((store) => store.storeStableId === requestedStoreStableId)
    ) {
      return requestedStoreStableId;
    }
    if (
      configuredStoreStableId &&
      stores.some((store) => store.storeStableId === configuredStoreStableId)
    ) {
      return configuredStoreStableId;
    }
    return stores[0]?.storeStableId ?? '';
  }, [configuredStoreStableId, requestedStoreStableId, stores]);
  const stableIdDuplicate = useMemo(() => {
    const candidate = storeStableId.trim().toLowerCase();
    if (!candidate) return false;
    return stores.some(
      (store) => store.storeStableId.toLowerCase() === candidate,
    );
  }, [storeStableId, stores]);

  useEffect(() => {
    const shouldFillMissingStore =
      context === 'operations' &&
      !requestedStoreStableId &&
      Boolean(selectedStoreStableId);
    const shouldReplaceInvalidStore =
      Boolean(requestedStoreStableId) &&
      Boolean(selectedStoreStableId) &&
      requestedStoreStableId !== selectedStoreStableId;

    if (
      loading ||
      failed ||
      (!shouldFillMissingStore && !shouldReplaceInvalidStore)
    ) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('store', selectedStoreStableId);
    router.replace(`${pathname}?${nextParams.toString()}`);
  }, [
    context,
    failed,
    loading,
    pathname,
    requestedStoreStableId,
    router,
    searchParams,
    selectedStoreStableId,
  ]);

  function navigateToStore(nextStoreStableId: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('store', nextStoreStableId);
    router.replace(`${pathname}?${nextParams.toString()}`);
  }

  async function handleCreateStore() {
    const normalizedName = storeName.trim();
    const normalizedStableId = storeStableId.trim();
    setCreateError(null);

    if (!normalizedName) {
      setCreateError(isZh ? '请输入门店名称。' : 'Enter a store name.');
      return;
    }
    if (
      !normalizedStableId ||
      normalizedStableId.length > 80 ||
      !STABLE_ID_PATTERN.test(normalizedStableId)
    ) {
      setCreateError(
        isZh
          ? 'Stable ID 必须以字母或数字开头，并且只能包含字母、数字、_ 或 -。'
          : 'Stable ID must start with a letter or number and contain only letters, numbers, _ or -.',
      );
      return;
    }

    if (stableIdDuplicate) {
      setCreateError(
        isZh
          ? '这个 Stable ID 已经存在，不能重复创建。'
          : 'This Stable ID already exists and cannot be reused.',
      );
      return;
    }

    setCreating(true);
    try {
      const created = await createAdminStore({
        storeName: normalizedName,
        storeStableId: normalizedStableId,
      });
      setStores((current) => [
        ...current,
        {
          storeStableId: created.storeStableId,
          storeName: created.storeName,
          isActive: created.isActive,
        },
      ]);
      setStoreName('');
      setStoreStableId('');
      setCreateOpen(false);
      navigateToStore(created.storeStableId);
    } catch {
      setCreateError(
        isZh
          ? '创建门店失败。请确认 Stable ID 没有重复后再试。'
          : 'Failed to create the store. Confirm the Stable ID is unique and try again.',
      );
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="border-b border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 sm:px-6 xl:px-8">
        {isZh ? '正在加载门店…' : 'Loading stores…'}
      </div>
    );
  }

  if (failed || stores.length === 0) {
    return (
      <div className="border-b border-slate-200 bg-white px-4 py-3 text-sm text-red-700 sm:px-6 xl:px-8">
        {isZh ? '无法加载门店列表。' : 'Unable to load the store list.'}
      </div>
    );
  }

  return (
    <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6 xl:px-8">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 sm:max-w-md">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              {isZh ? '当前门店' : 'Current store'}
            </span>
            <span className="relative block">
              <Store
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <select
                value={selectedStoreStableId}
                onChange={(event) => navigateToStore(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-10 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#87362E] focus:ring-2 focus:ring-[#87362E]/15"
              >
                {stores.map((store) => (
                  <option key={store.storeStableId} value={store.storeStableId}>
                    {store.storeName} · {store.storeStableId}
                    {store.isActive ? '' : isZh ? '（停用）' : ' (inactive)'}
                  </option>
                ))}
              </select>
            </span>
          </label>

          {context === 'catalog' ? (
            <p className="max-w-xl text-xs leading-5 text-amber-700">
              {isZh
                ? '当前 Catalog 仍为品牌级共享菜单。门店选择器已预留多门店上下文，但本轮不会伪装成门店独立菜单。'
                : 'Catalog is still shared at brand level. The store selector reserves multi-store context without pretending menu data is store-specific yet.'}
            </p>
          ) : null}
        </div>

        {context === 'store' && canCreateStore ? (
          <div className="w-full xl:w-[430px]">
            {!createOpen ? (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="flex min-h-11 w-full items-center justify-between rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-2 text-left outline-none transition hover:border-[#87362E]/40 hover:bg-[#87362E]/5 focus-visible:ring-2 focus-visible:ring-[#87362E]/25"
              >
                <span>
                  <span className="block text-sm font-semibold text-slate-900">
                    {isZh ? '新增门店' : 'Add store'}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {isZh ? '创建门店名称与唯一 Stable ID' : 'Create a store name and unique Stable ID'}
                  </span>
                </span>
                <Plus className="size-5 text-[#87362E]" aria-hidden="true" />
              </button>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      {isZh ? '新增门店' : 'Add store'}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {isZh
                        ? 'Stable ID 创建后作为业务身份使用，不从门店名称自动生成。'
                        : 'Stable ID becomes the business identity after creation and is not derived automatically from the store name.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateOpen(false);
                      setCreateError(null);
                    }}
                    aria-label={isZh ? '关闭新增门店' : 'Close add store'}
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-900"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <label className="text-xs font-medium text-slate-700">
                    {isZh ? '门店名称' : 'Store name'}
                    <input
                      value={storeName}
                      onChange={(event) => setStoreName(event.target.value)}
                      maxLength={120}
                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#87362E] focus:ring-2 focus:ring-[#87362E]/15"
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-700">
                    Stable ID
                    <input
                      value={storeStableId}
                      onChange={(event) => setStoreStableId(event.target.value)}
                      maxLength={80}
                      spellCheck={false}
                      placeholder="4750_Yonge_Street"
                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm text-slate-900 outline-none focus:border-[#87362E] focus:ring-2 focus:ring-[#87362E]/15"
                    />
                  </label>
                </div>

                {stableIdDuplicate ? (
                  <p role="alert" className="mt-3 text-xs font-medium text-red-700">
                    {isZh
                      ? '这个 Stable ID 已经存在，不能保存。'
                      : 'This Stable ID already exists and cannot be saved.'}
                  </p>
                ) : createError ? (
                  <p role="alert" className="mt-3 text-xs font-medium text-red-700">
                    {createError}
                  </p>
                ) : null}

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleCreateStore()}
                    disabled={creating || stableIdDuplicate}
                    className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#87362E] px-4 py-2 text-sm font-semibold text-white outline-none transition hover:bg-[#762f28] focus-visible:ring-2 focus-visible:ring-[#87362E]/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creating
                      ? isZh
                        ? '创建中…'
                        : 'Creating…'
                      : isZh
                        ? '创建门店'
                        : 'Create store'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
