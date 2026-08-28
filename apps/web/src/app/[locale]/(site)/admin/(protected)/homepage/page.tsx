'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import {
  getDefaultHomepageContent,
  type HomepageContent,
} from '@/lib/homepage-content';
type EditingLocale = 'zh' | 'en';
type ImageField = 'heroImageUrl' | 'heroMobileImageUrl' | 'membershipImageUrl';
type TextField = Exclude<keyof HomepageContent, ImageField>;

type UploadResponse = {
  url: string;
};

const TEXT_FIELDS: Array<{
  key: TextField;
  label: string;
  multiline?: boolean;
  hint?: string;
}> = [
  { key: 'heroEyebrow', label: '首屏小标题' },
  { key: 'heroTitle', label: '首屏主标题' },
  { key: 'heroDescription', label: '首屏说明文字', multiline: true },
  { key: 'heroPrimaryCtaLabel', label: '主按钮文字' },
  { key: 'heroSecondaryCtaLabel', label: '次按钮文字' },
  { key: 'dailySpecialTitle', label: '今日特价标题' },
  { key: 'dailySpecialDescription', label: '今日特价说明', multiline: true },
  { key: 'favoritesEyebrow', label: '招牌推荐小标题' },
  { key: 'favoritesTitle', label: '招牌推荐标题' },
  { key: 'membershipEyebrow', label: '会员区小标题' },
  { key: 'membershipTitle', label: '会员区主标题' },
  { key: 'membershipDescription', label: '会员区说明', multiline: true },
  { key: 'membershipCtaLabel', label: '会员区按钮文字' },
];

const IMAGE_FIELDS: Array<{
  key: ImageField;
  label: string;
  hint: string;
}> = [
  {
    key: 'heroImageUrl',
    label: '首屏宽屏图片',
    hint: '电脑 / 平板优先使用。建议准备横向图片。',
  },
  {
    key: 'heroMobileImageUrl',
    label: '首屏手机图片',
    hint: '窄屏优先使用；未设置时自动回退到宽屏图片。',
  },
  {
    key: 'membershipImageUrl',
    label: '会员区图片',
    hint: '可放会员卡、活动视觉等；留空则首页不显示此图片位。',
  },
];

function cloneContent(content: HomepageContent): HomepageContent {
  return { ...content };
}

