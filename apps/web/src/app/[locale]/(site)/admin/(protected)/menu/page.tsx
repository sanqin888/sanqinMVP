//apps/web/src/app/[locale]/admin/(protected)/menu/page.tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import { ImageLibraryModal } from '@/components/admin/ImageLibraryModal';
import type { Locale } from '@/lib/i18n/locales';
import type {
  AdminMenuCategoryDto,
  AdminMenuFullResponse,
  MenuItemWithBindingsDto,
  MenuPackagingTypeDto,
  MenuTemplateLite,
} from '@shared/menu';

type SavingState = {
  itemStableId: string | null;
  error: string | null;
};
type UberSyncStatus =
  | 'SYNCED'
  | 'SYNC_REQUESTED'
  | 'SKIPPED_NOT_PUBLISHED'
  | 'FAILED';

type AvailabilityTarget = {
  stableId: string;
  label: string;
};

type BindDraft = {
  templateGroupStableId: string;
  minSelect: string;
  maxSelect: string; // "" => null
  sortOrder: string;
  isRequired: boolean; // UI helper => minSelect>=1
  /** Empty means this option affects every packaging used by the item. */
  affectedPackagingTypeStableId: string;
};

type BindingEditDraft = {
  minSelect: string;
  maxSelect: string; // "" => null
  sortOrder: string;
  affectedPackagingTypeStableId: string;
};

type FixedComponentDraft = {
  componentItemStableId: string;
  quantity: string;
};

function createEmptyBindDraft(): BindDraft {
  return {
    templateGroupStableId: '',
    minSelect: '',
    maxSelect: '',
    sortOrder: '',
    isRequired: false,
    affectedPackagingTypeStableId: '',
  };
}

