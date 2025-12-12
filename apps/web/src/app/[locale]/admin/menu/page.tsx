// apps/web/src/app/[locale]/admin/menu/page.tsx
"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  type Locale,
  type DbMenuCategory,
  type DbMenuItem,
  type DbMenuOptionGroup,
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

// ===== 选项组 & 选项的前端类型（与后端保持一致或做轻微映射） ===== //

export type MenuOptionChoice = {
  id: string;
  nameEn: string;
  nameZh: string | null;
  priceDeltaCents: number;
  sortOrder: number;
  isAvailable: boolean;
};

export type MenuOptionGroup = Omit<
  DbMenuOptionGroup,
  "options" | "maxSelect"
> & {
  maxSelect: number | null;
  options: MenuOptionChoice[];
};

// DbMenuItem 在 shared 中不一定显式带有 optionGroups，这里做一个扩展类型
type MenuItemWithOptions = DbMenuItem & {
  optionGroups?: MenuOptionGroup[];
};

// 新建选项组草稿（按 item 维度）
type NewOptionGroupDraft = {
  nameEn: string;
  nameZh: string;
  minSelect: string; // 文本，保存时转数字
  maxSelect: string; // 文本，保存时转数字，空串代表 null（不限）
  sortOrder: string;
  isRequired: boolean;
};

// 新建选项草稿（按 group 维度）
type NewOptionChoiceDraft = {
  nameEn: string;
  nameZh: string;
  priceDelta: string; // CAD 文本，保存时转 cents
  sortOrder: string;
};

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

  // 选项组 / 选项 保存 / 删除中的 id
  const [savingOptionGroupId, setSavingOptionGroupId] = useState<string | null>(
    null,
  );
  const [savingOptionChoiceId, setSavingOptionChoiceId] = useState<
    string | null
  >(null);
  const [deletingOptionGroupId, setDeletingOptionGroupId] = useState<
    string | null
  >(null);
  const [deletingOptionChoiceId, setDeletingOptionChoiceId] = useState<
    string | null
  >(null);

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

  // —— 新建选项组（按 item 维护草稿） —— //
  const [newOptionGroupDrafts, setNewOptionGroupDrafts] = useState<
    Record<string, NewOptionGroupDraft>
  >({});

  // —— 新建选项（按 group 维护草稿） —— //
  const [newOptionChoiceDrafts, setNewOptionChoiceDrafts] = useState<
    Record<string, NewOptionChoiceDraft>
  >({});

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

