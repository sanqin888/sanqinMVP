'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Tags } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import type { Locale } from '@/lib/i18n/locales';
import {
  StaffEmptyState,
  StaffPage,
  StaffPageHeader,
} from '@/components/staff/StaffPrimitives';
import type { MenuCategoryBaseDto } from '@shared/menu';

type CategoryDraft = {
  nameEn: string;
  nameZh: string;
  sortOrder: string;
};

function toIntOrZero(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

export default function AdminMenuCategoriesPage() {
  const { locale } = useParams<{ locale: Locale }>();
  const searchParams = useSearchParams();
  const storeStableId = searchParams.get('store')?.trim() ?? '';
  const safeLocale: Locale = locale === 'zh' ? 'zh' : 'en';
  const isZh = safeLocale === 'zh';

  const [categories, setCategories] = useState<MenuCategoryBaseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newNameEn, setNewNameEn] = useState('');
  const [newNameZh, setNewNameZh] = useState('');
  const [newSortOrder, setNewSortOrder] = useState('0');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingStableId, setEditingStableId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, CategoryDraft>>({});
  const [savingStableId, setSavingStableId] = useState<string | null>(null);

  const storeScopedPath = useCallback(
    (path: string) => {
      if (!storeStableId) return path;
      const separator = path.includes('?') ? '&' : '?';
      return `${path}${separator}storeStableId=${encodeURIComponent(storeStableId)}`;
    },
    [storeStableId],
  );

  const load = useCallback(async (): Promise<void> => {
    if (!storeStableId) {
      setCategories([]);
      setLoadError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const result = await apiFetch<MenuCategoryBaseDto[]>(
        storeScopedPath('/admin/menu/categories'),
      );
      setCategories(result ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [storeScopedPath, storeStableId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCategory(): Promise<void> {
    const nameEn = newNameEn.trim();
    const nameZh = newNameZh.trim();
    setCreateError(null);

    if (!nameEn) {
      setCreateError(isZh ? '英文名称必填' : 'English name is required.');
      return;
    }

    setCreating(true);
    try {
      await apiFetch(storeScopedPath('/admin/menu/categories'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nameEn,
          nameZh: nameZh || null,
          sortOrder: toIntOrZero(newSortOrder),
          isActive: true,
        }),
      });
      setNewNameEn('');
      setNewNameZh('');
      setNewSortOrder('0');
      await load();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  }

  function startEditing(category: MenuCategoryBaseDto): void {
    setEditingStableId(category.stableId);
    setDrafts((current) => ({
      ...current,
      [category.stableId]: {
        nameEn: category.nameEn,
        nameZh: category.nameZh ?? '',
        sortOrder: String(category.sortOrder),
      },
    }));
  }

  async function saveCategory(category: MenuCategoryBaseDto): Promise<void> {
    const draft = drafts[category.stableId];
    if (!draft) return;

    const nameEn = draft.nameEn.trim();
    if (!nameEn) {
      window.alert(isZh ? '分类英文名必填' : 'Category English name is required.');
      return;
    }

    setSavingStableId(category.stableId);
    try {
      await apiFetch(
        storeScopedPath(
          `/admin/menu/categories/${encodeURIComponent(category.stableId)}`,
        ),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nameEn,
            nameZh: draft.nameZh.trim() || null,
            sortOrder: toIntOrZero(draft.sortOrder),
          }),
        },
      );
      setEditingStableId(null);
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingStableId(null);
    }
  }

  async function setCategoryActive(
    category: MenuCategoryBaseDto,
    isActive: boolean,
  ): Promise<void> {
    setSavingStableId(category.stableId);
    try {
      await apiFetch(
        storeScopedPath(
          `/admin/menu/categories/${encodeURIComponent(category.stableId)}`,
        ),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive }),
        },
      );
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingStableId(null);
    }
  }

  return (
    <StaffPage>
      <StaffPageHeader
        eyebrow={isZh ? '菜单' : 'Catalog'}
        title={isZh ? '分类管理' : 'Category management'}
        description={
          isZh
            ? '按当前门店维护菜单分类。这里使用独立的 Store-scoped 分类接口，不加载完整菜单。'
            : 'Maintain menu categories for the current store using the narrow Store-scoped category API.'
        }
      />

      {!storeStableId ? (
        <StaffEmptyState
          icon={<Tags className="size-5" aria-hidden="true" />}
          title={isZh ? '请先选择门店' : 'Select a store first'}
          description={
            isZh
              ? '选择门店后才能读取和维护该门店的菜单分类。'
              : 'Choose a store before loading or editing its menu categories.'
          }
        />
      ) : (
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 p-4">
            <h2 className="text-base font-semibold">
              {isZh ? '创建分类' : 'Create category'}
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className="space-y-1">
                <div className="text-xs text-slate-600">
                  {isZh ? '英文名' : 'Name (EN)'}
                </div>
                <input
                  value={newNameEn}
                  onChange={(event) => setNewNameEn(event.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <div className="text-xs text-slate-600">
                  {isZh ? '中文名' : 'Name (ZH)'}
                </div>
                <input
                  value={newNameZh}
                  onChange={(event) => setNewNameZh(event.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <div className="text-xs text-slate-600">
                  {isZh ? '排序' : 'Sort order'}
                </div>
                <input
                  value={newSortOrder}
                  onChange={(event) => setNewSortOrder(event.target.value)}
                  inputMode="numeric"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => void createCategory()}
                  className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {creating
                    ? isZh
                      ? '创建中…'
                      : 'Creating…'
                    : isZh
                      ? '创建分类'
                      : 'Create category'}
                </button>
              </div>
            </div>
            {createError ? (
              <div className="mt-3 text-sm text-red-700">{createError}</div>
            ) : null}
          </section>

          {loadError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {isZh ? '加载失败：' : 'Load failed: '}
              {loadError}
            </div>
          ) : null}

          <section className="space-y-3">
            {loading ? (
              <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">
                {isZh ? '加载中…' : 'Loading…'}
              </div>
            ) : categories.length === 0 ? (
              <StaffEmptyState
                icon={<Tags className="size-5" aria-hidden="true" />}
                title={isZh ? '暂无分类' : 'No categories yet'}
                description={
                  isZh
                    ? '使用上方表单创建当前门店的第一个分类。'
                    : 'Use the form above to create the first category for this store.'
                }
              />
            ) : (
              categories.map((category) => {
                const editing = editingStableId === category.stableId;
                const draft = drafts[category.stableId];

                return (
                  <div
                    key={category.stableId}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    {editing && draft ? (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                        <label className="space-y-1 md:col-span-2">
                          <div className="text-xs text-slate-600">
                            {isZh ? '英文名' : 'Name (EN)'}
                          </div>
                          <input
                            value={draft.nameEn}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [category.stableId]: {
                                  ...draft,
                                  nameEn: event.target.value,
                                },
                              }))
                            }
                            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="space-y-1 md:col-span-2">
                          <div className="text-xs text-slate-600">
                            {isZh ? '中文名' : 'Name (ZH)'}
                          </div>
                          <input
                            value={draft.nameZh}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [category.stableId]: {
                                  ...draft,
                                  nameZh: event.target.value,
                                },
                              }))
                            }
                            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="space-y-1">
                          <div className="text-xs text-slate-600">
                            {isZh ? '排序' : 'Sort'}
                          </div>
                          <input
                            value={draft.sortOrder}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [category.stableId]: {
                                  ...draft,
                                  sortOrder: event.target.value,
                                },
                              }))
                            }
                            inputMode="numeric"
                            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                          />
                        </label>
                        <div className="flex flex-wrap gap-2 md:col-span-5">
                          <button
                            type="button"
                            disabled={savingStableId === category.stableId}
                            onClick={() => void saveCategory(category)}
                            className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                          >
                            {savingStableId === category.stableId
                              ? isZh
                                ? '保存中…'
                                : 'Saving…'
                              : isZh
                                ? '保存'
                                : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingStableId(null)}
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700"
                          >
                            {isZh ? '取消' : 'Cancel'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">
                            {isZh
                              ? category.nameZh ?? category.nameEn
                              : category.nameEn}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {category.stableId} · sort {category.sortOrder} ·{' '}
                            {category.isActive
                              ? isZh
                                ? '启用'
                                : 'active'
                              : isZh
                                ? '停用'
                                : 'inactive'}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => startEditing(category)}
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700"
                          >
                            {isZh ? '编辑' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            disabled={savingStableId === category.stableId}
                            onClick={() =>
                              void setCategoryActive(
                                category,
                                !category.isActive,
                              )
                            }
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
                          >
                            {category.isActive
                              ? isZh
                                ? '停用'
                                : 'Disable'
                              : isZh
                                ? '启用'
                                : 'Enable'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </section>
        </div>
      )}
    </StaffPage>
  );
}