type CreateCategoryPayload = {
  nameEn: string;
  nameZh?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

type CreateItemPayload = {
  categoryStableId: string;
  nameEn: string;
  nameZh?: string | null;
  basePriceCents: number;
  sortOrder?: number;
  isAvailable?: boolean;
  visibility?: "PUBLIC" | "HIDDEN";
  isVisibleOnMainMenu?: boolean;
  publishToUberEats?: boolean;
};

type CategoryEditDraft = {
  nameEn: string;
  nameZh: string;
  sortOrder: string;
};

const BIND_ENDPOINT = (itemStableId: string) =>
  `/admin/menu/items/${encodeURIComponent(itemStableId)}/option-group-bindings`;

const UNBIND_ENDPOINT = (
  itemStableId: string,
  templateGroupStableId: string,
) =>
  `/admin/menu/items/${encodeURIComponent(itemStableId)}/option-group-bindings/${encodeURIComponent(
    templateGroupStableId,
  )}`;

function toIntOrNull(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toIntOrZero(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function isTempUnavailable(tempUnavailableUntil?: string | null): boolean {
  if (!tempUnavailableUntil) return false;
  const parsed = Date.parse(tempUnavailableUntil);
  if (!Number.isFinite(parsed)) return false;
  return parsed > Date.now();
}

function itemStatusLabel(isZh: boolean, isAvailable: boolean, tempUntil: string | null): string {
  if (!isAvailable) return isZh ? '下架' : 'Off';
  if (tempUntil && isTempUnavailable(tempUntil)) return isZh ? '今日下架' : 'Off today';
  return isZh ? '在售' : 'On';
}


export default function AdminMenuPage() {
  const { locale } = useParams<{ locale: Locale }>();
  const isZh = locale === 'zh';

  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [categories, setCategories] = useState<AdminMenuCategoryDto[]>([]);
  const [templates, setTemplates] = useState<MenuTemplateLite[]>([]);
  const [packagingTypes, setPackagingTypes] = useState<MenuPackagingTypeDto[]>([]);
  const [newPackagingName, setNewPackagingName] = useState('');
  const [creatingPackaging, setCreatingPackaging] = useState(false);

  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<SavingState>({ itemStableId: null, error: null });
  const [uberSyncByItem, setUberSyncByItem] = useState<Record<string, UberSyncStatus>>({});

  const [editingCategoryStableId, setEditingCategoryStableId] = useState<string | null>(null);
  const [categoryEditDrafts, setCategoryEditDrafts] = useState<
    Record<string, CategoryEditDraft>
  >({});
  const [categorySavingId, setCategorySavingId] = useState<string | null>(null);

  const [unbindingId, setUnbindingId] = useState<string | null>(null);
  const [bindingItemId, setBindingItemId] = useState<string | null>(null);
  const [bindingUpdateId, setBindingUpdateId] = useState<string | null>(null);

  const [bindDrafts, setBindDrafts] = useState<Record<string, BindDraft>>({});
  const [fixedComponentDrafts, setFixedComponentDrafts] = useState<
    Record<string, FixedComponentDraft>
  >({});
  const [bindingEdits, setBindingEdits] = useState<
    Record<string, Record<string, BindingEditDraft>>
  >({});
  const [availabilityTarget, setAvailabilityTarget] = useState<AvailabilityTarget | null>(null);
  const [imageUploads, setImageUploads] = useState<
    Record<string, { uploading: boolean; error: string | null }>
  >({});
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [activeItemForImage, setActiveItemForImage] = useState<{
    catId: string;
    itemId: string;
  } | null>(null);

  // ----- Create category form -----
  const [newCatNameEn, setNewCatNameEn] = useState('');
  const [newCatNameZh, setNewCatNameZh] = useState('');
  const [newCatSortOrder, setNewCatSortOrder] = useState('0');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [createCategoryError, setCreateCategoryError] = useState<string | null>(null);

  // ----- Create item form per category -----
  const [newItemDraft, setNewItemDraft] = useState<
    Record<
      string,
      {
        nameEn: string;
        nameZh: string;
        basePriceCents: string;
        sortOrder: string;
        publishToUberEats: boolean;
      }
    >
  >({});

  const templateByStableId = useMemo(() => {
    const m = new Map<string, MenuTemplateLite>();
    for (const t of templates) m.set(t.templateGroupStableId, t);
    return m;
  }, [templates]);

  const allMenuItems = useMemo(
    () => categories.flatMap((category) => category.items),
    [categories],
  );
  const menuItemByStableId = useMemo(
    () => new Map(allMenuItems.map((item) => [item.stableId, item])),
    [allMenuItems],
  );

  function getBindDraft(itemStableId: string): BindDraft {
    return bindDrafts[itemStableId] ?? createEmptyBindDraft();
  }

  function getFixedComponentDraft(itemStableId: string): FixedComponentDraft {
    return (
      fixedComponentDrafts[itemStableId] ?? {
        componentItemStableId: '',
        quantity: '1',
      }
    );
  }

  function getBindingEditDraft(
    itemStableId: string,
    templateGroupStableId: string,
    current: {
      minSelect: number;
      maxSelect: number | null;
      sortOrder: number;
      affectedPackagingTypeStableIds: string[];
    },
  ): BindingEditDraft {
    return (
      bindingEdits[itemStableId]?.[templateGroupStableId] ?? {
        minSelect: String(current.minSelect ?? 0),
        maxSelect: current.maxSelect == null ? '' : String(current.maxSelect),
        sortOrder: String(current.sortOrder ?? 0),
        affectedPackagingTypeStableId:
          current.affectedPackagingTypeStableIds[0] ?? '',
      }
    );
  }

  function updateBindingEditDraft(
    itemStableId: string,
    templateGroupStableId: string,
    patch: Partial<BindingEditDraft>,
    current: {
      minSelect: number;
      maxSelect: number | null;
      sortOrder: number;
      affectedPackagingTypeStableIds: string[];
    },
  ) {
    setBindingEdits((prev) => ({
      ...prev,
      [itemStableId]: {
        ...(prev[itemStableId] ?? {}),
        [templateGroupStableId]: {
          ...getBindingEditDraft(itemStableId, templateGroupStableId, current),
          ...patch,
        },
      },
    }));
  }

  function toggleItemExpanded(itemStableId: string) {
    setExpandedItems((prev) => ({ ...prev, [itemStableId]: !prev[itemStableId] }));
  }

  function updateItemField<K extends keyof MenuItemWithBindingsDto>(
    categoryStableId: string,
    itemStableId: string,
    field: K,
    value: MenuItemWithBindingsDto[K],
  ) {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.stableId !== categoryStableId
          ? cat
          : {
              ...cat,
              items: cat.items.map((item) =>
                item.stableId !== itemStableId ? item : { ...item, [field]: value },
              ),
            },
      ),
    );
  }

  function startEditCategory(category: AdminMenuCategoryDto): void {
    setEditingCategoryStableId(category.stableId);
    setCategoryEditDrafts((prev) => ({
      ...prev,
      [category.stableId]: {
        nameEn: category.nameEn,
        nameZh: category.nameZh ?? '',
        sortOrder: String(category.sortOrder ?? 0),
      },
    }));
  }

  function cancelEditCategory(): void {
    setEditingCategoryStableId(null);
  }

  async function saveCategory(categoryStableId: string): Promise<void> {
    const draft = categoryEditDrafts[categoryStableId];
    if (!draft) return;

    const nameEn = draft.nameEn.trim();
    const nameZh = draft.nameZh.trim();
    if (!nameEn) {
      alert(isZh ? '分类英文名必填' : 'Category English name is required.');
      return;
    }

    setCategorySavingId(categoryStableId);
    try {
      const updated = await apiFetch<{
        stableId: string;
        nameEn: string;
        nameZh: string | null;
        sortOrder: number;
        isActive: boolean;
      }>(`/admin/menu/categories/${encodeURIComponent(categoryStableId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nameEn,
          nameZh: nameZh ? nameZh : null,
          sortOrder: toIntOrZero(draft.sortOrder),
        }),
      });

      setCategories((prev) =>
        prev.map((cat) =>
          cat.stableId === updated.stableId
            ? {
                ...cat,
                nameEn: updated.nameEn,
                nameZh: updated.nameZh,
                sortOrder: updated.sortOrder,
                isActive: updated.isActive,
              }
            : cat,
        ),
      );
      setEditingCategoryStableId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setCategorySavingId(null);
    }
  }

  async function load(): Promise<void> {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiFetch<AdminMenuFullResponse>('/admin/menu/full');
      setCategories(data.categories ?? []);
      setTemplates(data.templatesLite ?? []);
      setPackagingTypes(data.packagingTypes ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreateCategory(): Promise<void> {
    setCreateCategoryError(null);

    const nameEn = newCatNameEn.trim();
    const nameZh = newCatNameZh.trim();
    if (!nameEn) {
      setCreateCategoryError(isZh ? '英文名称必填' : 'English name is required.');
      return;
    }

    const payload: CreateCategoryPayload = {
      nameEn,
      nameZh: nameZh ? nameZh : null,
      sortOrder: toIntOrZero(newCatSortOrder),
      isActive: true,
    };

    setCreatingCategory(true);
    try {
      await apiFetch('/admin/menu/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setNewCatNameEn('');
      setNewCatNameZh('');
      setNewCatSortOrder('0');
      await load();
    } catch (e) {
      setCreateCategoryError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingCategory(false);
    }
  }

  function getNewItemDraft(categoryStableId: string) {
    return (
      newItemDraft[categoryStableId] ?? {
        nameEn: '',
        nameZh: '',
        basePriceCents: '0',
        sortOrder: '0',
        publishToUberEats: false,
      }
    );
  }

  async function handleCreateItem(categoryStableId: string): Promise<void> {
    const draft = getNewItemDraft(categoryStableId);
    const nameEn = draft.nameEn.trim();
    const nameZh = draft.nameZh.trim();
    const basePriceCents = toIntOrZero(draft.basePriceCents);
    const sortOrder = toIntOrZero(draft.sortOrder);

    if (!nameEn) {
      alert(isZh ? '菜品英文名必填' : 'Item English name is required.');
      return;
    }

    const payload: CreateItemPayload = {
      categoryStableId,
      nameEn,
      nameZh: nameZh ? nameZh : null,
      basePriceCents,
      sortOrder,
      isAvailable: true,
      visibility: "PUBLIC",
      isVisibleOnMainMenu: true,
      publishToUberEats: draft.publishToUberEats,
    };

    try {
      await apiFetch('/admin/menu/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setNewItemDraft((prev) => ({ ...prev, [categoryStableId]: getNewItemDraft('') }));
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }


  async function handleSaveItem(categoryStableId: string, itemStableId: string): Promise<void> {
    setSaving({ itemStableId, error: null });

    try {
      const category = categories.find((c) => c.stableId === categoryStableId);
      const item = category?.items.find((i) => i.stableId === itemStableId);
      if (!item) throw new Error(isZh ? '找不到菜品' : 'Item not found.');

      const body: Record<string, unknown> = {
        categoryStableId: item.categoryStableId,
        nameEn: item.nameEn,
        nameZh: item.nameZh ?? undefined,
        basePriceCents: item.basePriceCents,
        visibility: item.visibility,
        isVisibleOnMainMenu: item.isVisibleOnMainMenu,
        publishToUberEats: item.publishToUberEats,
        labelStrategy: item.labelStrategy,
        itemKind: item.itemKind,
        packagingTypeStableIds: item.packagings.map(
          (packaging) => packaging.packagingType.stableId,
        ),
        fixedComponents: item.fixedComponents.map((component, index) => ({
          componentItemStableId: component.componentItemStableId,
          quantity: component.quantity,
          sortOrder: index,
        })),
        sortOrder: item.sortOrder,
        imageUrl: item.imageUrl ?? undefined,
        ingredientsEn: item.ingredientsEn ?? undefined,
        ingredientsZh: item.ingredientsZh ?? undefined,
      };

      await apiFetch(`/admin/menu/items/${encodeURIComponent(itemStableId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      setSaving({ itemStableId: null, error: null });
      await load();
    } catch (e) {
      setSaving({
        itemStableId: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function setItemAvailability(
    itemStableId: string,
    mode: 'ON' | 'TEMP_TODAY_OFF' | 'PERMANENT_OFF',
  ): Promise<void> {
    try {
      const result = await apiFetch<{ uberSync: { status: UberSyncStatus } }>(`/admin/menu/items/${encodeURIComponent(itemStableId)}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      setUberSyncByItem((current) => ({ ...current, [itemStableId]: result.uberSync.status }));
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function applyAvailabilityChoice(mode: 'TEMP_TODAY_OFF' | 'PERMANENT_OFF') {
    if (!availabilityTarget) return;
    const target = availabilityTarget;
    setAvailabilityTarget(null);
    await setItemAvailability(target.stableId, mode);
  }

  function applyTemplateDefaultsToBindDraft(itemStableId: string, templateGroupStableId: string) {
    const tpl = templates.find((t) => t.templateGroupStableId === templateGroupStableId);
    if (!tpl) return;

    setBindDrafts((prev) => {
      const next: BindDraft = {
        ...(prev[itemStableId] ?? createEmptyBindDraft()),
        templateGroupStableId,
        minSelect: String(tpl.defaultMinSelect ?? 0),
        maxSelect: tpl.defaultMaxSelect == null ? '' : String(tpl.defaultMaxSelect),
        sortOrder: String(tpl.sortOrder ?? 0),
        isRequired: (tpl.defaultMinSelect ?? 0) > 0,
      };
      return { ...prev, [itemStableId]: next };
    });
  }

  async function handleBindTemplateToItem(itemStableId: string): Promise<void> {
    const draft = getBindDraft(itemStableId);
    const templateGroupStableId = draft.templateGroupStableId;

    if (!templateGroupStableId) {
      alert(isZh ? '请选择一个选项组模板' : 'Please select a template group.');
      return;
    }

    const minSelectRaw = toIntOrNull(draft.minSelect);
    const maxSelectRaw = toIntOrNull(draft.maxSelect);
    const sortOrderRaw = toIntOrNull(draft.sortOrder);

    const minSelect = Math.max(0, minSelectRaw ?? 0);
    const maxSelect = maxSelectRaw == null ? null : Math.max(0, maxSelectRaw);
    const sortOrder = Math.max(0, sortOrderRaw ?? 0);

    setBindingItemId(itemStableId);
    try {
      await apiFetch(BIND_ENDPOINT(itemStableId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateGroupStableId,
          minSelect,
          maxSelect,
          sortOrder,
          isEnabled: true,
          affectedPackagingTypeStableIds: draft.affectedPackagingTypeStableId
            ? [draft.affectedPackagingTypeStableId]
            : [],
        }),
      });

      setBindDrafts((prev) => ({ ...prev, [itemStableId]: createEmptyBindDraft() }));
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBindingItemId(null);
    }
  }

  async function handleUpdateBinding(
    itemStableId: string,
    templateGroupStableId: string,
    draft: BindingEditDraft,
  ): Promise<void> {
    const minSelectRaw = toIntOrNull(draft.minSelect);
    const maxSelectRaw = toIntOrNull(draft.maxSelect);
    const sortOrderRaw = toIntOrNull(draft.sortOrder);

    const minSelect = Math.max(0, minSelectRaw ?? 0);
    const maxSelect = maxSelectRaw == null ? null : Math.max(0, maxSelectRaw);
    const sortOrder = Math.max(0, sortOrderRaw ?? 0);
    const bindingKey = `${itemStableId}:${templateGroupStableId}`;

    setBindingUpdateId(bindingKey);
    try {
      await apiFetch(BIND_ENDPOINT(itemStableId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateGroupStableId,
          minSelect,
          maxSelect,
          sortOrder,
          isEnabled: true,
          affectedPackagingTypeStableIds: draft.affectedPackagingTypeStableId
            ? [draft.affectedPackagingTypeStableId]
            : [],
        }),
      });

      setBindingEdits((prev) => {
        const next = { ...prev };
        if (next[itemStableId]) {
          const inner = { ...next[itemStableId] };
          delete inner[templateGroupStableId];
          next[itemStableId] = inner;
        }
        return next;
      });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBindingUpdateId(null);
    }
  }

  async function handleUnbindFromItem(
    itemStableId: string,
    templateGroupStableId: string,
  ): Promise<void> {
    setUnbindingId(templateGroupStableId);
    try {
      await apiFetch(UNBIND_ENDPOINT(itemStableId, templateGroupStableId), {
        method: 'DELETE',
      });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setUnbindingId(null);
    }
  }

  async function handleCreatePackaging(): Promise<void> {
    const name = newPackagingName.trim();
    if (!name) {
      alert(isZh ? '请输入包装名称' : 'Packaging name is required.');
      return;
    }
    setCreatingPackaging(true);
    try {
      await apiFetch('/admin/menu/packaging-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, isActive: true }),
      });
      setNewPackagingName('');
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingPackaging(false);
    }
  }

  async function handleImageUpload(
    categoryStableId: string,
    itemStableId: string,
    file: File,
  ): Promise<void> {
    setImageUploads((prev) => ({
      ...prev,
      [itemStableId]: { uploading: true, error: null },
    }));

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetch<{ url: string }>('/admin/upload/image', {
        method: 'POST',
        body: formData,
      });
      updateItemField(categoryStableId, itemStableId, 'imageUrl', res.url);
    } catch (e) {
      setImageUploads((prev) => ({
        ...prev,
        [itemStableId]: {
          uploading: false,
          error: e instanceof Error ? e.message : String(e),
        },
      }));
      return;
    }

    setImageUploads((prev) => ({
      ...prev,
      [itemStableId]: { uploading: false, error: null },
    }));
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="text-xl font-semibold">{isZh ? '菜单管理' : 'Menu Admin'}</h1>
        <p className="mt-4 text-sm text-slate-600">{isZh ? '加载中…' : 'Loading…'}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{isZh ? '菜单管理' : 'Menu Admin'}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {isZh
              ? '这里维护分类、菜品，以及菜品绑定的选项组模板。'
              : 'Manage categories, items, and item-to-template bindings.'}
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/${locale}/admin`}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          >
            {isZh ? '返回后台' : 'Back'}
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
          >
            {isZh ? '刷新' : 'Refresh'}
          </button>
        </div>
      </header>

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {isZh ? '加载失败：' : 'Load failed: '} {loadError}
        </div>
      ) : null}

      {/* Packaging management */}
      <section className="rounded-xl border border-slate-200 p-4">
        <div>
          <h2 className="text-base font-semibold">
            {isZh ? '包装单品' : 'Packaging'}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {isZh
              ? '这里只维护店里实际使用的包装，例如小三明治袋、16oz、38oz；每个菜品使用哪些包装在菜品编辑中选择。'
              : 'Maintain only the physical packaging used in store. Choose which packages each item uses in item editing.'}
          </p>
        </div>

        <div className="mt-4">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-sm font-medium">
              {isZh ? '新增包装' : 'Add packaging'}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={newPackagingName}
                onChange={(e) => setNewPackagingName(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm"
                placeholder={isZh ? '例如：16oz、38oz、三明治袋' : 'e.g. 16oz, 38oz, sandwich bag'}
              />
              <button
                type="button"
                disabled={creatingPackaging}
                onClick={() => void handleCreatePackaging()}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {creatingPackaging
                  ? isZh
                    ? '添加中…'
                    : 'Adding…'
                  : isZh
                    ? '添加'
                    : 'Add'}
              </button>
            </div>
            {packagingTypes.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {packagingTypes.map((type) => (
                  <span
                    key={type.stableId}
                    className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700"
                  >
                    {type.name}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

        </div>
      </section>

      {/* Create Category */}
      <section className="rounded-xl border border-slate-200 p-4">
        <h2 className="text-base font-semibold">{isZh ? '创建分类' : 'Create Category'}</h2>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="space-y-1">
            <div className="text-xs text-slate-600">{isZh ? '英文名' : 'Name (EN)'}</div>
            <input
              value={newCatNameEn}
              onChange={(e) => setNewCatNameEn(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              placeholder={isZh ? '例如: Drinks' : 'e.g. Drinks'}
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs text-slate-600">{isZh ? '中文名' : 'Name (ZH)'}</div>
            <input
              value={newCatNameZh}
              onChange={(e) => setNewCatNameZh(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              placeholder={isZh ? '例如: 饮品' : 'e.g. 饮品'}
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs text-slate-600">{isZh ? '排序' : 'Sort order'}</div>
            <input
              value={newCatSortOrder}
              onChange={(e) => setNewCatSortOrder(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              inputMode="numeric"
            />
          </label>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => void handleCreateCategory()}
              disabled={creatingCategory}
              className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {creatingCategory ? (isZh ? '创建中…' : 'Creating…') : isZh ? '创建分类' : 'Create'}
            </button>
          </div>
        </div>

        {createCategoryError ? (
          <div className="mt-3 text-sm text-red-700">{createCategoryError}</div>
        ) : null}
      </section>

      {/* Categories + Items */}
      <section className="space-y-4">
        {categories.map((cat) => {
          const isEditingCategory = editingCategoryStableId === cat.stableId;
          const categoryDraft = categoryEditDrafts[cat.stableId];

          return (
            <div key={cat.stableId} className="rounded-xl border border-slate-200">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4">
                <div>
                  <div className="text-base font-semibold">
                    {isZh ? cat.nameZh ?? cat.nameEn : cat.nameEn}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    sort:{' '}
                    {cat.sortOrder} · {cat.isActive ? (isZh ? '启用' : 'active') : isZh ? '停用' : 'inactive'}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {!isEditingCategory ? (
                    <button
                      type="button"
                      className="rounded-full border bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      onClick={() => startEditCategory(cat)}
                    >
                      {isZh ? '编辑' : 'Edit'}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="rounded-full border bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800"
                        onClick={() => void saveCategory(cat.stableId)}
                        disabled={categorySavingId === cat.stableId}
                      >
                        {categorySavingId === cat.stableId
                          ? isZh
                            ? '保存中…'
                            : 'Saving…'
                          : isZh
                            ? '保存'
                            : 'Save'}
                      </button>
                      <button
                        type="button"
                        className="rounded-full border bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        onClick={cancelEditCategory}
                      >
                        {isZh ? '取消' : 'Cancel'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isEditingCategory && categoryDraft ? (
                <div className="border-b border-slate-200 p-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                    <label className="space-y-1 md:col-span-2">
                      <div className="text-xs text-slate-600">{isZh ? '英文名' : 'Name (EN)'}</div>
                      <input
                        value={categoryDraft.nameEn}
                        onChange={(e) =>
                          setCategoryEditDrafts((prev) => ({
                            ...prev,
                            [cat.stableId]: {
                              ...prev[cat.stableId],
                              nameEn: e.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>

                    <label className="space-y-1 md:col-span-2">
                      <div className="text-xs text-slate-600">{isZh ? '中文名' : 'Name (ZH)'}</div>
                      <input
                        value={categoryDraft.nameZh}
                        onChange={(e) =>
                          setCategoryEditDrafts((prev) => ({
                            ...prev,
                            [cat.stableId]: {
                              ...prev[cat.stableId],
                              nameZh: e.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>

                    <label className="space-y-1">
                      <div className="text-xs text-slate-600">{isZh ? '排序' : 'Sort'}</div>
                      <input
                        value={categoryDraft.sortOrder}
                        onChange={(e) =>
                          setCategoryEditDrafts((prev) => ({
                            ...prev,
                            [cat.stableId]: {
                              ...prev[cat.stableId],
                              sortOrder: e.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                        inputMode="numeric"
                      />
                    </label>
                  </div>
                </div>
              ) : null}

            {/* Create item in category */}
            <div className="border-b border-slate-200 p-4">
              <h3 className="text-sm font-semibold">{isZh ? '创建菜品' : 'Create Item'}</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-6">
                <label className="space-y-1 md:col-span-2">
                  <div className="text-xs text-slate-600">{isZh ? '英文名' : 'Name (EN)'}</div>
                  <input
                    value={getNewItemDraft(cat.stableId).nameEn}
                    onChange={(e) =>
                      setNewItemDraft((prev) => ({
                        ...prev,
                        [cat.stableId]: { ...getNewItemDraft(cat.stableId), nameEn: e.target.value },
                      }))
                    }
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    placeholder={isZh ? '例如: Beef Noodles' : 'e.g. Beef Noodles'}
                  />
                </label>

                <label className="space-y-1 md:col-span-2">
                  <div className="text-xs text-slate-600">{isZh ? '中文名' : 'Name (ZH)'}</div>
                  <input
                    value={getNewItemDraft(cat.stableId).nameZh}
                    onChange={(e) =>
                      setNewItemDraft((prev) => ({
                        ...prev,
                        [cat.stableId]: { ...getNewItemDraft(cat.stableId), nameZh: e.target.value },
                      }))
                    }
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    placeholder={isZh ? '例如: 牛肉面' : 'e.g. 牛肉面'}
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-xs text-slate-600">{isZh ? '价格(分)' : 'Price (cents)'}</div>
                  <input
                    value={getNewItemDraft(cat.stableId).basePriceCents}
                    onChange={(e) =>
                      setNewItemDraft((prev) => ({
                        ...prev,
                        [cat.stableId]: {
                          ...getNewItemDraft(cat.stableId),
                          basePriceCents: e.target.value,
                        },
                      }))
                    }
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    inputMode="numeric"
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-xs text-slate-600">{isZh ? '排序' : 'Sort'}</div>
                  <input
                    value={getNewItemDraft(cat.stableId).sortOrder}
                    onChange={(e) =>
                      setNewItemDraft((prev) => ({
                        ...prev,
                        [cat.stableId]: { ...getNewItemDraft(cat.stableId), sortOrder: e.target.value },
                      }))
                    }
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    inputMode="numeric"
                  />
                </label>

                <label className="flex items-center gap-2 md:col-span-6">
                  <input
                    type="checkbox"
                    checked={getNewItemDraft(cat.stableId).publishToUberEats}
                    onChange={(e) =>
                      setNewItemDraft((prev) => ({
                        ...prev,
                        [cat.stableId]: {
                          ...getNewItemDraft(cat.stableId),
                          publishToUberEats: e.target.checked,
                        },
                      }))
                    }
                  />
                  <span className="text-sm">
                    {isZh ? '发布到 Uber Eats' : 'Publish to Uber Eats'}
                  </span>
                  <span className="text-xs text-slate-500">
                    {isZh
                      ? '只有明确开启的公开菜品才会进入 Uber Eats 菜单。'
                      : 'Only public items explicitly enabled here will be included in the Uber Eats menu.'}
                  </span>
                </label>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => void handleCreateItem(cat.stableId)}
                    className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
                  >
                    {isZh ? '创建' : 'Create'}
                  </button>
                </div>
              </div>
            </div>

            {/* Items list */}
            <div className="divide-y divide-slate-200">
              {cat.items.map((item) => {
                const expanded = !!expandedItems[item.stableId];

                return (
                  <div key={item.stableId} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold">
                          {isZh ? item.nameZh ?? item.nameEn : item.nameEn}
                        </div>
                        {uberSyncByItem[item.stableId] && (
                          <div className="mt-1 text-xs text-sky-700" role="status">
                            {uberSyncByItem[item.stableId] === 'SYNC_REQUESTED'
                              ? isZh ? '本地已下架、Uber 同步中' : 'Saved locally; syncing with Uber'
                              : uberSyncByItem[item.stableId] === 'FAILED'
                                ? isZh ? 'Uber 同步失败，可重试' : 'Uber sync failed; retry available'
                                : uberSyncByItem[item.stableId] === 'SYNCED'
                                  ? isZh ? 'Uber 同步成功' : 'Uber sync succeeded'
                                  : isZh ? '未发布到 Uber' : 'Not published to Uber'}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => toggleItemExpanded(item.stableId)}
                          className="rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                        >
                          {expanded ? (isZh ? '收起' : 'Collapse') : isZh ? '编辑' : 'Edit'}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const isOn = item.isAvailable && !isTempUnavailable(item.tempUnavailableUntil);
                            if (isOn) {
                              setAvailabilityTarget({
                                stableId: item.stableId,
                                label: isZh ? item.nameZh ?? item.nameEn : item.nameEn,
                              });
                              return;
                            }
                            void setItemAvailability(item.stableId, 'ON');
                          }}
                          className={`rounded-md px-3 py-2 text-sm ${
                            item.isAvailable && !isTempUnavailable(item.tempUnavailableUntil)
                              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                          }`}
                        >
                          {itemStatusLabel(isZh, item.isAvailable, item.tempUnavailableUntil)}
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleSaveItem(cat.stableId, item.stableId)}
                          disabled={saving.itemStableId !== null}
                          className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                        >
                          {saving.itemStableId === item.stableId
                            ? isZh
                              ? '保存中…'
                              : 'Saving…'
                            : isZh
                              ? '保存'
                              : 'Save'}
                        </button>
                      </div>
                    </div>

                    {expanded ? (
                      <div className="mt-4 space-y-5">
                        {/* Basic fields */}
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                          <label className="space-y-1 md:col-span-2">
                            <div className="text-xs text-slate-600">{isZh ? '英文名' : 'Name (EN)'}</div>
                            <input
                              value={item.nameEn}
                              onChange={(e) =>
                                updateItemField(cat.stableId, item.stableId, 'nameEn', e.target.value)
                              }
                              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                            />
                          </label>

                          <label className="space-y-1 md:col-span-2">
                            <div className="text-xs text-slate-600">{isZh ? '中文名' : 'Name (ZH)'}</div>
                            <input
                              value={item.nameZh ?? ''}
                              onChange={(e) =>
                                updateItemField(
                                  cat.stableId,
                                  item.stableId,
                                  'nameZh',
                                  e.target.value ? e.target.value : null,
                                )
                              }
                              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                            />
                          </label>

                          <label className="space-y-1">
                            <div className="text-xs text-slate-600">{isZh ? '价格(分)' : 'Price (cents)'}</div>
                            <input
                              value={String(item.basePriceCents)}
                              onChange={(e) =>
                                updateItemField(cat.stableId, item.stableId, 'basePriceCents', toIntOrZero(e.target.value))
                              }
                              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                              inputMode="numeric"
                            />
                          </label>

                          <label className="space-y-1">
                            <div className="text-xs text-slate-600">{isZh ? '排序' : 'Sort'}</div>
                            <input
                              value={String(item.sortOrder)}
                              onChange={(e) =>
                                updateItemField(cat.stableId, item.stableId, 'sortOrder', toIntOrZero(e.target.value))
                              }
                              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                              inputMode="numeric"
                            />
                          </label>

                          <label className="space-y-1 md:col-span-3">
                            <span className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={item.visibility === "PUBLIC"}
                                onChange={(e) =>
                                  updateItemField(
                                    cat.stableId,
                                    item.stableId,
                                    "visibility",
                                    e.target.checked ? "PUBLIC" : "HIDDEN",
                                  )
                                }
                              />
                              <span className="text-sm">{isZh ? "顾客渠道启用" : "Enabled for customer channels"}</span>
                            </span>
                            <span className="block text-xs text-slate-500">
                              {isZh
                                ? "关闭后顾客无法购买此菜品；会员专享请在「营销活动」中配置。"
                                : "Turn this off to block customer ordering. Configure member-only offers under Promotions."}
                            </span>
                          </label>


                          <label className="flex items-center gap-2 md:col-span-3">
                            <input
                              type="checkbox"
                              checked={item.isVisibleOnMainMenu}
                              onChange={(e) =>
                                updateItemField(
                                  cat.stableId,
                                  item.stableId,
                                  "isVisibleOnMainMenu",
                                  e.target.checked,
                                )
                              }
                            />
                            <span className="text-sm">{isZh ? "在主菜单展示" : "Show on main menu"}</span>
                          </label>

                          <label className="flex items-center gap-2 md:col-span-3">
                            <input
                              type="checkbox"
                              checked={item.isAvailable}
                              onChange={(e) =>
                                updateItemField(cat.stableId, item.stableId, 'isAvailable', e.target.checked)
                              }
                            />
                            <span className="text-sm">{isZh ? '可售' : 'Available'}</span>
                          </label>

                          <label className="space-y-1 md:col-span-6">
                            <span className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={item.publishToUberEats}
                                disabled={item.fixedComponents.length > 0}
                                onChange={(e) =>
                                  updateItemField(
                                    cat.stableId,
                                    item.stableId,
                                    'publishToUberEats',
                                    e.target.checked,
                                  )
                                }
                              />
                              <span className="text-sm">
                                {isZh ? '发布到 Uber Eats' : 'Publish to Uber Eats'}
                              </span>
                            </span>
                            <span className="block text-xs text-slate-500">
                              {item.fixedComponents.length > 0
                                ? isZh
                                  ? '固定套餐暂不支持发布到 Uber Eats；先保证 Web / POS 的组成与子菜品选项上下文准确。'
                                  : 'Fixed combos are not published to Uber Eats yet; Web/POS component and child-option context is protected first.'
                                : isZh
                                  ? '只有明确开启的公开菜品才会进入 Uber Eats 菜单。'
                                  : 'Only public items explicitly enabled here will be included in the Uber Eats menu.'}
                            </span>
                          </label>

                          <label className="space-y-1 md:col-span-2">
                            <div className="text-xs text-slate-600">{isZh ? '商品类型' : 'Item type'}</div>
                            <select
                              value={item.itemKind}
                              onChange={(e) =>
                                updateItemField(
                                  cat.stableId,
                                  item.stableId,
                                  'itemKind',
                                  e.target.value as MenuItemWithBindingsDto['itemKind'],
                                )
                              }
                              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                            >
                              <option value="FOOD">{isZh ? '食品' : 'Food'}</option>
                              <option value="BEVERAGE">{isZh ? '饮品' : 'Beverage'}</option>
                            </select>
                          </label>

                          <label className="space-y-1 md:col-span-2">
                            <div className="text-xs text-slate-600">Label Strategy</div>
                            <select
                              value={item.labelStrategy}
                              onChange={(e) =>
                                updateItemField(
                                  cat.stableId,
                                  item.stableId,
                                  'labelStrategy',
                                  e.target.value as MenuItemWithBindingsDto['labelStrategy'],
                                )
                              }
                              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                            >
                              <option value="AUTO">AUTO</option>
                              <option value="ALWAYS">ALWAYS</option>
                              <option value="NEVER">NEVER</option>
                            </select>
                          </label>

                          <div className="space-y-2 md:col-span-4">
                            <div className="text-xs text-slate-600">
                              {isZh
                                ? `使用几个包装：${item.packagings.length}`
                                : `Packages used: ${item.packagings.length}`}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {packagingTypes
                                .filter((type) => type.isActive)
                                .map((type) => {
                                  const checked = item.packagings.some(
                                    (packaging) =>
                                      packaging.packagingType.stableId === type.stableId,
                                  );
                                  return (
                                    <label
                                      key={type.stableId}
                                      className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) => {
                                          const nextPackagings = e.target.checked
                                            ? [
                                                ...item.packagings,
                                                {
                                                  sortOrder: item.packagings.length,
                                                  packagingType: type,
                                                },
                                              ]
                                            : item.packagings.filter(
                                                (packaging) =>
                                                  packaging.packagingType.stableId !==
                                                  type.stableId,
                                              );
                                          updateItemField(
                                            cat.stableId,
                                            item.stableId,
                                            'packagings',
                                            nextPackagings,
                                          );
                                        }}
                                      />
                                      <span>{type.name}</span>
                                    </label>
                                  );
                                })}
                            </div>
                            <div className="text-xs text-slate-500">
                              {isZh
                                ? '例如：肉夹馍 = 1（小三明治袋）；酸辣粉 = 2（38oz、16oz）。'
                                : 'Example: Roujiamo = 1 package; hot noodles = 2 packages.'}
                            </div>
                          </div>

                          <label className="space-y-1 md:col-span-6">
                            <div className="text-xs text-slate-600">
                              {isZh ? '图片管理' : 'Image management'}
                            </div>
                            <div className="flex flex-col gap-2 md:flex-row md:items-center">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.currentTarget.value = '';
                                  if (!file) return;
                                  void handleImageUpload(cat.stableId, item.stableId, file);
                                }}
                                disabled={imageUploads[item.stableId]?.uploading}
                                className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200 disabled:opacity-50"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveItemForImage({
                                    catId: cat.stableId,
                                    itemId: item.stableId,
                                  });
                                  setIsImageModalOpen(true);
                                }}
                                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
                              >
                                {isZh ? '从媒体库选择' : 'Select from library'}
                              </button>
                              {item.imageUrl ? (
                                <a
                                  href={item.imageUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-slate-600 underline hover:text-slate-900"
                                >
                                  {isZh ? '查看当前图片' : 'View current image'}
                                </a>
                              ) : null}
                            </div>
                            {imageUploads[item.stableId]?.error ? (
                              <div className="text-xs text-rose-600">
                                {isZh ? '上传失败：' : 'Upload failed: '}
                                {imageUploads[item.stableId]?.error}
                              </div>
                            ) : null}
                            {item.imageUrl ? (
                              <Image
                                src={item.imageUrl}
                                alt={isZh ? '菜品图片预览' : 'Item image preview'}
                                width={112}
                                height={112}
                                className="mt-2 h-28 w-28 rounded-md border border-slate-200 object-cover"
                                unoptimized
                              />
                            ) : null}
                          </label>

                          <label className="space-y-1 md:col-span-3">
                            <div className="text-xs text-slate-600">{isZh ? '配料说明(英)' : 'Ingredients (EN)'}</div>
                            <textarea
                              value={item.ingredientsEn ?? ''}
                              onChange={(e) =>
                                updateItemField(
                                  cat.stableId,
                                  item.stableId,
                                  'ingredientsEn',
                                  e.target.value ? e.target.value : null,
                                )
                              }
                              className="h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                            />
                          </label>

                          <label className="space-y-1 md:col-span-3">
                            <div className="text-xs text-slate-600">{isZh ? '配料说明(中)' : 'Ingredients (ZH)'}</div>
                            <textarea
                              value={item.ingredientsZh ?? ''}
                              onChange={(e) =>
                                updateItemField(
                                  cat.stableId,
                                  item.stableId,
                                  'ingredientsZh',
                                  e.target.value ? e.target.value : null,
                                )
                              }
                              className="h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                            />
                          </label>
                        </div>

                        {/* Fixed combo composition */}
                        <div className="rounded-lg border border-slate-200 p-4">
                          <div>
                            <h4 className="text-sm font-semibold">
                              {isZh ? '固定套餐组成' : 'Fixed combo composition'}
                            </h4>
                            <p className="mt-1 text-xs text-slate-500">
                              {isZh
                                ? '这里添加套餐固定包含的实际菜品。顾客无需逐个勾选；组成菜品自己的选项会自动继承。'
                                : 'Add the actual items included in this combo. Customers do not select them individually; component item options are inherited automatically.'}
                            </p>
                          </div>

                          <div className="mt-3 space-y-2">
                            {item.fixedComponents.length === 0 ? (
                              <div className="text-sm text-slate-600">
                                {isZh ? '当前不是固定套餐。' : 'No fixed components.'}
                              </div>
                            ) : (
                              item.fixedComponents
                                .slice()
                                .sort((a, b) => a.sortOrder - b.sortOrder)
                                .map((component) => {
                                  const componentItem = menuItemByStableId.get(
                                    component.componentItemStableId,
                                  );
                                  const componentName = componentItem
                                    ? isZh
                                      ? componentItem.nameZh ?? componentItem.nameEn
                                      : componentItem.nameEn
                                    : component.componentItemStableId;

                                  return (
                                    <div
                                      key={component.componentItemStableId}
                                      className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                                    >
                                      <span className="min-w-0 flex-1 text-sm font-medium">
                                        {componentName}
                                      </span>
                                      <label className="flex items-center gap-1 text-xs text-slate-600">
                                        <span>{isZh ? '数量' : 'Qty'}</span>
                                        <input
                                          value={String(component.quantity)}
                                          onChange={(e) => {
                                            const quantity = Math.max(
                                              1,
                                              toIntOrZero(e.target.value),
                                            );
                                            updateItemField(
                                              cat.stableId,
                                              item.stableId,
                                              'fixedComponents',
                                              item.fixedComponents.map((current) =>
                                                current.componentItemStableId ===
                                                component.componentItemStableId
                                                  ? { ...current, quantity }
                                                  : current,
                                              ),
                                            );
                                          }}
                                          className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                                          inputMode="numeric"
                                        />
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateItemField(
                                            cat.stableId,
                                            item.stableId,
                                            'fixedComponents',
                                            item.fixedComponents
                                              .filter(
                                                (current) =>
                                                  current.componentItemStableId !==
                                                  component.componentItemStableId,
                                              )
                                              .map((current, index) => ({
                                                ...current,
                                                sortOrder: index,
                                              })),
                                          )
                                        }
                                        className="rounded-md border border-rose-200 bg-white px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                                      >
                                        {isZh ? '移除' : 'Remove'}
                                      </button>
                                    </div>
                                  );
                                })
                            )}
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_100px_auto]">
                            <select
                              value={getFixedComponentDraft(item.stableId).componentItemStableId}
                              onChange={(e) =>
                                setFixedComponentDrafts((prev) => ({
                                  ...prev,
                                  [item.stableId]: {
                                    ...getFixedComponentDraft(item.stableId),
                                    componentItemStableId: e.target.value,
                                  },
                                }))
                              }
                              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                            >
                              <option value="">
                                {isZh ? '选择组成菜品…' : 'Choose component item…'}
                              </option>
                              {allMenuItems
                                .filter(
                                  (candidate) =>
                                    candidate.stableId !== item.stableId &&
                                    !item.fixedComponents.some(
                                      (component) =>
                                        component.componentItemStableId ===
                                        candidate.stableId,
                                    ),
                                )
                                .map((candidate) => (
                                  <option key={candidate.stableId} value={candidate.stableId}>
                                    {isZh
                                      ? candidate.nameZh ?? candidate.nameEn
                                      : candidate.nameEn}
                                  </option>
                                ))}
                            </select>
                            <input
                              value={getFixedComponentDraft(item.stableId).quantity}
                              onChange={(e) =>
                                setFixedComponentDrafts((prev) => ({
                                  ...prev,
                                  [item.stableId]: {
                                    ...getFixedComponentDraft(item.stableId),
                                    quantity: e.target.value,
                                  },
                                }))
                              }
                              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                              inputMode="numeric"
                              aria-label={isZh ? '组成数量' : 'Component quantity'}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const draft = getFixedComponentDraft(item.stableId);
                                const componentItemStableId =
                                  draft.componentItemStableId.trim();
                                if (!componentItemStableId) return;
                                if (item.publishToUberEats) {
                                  updateItemField(
                                    cat.stableId,
                                    item.stableId,
                                    'publishToUberEats',
                                    false,
                                  );
                                }
                                updateItemField(
                                  cat.stableId,
                                  item.stableId,
                                  'fixedComponents',
                                  [
                                    ...item.fixedComponents,
                                    {
                                      componentItemStableId,
                                      quantity: Math.max(1, toIntOrZero(draft.quantity)),
                                      sortOrder: item.fixedComponents.length,
                                    },
                                  ],
                                );
                                setFixedComponentDrafts((prev) => ({
                                  ...prev,
                                  [item.stableId]: {
                                    componentItemStableId: '',
                                    quantity: '1',
                                  },
                                }));
                              }}
                              className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
                            >
                              {isZh ? '添加组成' : 'Add component'}
                            </button>
                          </div>
                        </div>

                        {/* Option group bindings */}
                        <div className="rounded-lg border border-slate-200 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h4 className="text-sm font-semibold">{isZh ? '选项组绑定' : 'Option Group Bindings'}</h4>
                              <p className="mt-1 text-xs text-slate-500">
                                {isZh
                                  ? '绑定的是“模板组选项组”(templateGroupStableId)，解绑需要 bindingStableId。'
                                  : 'Binding uses templateGroupStableId; unbind requires bindingStableId.'}
                              </p>
                            </div>

                            <Link
                              href={`/${locale}/admin/menu/options`}
                              className="text-sm text-slate-700 underline hover:text-slate-900"
                            >
                              {isZh ? '管理选项组模板' : 'Manage templates'}
                            </Link>
                          </div>

                          {/* Bound list */}
                          <div className="mt-3 space-y-2">
                            {item.optionGroups.length === 0 ? (
                              <div className="text-sm text-slate-600">
                                {isZh ? '暂无绑定' : 'No bindings yet.'}
                              </div>
                            ) : (
                              item.optionGroups
                                .slice()
                                .sort((a, b) => a.sortOrder - b.sortOrder)
                                .map((g) => {
                                  const tplStableId = g.templateGroupStableId;
                                  const bindingStableId = g.bindingStableId ?? null;
                                  const tpl = templateByStableId.get(tplStableId) ?? g.template;
                                  const groupName = isZh
                                    ? tpl?.nameZh ?? tpl?.nameEn
                                    : tpl?.nameEn ?? tplStableId;
                                  const unbindKey = bindingStableId ?? tplStableId;
                                  const editDraft = getBindingEditDraft(
                                    item.stableId,
                                    tplStableId,
                                    {
                                      minSelect: g.minSelect,
                                      maxSelect: g.maxSelect ?? null,
                                      sortOrder: g.sortOrder,
                                      affectedPackagingTypeStableIds:
                                        g.affectedPackagingTypeStableIds ?? [],
                                    },
                                  );
                                  const bindingKey = `${item.stableId}:${tplStableId}`;

                                  return (
                                    <div
                                      key={bindingStableId ?? tplStableId}
                                      className="flex flex-col gap-3 rounded-md border border-slate-200 px-3 py-2 md:flex-row md:items-center md:justify-between"
                                    >
                                      <div className="min-w-0">
                                        <div className="truncate text-sm font-medium">
                                          {groupName}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">
                                          {tpl?.isAvailable === false ? (
                                            <span className="text-xs text-amber-700">
                                              {isZh ? '模板当前不可用' : 'Template unavailable'}
                                            </span>
                                          ) : null}
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                                          <label className="flex items-center gap-1">
                                            <span>{isZh ? '最少' : 'Min'}</span>
                                            <input
                                              value={editDraft.minSelect}
                                              onChange={(e) =>
                                                updateBindingEditDraft(item.stableId, tplStableId, {
                                                  minSelect: e.target.value,
                                                }, {
                                                  minSelect: g.minSelect,
                                                  maxSelect: g.maxSelect ?? null,
                                                  sortOrder: g.sortOrder,
                                                  affectedPackagingTypeStableIds:
                                                    g.affectedPackagingTypeStableIds ?? [],
                                                })
                                              }
                                              className="w-16 rounded-md border border-slate-200 px-2 py-1 text-xs"
                                              inputMode="numeric"
                                            />
                                          </label>
                                          <label className="flex items-center gap-1">
                                            <span>{isZh ? '最多' : 'Max'}</span>
                                            <input
                                              value={editDraft.maxSelect}
                                              onChange={(e) =>
                                                updateBindingEditDraft(item.stableId, tplStableId, {
                                                  maxSelect: e.target.value,
                                                }, {
                                                  minSelect: g.minSelect,
                                                  maxSelect: g.maxSelect ?? null,
                                                  sortOrder: g.sortOrder,
                                                  affectedPackagingTypeStableIds:
                                                    g.affectedPackagingTypeStableIds ?? [],
                                                })
                                              }
                                              className="w-16 rounded-md border border-slate-200 px-2 py-1 text-xs"
                                              inputMode="numeric"
                                              placeholder={isZh ? '不限' : '∞'}
                                            />
                                          </label>
                                          <label className="flex items-center gap-1">
                                            <span>{isZh ? '排序' : 'Sort'}</span>
                                            <input
                                              value={editDraft.sortOrder}
                                              onChange={(e) =>
                                                updateBindingEditDraft(item.stableId, tplStableId, {
                                                  sortOrder: e.target.value,
                                                }, {
                                                  minSelect: g.minSelect,
                                                  maxSelect: g.maxSelect ?? null,
                                                  sortOrder: g.sortOrder,
                                                  affectedPackagingTypeStableIds:
                                                    g.affectedPackagingTypeStableIds ?? [],
                                                })
                                              }
                                              className="w-16 rounded-md border border-slate-200 px-2 py-1 text-xs"
                                              inputMode="numeric"
                                            />
                                          </label>
                                          {item.packagings.length > 1 ? (
                                            <label className="flex items-center gap-1">
                                              <span>{isZh ? '影响包装' : 'Affects'}</span>
                                              <select
                                                value={editDraft.affectedPackagingTypeStableId}
                                                onChange={(e) =>
                                                  updateBindingEditDraft(
                                                    item.stableId,
                                                    tplStableId,
                                                    {
                                                      affectedPackagingTypeStableId:
                                                        e.target.value,
                                                    },
                                                    {
                                                      minSelect: g.minSelect,
                                                      maxSelect: g.maxSelect ?? null,
                                                      sortOrder: g.sortOrder,
                                                      affectedPackagingTypeStableIds:
                                                        g.affectedPackagingTypeStableIds ?? [],
                                                    },
                                                  )
                                                }
                                                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                                              >
                                                <option value="">
                                                  {isZh ? '全部包装' : 'All packages'}
                                                </option>
                                                {item.packagings.map((packaging) => (
                                                  <option
                                                    key={packaging.packagingType.stableId}
                                                    value={packaging.packagingType.stableId}
                                                  >
                                                    {packaging.packagingType.name}
                                                  </option>
                                                ))}
                                              </select>
                                            </label>
                                          ) : item.packagings.length === 1 ? (
                                            <span className="text-xs text-slate-500">
                                              {isZh
                                                ? `默认影响 ${item.packagings[0].packagingType.name}`
                                                : `Affects ${item.packagings[0].packagingType.name} by default`}
                                            </span>
                                          ) : null}
                                        </div>
                                      </div>

                                      <div className="flex shrink-0 items-center gap-2">
                                        <Link
                                          href={`/${locale}/admin/menu/options#group-${tplStableId}`}
                                          className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                                        >
                                          {isZh ? '查看模板' : 'View'}
                                        </Link>

                                        <button
                                          type="button"
                                          onClick={() =>
                                            void handleUpdateBinding(
                                              item.stableId,
                                              tplStableId,
                                              editDraft,
                                            )
                                          }
                                          disabled={bindingUpdateId === bindingKey}
                                          className="rounded-md bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-50"
                                        >
                                          {bindingUpdateId === bindingKey
                                            ? isZh
                                              ? '更新中…'
                                              : 'Updating…'
                                            : isZh
                                              ? '更新'
                                              : 'Update'}
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() =>
                                            void handleUnbindFromItem(item.stableId, unbindKey)
                                          }
                                          disabled={unbindingId === unbindKey}
                                          className="rounded-md bg-rose-600 px-2 py-1 text-xs text-white disabled:opacity-50"
                                        >
                                          {unbindingId === unbindKey
                                            ? isZh
                                              ? '解绑中…'
                                              : 'Removing…'
                                            : isZh
                                              ? '解绑'
                                              : 'Unbind'}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                            )}
                          </div>

                          {/* Bind new */}
                          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12">
                            <label className="space-y-1 md:col-span-3">
                              <div className="text-xs text-slate-600">{isZh ? '模板组选项组' : 'Template group'}</div>
                              <select
                                value={getBindDraft(item.stableId).templateGroupStableId}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setBindDrafts((prev) => ({
                                    ...prev,
                                    [item.stableId]: { ...(prev[item.stableId] ?? createEmptyBindDraft()), templateGroupStableId: v },
                                  }));
                                  applyTemplateDefaultsToBindDraft(item.stableId, v);
                                }}
                                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                              >
                                <option value="">{isZh ? '请选择…' : 'Select…'}</option>
                                {templates
                                  .slice()
                                  .sort((a, b) => a.sortOrder - b.sortOrder)
                                  .map((t) => (
                                    <option key={t.templateGroupStableId} value={t.templateGroupStableId}>
                                      {isZh ? (t.nameZh ?? t.nameEn) : t.nameEn}
                                    </option>
                                  ))}
                              </select>
                            </label>

                            <label className="space-y-1 md:col-span-2">
                              <div className="text-xs text-slate-600">{isZh ? '最少选' : 'Min'}</div>
                              <input
                                value={getBindDraft(item.stableId).minSelect}
                                onChange={(e) =>
                                  setBindDrafts((prev) => ({
                                    ...prev,
                                    [item.stableId]: { ...getBindDraft(item.stableId), minSelect: e.target.value },
                                  }))
                                }
                                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                                inputMode="numeric"
                              />
                            </label>

                            <label className="space-y-1 md:col-span-2">
                              <div className="text-xs text-slate-600">{isZh ? '最多选' : 'Max'}</div>
                              <input
                                value={getBindDraft(item.stableId).maxSelect}
                                onChange={(e) =>
                                  setBindDrafts((prev) => ({
                                    ...prev,
                                    [item.stableId]: { ...getBindDraft(item.stableId), maxSelect: e.target.value },
                                  }))
                                }
                                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                                inputMode="numeric"
                                placeholder={isZh ? '留空=不限' : 'blank = ∞'}
                              />
                            </label>

                            <label className="space-y-1 md:col-span-2">
                              <div className="text-xs text-slate-600">{isZh ? '排序' : 'Sort'}</div>
                              <input
                                value={getBindDraft(item.stableId).sortOrder}
                                onChange={(e) =>
                                  setBindDrafts((prev) => ({
                                    ...prev,
                                    [item.stableId]: { ...getBindDraft(item.stableId), sortOrder: e.target.value },
                                  }))
                                }
                                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                                inputMode="numeric"
                              />
                            </label>

                            {item.packagings.length > 1 ? (
                              <label className="space-y-1 md:col-span-2">
                                <div className="text-xs text-slate-600">
                                  {isZh ? '影响包装' : 'Affects'}
                                </div>
                                <select
                                  value={
                                    getBindDraft(item.stableId)
                                      .affectedPackagingTypeStableId
                                  }
                                  onChange={(e) =>
                                    setBindDrafts((prev) => ({
                                      ...prev,
                                      [item.stableId]: {
                                        ...getBindDraft(item.stableId),
                                        affectedPackagingTypeStableId:
                                          e.target.value,
                                      },
                                    }))
                                  }
                                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                                >
                                  <option value="">
                                    {isZh ? '全部包装' : 'All packages'}
                                  </option>
                                  {item.packagings.map((packaging) => (
                                    <option
                                      key={packaging.packagingType.stableId}
                                      value={packaging.packagingType.stableId}
                                    >
                                      {packaging.packagingType.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : item.packagings.length === 1 ? (
                              <div className="flex items-end md:col-span-2">
                                <span className="pb-2 text-xs text-slate-500">
                                  {isZh
                                    ? `默认影响 ${item.packagings[0].packagingType.name}`
                                    : `Affects ${item.packagings[0].packagingType.name} by default`}
                                </span>
                              </div>
                            ) : (
                              <div className="md:col-span-2" />
                            )}

                            <div className="flex items-end md:col-span-1">
                              <button
                                type="button"
                                onClick={() => void handleBindTemplateToItem(item.stableId)}
                                disabled={bindingItemId === item.stableId}
                                className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
                              >
                                {bindingItemId === item.stableId
                                  ? isZh
                                    ? '绑定中…'
                                    : 'Binding…'
                                  : isZh
                                    ? '绑定'
                                    : 'Bind'}
                              </button>
                            </div>
                          </div>
                        </div>

                        {saving.error ? (
                          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {isZh ? '保存失败：' : 'Save failed: '} {saving.error}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          );
        })}
      </section>

      {availabilityTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {isZh ? '选择下架方式' : 'Select off mode'}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {isZh ? '对' : 'For '}
              <span className="font-semibold text-slate-900">{availabilityTarget.label}</span>
              {isZh ? '设置下架方式' : ', choose how to turn off availability.'}
            </p>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => void applyAvailabilityChoice('TEMP_TODAY_OFF')}
                className="w-full rounded-full bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
              >
                {isZh ? '当日下架' : 'Off today'}
              </button>
              <button
                type="button"
                onClick={() => void applyAvailabilityChoice('PERMANENT_OFF')}
                className="w-full rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                {isZh ? '永久下架' : 'Off permanently'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setAvailabilityTarget(null)}
              className="mt-4 w-full rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50"
            >
              {isZh ? '取消' : 'Cancel'}
            </button>
          </div>
        </div>
      ) : null}

      {isImageModalOpen && activeItemForImage ? (
        <ImageLibraryModal
          isZh={isZh}
          onClose={() => {
            setIsImageModalOpen(false);
            setActiveItemForImage(null);
          }}
          onSelect={(url) => {
            updateItemField(activeItemForImage.catId, activeItemForImage.itemId, 'imageUrl', url);
            setIsImageModalOpen(false);
            setActiveItemForImage(null);
          }}
        />
      ) : null}
    </div>
  );
}