function getNewOptionGroupDraft(itemId: string): NewOptionGroupDraft {
  return (
    newOptionGroupDrafts[itemId] ?? {
      nameEn: "",
      nameZh: "",
      minSelect: "0",
      maxSelect: "",
      sortOrder: "0",
      isRequired: false,
    }
  );
}

  function updateNewOptionGroupDraft<K extends keyof NewOptionGroupDraft>(
    itemId: string,
    field: K,
    value: NewOptionGroupDraft[K],
  ) {
    setNewOptionGroupDrafts((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] ?? {
          nameEn: "",
          nameZh: "",
  minSelect: "0",
  maxSelect: "",
          sortOrder: "0",
          isRequired: false,
        }),
        [field]: value,
      },
    }));
  }

  function getNewOptionChoiceDraft(groupId: string): NewOptionChoiceDraft {
    return (
      newOptionChoiceDrafts[groupId] ?? {
        nameEn: "",
        nameZh: "",
        priceDelta: "",
        sortOrder: "0",
      }
    );
  }

  function updateNewOptionChoiceDraft<K extends keyof NewOptionChoiceDraft>(
    groupId: string,
    field: K,
    value: NewOptionChoiceDraft[K],
  ) {
    setNewOptionChoiceDrafts((prev) => ({
      ...prev,
      [groupId]: {
        ...(prev[groupId] ?? {
          nameEn: "",
          nameZh: "",
          priceDelta: "",
          sortOrder: "0",
        }),
        [field]: value,
      },
    }));
  }

  // ===== 选项组 / 选项：本地状态更新 ===== //

  function updateOptionGroupField<
    K extends keyof MenuOptionGroup,
    V extends MenuOptionGroup[K],
  >(categoryId: string, itemId: string, groupId: string, field: K, value: V) {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id !== categoryId
          ? cat
          : {
              ...cat,
              items: cat.items.map((it) => {
                if (it.id !== itemId) return it;
                const item = it as MenuItemWithOptions;
                const groups = item.optionGroups ?? [];
                const nextGroups = groups.map((g) =>
                  g.id !== groupId ? g : { ...g, [field]: value },
                );
                return {
                  ...(item as DbMenuItem),
                  optionGroups: nextGroups,
                };
              }),
            },
      ),
    );
  }

  function updateOptionChoiceField<
    K extends keyof MenuOptionChoice,
    V extends MenuOptionChoice[K],
  >(
    categoryId: string,
    itemId: string,
    groupId: string,
    choiceId: string,
    field: K,
    value: V,
  ) {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id !== categoryId
          ? cat
          : {
              ...cat,
              items: cat.items.map((it) => {
                if (it.id !== itemId) return it;
                const item = it as MenuItemWithOptions;
                const groups = item.optionGroups ?? [];
                const nextGroups = groups.map((g) =>
                  g.id !== groupId
                    ? g
                    : {
                        ...g,
                        options: (g.options ?? []).map((c) =>
                          c.id !== choiceId ? c : { ...c, [field]: value },
                        ),
                      },
                );
                return {
                  ...(item as DbMenuItem),
                  optionGroups: nextGroups,
                };
              }),
            },
      ),
    );
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

      // 注意：apiFetch 需要支持 FormData（不要强行写 Content-Type: application/json）
      const res = await apiFetch<{ url: string }>("/admin/upload/image", {
        method: "POST",
        body: formData,
      });

      if (!res?.url) {
        throw new Error("No url in upload response");
      }

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

      if (!res?.url) {
        throw new Error("No url in upload response");
      }

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
    const itemRaw = category?.items.find((i) => i.id === itemId);
    if (!itemRaw) return;

    const item = itemRaw as MenuItemWithOptions;

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

      // 如需一次性保存选项组，也可以在这里带上 optionGroups，自行设计后端 DTO
      // body.optionGroups = item.optionGroups ?? [];

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

  // ===== 选项组 / 选项：后端交互 ===== //

  async function handleCreateOptionGroup(categoryId: string, itemId: string) {
    const draft = getNewOptionGroupDraft(itemId);
    const nameEn = draft.nameEn.trim();
    const nameZh = draft.nameZh.trim();
    const sortOrderNumber = Number(draft.sortOrder || "0");
const minSelectNumber = Number(draft.minSelect || "0");
const maxSelectNumber =
  draft.maxSelect.trim() === ""
    ? null
    : Number.isNaN(Number(draft.maxSelect))
    ? null
    : Number(draft.maxSelect);

    if (!nameEn) {
      setSaving((prev) => ({
        ...prev,
        error: isZh
          ? "选项组英文名称不能为空。"
          : "Option group English name is required.",
      }));
      return;
    }

    setSaving((prev) => ({ ...prev, error: null }));
    setSavingOptionGroupId("new");

    try {
await apiFetch(`/admin/menu/items/${itemId}/option-groups`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    nameEn,
    nameZh: nameZh || undefined,
    minSelect: Number.isNaN(minSelectNumber) ? 0 : minSelectNumber,
    maxSelect: maxSelectNumber,
    isRequired: draft.isRequired,
    sortOrder: Number.isNaN(sortOrderNumber) ? 0 : sortOrderNumber,
  }),
});

      // 清空草稿 & 重新加载
      setNewOptionGroupDrafts((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      await reloadMenu();
    } catch (err) {
      console.error(err);
      setSaving((prev) => ({
        ...prev,
        error: isZh
          ? "新建选项组失败，请稍后重试。"
          : "Failed to create option group. Please try again.",
      }));
    } finally {
      setSavingOptionGroupId(null);
    }
  }

  async function handleSaveOptionGroup(
    categoryId: string,
    itemId: string,
    group: MenuOptionGroup,
  ) {
    setSaving((prev) => ({ ...prev, error: null }));
    setSavingOptionGroupId(group.id);

    try {
      await apiFetch(`/admin/menu/option-groups/${group.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameEn: group.nameEn,
          nameZh: group.nameZh || undefined,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          isRequired: group.isRequired,
          sortOrder: group.sortOrder,
        }),
      });

      await reloadMenu();
    } catch (err) {
      console.error(err);
      setSaving((prev) => ({
        ...prev,
        error: isZh
          ? "保存选项组失败，请稍后重试。"
          : "Failed to save option group. Please try again.",
      }));
    } finally {
      setSavingOptionGroupId(null);
    }
  }

  async function handleDeleteOptionGroup(
    categoryId: string,
    itemId: string,
    groupId: string,
  ) {
    if (
      !window.confirm(
        isZh
          ? "确定要删除这个选项组及其所有选项吗？"
          : "Delete this option group and all its options?",
      )
    ) {
      return;
    }

    setDeletingOptionGroupId(groupId);
    setSaving((prev) => ({ ...prev, error: null }));

    try {
      await apiFetch(`/admin/menu/option-groups/${groupId}`, {
        method: "DELETE",
      });

      await reloadMenu();
    } catch (err) {
      console.error(err);
      setSaving((prev) => ({
        ...prev,
        error: isZh
          ? "删除选项组失败，请稍后重试。"
          : "Failed to delete option group. Please try again.",
      }));
    } finally {
      setDeletingOptionGroupId(null);
    }
  }

  async function handleCreateOptionChoice(
    categoryId: string,
    itemId: string,
    groupId: string,
  ) {
    const draft = getNewOptionChoiceDraft(groupId);
    const nameEn = draft.nameEn.trim();
    const nameZh = draft.nameZh.trim();
    const priceDeltaNumber = Number(draft.priceDelta || "0");
    const sortOrderNumber = Number(draft.sortOrder || "0");

    if (!nameEn) {
      setSaving((prev) => ({
        ...prev,
        error: isZh
          ? "选项英文名称不能为空。"
          : "Option English name is required.",
      }));
      return;
    }

    setSaving((prev) => ({ ...prev, error: null }));
    setSavingOptionChoiceId("new");

    try {
      await apiFetch(`/admin/menu/option-groups/${groupId}/options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameEn,
          nameZh: nameZh || undefined,
          priceDeltaCents: Math.round(
            Number.isNaN(priceDeltaNumber) ? 0 : priceDeltaNumber * 100,
          ),
          sortOrder: Number.isNaN(sortOrderNumber) ? 0 : sortOrderNumber,
        }),
      });

      setNewOptionChoiceDrafts((prev) => {
        const next = { ...prev };
        delete next[groupId];
        return next;
      });
      await reloadMenu();
    } catch (err) {
      console.error(err);
      setSaving((prev) => ({
        ...prev,
        error: isZh
          ? "新建选项失败，请稍后重试。"
          : "Failed to create option. Please try again.",
      }));
    } finally {
      setSavingOptionChoiceId(null);
    }
  }

  async function handleSaveOptionChoice(
    categoryId: string,
    itemId: string,
    groupId: string,
    choice: MenuOptionChoice,
  ) {
    setSaving((prev) => ({ ...prev, error: null }));
    setSavingOptionChoiceId(choice.id);

    try {
      await apiFetch(`/admin/menu/options/${choice.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameEn: choice.nameEn,
          nameZh: choice.nameZh || undefined,
          priceDeltaCents: choice.priceDeltaCents,
          sortOrder: choice.sortOrder,
          isAvailable: choice.isAvailable,
        }),
      });

      await reloadMenu();
    } catch (err) {
      console.error(err);
      setSaving((prev) => ({
        ...prev,
        error: isZh
          ? "保存选项失败，请稍后重试。"
          : "Failed to save option. Please try again.",
      }));
    } finally {
      setSavingOptionChoiceId(null);
    }
  }

  async function handleDeleteOptionChoice(
    categoryId: string,
    itemId: string,
    groupId: string,
    choiceId: string,
  ) {
    if (
      !window.confirm(
        isZh ? "确定要删除这个选项吗？" : "Delete this option permanently?",
      )
    ) {
      return;
    }

    setDeletingOptionChoiceId(choiceId);
    setSaving((prev) => ({ ...prev, error: null }));

    try {
      await apiFetch(`/admin/menu/options/${choiceId}`, {
        method: "DELETE",
      });

      await reloadMenu();
    } catch (err) {
      console.error(err);
      setSaving((prev) => ({
        ...prev,
        error: isZh
          ? "删除选项失败，请稍后重试。"
          : "Failed to delete option. Please try again.",
      }));
    } finally {
      setDeletingOptionChoiceId(null);
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

  // ===== 渲染 ===== //

  return (
    <div className="space-y-8">
      {/* 顶部说明 */}
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Admin
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">
          菜单维护（图片上传 & 配料说明 & 选项组）
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          这里可以维护线上菜单的数据：分类、菜品名称、价格、上下架状态、展示图片（支持上传）、配料说明（中英文），以及每个菜品的选项组和选项。
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
  // 扩展一下类型，避免使用 any
  type CategoryWithOptionalMeta = DbMenuCategory & {
    nameZh?: string | null;
    isActive?: boolean | null;
  };

  const catWithMeta = cat as CategoryWithOptionalMeta;

  const localizedCatName =
    isZh && catWithMeta.nameZh ? catWithMeta.nameZh : catWithMeta.nameEn;

  const isActiveCategory =
    typeof catWithMeta.isActive === "boolean" ? catWithMeta.isActive : true;

  return (
    <div key={catWithMeta.id} className="rounded-2xl border p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-base font-semibold text-slate-900">
            {localizedCatName}
          </p>
          <p className="text-xs text-slate-500">
            {isZh ? "排序" : "Sort"}: {catWithMeta.sortOrder} ·{" "}
            {catWithMeta.items.length}{" "}
            {isZh
              ? "个菜品"
              : catWithMeta.items.length === 1
              ? "item"
              : "items"}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
            isActiveCategory
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {isActiveCategory
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
                    {cat.items.map((rawItem) => {
                      const item = rawItem as MenuItemWithOptions;
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

                      const priceDisplay = (item.basePriceCents / 100).toFixed(
                        2,
                      );
                      const isExpanded = !!expandedItems[item.id];
                      const optionGroups = item.optionGroups ?? [];

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

                              {/* 图片上传区域 */}
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  菜品图片
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
                                      className="w-full rounded-md border px-2 py-1 text-[11px] font-mono"
                                      value={item.imageUrl ?? ""}
                                      onChange={(e) =>
                                        updateItemField(
                                          cat.id,
                                          item.id,
                                          "imageUrl",
                                          e.target
                                            .value as DbMenuItem["imageUrl"],
                                        )
                                      }
                                      placeholder={
                                        isZh
                                          ? "图片上传后会自动填入 URL，如需特殊处理可手动修改。"
                                          : "After upload, URL will be filled automatically. You may edit if needed."
                                      }
                                    />
                                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="text-[11px]"
                                        onChange={(e) => {
                                          const file =
                                            e.target.files?.[0] ?? null;
                                          if (file) {
                                            void handleUploadItemImage(
                                              cat.id,
                                              item.id,
                                              file,
                                            );
                                          }
                                        }}
                                      />
                                      <span className="text-[10px] text-slate-400">
                                        {uploadingImageForItem === item.id
                                          ? isZh
                                            ? "图片上传中…"
                                            : "Uploading image..."
                                          : isZh
                                          ? "支持 jpg/png/webp，建议尺寸不小于 600×600。"
                                          : "Supports jpg/png/webp. Recommended size ≥ 600×600."}
                                      </span>
                                    </div>
                                  </div>
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

                              {/* 选项组 & 选项 */}
                              <div className="mt-3 space-y-2 rounded-lg bg白/70 p-3">
                                <div className="flex items-center justify-between">
                                  <p className="text-[11px] font-semibold text-slate-700">
                                    {isZh
                                      ? "选项组 & 选项（如 辣度、加料）"
                                      : "Option groups & options (e.g., spice level, add-ons)"}
                                  </p>
                                  <p className="text-[10px] text-slate-400">
                                    {optionGroups.length}{" "}
                                    {isZh ? "个选项组" : "groups"}
                                  </p>
                                </div>

                                {optionGroups.length === 0 ? (
                                  <p className="text-[11px] text-slate-400">
                                    {isZh
                                      ? "当前菜品还没有选项组，可以在下方“新建选项组”中添加。"
                                      : "No option groups yet. Use “Create option group” below to add."}
                                  </p>
                                ) : (
                                  <div className="space-y-3">
                                    {optionGroups.map((group) => (
                                      <div
                                        key={group.id}
                                        className="space-y-2 rounded-md border bg-slate-50/80 p-2"
                                      >
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                          <div>
                                            <p className="text-[11px] font-semibold text-slate-800">
                                              {isZh && group.nameZh
                                                ? group.nameZh
                                                : group.nameEn}
                                            </p>
                                            <p className="text-[10px] text-slate-500">
                                              {isZh ? "排序" : "Sort"}:{" "}
                                              {group.sortOrder} ·{" "}
                                              {group.options?.length ?? 0}{" "}
                                              {isZh ? "个选项" : "options"}
                                            </p>
                                          </div>
                                          <div className="flex flex-wrap items-center gap-2">
<span
  className={`rounded-full px-2 py-0.5 text-[10px] ${
    group.minSelect > 0
      ? "bg-emerald-50 text-emerald-700"
      : "bg-slate-100 text-slate-600"
  }`}
>
  {group.minSelect > 0
    ? isZh
      ? `至少选择 ${group.minSelect} 项`
      : `Min ${group.minSelect} choice${group.minSelect > 1 ? "s" : ""}`
    : isZh
    ? "可选"
    : "Optional"}
</span>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                void handleDeleteOptionGroup(
                                                  cat.id,
                                                  item.id,
                                                  group.id,
                                                )
                                              }
                                              className="text-[10px] font-medium text-red-600 hover:text-red-500"
                                              disabled={
                                                deletingOptionGroupId ===
                                                group.id
                                              }
                                            >
                                              {deletingOptionGroupId ===
                                              group.id
                                                ? isZh
                                                  ? "删除中…"
                                                  : "Deleting..."
                                                : isZh
                                                ? "删除选项组"
                                                : "Delete group"}
                                            </button>
                                          </div>
                                        </div>

                                        {/* 选项组编辑 */}
<div className="grid gap-2 md:grid-cols-5">
  <div className="space-y-1">
    <label className="block text-[10px] font-medium text-slate-500">
      名称（EN）
    </label>
    <input
      type="text"
      className="w-full rounded-md border px-2 py-1 text-[11px]"
      value={group.nameEn}
      onChange={(e) =>
        updateOptionGroupField(
          cat.id,
          item.id,
          group.id,
          "nameEn",
          e.target.value as MenuOptionGroup["nameEn"],
        )
      }
    />
  </div>

  <div className="space-y-1">
    <label className="block text-[10px] font-medium text-slate-500">
      名称（中文）
    </label>
    <input
      type="text"
      className="w-full rounded-md border px-2 py-1 text-[11px]"
      value={group.nameZh ?? ""}
      onChange={(e) =>
        updateOptionGroupField(
          cat.id,
          item.id,
          group.id,
          "nameZh",
          e.target.value as MenuOptionGroup["nameZh"],
        )
      }
    />
  </div>

  <div className="space-y-1">
    <label className="block text-[10px] font-medium text-slate-500">
      最少选择（minSelect）
    </label>
    <input
      type="number"
      className="w-full rounded-md border px-2 py-1 text-[11px]"
      value={group.minSelect}
      onChange={(e) =>
        updateOptionGroupField(
          cat.id,
          item.id,
          group.id,
          "minSelect",
          Number.isNaN(Number(e.target.value))
            ? (0 as MenuOptionGroup["minSelect"])
            : (Number(
                e.target.value,
              ) as MenuOptionGroup["minSelect"]),
        )
      }
      placeholder={isZh ? "0 = 可不选" : "0 = optional"}
    />
  </div>

  <div className="space-y-1">
    <label className="block text-[10px] font-medium text-slate-500">
      最大可选数量（maxSelect）
    </label>
    <input
      type="number"
      className="w-full rounded-md border px-2 py-1 text-[11px]"
      value={group.maxSelect ?? ""}
      onChange={(e) =>
        updateOptionGroupField(
          cat.id,
          item.id,
          group.id,
          "maxSelect",
          e.target.value === ""
            ? (null as MenuOptionGroup["maxSelect"])
            : (Number(
                e.target.value,
              ) as MenuOptionGroup["maxSelect"]),
        )
      }
      placeholder={isZh ? "空 = 不限制" : "empty = no limit"}
    />
  </div>

  <div className="space-y-1">
    <label className="block text-[10px] font-medium text-slate-500">
      排序
    </label>
    <input
      type="number"
      className="w-full rounded-md border px-2 py-1 text-[11px]"
      value={group.sortOrder}
      onChange={(e) =>
        updateOptionGroupField(
          cat.id,
          item.id,
          group.id,
          "sortOrder",
          Number(
            e.target.value,
          ) as MenuOptionGroup["sortOrder"],
        )
      }
    />
  </div>
</div>

<div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
  <p className="text-[10px] text-slate-500">
    {isZh
      ? "说明：最少选择为 0 表示可不选；≥1 表示下单时必须至少选对应数量。最大可选为空表示不限制。"
      : "Note: min select 0 means optional; ≥1 means the customer must pick at least that many. Empty max means no upper limit."}
  </p>
  <button
    type="button"
    onClick={() => void handleSaveOptionGroup(cat.id, item.id, group)}
    className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-semibold text-white hover:bg-slate-700"
    disabled={savingOptionGroupId === group.id}
  >
    {savingOptionGroupId === group.id
      ? isZh
        ? "保存中…"
        : "Saving..."
      : isZh
      ? "保存选项组"
      : "Save group"}
  </button>
</div>

                                        {/* 选项列表 */}
                                        <div className="mt-2 space-y-2 rounded border border-dashed border-slate-300 bg-white/80 p-2">
                                          {(group.options?.length ?? 0) === 0 ? (
                                            <p className="text-[10px] text-slate-400">
                                              {isZh
                                                ? "该选项组还没有选项，可以在下方添加。"
                                                : "No options yet. Add one below."}
                                            </p>
                                          ) : (
                                            <div className="space-y-2">
                                              {(group.options ?? []).map(
                                                (choice) => (
                                                  <div
                                                    key={choice.id}
                                                    className="grid gap-2 rounded border bg-slate-50 p-2 md:grid-cols-5"
                                                  >
                                                    <div className="space-y-1 md:col-span-2">
                                                      <label className="block text-[10px] font-medium text-slate-500">
                                                        名称（EN）
                                                      </label>
                                                      <input
                                                        type="text"
                                                        className="w-full rounded-md border px-2 py-1 text-[11px]"
                                                        value={choice.nameEn}
                                                        onChange={(e) =>
                                                          updateOptionChoiceField(
                                                            cat.id,
                                                            item.id,
                                                            group.id,
                                                            choice.id,
                                                            "nameEn",
                                                            e.target
                                                              .value as MenuOptionChoice["nameEn"],
                                                          )
                                                        }
                                                      />
                                                      <label className="mt-1 block text-[10px] font-medium text-slate-500">
                                                        名称（中文）
                                                      </label>
                                                      <input
                                                        type="text"
                                                        className="w-full rounded-md border px-2 py-1 text-[11px]"
                                                        value={
                                                          choice.nameZh ?? ""
                                                        }
                                                        onChange={(e) =>
                                                          updateOptionChoiceField(
                                                            cat.id,
                                                            item.id,
                                                            group.id,
                                                            choice.id,
                                                            "nameZh",
                                                            e.target
                                                              .value as MenuOptionChoice["nameZh"],
                                                          )
                                                        }
                                                      />
                                                    </div>
                                                    <div className="space-y-1">
                                                      <label className="block text-[10px] font-medium text-slate-500">
                                                        加价（CAD）
                                                      </label>
                                                      <input
                                                        type="number"
                                                        min={0}
                                                        step="0.01"
                                                        className="w-full rounded-md border px-2 py-1 text-[11px]"
                                                        value={(
                                                          choice.priceDeltaCents /
                                                          100
                                                        ).toFixed(2)}
                                                        onChange={(e) => {
                                                          const v = Number(
                                                            e.target.value,
                                                          );
                                                          if (
                                                            Number.isNaN(v)
                                                          ) {
                                                            return;
                                                          }
                                                          updateOptionChoiceField(
                                                            cat.id,
                                                            item.id,
                                                            group.id,
                                                            choice.id,
                                                            "priceDeltaCents",
                                                            Math.round(
                                                              v * 100,
                                                            ) as MenuOptionChoice["priceDeltaCents"],
                                                          );
                                                        }}
                                                      />
                                                      <p className="mt-1 text-[10px] text-slate-400">
                                                        {isZh
                                                          ? "0 表示不加价"
                                                          : "0 means no extra charge"}
                                                      </p>
                                                    </div>
                                                    <div className="space-y-1">
                                                      <label className="block text-[10px] font-medium text-slate-500">
                                                        排序
                                                      </label>
                                                      <input
                                                        type="number"
                                                        className="w-full rounded-md border px-2 py-1 text-[11px]"
                                                        value={choice.sortOrder}
                                                        onChange={(e) =>
                                                          updateOptionChoiceField(
                                                            cat.id,
                                                            item.id,
                                                            group.id,
                                                            choice.id,
                                                            "sortOrder",
                                                            Number(
                                                              e.target.value,
                                                            ) as MenuOptionChoice["sortOrder"],
                                                          )
                                                        }
                                                      />
                                                      <label className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-700">
                                                        <input
                                                          type="checkbox"
                                                          className="h-3 w-3 rounded border-slate-300"
                                                          checked={
                                                            choice.isAvailable
                                                          }
                                                          onChange={(e) =>
                                                            updateOptionChoiceField(
                                                              cat.id,
                                                              item.id,
                                                              group.id,
                                                              choice.id,
                                                              "isAvailable",
                                                              e.target
                                                                .checked as MenuOptionChoice["isAvailable"],
                                                            )
                                                          }
                                                        />
                                                        {isZh
                                                          ? "可选"
                                                          : "Selectable"}
                                                      </label>
                                                    </div>
                                                    <div className="flex flex-col items-end justify-between gap-2">
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          void handleSaveOptionChoice(
                                                            cat.id,
                                                            item.id,
                                                            group.id,
                                                            choice,
                                                          )
                                                        }
                                                        className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-semibold text-white hover:bg-slate-700"
                                                        disabled={
                                                          savingOptionChoiceId ===
                                                          choice.id
                                                        }
                                                      >
                                                        {savingOptionChoiceId ===
                                                        choice.id
                                                          ? isZh
                                                            ? "保存中…"
                                                            : "Saving..."
                                                          : isZh
                                                          ? "保存选项"
                                                          : "Save option"}
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          void handleDeleteOptionChoice(
                                                            cat.id,
                                                            item.id,
                                                            group.id,
                                                            choice.id,
                                                          )
                                                        }
                                                        className="text-[10px] font-medium text-red-600 hover:text-red-500"
                                                        disabled={
                                                          deletingOptionChoiceId ===
                                                          choice.id
                                                        }
                                                      >
                                                        {deletingOptionChoiceId ===
                                                        choice.id
                                                          ? isZh
                                                            ? "删除中…"
                                                            : "Deleting..."
                                                          : isZh
                                                          ? "删除"
                                                          : "Delete"}
                                                      </button>
                                                    </div>
                                                  </div>
                                                ),
                                              )}
                                            </div>
                                          )}

                                          {/* 新建选项 */}
                                          <div className="mt-2 rounded border border-dashed border-slate-300 bg-slate-50/80 p-2">
                                            <p className="mb-1 text-[10px] font-semibold text-slate-700">
                                              {isZh
                                                ? "新建选项"
                                                : "Create new option"}
                                            </p>
                                            {(() => {
                                              const draft =
                                                getNewOptionChoiceDraft(
                                                  group.id,
                                                );
                                              return (
                                                <div className="grid gap-2 md:grid-cols-4">
                                                  <div className="space-y-1 md:col-span-2">
                                                    <label className="block text-[10px] font-medium text-slate-500">
                                                      名称（EN）
                                                    </label>
                                                    <input
                                                      type="text"
                                                      className="w-full rounded-md border px-2 py-1 text-[11px]"
                                                      value={draft.nameEn}
                                                      onChange={(e) =>
                                                        updateNewOptionChoiceDraft(
                                                          group.id,
                                                          "nameEn",
                                                          e.target.value,
                                                        )
                                                      }
                                                    />
                                                    <label className="mt-1 block text-[10px] font-medium text-slate-500">
                                                      名称（中文）
                                                    </label>
                                                    <input
                                                      type="text"
                                                      className="w-full rounded-md border px-2 py-1 text-[11px]"
                                                      value={draft.nameZh}
                                                      onChange={(e) =>
                                                        updateNewOptionChoiceDraft(
                                                          group.id,
                                                          "nameZh",
                                                          e.target.value,
                                                        )
                                                      }
                                                    />
                                                  </div>
                                                  <div className="space-y-1">
                                                    <label className="block text-[10px] font-medium text-slate-500">
                                                      加价（CAD）
                                                    </label>
                                                    <input
                                                      type="number"
                                                      min={0}
                                                      step="0.01"
                                                      className="w-full rounded-md border px-2 py-1 text-[11px]"
                                                      value={draft.priceDelta}
                                                      onChange={(e) =>
                                                        updateNewOptionChoiceDraft(
                                                          group.id,
                                                          "priceDelta",
                                                          e.target.value,
                                                        )
                                                      }
                                                    />
                                                  </div>
                                                  <div className="space-y-1">
                                                    <label className="block text-[10px] font-medium text-slate-500">
                                                      排序
                                                    </label>
                                                    <input
                                                      type="number"
                                                      className="w-full rounded-md border px-2 py-1 text-[11px]"
                                                      value={draft.sortOrder}
                                                      onChange={(e) =>
                                                        updateNewOptionChoiceDraft(
                                                          group.id,
                                                          "sortOrder",
                                                          e.target.value,
                                                        )
                                                      }
                                                    />
                                                    <div className="mt-1 flex justify-end">
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          void handleCreateOptionChoice(
                                                            cat.id,
                                                            item.id,
                                                            group.id,
                                                          )
                                                        }
                                                        className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-semibold text-white hover:bg-slate-700"
                                                        disabled={
                                                          savingOptionChoiceId ===
                                                          "new"
                                                        }
                                                      >
                                                        {savingOptionChoiceId ===
                                                        "new"
                                                          ? isZh
                                                            ? "创建中…"
                                                            : "Creating..."
                                                          : isZh
                                                          ? "添加选项"
                                                          : "Add option"}
                                                      </button>
                                                    </div>
                                                  </div>
                                                </div>
                                              );
                                            })()}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* 新建选项组 */}
                                <div className="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50/80 p-2">
                                  <p className="mb-1 text-[10px] font-semibold text-slate-700">
                                    {isZh ? "新建选项组" : "Create new option group"}
                                  </p>
                                  {(() => {
                                    const draft = getNewOptionGroupDraft(
                                      item.id,
                                    );
                                    return (
                                      <div className="grid gap-2 md:grid-cols-4">
                                        <div className="space-y-1">
                                          <label className="block text-[10px] font-medium text-slate-500">
                                            名称（EN）
                                          </label>
                                          <input
                                            type="text"
                                            className="w-full rounded-md border px-2 py-1 text-[11px]"
                                            value={draft.nameEn}
                                            onChange={(e) =>
                                              updateNewOptionGroupDraft(
                                                item.id,
                                                "nameEn",
                                                e.target.value,
                                              )
                                            }
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="block text-[10px] font-medium text-slate-500">
                                            名称（中文）
                                          </label>
                                          <input
                                            type="text"
                                            className="w-full rounded-md border px-2 py-1 text-[11px]"
                                            value={draft.nameZh}
                                            onChange={(e) =>
                                              updateNewOptionGroupDraft(
                                                item.id,
                                                "nameZh",
                                                e.target.value,
                                              )
                                            }
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="block text-[10px] font-medium text-slate-500">
                                            最大可选数量
                                          </label>
                                          <input
                                            type="number"
                                            className="w-full rounded-md border px-2 py-1 text-[11px]"
                                            value={draft.maxSelect}
                                            onChange={(e) =>
                                              updateNewOptionGroupDraft(
                                                item.id,
                                                "maxSelect",
                                                e.target.value,
                                              )
                                            }
                                            placeholder={
                                              isZh ? "空=不限制" : "empty = no limit"
                                            }
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="block text-[10px] font-medium text-slate-500">
                                            排序
                                          </label>
                                          <input
                                            type="number"
                                            className="w-full rounded-md border px-2 py-1 text-[11px]"
                                            value={draft.sortOrder}
                                            onChange={(e) =>
                                              updateNewOptionGroupDraft(
                                                item.id,
                                                "sortOrder",
                                                e.target.value,
                                              )
                                            }
                                          />
                                          <div className="mt-1 flex items-center justify-between">
                                            <label className="inline-flex items-center gap-1 text-[10px] text-slate-700">
                                              <input
                                                type="checkbox"
                                                className="h-3 w-3 rounded border-slate-300"
                                                checked={draft.isRequired}
                                                onChange={(e) =>
                                                  updateNewOptionGroupDraft(
                                                    item.id,
                                                    "isRequired",
                                                    e.target.checked,
                                                  )
                                                }
                                              />
                                              {isZh ? "必选" : "Required"}
                                            </label>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                void handleCreateOptionGroup(
                                                  cat.id,
                                                  item.id,
                                                )
                                              }
                                              className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-semibold text-white hover:bg-slate-700"
                                              disabled={
                                                savingOptionGroupId === "new"
                                              }
                                            >
                                              {savingOptionGroupId === "new"
                                                ? isZh
                                                  ? "创建中…"
                                                  : "Creating..."
                                                : isZh
                                                ? "添加选项组"
                                                : "Add group"}
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>

                              <div className="mt-2 flex items-center justify-between">
                                <p className="text-[11px] text-slate-500">
                                  {isZh
                                    ? "保存后，顾客菜单页会实时使用最新的图片、配料说明以及选项组。"
                                    : "After saving, the customer menu will use the updated image, ingredients, and options."}
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
                                  菜品图片
                                </label>
                                <div className="space-y-1">
                                  <input
                                    type="text"
                                    className="w-full rounded-md border px-2 py-1 text-[11px] font-mono"
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
                                        const file =
                                          e.target.files?.[0] ?? null;
                                        if (file) {
                                          void handleUploadNewItemImage(
                                            cat.id,
                                            file,
                                          );
                                        }
                                      }}
                                    />
                                    <span className="text-[10px] text-slate-400">
                                      {uploadingImageForDraftCategory ===
                                      cat.id
                                        ? isZh
                                          ? "图片上传中…"
                                          : "Uploading image..."
                                        : isZh
                                        ? "可不填，后续也可在菜品编辑中上传图片。"
                                        : "Optional – you can also upload after the item is created."}
                                    </span>
                                  </div>
                                </div>
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
