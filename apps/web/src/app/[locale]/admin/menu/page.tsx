// apps/web/src/app/[locale]/admin/menu/page.tsx
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  type Locale,
  type DbMenuCategory,
  type DbMenuItem,
} from "@/lib/order/shared";
import { apiFetch } from "@/lib/api-client";

type SavingState = {
  itemId: string | null;
  error: string | null;
};

type SectionCardProps = {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
};

function SectionCard({ title, children, actions }: SectionCardProps) {
  return (
    <section className="space-y-4 rounded-2xl border bg-white/80 p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

// ===== 新建菜品草稿 ===== //

type NewItemDraft = {
  stableId: string;
  nameEn: string;
  nameZh: string;
  price: string; // CAD 文本
  sortOrder: string;
  imageUrl: string;
  ingredientsEn: string;
  ingredientsZh: string;
};

function createEmptyNewItemDraft(): NewItemDraft {
  return {
    stableId: "",
    nameEn: "",
    nameZh: "",
    price: "",
    sortOrder: "0",
    imageUrl: "",
    ingredientsEn: "",
    ingredientsZh: "",
  };
}

// ===== 选项库（全局）模板：用于“绑定到菜品”下拉选择 ===== //

type OptionGroupTemplateLite = {
  id: string;
  nameEn: string;
  nameZh?: string | null;
  defaultMinSelect: number;
  defaultMaxSelect: number | null;
  sortOrder: number;
  isAvailable: boolean;
  tempUnavailableUntil: string | null;
};

type BoundOptionGroup = {
  id: string; // 绑定记录 id（或组 id，取决于后端实现）
  nameEn?: string;
  nameZh?: string | null;

  // 可能的模板 id 字段（不同后端命名兼容）
  templateId?: string | null;
  optionGroupTemplateId?: string | null;
  templateGroupId?: string | null;

  minSelect?: number;
  maxSelect?: number | null;

  isEnabled?: boolean;
  sortOrder?: number;
};

type BindDraft = {
  templateId: string;
  minSelect: string;
  maxSelect: string; // "" => null
  sortOrder: string;
  isRequired: boolean;
};

function createEmptyBindDraft(): BindDraft {
  return {
    templateId: "",
    minSelect: "",
    maxSelect: "",
    sortOrder: "",
    isRequired: false,
  };
}

function safeNum(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeNullableNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickTemplateId(g: BoundOptionGroup): string | null {
  return (
    g.templateId ??
    g.optionGroupTemplateId ??
    g.templateGroupId ??
    null
  );
}

function getBoundGroupsFromItem(item: unknown): BoundOptionGroup[] {
  const it = item as Record<string, unknown>;
  const candidates = [
    it["optionGroupBindings"],
    it["optionGroups"],
    it["boundOptionGroups"],
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as BoundOptionGroup[];
  }
  return [];
}

export default function AdminMenuPage() {
  const params = useParams<{ locale: Locale }>();
  const locale = (params?.locale === "zh" ? "zh" : "en") as Locale;
  const isZh = locale === "zh";

  const [categories, setCategories] = useState<DbMenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>(
    {},
  );

  const [saving, setSaving] = useState<SavingState>({
    itemId: null,
    error: null,
  });

  // 图片上传中的 item / draft
  const [uploadingImageForItem, setUploadingImageForItem] = useState<
    string | null
  >(null);
  const [uploadingImageForDraftCategory, setUploadingImageForDraftCategory] =
    useState<string | null>(null);

  // —— 新建分类 —— //
  const [newCategoryNameEn, setNewCategoryNameEn] = useState("");
  const [newCategoryNameZh, setNewCategoryNameZh] = useState("");
  const [newCategorySortOrder, setNewCategorySortOrder] = useState("0");
  const [creatingCategory, setCreatingCategory] = useState(false);

  // —— 新建菜品（按分类维护一份草稿） —— //
  const [newItemDrafts, setNewItemDrafts] = useState<
    Record<string, NewItemDraft>
  >({});
  const [creatingItemForCategory, setCreatingItemForCategory] = useState<
    string | null
  >(null);

  // —— 选项库模板（用于绑定） —— //
  const [templates, setTemplates] = useState<OptionGroupTemplateLite[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  // —— 绑定草稿（按 item） —— //
  const [bindDrafts, setBindDrafts] = useState<Record<string, BindDraft>>({});
  const [bindingItemId, setBindingItemId] = useState<string | null>(null);
  const [unbindingId, setUnbindingId] = useState<string | null>(null);

  const totalItems = useMemo(
    () => categories.reduce((sum, cat) => sum + cat.items.length, 0),
    [categories],
  );

  // ===== 加载菜单 ===== //

  async function reloadMenu(): Promise<void> {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiFetch<DbMenuCategory[]>("/admin/menu/full");
      const sorted = (data ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((cat) => ({
          ...cat,
          items: cat.items.slice().sort((a, b) => a.sortOrder - b.sortOrder),
        }));
      setCategories(sorted);
    } catch (err) {
      console.error(err);
      setLoadError(
        isZh
          ? "菜单加载失败，请稍后重试。"
          : "Failed to load menu. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reloadMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isZh]);

  // ===== 加载选项库模板（用于绑定下拉） ===== //

  async function loadTemplates(): Promise<void> {
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const res = await apiFetch<OptionGroupTemplateLite[]>(
        "/admin/menu/option-group-templates",
      );
      const sorted = (res ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
      setTemplates(sorted);
    } catch (e) {
      console.error(e);
      setTemplatesError(
        isZh ? "加载选项库失败，请稍后重试。" : "Failed to load option templates.",
      );
    } finally {
      setTemplatesLoading(false);
    }
  }

  useEffect(() => {
    void loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isZh]);

  // ===== 工具函数 ===== //

  function updateItemField<K extends keyof DbMenuItem>(
    categoryId: string,
    itemId: string,
    field: K,
    value: DbMenuItem[K],
  ) {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id !== categoryId
          ? cat
          : {
              ...cat,
              items: cat.items.map((item) =>
                item.id !== itemId ? item : { ...item, [field]: value },
              ),
            },
      ),
    );
  }

  function toggleItemExpanded(itemId: string) {
    setExpandedItems((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  }

  function getNewItemDraft(categoryId: string): NewItemDraft {
    return newItemDrafts[categoryId] ?? createEmptyNewItemDraft();
  }

  function updateNewItemField<K extends keyof NewItemDraft>(
    categoryId: string,
    field: K,
    value: NewItemDraft[K],
  ) {
    setNewItemDrafts((prev) => ({
      ...prev,
      [categoryId]: {
        ...(prev[categoryId] ?? createEmptyNewItemDraft()),
        [field]: value,
      },
    }));
  }

  function getBindDraft(itemId: string): BindDraft {
    return bindDrafts[itemId] ?? createEmptyBindDraft();
  }

  function updateBindDraft<K extends keyof BindDraft>(
    itemId: string,
    field: K,
    value: BindDraft[K],
  ) {
    setBindDrafts((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] ?? createEmptyBindDraft()),
        [field]: value,
      },
    }));
  }

  function applyTemplateDefaultsToBindDraft(itemId: string, templateId: string) {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;

    setBindDrafts((prev) => {
      const next: BindDraft = {
        ...(prev[itemId] ?? createEmptyBindDraft()),
        templateId,
        minSelect: String(tpl.defaultMinSelect ?? 0),
        maxSelect: tpl.defaultMaxSelect == null ? "" : String(tpl.defaultMaxSelect),
        sortOrder: String(tpl.sortOrder ?? 0),
        isRequired: (tpl.defaultMinSelect ?? 0) > 0,
      };
      return { ...prev, [itemId]: next };
    });
  }

  // ===== 图片上传 ===== //

  async function handleUploadItemImage(
    categoryId: string,
    itemId: string,
    file: File,
  ) {
    if (!file) return;

    setUploadingImageForItem(itemId);
    setSaving((prev) => ({ ...prev, error: null }));

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await apiFetch<{ url: string }>("/admin/upload/image", {
        method: "POST",
        body: formData,
      });

      if (!res?.url) throw new Error("No url in upload response");

      updateItemField(
        categoryId,
        itemId,
        "imageUrl",
        res.url as DbMenuItem["imageUrl"],
      );
    } catch (err) {
      console.error(err);
      setSaving((prev) => ({
        ...prev,
        error: isZh
          ? "图片上传失败，请稍后重试。"
          : "Failed to upload image. Please try again.",
      }));
    } finally {
      setUploadingImageForItem(null);
    }
  }

  async function handleUploadNewItemImage(categoryId: string, file: File) {
    if (!file) return;

    setUploadingImageForDraftCategory(categoryId);
    setSaving((prev) => ({ ...prev, error: null }));

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await apiFetch<{ url: string }>("/admin/upload/image", {
        method: "POST",
        body: formData,
      });

      if (!res?.url) throw new Error("No url in upload response");

      updateNewItemField(categoryId, "imageUrl", res.url);
    } catch (err) {
      console.error(err);
      setSaving((prev) => ({
        ...prev,
        error: isZh
          ? "图片上传失败，请稍后重试。"
          : "Failed to upload image. Please try again.",
      }));
    } finally {
      setUploadingImageForDraftCategory(null);
    }
  }

  // ===== 保存已有菜品 ===== //

  async function handleSaveItem(categoryId: string, itemId: string) {
    const category = categories.find((c) => c.id === categoryId);
    const item = category?.items.find((i) => i.id === itemId);
    if (!item) return;

    setSaving({ itemId, error: null });

    try {
      const body: Record<string, unknown> = {
        categoryId: item.categoryId,
        nameEn: item.nameEn,
        nameZh: item.nameZh ?? undefined,
        basePriceCents: item.basePriceCents,
        isAvailable: item.isAvailable,
        isVisible: item.isVisible,
        sortOrder: item.sortOrder,
        imageUrl: item.imageUrl ?? undefined,
        ingredientsEn: item.ingredientsEn ?? undefined,
        ingredientsZh: item.ingredientsZh ?? undefined,
      };

      await apiFetch(`/admin/menu/items/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      setSaving({ itemId: null, error: null });
    } catch (err) {
      console.error(err);
      setSaving({
        itemId: null,
        error: isZh
          ? "保存失败，请稍后重试。"
          : "Failed to save item. Please try again.",
      });
    }
  }

  // ===== 新建分类 ===== //

  async function handleCreateCategory() {
    const nameEn = newCategoryNameEn.trim();
    const nameZh = newCategoryNameZh.trim();
    const sort = Number(newCategorySortOrder || "0");

    if (!nameEn) {
      setSaving({
        itemId: null,
        error: isZh ? "分类英文名称不能为空。" : "Category name (EN) is required.",
      });
      return;
    }

    setCreatingCategory(true);
    setSaving({ itemId: null, error: null });

    try {
      await apiFetch("/admin/menu/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameEn,
          nameZh: nameZh || undefined,
          sortOrder: Number.isNaN(sort) ? 0 : sort,
        }),
      });

      setNewCategoryNameEn("");
      setNewCategoryNameZh("");
      setNewCategorySortOrder("0");
      await reloadMenu();
    } catch (err) {
      console.error(err);
      setSaving({
        itemId: null,
        error: isZh
          ? "新建分类失败，请稍后重试。"
          : "Failed to create category. Please try again.",
      });
    } finally {
      setCreatingCategory(false);
    }
  }

  // ===== 新建菜品 ===== //

  async function handleCreateItem(categoryId: string) {
    const draft = getNewItemDraft(categoryId);

    const stableId = draft.stableId.trim();
    const nameEn = draft.nameEn.trim();
    const nameZh = draft.nameZh.trim();
    const imageUrl = draft.imageUrl.trim();
    const ingredientsEn = draft.ingredientsEn.trim();
    const ingredientsZh = draft.ingredientsZh.trim();

    const priceNumber = Number(draft.price);
    const sortOrderNumber = Number(draft.sortOrder || "0");

    if (!stableId || !nameEn || Number.isNaN(priceNumber)) {
      setSaving({
        itemId: null,
        error: isZh
          ? "请填写 stableId、英文名称和正确的价格。"
          : "Please fill stableId, English name and a valid price.",
      });
      return;
    }

    setCreatingItemForCategory(categoryId);
    setSaving({ itemId: null, error: null });

    try {
      await apiFetch("/admin/menu/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          stableId,
          nameEn,
          nameZh: nameZh || undefined,
          basePriceCents: Math.round(priceNumber * 100),
          sortOrder: Number.isNaN(sortOrderNumber) ? 0 : sortOrderNumber,
          imageUrl: imageUrl || undefined,
          ingredientsEn: ingredientsEn || undefined,
          ingredientsZh: ingredientsZh || undefined,
        }),
      });

      setNewItemDrafts((prev) => {
        const next = { ...prev };
        delete next[categoryId];
        return next;
      });
      await reloadMenu();
    } catch (err) {
      console.error(err);
      setSaving({
        itemId: null,
        error: isZh
          ? "新建菜品失败，请稍后重试。"
          : "Failed to create item. Please try again.",
      });
    } finally {
      setCreatingItemForCategory(null);
    }
  }

  // ===== 绑定 / 解绑 选项组（全局模板） =====
  // 注意：这里使用了“推荐的 REST 路径”，若你的后端路径不同，改这里两个 endpoint 即可：
  const BIND_ENDPOINT = (itemId: string) =>
    `/admin/menu/items/${itemId}/option-group-bindings`;
  const UNBIND_ENDPOINT = (itemId: string, bindingId: string) =>
    `/admin/menu/items/${itemId}/option-group-bindings/${bindingId}`;

  async function handleBindTemplateToItem(itemId: string) {
    const draft = getBindDraft(itemId);
    const templateId = draft.templateId;
    if (!templateId) return;

    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;

    let minSelect = safeNum(draft.minSelect, tpl.defaultMinSelect ?? 0);

    // ✅ “必选”不再单独发字段，而是用 minSelect 表达：必选 => minSelect >= 1
    if (draft.isRequired && minSelect <= 0) minSelect = 1;
    if (!draft.isRequired && minSelect < 0) minSelect = 0;
    const maxSelect =
      draft.maxSelect.trim() === ""
        ? null
        : safeNullableNum(draft.maxSelect);
    const sortOrder = safeNum(draft.sortOrder, tpl.sortOrder ?? 0);

    setBindingItemId(itemId);
    setSaving((prev) => ({ ...prev, error: null }));

    try {
      await apiFetch(BIND_ENDPOINT(itemId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        templateGroupId: templateId,
        minSelect,
        maxSelect,
        sortOrder,
        isEnabled: true, // 先固定为 true；后续如果你要做“按菜品禁用组选项”再加 UI
        }),
      });

      setBindDrafts((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });

      await reloadMenu();
    } catch (e) {
      console.error(e);
      setSaving((prev) => ({
        ...prev,
        error: isZh
          ? "绑定选项组失败，请稍后重试。"
          : "Failed to bind option group. Please try again.",
      }));
    } finally {
      setBindingItemId(null);
    }
  }

  async function handleUnbindFromItem(itemId: string, bindingId: string) {
    if (
      !window.confirm(
        isZh ? "确定要从该菜品解绑这个选项组吗？" : "Unbind this option group from the item?",
      )
    ) {
      return;
    }

    setUnbindingId(bindingId);
    setSaving((prev) => ({ ...prev, error: null }));

    try {
      await apiFetch(UNBIND_ENDPOINT(itemId, bindingId), { method: "DELETE" });
      await reloadMenu();
    } catch (e) {
      console.error(e);
      setSaving((prev) => ({
        ...prev,
        error: isZh
          ? "解绑失败，请稍后重试。"
          : "Failed to unbind. Please try again.",
      }));
    } finally {
      setUnbindingId(null);
    }
  }

  // ===== 渲染 ===== //

  return (
    <div className="space-y-8">
      {/* 顶部说明 */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Admin
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            菜单维护（图片上传 & 配料说明）
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            这里维护分类与菜品基础信息（名称/价格/上下架/图片/配料说明）。选项组与选项请在“选项页”统一维护；本页仅支持将全局选项组绑定/解绑到菜品。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void reloadMenu()}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            {isZh ? "刷新菜单" : "Refresh menu"}
          </button>
        </div>
      </div>

      {/* 概览统计 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white/80 p-5 shadow-sm">
          <p className="text-sm text-slate-500">{isZh ? "分类数量" : "Categories"}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {categories.length}
          </p>
        </div>
        <div className="rounded-2xl border bg-white/80 p-5 shadow-sm">
          <p className="text-sm text-slate-500">{isZh ? "菜品总数" : "Items"}</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-600">
            {totalItems}
          </p>
        </div>
        <div className="rounded-2xl border bg-white/80 p-5 shadow-sm">
          <p className="text-sm text-slate-500">{isZh ? "数据状态" : "Status"}</p>
          <p className="mt-2 text-sm font-medium text-slate-900">
            {loading
              ? isZh
                ? "加载中…"
                : "Loading…"
              : loadError
              ? isZh
                ? "加载失败（可重试）"
                : "Load failed"
              : isZh
              ? "正常"
              : "OK"}
          </p>
        </div>
      </div>

      {/* 新建分类 */}
      <SectionCard title={isZh ? "新建分类" : "Create category"}>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-500">
              {isZh ? "分类名称（EN）" : "Category name (EN)"}
            </label>
            <input
              type="text"
              className="h-9 w-full rounded-md border px-3 text-sm"
              value={newCategoryNameEn}
              onChange={(e) => setNewCategoryNameEn(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-500">
              {isZh ? "分类名称（中文）" : "Category name (ZH)"}
            </label>
            <input
              type="text"
              className="h-9 w-full rounded-md border px-3 text-sm"
              value={newCategoryNameZh}
              onChange={(e) => setNewCategoryNameZh(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-500">
              {isZh ? "排序（数值越小越靠前）" : "Sort (smaller = earlier)"}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="h-9 w-full rounded-md border px-3 text-sm tabular-nums"
                value={newCategorySortOrder}
                onChange={(e) => setNewCategorySortOrder(e.target.value)}
              />
              <button
                type="button"
                onClick={() => void handleCreateCategory()}
                className="h-9 whitespace-nowrap rounded-full bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700"
                disabled={creatingCategory}
              >
                {creatingCategory
                  ? isZh
                    ? "创建中…"
                    : "Creating…"
                  : isZh
                  ? "创建分类"
                  : "Create"}
              </button>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* 菜单列表 */}
        <SectionCard title={isZh ? "菜单列表" : "Menu"}>
        {loading ? (
          <p className="text-sm text-slate-500">{isZh ? "菜单加载中…" : "Loading menu…"}</p>
        ) : loadError ? (
          <p className="text-sm text-red-600">{loadError}</p>
        ) : categories.length === 0 ? (
          <p className="text-sm text-slate-500">
            {isZh ? "暂无菜单数据，请先创建一个分类。" : "No menu yet. Create a category first."}
          </p>
        ) : (
          <div className="space-y-4">
            {categories.map((cat) => {
              const localizedCatName =
                isZh && cat.nameZh ? cat.nameZh : cat.nameEn;

              return (
                <div key={cat.id} className="rounded-2xl border p-4 shadow-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-base font-semibold text-slate-900">
                        {localizedCatName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {isZh ? "排序" : "Sort"}: {cat.sortOrder} ·{" "}
                        {cat.items.length}{" "}
                        {isZh ? "个菜品" : cat.items.length === 1 ? "item" : "items"}
                      </p>
                    </div>
                  </div>

                  {/* 分类内菜品列表 */}
                  <div className="mt-4 space-y-3">
                    {cat.items.map((item) => {
                      const localizedName =
                        isZh && item.nameZh ? item.nameZh : item.nameEn;

                      const ingredientsPreview = (() => {
                        const text =
                          isZh && item.ingredientsZh
                            ? item.ingredientsZh
                            : item.ingredientsEn ?? "";
                        if (!text) return "";
                        if (text.length <= 80) return text;
                        return `${text.slice(0, 80)}…`;
                      })();

                      const priceDisplay = (item.basePriceCents / 100).toFixed(2);
                      const isExpanded = !!expandedItems[item.id];

                      const boundGroups = getBoundGroupsFromItem(item);

                      return (
                        <div
                          key={item.id}
                          className="rounded-xl border bg-slate-50/60 p-3"
                        >
                          {/* 顶部简要信息 */}
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                {localizedName}
                              </p>

                              {ingredientsPreview ? (
                                <p className="mt-1 text-xs text-slate-500">
                                  {ingredientsPreview}
                                </p>
                              ) : (
                                <p className="mt-1 text-[11px] text-slate-400">
                                  {isZh
                                    ? "尚未填写配料说明。"
                                    : "No ingredients specified yet."}
                                </p>
                              )}

                              <p className="mt-1 text-xs text-slate-500">
                                ID: <span className="font-mono">{item.stableId}</span>
                              </p>

                              <div className="mt-2 flex flex-wrap gap-2">
                                <span
                                  className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                                    item.isVisible
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-slate-100 text-slate-600"
                                  }`}
                                >
                                  {item.isVisible
                                    ? isZh
                                      ? "前台展示"
                                      : "Visible"
                                    : isZh
                                    ? "前台隐藏"
                                    : "Hidden"}
                                </span>
                                <span
                                  className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                                    item.isAvailable
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-amber-50 text-amber-700"
                                  }`}
                                >
                                  {item.isAvailable
                                    ? isZh
                                      ? "可售"
                                      : "Available"
                                    : isZh
                                    ? "已下架"
                                    : "Unavailable"}
                                </span>

                                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">
                                  {isZh ? "已绑定选项组" : "Bound groups"}:{" "}
                                  {boundGroups.length}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              <span className="rounded-full bg-slate-900/90 px-3 py-1 text-xs font-semibold text-white">
                                ${priceDisplay}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleItemExpanded(item.id)}
                                className="text-xs font-medium text-emerald-700 hover:text-emerald-600"
                              >
                                {isExpanded
                                  ? isZh
                                    ? "收起编辑"
                                    : "Hide details"
                                  : isZh
                                  ? "展开编辑"
                                  : "Edit details"}
                              </button>
                            </div>
                          </div>

                          {/* 展开编辑表单（修改已有菜品） */}
                          {isExpanded && (
                            <div className="mt-4 space-y-3 border-t pt-4 text-xs text-slate-700">
                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-1">
                                  <label className="block text-[11px] font-medium text-slate-500">
                                    {isZh ? "名称（EN）" : "Name (EN)"}
                                  </label>
                                  <input
                                    type="text"
                                    className="h-9 w-full rounded-md border px-3 text-sm"
                                    value={item.nameEn}
                                    onChange={(e) =>
                                      updateItemField(
                                        cat.id,
                                        item.id,
                                        "nameEn",
                                        e.target.value as DbMenuItem["nameEn"],
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="block text-[11px] font-medium text-slate-500">
                                    {isZh ? "名称（中文）" : "Name (ZH)"}
                                  </label>
                                  <input
                                    type="text"
                                    className="h-9 w-full rounded-md border px-3 text-sm"
                                    value={item.nameZh ?? ""}
                                    onChange={(e) =>
                                      updateItemField(
                                        cat.id,
                                        item.id,
                                        "nameZh",
                                        e.target.value as DbMenuItem["nameZh"],
                                      )
                                    }
                                  />
                                </div>
                              </div>

                              <div className="grid gap-3 md:grid-cols-3">
                                <div className="space-y-1">
                                  <label className="block text-[11px] font-medium text-slate-500">
                                    {isZh ? "价格（CAD）" : "Price (CAD)"}
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    className="h-9 w-full rounded-md border px-3 text-sm tabular-nums"
                                    value={priceDisplay}
                                    onChange={(e) => {
                                      const v = Number(e.target.value);
                                      if (Number.isNaN(v)) return;
                                      const cents = Math.round(v * 100);
                                      updateItemField(
                                        cat.id,
                                        item.id,
                                        "basePriceCents",
                                        cents as DbMenuItem["basePriceCents"],
                                      );
                                    }}
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="block text-[11px] font-medium text-slate-500">
                                    {isZh ? "排序（数值越小越靠前）" : "Sort (smaller = earlier)"}
                                  </label>
                                  <input
                                    type="number"
                                    className="h-9 w-full rounded-md border px-3 text-sm tabular-nums"
                                    value={item.sortOrder}
                                    onChange={(e) =>
                                      updateItemField(
                                        cat.id,
                                        item.id,
                                        "sortOrder",
                                        Number(e.target.value) as DbMenuItem["sortOrder"],
                                      )
                                    }
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="block text-[11px] font-medium text-slate-500">
                                    {isZh ? "展示与可售" : "Visibility & availability"}
                                  </label>
                                  <div className="flex h-9 items-center gap-4 rounded-md border px-3">
                                    <label className="inline-flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        className="h-3.5 w-3.5 rounded border-slate-300"
                                        checked={item.isVisible}
                                        onChange={(e) =>
                                          updateItemField(
                                            cat.id,
                                            item.id,
                                            "isVisible",
                                            e.target.checked as DbMenuItem["isVisible"],
                                          )
                                        }
                                      />
                                      <span className="text-[11px] text-slate-700">
                                        {isZh ? "前台展示" : "Visible"}
                                      </span>
                                    </label>
                                    <label className="inline-flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        className="h-3.5 w-3.5 rounded border-slate-300"
                                        checked={item.isAvailable}
                                        onChange={(e) =>
                                          updateItemField(
                                            cat.id,
                                            item.id,
                                            "isAvailable",
                                            e.target.checked as DbMenuItem["isAvailable"],
                                          )
                                        }
                                      />
                                      <span className="text-[11px] text-slate-700">
                                        {isZh ? "可售" : "Available"}
                                      </span>
                                    </label>
                                  </div>
                                </div>
                              </div>

                              {/* 图片上传区域 */}
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  {isZh ? "菜品图片" : "Item image"}
                                </label>
                                <div className="flex items-start gap-3">
                                  {item.imageUrl ? (
                                    <div className="h-16 w-16 overflow-hidden rounded-md border bg-white">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={item.imageUrl}
                                        alt={localizedName}
                                        className="h-full w-full object-cover"
                                      />
                                    </div>
                                  ) : (
                                    <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed text-[10px] text-slate-400">
                                      {isZh ? "暂无图片" : "No image"}
                                    </div>
                                  )}

                                  <div className="flex-1 space-y-2">
                                    <input
                                      type="text"
                                      className="h-9 w-full rounded-md border px-3 text-[11px] font-mono"
                                      value={item.imageUrl ?? ""}
                                      onChange={(e) =>
                                        updateItemField(
                                          cat.id,
                                          item.id,
                                          "imageUrl",
                                          e.target.value as DbMenuItem["imageUrl"],
                                        )
                                      }
                                      placeholder={
                                        isZh
                                          ? "上传后会自动填入 URL，如需可手动修改。"
                                          : "After upload, URL will be filled automatically."
                                      }
                                    />
                                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="text-[11px]"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0] ?? null;
                                          if (file) {
                                            void handleUploadItemImage(cat.id, item.id, file);
                                          }
                                        }}
                                      />
                                      <span className="text-[10px] text-slate-400">
                                        {uploadingImageForItem === item.id
                                          ? isZh
                                            ? "图片上传中…"
                                            : "Uploading…"
                                          : isZh
                                          ? "支持 jpg/png/webp，建议 ≥ 600×600。"
                                          : "Supports jpg/png/webp. Recommend ≥ 600×600."}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* 配料说明 */}
                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-1">
                                  <label className="block text-[11px] font-medium text-slate-500">
                                    {isZh ? "配料说明（EN）" : "Ingredients (EN)"}
                                  </label>
                                  <textarea
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                    rows={3}
                                    placeholder={
                                      isZh
                                        ? "例如：Wheat noodles, chili oil, garlic..."
                                        : "e.g., Wheat noodles, chili oil, garlic..."
                                    }
                                    value={item.ingredientsEn ?? ""}
                                    onChange={(e) =>
                                      updateItemField(
                                        cat.id,
                                        item.id,
                                        "ingredientsEn",
                                        e.target.value,
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="block text-[11px] font-medium text-slate-500">
                                    {isZh ? "配料说明（中文）" : "Ingredients (ZH)"}
                                  </label>
                                  <textarea
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                    rows={3}
                                    placeholder={
                                      isZh
                                        ? "例如：凉皮、辣椒油、大蒜、芝麻酱..."
                                        : "例如：凉皮、辣椒油、大蒜、芝麻酱..."
                                    }
                                    value={item.ingredientsZh ?? ""}
                                    onChange={(e) =>
                                      updateItemField(
                                        cat.id,
                                        item.id,
                                        "ingredientsZh",
                                        e.target.value,
                                      )
                                    }
                                  />
                                </div>
                              </div>

                              {/* 选项组绑定（只读 + 绑定/解绑 + 跳转） */}
                              <div className="rounded-lg bg-white/70 p-3">
                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                  <div>
                                    <p className="text-[11px] font-semibold text-slate-800">
                                      {isZh ? "选项组绑定（不在此编辑选项）" : "Bound option groups (no inline editing)"}
                                    </p>
                                    <p className="mt-1 text-[10px] text-slate-500">
                                      {isZh
                                        ? "选项组与选项（价格/上下架/内容）请在选项页统一维护；这里仅绑定到菜品。"
                                        : "Edit groups/choices (price/availability/content) in the options page. This section only binds/unbinds to the item."}
                                    </p>
                                  </div>
                                  <Link
                                    href={`/${locale}/admin/menu/options`}
                                    className="text-xs font-medium text-emerald-700 hover:text-emerald-600"
                                  >
                                    {isZh ? "打开选项页" : "Open options page"}
                                  </Link>
                                </div>

                                {/* 已绑定列表 */}
                                {boundGroups.length === 0 ? (
                                  <p className="mt-2 text-[11px] text-slate-400">
                                    {isZh
                                      ? "当前菜品尚未绑定任何选项组。"
                                      : "This item has no bound option groups yet."}
                                  </p>
                                ) : (
                                  <div className="mt-3 space-y-2">
                                    {boundGroups
                                      .slice()
                                      .sort((a, b) => safeNum(a.sortOrder) - safeNum(b.sortOrder))
                                      .map((g) => {
                                        const name =
                                          isZh && g.nameZh ? g.nameZh : g.nameEn ?? "(Unnamed)";
                                        const tplId = pickTemplateId(g);

                                        const minSel = safeNum(g.minSelect, 0);
                                        const maxSel = g.maxSelect == null ? null : safeNullableNum(g.maxSelect);
                                        const sort = safeNum(g.sortOrder, 0);
                                        const required = minSel > 0;

                                        return (
                                          <div
                                            key={g.id}
                                            className="flex flex-col gap-2 rounded-md border bg-slate-50/80 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                                          >
                                            <div className="min-w-0">
                                              <p className="truncate text-[11px] font-semibold text-slate-900">
                                                {name}
                                              </p>
                                              <p className="mt-0.5 text-[10px] text-slate-500">
                                                {isZh ? "规则" : "Rules"}: min={minSel}, max=
                                                {maxSel == null ? (isZh ? "不限" : "unlimited") : maxSel},{" "}
                                                {isZh ? "排序" : "sort"}={sort} ·{" "}
                                                {required ? (isZh ? "必选" : "Required") : (isZh ? "可选" : "Optional")}
                                              </p>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                              {tplId ? (
                                                <Link
                                                  href={`/${locale}/admin/menu/options#group-${tplId}`}
                                                  className="rounded-full border bg-white px-3 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                                                >
                                                  {isZh ? "去选项页编辑" : "Edit in options page"}
                                                </Link>
                                              ) : (
                                                <Link
                                                  href={`/${locale}/admin/menu/options`}
                                                  className="rounded-full border bg-white px-3 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                                                >
                                                  {isZh ? "去选项页" : "Go to options"}
                                                </Link>
                                              )}

                                              <button
                                                type="button"
                                                onClick={() => void handleUnbindFromItem(item.id, g.id)}
                                                className="rounded-full border bg-white px-3 py-1 text-[10px] font-medium text-red-700 hover:bg-red-50"
                                                disabled={unbindingId === g.id}
                                              >
                                                {unbindingId === g.id
                                                  ? isZh
                                                    ? "解绑中…"
                                                    : "Unbinding…"
                                                  : isZh
                                                  ? "解绑"
                                                  : "Unbind"}
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                  </div>
                                )}

                                {/* 绑定新选项组 */}
                                <div className="mt-3 rounded-md border border-dashed border-slate-300 bg-white p-3">
                                  <p className="text-[11px] font-semibold text-slate-700">
                                    {isZh ? "绑定一个全局选项组" : "Bind a global option group"}
                                  </p>

                                  {templatesLoading ? (
                                    <p className="mt-2 text-[11px] text-slate-400">
                                      {isZh ? "选项库加载中…" : "Loading templates…"}
                                    </p>
                                  ) : templatesError ? (
                                    <p className="mt-2 text-[11px] text-red-600">{templatesError}</p>
                                  ) : templates.length === 0 ? (
                                    <p className="mt-2 text-[11px] text-slate-400">
                                      {isZh
                                        ? "暂无可用模板，请先去选项页创建选项组。"
                                        : "No templates yet. Create one in the options page first."}
                                    </p>
                                  ) : (
                                    <div className="mt-2 grid gap-2 md:grid-cols-12">
                                      <div className="space-y-1 md:col-span-5">
                                        <label className="block text-[10px] font-medium text-slate-500">
                                          {isZh ? "选择模板组选项" : "Template group"}
                                        </label>
                                        <select
                                          className="h-9 w-full rounded-md border px-3 text-sm"
                                          value={getBindDraft(item.id).templateId}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            if (!v) {
                                              updateBindDraft(item.id, "templateId", "");
                                              return;
                                            }
                                            applyTemplateDefaultsToBindDraft(item.id, v);
                                          }}
                                        >
                                          <option value="">
                                            {isZh ? "请选择…" : "Select…"}
                                          </option>
                                          {templates.map((t) => {
                                            const label =
                                              isZh && t.nameZh ? t.nameZh : t.nameEn;
                                            return (
                                              <option key={t.id} value={t.id}>
                                                {label}
                                              </option>
                                            );
                                          })}
                                        </select>
                                      </div>

                                      <div className="space-y-1 md:col-span-2">
                                        <label className="block text-[10px] font-medium text-slate-500">
                                          minSelect
                                        </label>
                                        <input
                                          type="number"
                                          className="h-9 w-full rounded-md border px-3 text-sm tabular-nums"
                                          value={getBindDraft(item.id).minSelect}
                                          onChange={(e) =>
                                            updateBindDraft(item.id, "minSelect", e.target.value)
                                          }
                                          placeholder="0"
                                        />
                                      </div>

                                      <div className="space-y-1 md:col-span-2">
                                        <label className="block text-[10px] font-medium text-slate-500">
                                          maxSelect
                                        </label>
                                        <input
                                          type="number"
                                          className="h-9 w-full rounded-md border px-3 text-sm tabular-nums"
                                          value={getBindDraft(item.id).maxSelect}
                                          onChange={(e) =>
                                            updateBindDraft(item.id, "maxSelect", e.target.value)
                                          }
                                          placeholder={isZh ? "空=不限" : "blank=unlimited"}
                                        />
                                      </div>

                                      <div className="space-y-1 md:col-span-1">
                                        <label className="block text-[10px] font-medium text-slate-500">
                                          {isZh ? "排序" : "Sort"}
                                        </label>
                                        <input
                                          type="number"
                                          className="h-9 w-full rounded-md border px-3 text-sm tabular-nums"
                                          value={getBindDraft(item.id).sortOrder}
                                          onChange={(e) =>
                                            updateBindDraft(item.id, "sortOrder", e.target.value)
                                          }
                                          placeholder="0"
                                        />
                                      </div>

                                      <div className="flex items-end justify-between gap-3 md:col-span-2">
                                        <label className="mb-2 inline-flex items-center gap-2 text-[10px] text-slate-700">
                                          <input
                                            type="checkbox"
                                            className="h-3.5 w-3.5 rounded border-slate-300"
                                            checked={getBindDraft(item.id).isRequired}