export default function AdminHomepagePage() {
  const [editingLocale, setEditingLocale] = useState<EditingLocale>('zh');
  const [content, setContent] = useState<HomepageContent>(() =>
    getDefaultHomepageContent('zh'),
  );
  const [savedSnapshot, setSavedSnapshot] = useState<HomepageContent>(() =>
    getDefaultHomepageContent('zh'),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<ImageField | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(content) !== JSON.stringify(savedSnapshot),
    [content, savedSnapshot],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadContent() {
      setLoading(true);
      setMessage(null);
      setError(null);
      const fallback = getDefaultHomepageContent(editingLocale);
      setContent(fallback);
      setSavedSnapshot(fallback);

      try {
        const loaded = await apiFetch<HomepageContent>(
          `/admin/homepage/content?locale=${editingLocale}`,
          { cache: 'no-store' },
        );
        if (cancelled) return;
        setContent(cloneContent(loaded));
        setSavedSnapshot(cloneContent(loaded));
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : '首页内容加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadContent();
    return () => {
      cancelled = true;
    };
  }, [editingLocale]);

  function switchEditingLocale(nextLocale: EditingLocale) {
    if (nextLocale === editingLocale) return;
    if (dirty && !window.confirm('当前语言有未保存修改，切换后这些修改会丢失。确定继续吗？')) {
      return;
    }
    setEditingLocale(nextLocale);
  }

  function updateTextField(key: TextField, value: string) {
    setContent((current) => ({ ...current, [key]: value }));
    setMessage(null);
  }

  function updateImageField(key: ImageField, value: string | null) {
    setContent((current) => ({ ...current, [key]: value }));
    setMessage(null);
  }

  async function uploadImage(field: ImageField, file: File) {
    setUploadingField(field);
    setError(null);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await apiFetch<UploadResponse>('/admin/upload/image', {
        method: 'POST',
        body: formData,
      });
      updateImageField(field, result.url);
      setMessage('图片已上传，点击“保存当前语言”后才会应用到首页。');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '图片上传失败');
    } finally {
      setUploadingField(null);
    }
  }

  async function saveContent() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const saved = await apiFetch<HomepageContent>(
        `/admin/homepage/content/${editingLocale}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(content),
        },
      );
      setContent(cloneContent(saved));
      setSavedSnapshot(cloneContent(saved));
      setMessage(editingLocale === 'zh' ? '中文首页装潢已保存。' : '英文首页装潢已保存。');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  const previewHref = `/${editingLocale}`;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-2 sm:p-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-slate-500">顾客首页内容管理</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-900">首页装潢</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            中文与英文内容完全独立维护。先选择要编辑的语言，再替换该语言首页的文字和图片。
            菜品图片、价格和菜单名称仍由“菜单管理”维护。
          </p>
        </div>
        <Link
          href={previewHref}
          target="_blank"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          预览当前语言首页 ↗
        </Link>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="text-sm font-semibold text-slate-900">1. 选择编辑语言</div>
        <div className="mt-3 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => switchEditingLocale('zh')}
            className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
              editingLocale === 'zh'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-white'
            }`}
          >
            中文首页
          </button>
          <button
            type="button"
            onClick={() => switchEditingLocale('en')}
            className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
              editingLocale === 'en'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-white'
            }`}
          >
            英文首页
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          当前编辑：{editingLocale === 'zh' ? '中文。顾客中文页面不会显示英文营销文案。' : '英文。顾客英文页面不会显示中文营销文案。'}
        </p>
      </section>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">加载中…</div>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-5">
              <h2 className="text-xl font-semibold text-slate-900">2. 页面文字</h2>
              <p className="mt-1 text-sm text-slate-500">这里只填写当前所选语言的内容，不需要在一个输入框里同时写中英文。</p>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              {TEXT_FIELDS.map((field) => {
                const value = content[field.key];
                if (typeof value !== 'string') return null;

                return (
                  <label key={field.key} className={field.multiline ? 'lg:col-span-2' : ''}>
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">{field.label}</span>
                    {field.multiline ? (
                      <textarea
                        rows={3}
                        value={value}
                        onChange={(event) => updateTextField(field.key, event.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      />
                    ) : (
                      <input
                        value={value}
                        onChange={(event) => updateTextField(field.key, event.target.value)}
                        className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      />
                    )}
                    {field.hint ? <span className="mt-1 block text-xs text-slate-400">{field.hint}</span> : null}
                  </label>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-5">
              <h2 className="text-xl font-semibold text-slate-900">3. 页面图片</h2>
              <p className="mt-1 text-sm text-slate-500">
                当前语言的图片独立保存。如果图片本身含文字，请在中文与英文标签下分别上传对应版本。
              </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              {IMAGE_FIELDS.map((field) => {
                const imageUrl = content[field.key];
                const uploading = uploadingField === field.key;

                return (
                  <div key={field.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    <div className="relative aspect-[4/3] bg-white">
                      {imageUrl ? (
                        <Image src={imageUrl} alt={field.label} fill sizes="400px" className="object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center px-6 text-center text-sm text-slate-400">未设置图片</div>
                      )}
                    </div>
                    <div className="space-y-3 p-4">
                      <div>
                        <div className="font-semibold text-slate-900">{field.label}</div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{field.hint}</p>
                      </div>
                      <label className={`inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700 ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
                        {uploading ? '上传中…' : imageUrl ? '替换图片' : '上传图片'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                          className="sr-only"
                          disabled={uploading}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.currentTarget.value = '';
                            if (file) void uploadImage(field.key, file);
                          }}
                        />
                      </label>
                      {imageUrl ? (
                        <button
                          type="button"
                          onClick={() => updateImageField(field.key, null)}
                          className="ml-2 h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-600 hover:bg-slate-100"
                        >
                          清除图片
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      <div className="sticky bottom-3 z-20 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            {error ? <span className="font-medium text-rose-600">{error}</span> : null}
            {!error && message ? <span className="font-medium text-emerald-700">{message}</span> : null}
            {!error && !message && dirty ? <span className="font-medium text-amber-700">有未保存修改</span> : null}
            {!error && !message && !dirty ? <span className="text-slate-500">当前内容已保存</span> : null}
          </div>
          <button
            type="button"
            disabled={loading || saving || !dirty}
            onClick={() => void saveContent()}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-6 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {saving ? '保存中…' : `保存${editingLocale === 'zh' ? '中文' : '英文'}首页`}
          </button>
        </div>
      </div>
    </main>
  );
}
