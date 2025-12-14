// apps/web/src/app/[locale]/admin/menu/OptionTemplatesPanel.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";

type TemplateOptionChoice = {
  id: string;
  nameEn: string;
  nameZh?: string | null;
  priceDeltaCents: number;
  isAvailable: boolean;
  tempUnavailableUntil: string | null;
  sortOrder: number;
};

type OptionGroupTemplate = {
  id: string;
  nameEn: string;
  nameZh?: string | null;

  defaultMinSelect: number;
  defaultMaxSelect: number | null;

  isAvailable: boolean;
  tempUnavailableUntil: string | null;

  sortOrder: number;

  options: TemplateOptionChoice[];
};

type AvailabilityMode = "ON" | "PERMANENT_OFF" | "TEMP_TODAY_OFF";

function formatMoney(cents: number): string {
  const v = (cents ?? 0) / 100;
  return `$${v.toFixed(2)}`;
}

function effectiveAvailable(isAvailable: boolean, tempUntil: string | null): boolean {
  if (!isAvailable) return false;
  if (!tempUntil) return true;
  // tempUntil > now 代表仍在临时下架窗口内
  return new Date(tempUntil).getTime() <= Date.now();
}

function SectionCard({
  id,
  title,
  subtitle,
  children,
  actions,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-4 rounded-2xl border bg-white/80 p-6 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "good" | "warn" | "off";
}) {
  const cls =
    tone === "good"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "warn"
      ? "bg-amber-50 text-amber-700"
      : "bg-slate-100 text-slate-600";
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

export function OptionTemplatesPanel({ isZh }: { isZh: boolean }) {
  const [templates, setTemplates] = useState<OptionGroupTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // ---- Create Template Group ----
  const [newGroupNameEn, setNewGroupNameEn] = useState("");
  const [newGroupNameZh, setNewGroupNameZh] = useState("");
  const [newGroupSortOrder, setNewGroupSortOrder] = useState<number>(0);
  const [newGroupDefaultMin, setNewGroupDefaultMin] = useState<number>(0);
  const [newGroupDefaultMax, setNewGroupDefaultMax] = useState<string>("1"); // "" => null

  // ---- Per-group “new option” draft ----
  const [newOptionDraft, setNewOptionDraft] = useState<
    Record<
      string,
      {
        nameEn: string;
        nameZh: string;
        priceDeltaCents: string; // cents
        sortOrder: string;
      }
    >
  >({});

  // ---- Per-option edit state ----
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [optionEditDraft, setOptionEditDraft] = useState<
    Record<
      string,
      {
        nameEn: string;
        nameZh: string;
        priceDeltaCents: string;
        sortOrder: string;
      }
    >
  >({});

  const sortedTemplates = useMemo(() => {
    return templates
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((g) => ({
        ...g,
        options: (g.options ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
      }));
  }, [templates]);

  async function loadTemplates(): Promise<void> {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiFetch<OptionGroupTemplate[]>(
        "/admin/menu/option-group-templates",
      );
      setTemplates(res ?? []);
    } catch (e) {
      console.error(e);
      setErr(isZh ? "加载选项库失败，请稍后重试。" : "Failed to load option templates.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isZh]);

  function getGroupStatusTone(g: OptionGroupTemplate): "good" | "warn" | "off" {
    if (!g.isAvailable) return "off";
    if (g.tempUnavailableUntil && !effectiveAvailable(true, g.tempUnavailableUntil)) return "warn";
    return "good";
  }

  function getGroupStatusLabel(g: OptionGroupTemplate): string {
    if (!g.isAvailable) return isZh ? "永久下架" : "Off (permanent)";
    if (g.tempUnavailableUntil && !effectiveAvailable(true, g.tempUnavailableUntil))
      return isZh ? "今日下架" : "Off (today)";
    return isZh ? "上架" : "On";
  }

  function getOptionStatusTone(o: TemplateOptionChoice): "good" | "warn" | "off" {
    if (!o.isAvailable) return "off";
    if (o.tempUnavailableUntil && !effectiveAvailable(true, o.tempUnavailableUntil)) return "warn";
    return "good";
  }

  function getOptionStatusLabel(o: TemplateOptionChoice): string {
    if (!o.isAvailable) return isZh ? "永久下架" : "Off (permanent)";
    if (o.tempUnavailableUntil && !effectiveAvailable(true, o.tempUnavailableUntil))
      return isZh ? "今日下架" : "Off (today)";
    return isZh ? "上架" : "On";
  }

  async function createTemplateGroup(): Promise<void> {
    const nameEn = newGroupNameEn.trim();
    if (!nameEn) return;

    const defaultMax =
      newGroupDefaultMax.trim() === "" ? null : Math.max(0, Math.floor(Number(newGroupDefaultMax)));

    try {
      await apiFetch("/admin/menu/option-group-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameEn,
          nameZh: newGroupNameZh.trim() || undefined,
          sortOrder: Number.isFinite(newGroupSortOrder) ? newGroupSortOrder : 0,
          defaultMinSelect: Math.max(0, Math.floor(newGroupDefaultMin)),
          defaultMaxSelect: defaultMax,
        }),
      });

      setNewGroupNameEn("");
      setNewGroupNameZh("");
      setNewGroupSortOrder(0);
      setNewGroupDefaultMin(0);
      setNewGroupDefaultMax("1");

      await loadTemplates();
    } catch (e) {
      console.error(e);
    }
  }

  async function setTemplateGroupAvailability(
    groupId: string,
    mode: AvailabilityMode,
  ): Promise<void> {
    try {
      await apiFetch(`/admin/menu/option-group-templates/${groupId}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      await loadTemplates();
    } catch (e) {
      console.error(e);
    }
  }

  function ensureDraft(groupId: string) {
    setNewOptionDraft((prev) => {
      if (prev[groupId]) return prev;
      return {
        ...prev,
        [groupId]: { nameEn: "", nameZh: "", priceDeltaCents: "0", sortOrder: "0" },
      };
    });
  }

  async function createOption(groupId: string): Promise<void> {
    const draft = newOptionDraft[groupId];
    if (!draft) return;

    const nameEn = draft.nameEn.trim();
    if (!nameEn) return;

    const priceDeltaCents = Math.round(Number(draft.priceDeltaCents || "0"));
    const sortOrder = Math.floor(Number(draft.sortOrder || "0"));

    try {
      await apiFetch(`/admin/menu/option-group-templates/${groupId}/options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameEn,
          nameZh: draft.nameZh.trim() || undefined,
          priceDeltaCents: Number.isFinite(priceDeltaCents) ? priceDeltaCents : 0,
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        }),
      });

      setNewOptionDraft((prev) => ({
        ...prev,
        [groupId]: { nameEn: "", nameZh: "", priceDeltaCents: "0", sortOrder: "0" },
      }));

      await loadTemplates();
    } catch (e) {
      console.error(e);
    }
  }

  function startEditOption(opt: TemplateOptionChoice): void {
    setEditingOptionId(opt.id);
    setOptionEditDraft((prev) => ({
      ...prev,
      [opt.id]: {
        nameEn: opt.nameEn ?? "",
        nameZh: opt.nameZh ?? "",
        priceDeltaCents: String(opt.priceDeltaCents ?? 0),
        sortOrder: String(opt.sortOrder ?? 0),
      },
    }));
  }

  async function saveOption(optionId: string): Promise<void> {
    const draft = optionEditDraft[optionId];
    if (!draft) return;

    const nameEn = draft.nameEn.trim();
    if (!nameEn) return;

    const priceDeltaCents = Math.round(Number(draft.priceDeltaCents || "0"));
    const sortOrder = Math.floor(Number(draft.sortOrder || "0"));

    try {
      await apiFetch(`/admin/menu/options/${optionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameEn,
          nameZh: draft.nameZh.trim() || undefined,
          priceDeltaCents: Number.isFinite(priceDeltaCents) ? priceDeltaCents : 0,
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        }),
      });

      setEditingOptionId(null);
      await loadTemplates();
    } catch (e) {
      console.error(e);
    }
  }

  async function setOptionAvailability(optionId: string, mode: AvailabilityMode): Promise<void> {
    try {
      await apiFetch(`/admin/menu/options/${optionId}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      await loadTemplates();
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteOption(optionId: string): Promise<void> {
    try {
      await apiFetch(`/admin/menu/options/${optionId}`, { method: "DELETE" });
      await loadTemplates();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <SectionCard
      id="option-templates"
      title={isZh ? "选项库（全局）" : "Option Library (Global)"}
      subtitle={
        isZh
          ? "这里维护全局复用的选项组与选项（如：香菜、辣度、加蛋），价格/上下架对所有绑定菜品全局生效。"
          : "Manage reusable option groups/choices (e.g., cilantro, spiciness, add egg). Price/availability changes apply globally."
      }
      actions={
        <button
          type="button"
          onClick={() => void loadTemplates()}
          className="rounded-md border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {isZh ? "刷新" : "Refresh"}
        </button>
      }
    >
      {/* Create group */}
      <div className="rounded-xl border bg-slate-50 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="space-y-1 md:col-span-4">
            <label className="block text-[11px] font-medium text-slate-500">
              {isZh ? "组名（英文）*" : "Group name (EN)*"}
            </label>
            <input
              className="h-9 w-full rounded-md border px-3 text-sm"
              placeholder={isZh ? "例如：Spiciness" : "e.g. Spiciness"}
              value={newGroupNameEn}
              onChange={(e) => setNewGroupNameEn(e.target.value)}
            />
          </div>

          <div className="space-y-1 md:col-span-4">
            <label className="block text-[11px] font-medium text-slate-500">
              {isZh ? "组名（中文）" : "Group name (ZH)"}
            </label>
            <input
              className="h-9 w-full rounded-md border px-3 text-sm"
              placeholder={isZh ? "例如：辣度" : "e.g. 辣度"}
              value={newGroupNameZh}
              onChange={(e) => setNewGroupNameZh(e.target.value)}
            />
          </div>

          <div className="space-y-1 md:col-span-1">
            <label className="block text-[11px] font-medium text-slate-500">
              min
            </label>
            <input
              className="h-9 w-full rounded-md border px-2 text-sm tabular-nums"
              type="number"
              value={newGroupDefaultMin}
              onChange={(e) => setNewGroupDefaultMin(Number(e.target.value))}
            />
          </div>

          <div className="space-y-1 md:col-span-1">
            <label className="block text-[11px] font-medium text-slate-500">
              max
            </label>
            <input
              className="h-9 w-full rounded-md border px-2 text-sm tabular-nums"
              placeholder={isZh ? "空=不限" : "blank=unlimited"}
              value={newGroupDefaultMax}
              onChange={(e) => setNewGroupDefaultMax(e.target.value)}
            />
          </div>

          <div className="space-y-1 md:col-span-1">
            <label className="block text-[11px] font-medium text-slate-500">
              {isZh ? "排序" : "Sort"}
            </label>
            <input
              className="h-9 w-full rounded-md border px-2 text-sm tabular-nums"
              type="number"
              value={newGroupSortOrder}
              onChange={(e) => setNewGroupSortOrder(Number(e.target.value))}
            />
          </div>

          <div className="flex items-end md:col-span-1">
            <button
              type="button"
              onClick={() => void createTemplateGroup()}
              className="h-9 w-full rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {isZh ? "创建" : "Create"}
            </button>
          </div>

          <p className="md:col-span-12 text-[10px] text-slate-500">
            {isZh
              ? "提示：max 留空表示不限制（无限）。"
              : "Tip: Leave max blank for unlimited."}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">{isZh ? "加载中…" : "Loading…"}</p>
      ) : err ? (
        <p className="text-sm text-red-600">{err}</p>
      ) : sortedTemplates.length === 0 ? (
        <p className="text-sm text-slate-500">{isZh ? "暂无选项组库。" : "No option templates yet."}</p>
      ) : (
        <div className="space-y-4">
          {sortedTemplates.map((g) => {
            const groupName = isZh && g.nameZh ? g.nameZh : g.nameEn;
            const tone = getGroupStatusTone(g);
            const label = getGroupStatusLabel(g);

            return (
              <div key={g.id} id={`group-${g.id}`} className="rounded-xl border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-base font-semibold text-slate-900">
                        {groupName}
                      </p>
                      <Badge tone={tone}>{label}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {isZh ? "默认规则" : "Defaults"}: min={g.defaultMinSelect}, max=
                      {g.defaultMaxSelect == null ? (isZh ? "不限" : "unlimited") : g.defaultMaxSelect},{" "}
                      {isZh ? "排序" : "sort"}={g.sortOrder}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-full border bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      onClick={() => void setTemplateGroupAvailability(g.id, "ON")}
                    >
                      {isZh ? "上架" : "On"}
                    </button>
                    <button
                      type="button"
                      className="rounded-full border bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      onClick={() => void setTemplateGroupAvailability(g.id, "TEMP_TODAY_OFF")}
                    >
                      {isZh ? "今日下架" : "Off today"}
                    </button>
                    <button
                      type="button"
                      className="rounded-full border bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      onClick={() => void setTemplateGroupAvailability(g.id, "PERMANENT_OFF")}
                    >
                      {isZh ? "永久下架" : "Off perm"}
                    </button>
                  </div>
                </div>

                {/* Add option */}
                <div className="mt-4 rounded-lg border bg-white p-3">
                  {newOptionDraft[g.id] ? null : (
                    <button
                      type="button"
                      className="text-xs font-medium text-emerald-700 hover:text-emerald-600"
                      onClick={() => ensureDraft(g.id)}
                    >
                      {isZh ? "添加一个选项" : "Add a choice"}
                    </button>
                  )}

                  {newOptionDraft[g.id] ? (
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-12">
                      <div className="space-y-1 md:col-span-4">
                        <label className="block text-[11px] font-medium text-slate-500">
                          {isZh ? "选项名（英文）*" : "Choice name (EN)*"}
                        </label>
                        <input
                          className="h-9 w-full rounded-md border px-3 text-sm"
                          placeholder={isZh ? "例如：Mild" : "e.g. Mild"}
                          value={newOptionDraft[g.id]?.nameEn ?? ""}
                          onChange={(e) =>
                            setNewOptionDraft((prev) => ({
                              ...prev,
                              [g.id]: { ...prev[g.id], nameEn: e.target.value },
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-1 md:col-span-4">
                        <label className="block text-[11px] font-medium text-slate-500">
                          {isZh ? "选项名（中文）" : "Choice name (ZH)"}
                        </label>
                        <input
                          className="h-9 w-full rounded-md border px-3 text-sm"
                          placeholder={isZh ? "例如：微辣" : "e.g. 微辣"}
                          value={newOptionDraft[g.id]?.nameZh ?? ""}
                          onChange={(e) =>
                            setNewOptionDraft((prev) => ({
                              ...prev,
                              [g.id]: { ...prev[g.id], nameZh: e.target.value },
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-1 md:col-span-2">
                        <label className="block text-[11px] font-medium text-slate-500">
                          {isZh ? "加价（分）" : "Delta (cents)"}
                        </label>
                        <input
                          className="h-9 w-full rounded-md border px-3 text-sm tabular-nums"
                          placeholder={isZh ? "例如：150" : "e.g. 150"}
                          value={newOptionDraft[g.id]?.priceDeltaCents ?? "0"}
                          onChange={(e) =>
                            setNewOptionDraft((prev) => ({
                              ...prev,
                              [g.id]: { ...prev[g.id], priceDeltaCents: e.target.value },
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-1 md:col-span-1">
                        <label className="block text-[11px] font-medium text-slate-500">
                          {isZh ? "排序" : "Sort"}
                        </label>
                        <input
                          className="h-9 w-full rounded-md border px-2 text-sm tabular-nums"
                          value={newOptionDraft[g.id]?.sortOrder ?? "0"}
                          onChange={(e) =>
                            setNewOptionDraft((prev) => ({
                              ...prev,
                              [g.id]: { ...prev[g.id], sortOrder: e.target.value },
                            }))
                          }
                        />
                      </div>

                      <div className="flex items-end md:col-span-1">
                        <button
                          type="button"
                          className="h-9 w-full rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800"
                          onClick={() => void createOption(g.id)}
                        >
                          {isZh ? "创建" : "Create"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Options list */}
                {g.options.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500">
                    {isZh ? "该组选项下暂无选项。" : "No choices yet."}
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {g.options.map((opt) => {
                      const optName = isZh && opt.nameZh ? opt.nameZh : opt.nameEn;
                      const optTone = getOptionStatusTone(opt);
                      const optLabel = getOptionStatusLabel(opt);
                      const isEditing = editingOptionId === opt.id;
                      const draft = optionEditDraft[opt.id];

                      return (
                        <div key={opt.id} className="rounded-lg border bg-slate-50 p-3">
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-medium text-slate-900">
                                  {optName}
                                </p>
                                <Badge tone={optTone}>{optLabel}</Badge>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                {isZh ? "加价" : "Delta"}: {formatMoney(opt.priceDeltaCents)} ·{" "}
                                {isZh ? "排序" : "sort"}={opt.sortOrder}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="rounded-full border bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                onClick={() => void setOptionAvailability(opt.id, "ON")}
                              >
                                {isZh ? "上架" : "On"}
                              </button>
                              <button
                                type="button"
                                className="rounded-full border bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                onClick={() => void setOptionAvailability(opt.id, "TEMP_TODAY_OFF")}
                              >
                                {isZh ? "今日下架" : "Off today"}
                              </button>
                              <button
                                type="button"
                                className="rounded-full border bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                onClick={() => void setOptionAvailability(opt.id, "PERMANENT_OFF")}
                              >
                                {isZh ? "永久下架" : "Off perm"}
                              </button>

                              {!isEditing ? (
                                <button
                                  type="button"
                                  className="rounded-full border bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                  onClick={() => startEditOption(opt)}
                                >
                                  {isZh ? "编辑" : "Edit"}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="rounded-full border bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800"
                                  onClick={() => void saveOption(opt.id)}
                                >
                                  {isZh ? "保存" : "Save"}
                                </button>
                              )}

                              <button
                                type="button"
                                className="rounded-full border bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                                onClick={() => void deleteOption(opt.id)}
                              >
                                {isZh ? "删除" : "Delete"}
                              </button>
                            </div>
                          </div>

                          {isEditing && draft ? (
                            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-12">
                              <div className="space-y-1 md:col-span-4">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  {isZh ? "英文名 *" : "Name EN *"}
                                </label>
                                <input
                                  className="h-9 w-full rounded-md border px-3 text-sm"
                                  value={draft.nameEn}
                                  onChange={(e) =>
                                    setOptionEditDraft((prev) => ({
                                      ...prev,
                                      [opt.id]: { ...prev[opt.id], nameEn: e.target.value },
                                    }))
                                  }
                                />
                              </div>

                              <div className="space-y-1 md:col-span-4">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  {isZh ? "中文名" : "Name ZH"}
                                </label>
                                <input
                                  className="h-9 w-full rounded-md border px-3 text-sm"
                                  value={draft.nameZh}
                                  onChange={(e) =>
                                    setOptionEditDraft((prev) => ({
                                      ...prev,
                                      [opt.id]: { ...prev[opt.id], nameZh: e.target.value },
                                    }))
                                  }
                                />
                              </div>

                              <div className="space-y-1 md:col-span-2">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  {isZh ? "加价（分）" : "Delta cents"}
                                </label>
                                <input
                                  className="h-9 w-full rounded-md border px-3 text-sm tabular-nums"
                                  value={draft.priceDeltaCents}
                                  onChange={(e) =>
                                    setOptionEditDraft((prev) => ({
                                      ...prev,
                                      [opt.id]: { ...prev[opt.id], priceDeltaCents: e.target.value },
                                    }))
                                  }
                                />
                              </div>

                              <div className="space-y-1 md:col-span-2">
                                <label className="block text-[11px] font-medium text-slate-500">
                                  {isZh ? "排序" : "Sort"}
                                </label>
                                <input
                                  className="h-9 w-full rounded-md border px-3 text-sm tabular-nums"
                                  value={draft.sortOrder}
                                  onChange={(e) =>
                                    setOptionEditDraft((prev) => ({
                                      ...prev,
                                      [opt.id]: { ...prev[opt.id], sortOrder: e.target.value },
                                    }))
                                  }
                                />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