onChange={(e) => {
  const checked = e.target.checked;
  updateBindDraft(item.id, "isRequired", checked);

  // ✅ 让“必选”立刻体现在 minSelect 上
  if (checked) {
    const cur = safeNum(getBindDraft(item.id).minSelect, 0);
    if (cur <= 0) updateBindDraft(item.id, "minSelect", "1");
  } else {
    updateBindDraft(item.id, "minSelect", "0");
  }
}}

                                          />
                                          {isZh ? "必选（min≥1）" : "Required（min≥1）"}
                                        </label>

                                        <button
                                          type="button"
                                          onClick={() => void handleBindTemplateToItem(item.id)}
                                          className="h-9 flex-1 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700"
                                          disabled={bindingItemId === item.id}
                                        >
                                          {bindingItemId === item.id
                                            ? isZh
                                              ? "绑定中…"
                                              : "Binding…"
                                            : isZh
                                            ? "绑定"
                                            : "Bind"}
                                        </button>
                                      </div>

                                      <p className="md:col-span-12 text-[10px] text-slate-500">
                                        {isZh
                                          ? "说明：绑定后，选项的价格/上下架/内容变更会对所有绑定菜品全局生效。"
                                          : "Note: Once bound, option price/availability/content changes apply globally to all bound items."}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="mt-2 flex items-center justify-between">
                                <p className="text-[11px] text-slate-500">
                                  {isZh
                                    ? "保存后，顾客菜单页会实时使用最新的图片与配料说明。"
                                    : "After saving, the customer menu will use the updated image and ingredients."}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => void handleSaveItem(cat.id, item.id)}
                                  className="inline-flex items-center rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                                  disabled={saving.itemId !== null}
                                >
                                  {saving.itemId === item.id
                                    ? isZh
                                      ? "保存中…"
                                      : "Saving…"
                                    : isZh
                                    ? "保存"
                                    : "Save"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* 新建菜品区域 */}
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-3">
                      <p className="mb-2 text-xs font-semibold text-slate-700">
                        {isZh ? "新建菜品" : "Create new item"}
                      </p>

                      {(() => {
                        const draft = getNewItemDraft(cat.id);
                        return (
                          <div className="space-y-3 text-xs text-slate-700">
                            <div className="grid gap-3 md:grid-cols-3">
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  stableId（唯一标识）
                                </label>
                                <input
                                  type="text"
                                  className="h-9 w-full rounded-md border px-3 text-sm"
                                  placeholder="例如：liangpi"
                                  value={draft.stableId}
                                  onChange={(e) =>
                                    updateNewItemField(cat.id, "stableId", e.target.value)
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  {isZh ? "名称（EN）" : "Name (EN)"}
                                </label>
                                <input
                                  type="text"
                                  className="h-9 w-full rounded-md border px-3 text-sm"
                                  value={draft.nameEn}
                                  onChange={(e) =>
                                    updateNewItemField(cat.id, "nameEn", e.target.value)
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  {isZh ? "名称（中文）" : "Name (ZH)"}
                                </label>
                                <input
                                  type="text"
                                  className="h-9 w-full rounded-md border px-3 text-sm"
                                  value={draft.nameZh}
                                  onChange={(e) =>
                                    updateNewItemField(cat.id, "nameZh", e.target.value)
                                  }
                                />
                              </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-3">
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  {isZh ? "价格（CAD）" : "Price (CAD)"}
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  className="h-9 w-full rounded-md border px-3 text-sm tabular-nums"
                                  value={draft.price}
                                  onChange={(e) =>
                                    updateNewItemField(cat.id, "price", e.target.value)
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  {isZh ? "排序" : "Sort"}
                                </label>
                                <input
                                  type="number"
                                  className="h-9 w-full rounded-md border px-3 text-sm tabular-nums"
                                  value={draft.sortOrder}
                                  onChange={(e) =>
                                    updateNewItemField(cat.id, "sortOrder", e.target.value)
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  {isZh ? "菜品图片" : "Image"}
                                </label>
                                <div className="space-y-1">
                                  <input
                                    type="text"
                                    className="h-9 w-full rounded-md border px-3 text-[11px] font-mono"
                                    value={draft.imageUrl}
                                    onChange={(e) =>
                                      updateNewItemField(cat.id, "imageUrl", e.target.value)
                                    }
                                    placeholder={
                                      isZh
                                        ? "上传后自动填入 URL，如需可手动修改。"
                                        : "After upload, URL will be filled automatically."
                                    }
                                  />
                                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="text-[11px]"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0] ?? null;
                                        if (file) void handleUploadNewItemImage(cat.id, file);
                                      }}
                                    />
                                    <span className="text-[10px] text-slate-400">
                                      {uploadingImageForDraftCategory === cat.id
                                        ? isZh
                                          ? "图片上传中…"
                                          : "Uploading…"
                                        : isZh
                                        ? "可不填，后续也可在菜品编辑中上传图片。"
                                        : "Optional — you can upload later."}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  {isZh ? "配料说明（EN）" : "Ingredients (EN)"}
                                </label>
                                <textarea
                                  className="w-full rounded-md border px-3 py-2 text-sm"
                                  rows={3}
                                  value={draft.ingredientsEn}
                                  onChange={(e) =>
                                    updateNewItemField(cat.id, "ingredientsEn", e.target.value)
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  {isZh ? "配料说明（中文）" : "Ingredients (ZH)"}
                                </label>
                                <textarea
                                  className="w-full rounded-md border px-3 py-2 text-sm"
                                  rows={3}
                                  value={draft.ingredientsZh}
                                  onChange={(e) =>
                                    updateNewItemField(cat.id, "ingredientsZh", e.target.value)
                                  }
                                />
                              </div>
                            </div>

                            <div className="mt-2 flex items-center justify-between">
                              <p className="text-[11px] text-slate-500">
                                {isZh
                                  ? "提示：stableId 一旦用于前台下单，后续请避免随意更改。"
                                  : "Note: once used in orders, avoid changing stableId."}
                              </p>
                              <button
                                type="button"
                                onClick={() => void handleCreateItem(cat.id)}
                                className="inline-flex items-center rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                                disabled={creatingItemForCategory === cat.id}
                              >
                                {creatingItemForCategory === cat.id
                                  ? isZh
                                    ? "创建中…"
                                    : "Creating…"
                                  : isZh
                                  ? "创建菜品"
                                  : "Create item"}
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {saving.error ? (
        <p className="text-xs text-red-600">{saving.error}</p>
      ) : null}
    </div>
  );
}
