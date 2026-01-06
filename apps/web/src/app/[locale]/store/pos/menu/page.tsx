// apps/web/src/app/[locale]/store/pos/menu/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import type { Locale } from '@/lib/i18n/locales';
import { isAvailableNow } from '@shared/menu';
import type {
  AdminMenuCategoryDto,
  AdminMenuFullResponse,
  OptionChoiceDto,
  TemplateGroupFullDto,
} from '@shared/menu';

type AvailabilityMode = 'ON' | 'TEMP_TODAY_OFF' | 'PERMANENT_OFF';

const COPY = {
  zh: {
    title: 'POS 菜单管理',
    subtitle: '仅用于门店内快速上下架：菜品、选项组与选项。',
    backToPos: '返回 POS 点单',
    sections: {
      items: '菜品上下架',
      groups: '选项组上下架',
      options: '选项上下架',
    },
    status: {
      on: '上架',
      offToday: '当日下架',
      offPermanent: '永久下架',
    },
    actions: {
      on: '上架',
      offToday: '当日下架',
      offPermanent: '永久下架',
    },
    loading: '正在加载菜单数据…',
    error: '加载失败，请稍后重试。',
    empty: '暂无数据',
  },
  en: {
    title: 'POS Menu Management',
    subtitle: 'In-store availability controls only (items, option groups, options).',
    backToPos: 'Back to POS ordering',
    sections: {
      items: 'Item availability',
      groups: 'Option group availability',
      options: 'Option availability',
    },
    status: {
      on: 'On',
      offToday: 'Off today',
      offPermanent: 'Off permanently',
    },
    actions: {
      on: 'Set on',
      offToday: 'Off today',
      offPermanent: 'Off permanently',
    },
    loading: 'Loading menu data…',
    error: 'Failed to load. Please try again.',
    empty: 'No data',
  },
} as const;

type StatusLabels = {
  on: string;
  offToday: string;
  offPermanent: string;
};

type ActionLabels = {
  on: string;
  offToday: string;
  offPermanent: string;
};

function getAvailabilityLabel(
  isAvailable: boolean,
  tempUnavailableUntil: string | null,
  labels: StatusLabels,
) {
  if (!isAvailable) return labels.offPermanent;
  if (!isAvailableNow({ isAvailable, tempUnavailableUntil })) return labels.offToday;
  return labels.on;
}

function AvailabilityActions({
  onSet,
  disabled,
  labels,
}: {
  onSet: (mode: AvailabilityMode) => void;
  disabled?: boolean;
  labels: ActionLabels;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onSet('ON')}
        disabled={disabled}
        className="rounded-full border border-emerald-400/60 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200 disabled:opacity-50"
      >
        {labels.on}
      </button>
      <button
        type="button"
        onClick={() => onSet('TEMP_TODAY_OFF')}
        disabled={disabled}
        className="rounded-full border border-amber-400/60 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200 disabled:opacity-50"
      >
        {labels.offToday}
      </button>
      <button
        type="button"
        onClick={() => onSet('PERMANENT_OFF')}
        disabled={disabled}
        className="rounded-full border border-slate-500/60 bg-slate-700/50 px-3 py-1 text-xs font-semibold text-slate-200 disabled:opacity-50"
      >
        {labels.offPermanent}
      </button>
    </div>
  );
}

function statusTone(label: string, labels: StatusLabels): string {
  if (label === labels.on) return 'bg-emerald-500/10 text-emerald-200 border-emerald-400/60';
  if (label === labels.offToday) return 'bg-amber-500/10 text-amber-200 border-amber-400/60';
  return 'bg-slate-700/60 text-slate-200 border-slate-500/60';
}

