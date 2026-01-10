// apps/web/src/app/[locale]/admin/(protected)/pos-devices/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import type { Locale } from '@/lib/i18n/locales';

type PosDevice = {
  id: string;
  deviceStableId: string;
  storeId: string;
  name: string | null;
  status: 'ACTIVE' | 'DISABLED';
  enrolledAt: string;
  lastSeenAt: string | null;
};

type PosDeviceWithCode = PosDevice & {
  enrollmentCode: string;
};

type RevealState = {
  deviceStableId: string;
  deviceName: string;
  enrollmentCode: string;
};

function formatDateTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AdminPosDevicesPage() {
  const { locale } = useParams<{ locale: Locale }>();
  const [devices, setDevices] = useState<PosDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formState, setFormState] = useState({ name: '', storeId: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const hasDevices = useMemo(() => devices.length > 0, [devices.length]);

  async function loadDevices() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiFetch<PosDevice[]>('/admin/pos-devices');
      setDevices(data ?? []);
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDevices();
  }, []);

  async function handleCreate() {
    setFormError(null);
    setActionError(null);

    const name = formState.name.trim();
    const storeId = formState.storeId.trim();

    if (!name) {
      setFormError('请填写设备名称。');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        storeId: storeId || undefined,
      };
      const created = await apiFetch<PosDeviceWithCode>('/admin/pos-devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setReveal({
        deviceStableId: created.deviceStableId,
        deviceName: created.name ?? name,
        enrollmentCode: created.enrollmentCode,
      });
      setFormState({ name: '', storeId: '' });
      await loadDevices();
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset(device: PosDevice) {
    setActionError(null);
    try {
      const updated = await apiFetch<PosDeviceWithCode>(
        `/admin/pos-devices/${device.id}/reset-code`,
        { method: 'PATCH' },
      );
      setReveal({
        deviceStableId: updated.deviceStableId,
        deviceName: updated.name ?? device.name ?? '未命名设备',
        enrollmentCode: updated.enrollmentCode,
      });
      await loadDevices();
    } catch (error) {
      setActionError((error as Error).message);
    }
  }

  async function handleDelete(device: PosDevice) {
    setActionError(null);
    if (!window.confirm(`确定删除设备「${device.name ?? device.deviceStableId}」吗？此操作不可撤销。`)) {
      return;
    }
    try {
      await apiFetch(`/admin/pos-devices/${device.id}`, { method: 'DELETE' });
      await loadDevices();
    } catch (error) {
      setActionError((error as Error).message);
    }
  }

  async function handleCopy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Admin
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold text-slate-900">POS 设备初始认证</h1>
          <Link
            href={`/${locale}/admin`}
            className="text-xs font-medium text-emerald-700 hover:text-emerald-600"
          >
            返回总览
          </Link>
        </div>
        <p className="text-sm text-slate-600">
          在此创建 POS 设备、生成一次性绑定码，并在需要时重置绑定码。绑定码只会在创建或重置时展示，请及时保存。
        </p>
      </div>

      {reveal && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-semibold">设备「{reveal.deviceName}」绑定码</div>
              <div className="text-xs text-emerald-700">
                StableId: {reveal.deviceStableId}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleCopy(reveal.enrollmentCode)}
              className="rounded-md border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              复制绑定码
            </button>
          </div>
          <div className="mt-3 text-2xl font-semibold tracking-[0.3em]">
            {reveal.enrollmentCode}
          </div>
          <button
            type="button"
            onClick={() => setReveal(null)}
            className="mt-3 text-xs font-medium text-emerald-700 hover:text-emerald-600"
          >
            我已保存
          </button>
        </section>
      )}

      <section className="rounded-2xl border bg-white/80 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">新增设备</h2>
            <p className="text-sm text-slate-600">创建后会生成一次性绑定码。</p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-slate-600">设备名称</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={formState.name}
              onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="例如：前台收银机 01"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-600">门店 ID（可选）</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={formState.storeId}
              onChange={(e) => setFormState((prev) => ({ ...prev, storeId: e.target.value }))}
              placeholder="默认使用系统门店"
            />
          </label>
        </div>
        {formError && <div className="mt-3 text-sm text-red-600">{formError}</div>}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={saving}
            className="rounded-md border bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? '创建中…' : '生成绑定码'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border bg-white/80 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">已登记设备</h2>
            <p className="text-sm text-slate-600">管理已创建的 POS 设备与绑定码。</p>
          </div>
          <button
            type="button"
            onClick={() => void loadDevices()}
            className="rounded-md border px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            刷新列表
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">加载中…</p>
        ) : loadError ? (
          <p className="mt-4 text-sm text-red-600">{loadError}</p>
        ) : !hasDevices ? (
          <p className="mt-4 text-sm text-slate-500">暂无设备，请先创建。</p>
        ) : (
          <div className="mt-4 space-y-3">
            {devices.map((device) => (
              <div key={device.id} className="rounded-xl border p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="text-base font-semibold text-slate-900">
                      {device.name ?? '未命名设备'}
                    </div>
                    <div className="text-xs text-slate-500">
                      StableId: {device.deviceStableId}
                    </div>
                    <div className="text-xs text-slate-500">门店：{device.storeId}</div>
                  </div>
                  <span
                    className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                      device.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {device.status}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 text-xs text-slate-600 sm:grid-cols-2">
                  <div>登记时间：{formatDateTime(device.enrolledAt)}</div>
                  <div>最近在线：{formatDateTime(device.lastSeenAt)}</div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleReset(device)}
                    className="rounded-md border px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                  >
                    重置绑定码
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(device)}
                    className="rounded-md border px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    删除设备
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {actionError && <div className="mt-4 text-sm text-red-600">{actionError}</div>}
      </section>
    </div>
  );
}
