"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
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

type NewItemDraft = {
  stableId: string;
  nameEn: string;
  nameZh: string;
  descriptionEn: string;
  descriptionZh: string;
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
    descriptionEn: "",
    descriptionZh: "",
    price: "",
    sortOrder: "0",
    imageUrl: "",
    ingredientsEn: "",
    ingredientsZh: "",
  };
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

  const totalItems = categories.reduce(
    (sum, cat) => sum + cat.items.length,
    0,
  );

  // ===== 工具函数 ===== //

  async function reloadMenu() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiFetch<DbMenuCategory[]>("/admin/menu/full");
      const sorted = data
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

  // ===== 保存已有菜品 ===== //

  async function handleSaveItem(categoryId: string, itemId: string) {
    const category = categories.find((c) => c.id === categoryId);
    const item = category?.items.find((i) => i.id === itemId);
    if (!item) return;

    setSaving({ itemId, error: null });

    try {
      const body = {
        categoryId: item.categoryId,
        nameEn: item.nameEn,
        nameZh: item.nameZh ?? undefined,
        descriptionEn: item.descriptionEn ?? undefined,
        descriptionZh: item.descriptionZh ?? undefined,
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
        json: body,
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
        json: {
          nameEn,
          nameZh: nameZh || undefined,
          sortOrder: Number.isNaN(sort) ? 0 : sort,
        },
      });

      // 清空表单并刷新菜单
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
    const descriptionEn = draft.descriptionEn.trim();
    const descriptionZh = draft.descriptionZh.trim();
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
        json: {
          categoryId,
          stableId,
          nameEn,
          nameZh: nameZh || undefined,
          descriptionEn: descriptionEn || undefined,
          descriptionZh: descriptionZh || undefined,
          basePriceCents: Math.round(priceNumber * 100),
          sortOrder: Number.isNaN(sortOrderNumber) ? 0 : sortOrderNumber,
          imageUrl: imageUrl || undefined,
          ingredientsEn: ingredientsEn || undefined,
          ingredientsZh: ingredientsZh || undefined,
        },
      });

      // 清空该分类的新建菜品草稿 & 刷新菜单
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

  // ===== 渲染 ===== //

  return (
    <div className="space-y-8">
      {/* 顶部说明 */}
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Admin
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">
          菜单维护（图片 & 配料说明）
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          这里可以维护线上菜单的数据：分类、菜品名称、价格、上下架状态、展示图片、配料说明（中英文）。
          顾客看到的菜单将直接使用这里的配置。
        </p>
      </div>

      {/* 概览统计 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white/80 p-5 shadow-sm">
          <p className="text-sm text-slate-500">分类数量</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {categories.length}
          </p>
        </div>
        <div className="rounded-2xl border bg-white/80 p-5 shadow-sm">
          <p className="text-sm text-slate-500">菜品总数</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-600">
            {totalItems}
          </p>
        </div>
        <div className="rounded-2xl border bg-white/80 p-5 shadow-sm">
          <p className="text-sm text-slate-500">数据状态</p>
          <p className="mt-2 text-sm font-medium text-slate-900">
            {loading
              ? "加载中…"
              : loadError
              ? isZh
                ? "加载失败（可重试）"
                : "Load failed"
              : "正常"}
          </p>
        </div>
      </div>

      {/* 新建分类 */}
      <SectionCard title="新建分类">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-500">
              分类名称（EN）
            </label>
            <input
              type="text"
              className="w-full rounded-md border px-2 py-1 text-xs"
              value={newCategoryNameEn}
              onChange={(e) => setNewCategoryNameEn(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-500">
              分类名称（中文）
            </label>
            <input
              type="text"
              className="w-full rounded-md border px-2 py-1 text-xs"
              value={newCategoryNameZh}
              onChange={(e) => setNewCategoryNameZh(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-500">
              排序（数值越小越靠前）
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="w-full rounded-md border px-2 py-1 text-xs"
                value={newCategorySortOrder}
                onChange={(e) => setNewCategorySortOrder(e.target.value)}
              />
              <button
                type="button"
                onClick={() => void handleCreateCategory()}
                className="whitespace-nowrap rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                disabled={creatingCategory}
              >
                {creatingCategory ? "创建中…" : "创建分类"}
              </button>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* 菜单列表 */}
      <SectionCard
        title="菜单列表"
        actions={
          <button
            type="button"
            className="text-xs font-medium text-emerald-700 hover:text-emerald-600"
            onClick={() => void reloadMenu()}
          >
            {isZh ? "重新加载菜单" : "Reload menu"}
          </button>
        }
      >
        {loading ? (
          <p className="text-sm text-slate-500">
            {isZh ? "菜单加载中…" : "Loading menu…"}
          </p>
        ) : loadError ? (
          <p className="text-sm text-red-600">{loadError}</p>
        ) : categories.length === 0 ? (
          <p className="text-sm text-slate-500">
            {isZh
              ? "暂无菜单数据，请先创建一个分类。"
              : "No menu data yet. Please create a category first."}
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
                        {isZh
                          ? "个菜品"
                          : cat.items.length === 1
                          ? "item"
                          : "items"}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                        cat.isActive
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {cat.isActive
                        ? isZh
                          ? "启用"
                          : "Active"
                        : isZh
                        ? "停用"
                        : "Inactive"}
                    </span>
                  </div>

                  {/* 分类内菜品列表 */}
                  <div className="mt-4 space-y-3">
                    {cat.items.map((item) => {
                      const localizedName =
                        isZh && item.nameZh ? item.nameZh : item.nameEn;
                      const localizedDesc =
                        isZh && item.descriptionZh
                          ? item.descriptionZh
                          : item.descriptionEn ?? "";

                      const priceDisplay = (item.basePriceCents / 100).toFixed(
                        2,
                      );
                      const isExpanded = !!expandedItems[item.id];

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
                              <p className="text-xs text-slate-500">
                                {localizedDesc ||
                                  (isZh ? "暂无描述" : "No description")}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                ID:{" "}
                                <span className="font-mono">
                                  {item.stableId}
                                </span>
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <span className="rounded-full bg-slate-900/90 px-3 py-1 text-xs font-semibold text-white">
                                ${priceDisplay}
                              </span>
                              <div className="flex flex-wrap gap-2">
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
                              </div>
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
                                    名称（EN）
                                  </label>
                                  <input
                                    type="text"
                                    className="w-full rounded-md border px-2 py-1 text-xs"
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
                                    名称（中文）
                                  </label>
                                  <input
                                    type="text"
                                    className="w-full rounded-md border px-2 py-1 text-xs"
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

                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-1">
                                  <label className="block text-[11px] font-medium text-slate-500">
                                    描述（EN）
                                  </label>
                                  <textarea
                                    className="w-full rounded-md border px-2 py-1 text-xs"
                                    rows={2}
                                    value={item.descriptionEn ?? ""}
                                    onChange={(e) =>
                                      updateItemField(
                                        cat.id,
                                        item.id,
                                        "descriptionEn",
                                        e.target
                                          .value as DbMenuItem["descriptionEn"],
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="block text-[11px] font-medium text-slate-500">
                                    描述（中文）
                                  </label>
                                  <textarea
                                    className="w-full rounded-md border px-2 py-1 text-xs"
                                    rows={2}
                                    value={item.descriptionZh ?? ""}
                                    onChange={(e) =>
                                      updateItemField(
                                        cat.id,
                                        item.id,
                                        "descriptionZh",
                                        e.target
                                          .value as DbMenuItem["descriptionZh"],
                                      )
                                    }
                                  />
                                </div>
                              </div>

                              <div className="grid gap-3 md:grid-cols-3">
                                <div className="space-y-1">
                                  <label className="block text-[11px] font-medium text-slate-500">
                                    价格（CAD）
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    className="w-full rounded-md border px-2 py-1 text-xs"
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
                                    排序（数值越小越靠前）
                                  </label>
                                  <input
                                    type="number"
                                    className="w-full rounded-md border px-2 py-1 text-xs"
                                    value={item.sortOrder}
                                    onChange={(e) =>
                                      updateItemField(
                                        cat.id,
                                        item.id,
                                        "sortOrder",
                                        Number(
                                          e.target.value,
                                        ) as DbMenuItem["sortOrder"],
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="block text-[11px] font-medium text-slate-500">
                                    展示与可售
                                  </label>
                                  <div className="flex items-center gap-3">
                                    <label className="inline-flex items-center gap-1">
                                      <input
                                        type="checkbox"
                                        className="h-3 w-3 rounded border-slate-300"
                                        checked={item.isVisible}
                                        onChange={(e) =>
                                          updateItemField(
                                            cat.id,
                                            item.id,
                                            "isVisible",
                                            e.target
                                              .checked as DbMenuItem["isVisible"],
                                          )
                                        }
                                      />
                                      <span className="text-[11px] text-slate-700">
                                        {isZh ? "前台展示" : "Visible"}
                                      </span>
                                    </label>
                                    <label className="inline-flex items-center gap-1">
                                      <input
                                        type="checkbox"
                                        className="h-3 w-3 rounded border-slate-300"
                                        checked={item.isAvailable}
                                        onChange={(e) =>
                                          updateItemField(
                                            cat.id,
                                            item.id,
                                            "isAvailable",
                                            e.target
                                              .checked as DbMenuItem["isAvailable"],
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

                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  图片 URL
                                </label>
                                <input
                                  type="text"
                                  className="w-full rounded-md border px-2 py-1 text-xs"
                                  placeholder={
                                    isZh
                                      ? "例如：https://example.com/liangpi.jpg"
                                      : "e.g., https://example.com/liangpi.jpg"
                                  }
                                  value={item.imageUrl ?? ""}
                                  onChange={(e) =>
                                    updateItemField(
                                      cat.id,
                                      item.id,
                                      "imageUrl",
                                      e.target.value as DbMenuItem["imageUrl"],
                                    )
                                  }
                                />
                              </div>

                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-1">
                                  <label className="block text-[11px] font-medium text-slate-500">
                                    配料说明（EN）
                                  </label>
                                  <textarea
                                    className="w-full rounded-md border px-2 py-1 text-xs"
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
                                        e.target
                                          .value as DbMenuItem["ingredientsEn"],
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="block text-[11px] font-medium text-slate-500">
                                    配料说明（中文）
                                  </label>
                                  <textarea
                                    className="w-full rounded-md border px-2 py-1 text-xs"
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
                                        e.target
                                          .value as DbMenuItem["ingredientsZh"],
                                      )
                                    }
                                  />
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
                                  onClick={() =>
                                    void handleSaveItem(cat.id, item.id)
                                  }
                                  className="inline-flex items-center rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                                  disabled={saving.itemId !== null}
                                >
                                  {saving.itemId === item.id
                                    ? isZh
                                      ? "保存中…"
                                      : "Saving..."
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
                                  className="w-full rounded-md border px-2 py-1 text-xs"
                                  placeholder="例如：liangpi"
                                  value={draft.stableId}
                                  onChange={(e) =>
                                    updateNewItemField(
                                      cat.id,
                                      "stableId",
                                      e.target.value,
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  名称（EN）
                                </label>
                                <input
                                  type="text"
                                  className="w-full rounded-md border px-2 py-1 text-xs"
                                  value={draft.nameEn}
                                  onChange={(e) =>
                                    updateNewItemField(
                                      cat.id,
                                      "nameEn",
                                      e.target.value,
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  名称（中文）
                                </label>
                                <input
                                  type="text"
                                  className="w-full rounded-md border px-2 py-1 text-xs"
                                  value={draft.nameZh}
                                  onChange={(e) =>
                                    updateNewItemField(
                                      cat.id,
                                      "nameZh",
                                      e.target.value,
                                    )
                                  }
                                />
                              </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  描述（EN）
                                </label>
                                <textarea
                                  className="w-full rounded-md border px-2 py-1 text-xs"
                                  rows={2}
                                  value={draft.descriptionEn}
                                  onChange={(e) =>
                                    updateNewItemField(
                                      cat.id,
                                      "descriptionEn",
                                      e.target.value,
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  描述（中文）
                                </label>
                                <textarea
                                  className="w-full rounded-md border px-2 py-1 text-xs"
                                  rows={2}
                                  value={draft.descriptionZh}
                                  onChange={(e) =>
                                    updateNewItemField(
                                      cat.id,
                                      "descriptionZh",
                                      e.target.value,
                                    )
                                  }
                                />
                              </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-3">
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  价格（CAD）
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  className="w-full rounded-md border px-2 py-1 text-xs"
                                  value={draft.price}
                                  onChange={(e) =>
                                    updateNewItemField(
                                      cat.id,
                                      "price",
                                      e.target.value,
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  排序
                                </label>
                                <input
                                  type="number"
                                  className="w-full rounded-md border px-2 py-1 text-xs"
                                  value={draft.sortOrder}
                                  onChange={(e) =>
                                    updateNewItemField(
                                      cat.id,
                                      "sortOrder",
                                      e.target.value,
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  图片 URL
                                </label>
                                <input
                                  type="text"
                                  className="w-full rounded-md border px-2 py-1 text-xs"
                                  value={draft.imageUrl}
                                  onChange={(e) =>
                                    updateNewItemField(
                                      cat.id,
                                      "imageUrl",
                                      e.target.value,
                                    )
                                  }
                                  placeholder={
                                    isZh
                                      ? "https://example.com/liangpi.jpg"
                                      : "https://example.com/liangpi.jpg"
                                  }
                                />
                              </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  配料说明（EN）
                                </label>
                                <textarea
                                  className="w-full rounded-md border px-2 py-1 text-xs"
                                  rows={3}
                                  value={draft.ingredientsEn}
                                  onChange={(e) =>
                                    updateNewItemField(
                                      cat.id,
                                      "ingredientsEn",
                                      e.target.value,
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  配料说明（中文）
                                </label>
                                <textarea
                                  className="w-full rounded-md border px-2 py-1 text-xs"
                                  rows={3}
                                  value={draft.ingredientsZh}
                                  onChange={(e) =>
                                    updateNewItemField(
                                      cat.id,
                                      "ingredientsZh",
                                      e.target.value,
                                    )
                                  }
                                />
                              </div>
                            </div>

                            <div className="mt-2 flex items-center justify-between">
                              <p className="text-[11px] text-slate-500">
                                {isZh
                                  ? "提示：stableId 一旦用于前台下单，后续请避免随意更改。"
                                  : "Note: once an item stableId is used in orders, avoid changing it."}
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
                                    : "Creating..."
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