export default function PosMenuManagementPage() {
  const { locale } = useParams<{ locale?: string }>();
  const safeLocale: Locale = locale === 'zh' ? 'zh' : 'en';
  const copy = COPY[safeLocale];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<AdminMenuCategoryDto[]>([]);
  const [templates, setTemplates] = useState<TemplateGroupFullDto[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const [menuRes, templatesRes] = await Promise.all([
        apiFetch<AdminMenuFullResponse>('/admin/menu/full'),
        apiFetch<TemplateGroupFullDto[]>('/admin/menu/option-group-templates'),
      ]);
      setCategories(menuRes.categories ?? []);
      setTemplates(templatesRes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeLocale]);

  async function setItemAvailability(itemStableId: string, mode: AvailabilityMode) {
    setSavingKey(`item-${itemStableId}`);
    try {
      await apiFetch(`/admin/menu/items/${encodeURIComponent(itemStableId)}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      await load();
    } finally {
      setSavingKey(null);
    }
  }

  async function setGroupAvailability(
    templateGroupStableId: string,
    mode: AvailabilityMode,
  ) {
    setSavingKey(`group-${templateGroupStableId}`);
    try {
      await apiFetch(
        `/admin/menu/option-group-templates/${encodeURIComponent(templateGroupStableId)}/availability`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        },
      );
      await load();
    } finally {
      setSavingKey(null);
    }
  }

  async function setOptionAvailability(optionStableId: string, mode: AvailabilityMode) {
    setSavingKey(`option-${optionStableId}`);
    try {
      await apiFetch(`/admin/menu/options/${encodeURIComponent(optionStableId)}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      await load();
    } finally {
      setSavingKey(null);
    }
  }

  const sortedTemplates = useMemo(
    () =>
      templates
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((tpl) => ({
          ...tpl,
          options: (tpl.options ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
        })),
    [templates],
  );

  return (
    <main className="min-h-screen bg-slate-900 text-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">{copy.title}</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">{copy.subtitle}</p>
          </div>
          <Link
            href={`/${safeLocale}/store/pos`}
            className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:border-slate-500"
          >
            {copy.backToPos}
          </Link>
        </div>

        {loading ? (
          <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-800/60 p-6 text-sm text-slate-300">
            {copy.loading}
          </div>
        ) : error ? (
          <div className="mt-8 rounded-3xl border border-rose-400/40 bg-rose-500/10 p-6 text-sm text-rose-200">
            {error}
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            <section className="rounded-3xl border border-slate-800 bg-slate-800/60 p-6">
              <h2 className="text-lg font-semibold">{copy.sections.items}</h2>
              {categories.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">{copy.empty}</p>
              ) : (
                <div className="mt-4 space-y-4">
                  {categories
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((category) => (
                      <div key={category.stableId} className="space-y-3">
                        <h3 className="text-sm font-semibold text-slate-200">
                          {safeLocale === 'zh'
                            ? category.nameZh ?? category.nameEn
                            : category.nameEn}
                        </h3>
                        <div className="space-y-3">
                          {category.items
                            .slice()
                            .sort((a, b) => a.sortOrder - b.sortOrder)
                            .map((item) => {
                              const label = getAvailabilityLabel(
                                item.isAvailable,
                                item.tempUnavailableUntil,
                                copy.status,
                              );
                              const isSaving = savingKey === `item-${item.stableId}`;
                              return (
                                <div
                                  key={item.stableId}
                                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-900/50 px-4 py-3"
                                >
                                  <div>
                                    <div className="text-sm font-semibold">
                                      {safeLocale === 'zh'
                                        ? item.nameZh ?? item.nameEn
                                        : item.nameEn}
                                    </div>
                                    <span
                                      className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs ${statusTone(
                                        label,
                                        copy.status,
                                      )}`}
                                    >
                                      {label}
                                    </span>
                                  </div>
                                  <AvailabilityActions
                                    labels={copy.actions}
                                    disabled={isSaving}
                                    onSet={(mode) => void setItemAvailability(item.stableId, mode)}
                                  />
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-800/60 p-6">
              <h2 className="text-lg font-semibold">{copy.sections.groups}</h2>
              {sortedTemplates.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">{copy.empty}</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {sortedTemplates.map((group) => {
                    const label = getAvailabilityLabel(
                      group.isAvailable,
                      group.tempUnavailableUntil,
                      copy.status,
                    );
                    const isSaving = savingKey === `group-${group.templateGroupStableId}`;
                    return (
                      <div
                        key={group.templateGroupStableId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-900/50 px-4 py-3"
                      >
                        <div>
                          <div className="text-sm font-semibold">
                            {safeLocale === 'zh'
                              ? group.nameZh ?? group.nameEn
                              : group.nameEn}
                          </div>
                          <span
                            className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs ${statusTone(
                              label,
                              copy.status,
                            )}`}
                          >
                            {label}
                          </span>
                        </div>
                        <AvailabilityActions
                          labels={copy.actions}
                          disabled={isSaving}
                          onSet={(mode) =>
                            void setGroupAvailability(group.templateGroupStableId, mode)
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-800/60 p-6">
              <h2 className="text-lg font-semibold">{copy.sections.options}</h2>
              {sortedTemplates.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">{copy.empty}</p>
              ) : (
                <div className="mt-4 space-y-4">
                  {sortedTemplates.map((group) => (
                    <div key={group.templateGroupStableId} className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-200">
                        {safeLocale === 'zh'
                          ? group.nameZh ?? group.nameEn
                          : group.nameEn}
                      </h3>
                      {(group.options ?? []).length === 0 ? (
                        <p className="text-sm text-slate-400">{copy.empty}</p>
                      ) : (
                        <div className="space-y-3">
                          {group.options.map((option: OptionChoiceDto) => {
                            const label = getAvailabilityLabel(
                              option.isAvailable,
                              option.tempUnavailableUntil,
                              copy.status,
                            );
                            const isSaving = savingKey === `option-${option.optionStableId}`;
                            return (
                              <div
                                key={option.optionStableId}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-900/50 px-4 py-3"
                              >
                                <div>
                                  <div className="text-sm font-semibold">
                                    {safeLocale === 'zh'
                                      ? option.nameZh ?? option.nameEn
                                      : option.nameEn}
                                  </div>
                                  <span
                                    className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs ${statusTone(
                                      label,
                                      copy.status,
                                    )}`}
                                  >
                                    {label}
                                  </span>
                                </div>
                                <AvailabilityActions
                                  labels={copy.actions}
                                  disabled={isSaving}
                                  onSet={(mode) =>
                                    void setOptionAvailability(option.optionStableId, mode)
                                  }
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
