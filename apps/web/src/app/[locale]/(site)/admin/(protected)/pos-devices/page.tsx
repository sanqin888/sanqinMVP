// apps/web/src/app/[locale]/admin/(protected)/pos-devices/page.tsx
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  createAdminPosDevice,
  deleteAdminPosDevice,
  fetchAdminPosDevices,
  resetAdminPosDeviceEnrollment,
  updateAdminPosDeviceStatus,
  type AdminPosDeviceView,
} from '@/lib/api/pos-devices';
import type { Locale } from '@/lib/i18n/locales';

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
  const searchParams = useSearchParams();
  const storeStableId = searchParams.get('store')?.trim() ?? '';
  const [devices, setDevices] = useState<AdminPosDeviceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusUpdatingStableId, setStatusUpdatingStableId] = useState<
    string | null
  >(null);

  const pendingDevices = useMemo(
    () => devices.filter((device) => !device.lastSeenAt),
    [devices],
  );
  const certifiedDevices = useMemo(
    () => devices.filter((device) => Boolean(device.lastSeenAt)),
    [devices],
  );
  const hasDevices = devices.length > 0;

  const loadDevices = useCallback(
    async (selectedStoreStableId = storeStableId) => {
      if (!selectedStoreStableId) {
        setDevices([]);
        setLoading(true);
        setLoadError(null);
        return;
      }

      setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchAdminPosDevices(selectedStoreStableId);
        setDevices(data ?? []);
      } catch (error) {
        setLoadError((error as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [storeStableId],
  );

  useEffect(() => {
    setReveal(null);
    setActionError(null);
    setFormError(null);
    void loadDevices(storeStableId);
  }, [loadDevices, storeStableId]);

  async function handleCreate() {
    setFormError(null);
    setActionError(null);

    const name = deviceName.trim();
    if (!storeStableId) {
      setFormError('请先选择门店。');
      return;
    }
    if (!name) {
      setFormError('请填写设备名称。');
      return;
    }

    setSaving(true);
    try {
      const created = await createAdminPosDevice({
        name,
        storeStableId,
      });
      setReveal({
        deviceStableId: created.deviceStableId,
        deviceName: created.name ?? name,
        enrollmentCode: created.enrollmentCode,
      });
      setDeviceName('');
      await loadDevices(storeStableId);
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset(device: AdminPosDeviceView) {
    if (
      !window.confirm(
        `确定要重置设备「${device.name ?? '未命名'}」的绑定码吗？\n旧的绑定码将立即失效。`,
      )
    ) {
      return;
    }

    setActionError(null);
    try {
      const updated = await resetAdminPosDeviceEnrollment(
        device.deviceStableId,
      );
      window.alert(
        `重置成功！\n请在 POS 设备上输入新的绑定码：\n\n${updated.enrollmentCode}\n\n(请立即记录，关闭后无法再次查看)`,
      );
      await loadDevices(storeStableId);
    } catch (error) {
      setActionError((error as Error).message);
    }
  }

  async function handleDelete(device: AdminPosDeviceView) {
    setActionError(null);
    if (
      !window.confirm(
        `确定删除设备「${device.name ?? device.deviceStableId}」吗？此操作不可撤销。`,
      )
    ) {
      return;
    }
    try {
      await deleteAdminPosDevice(device.deviceStableId);
      await loadDevices(storeStableId);
    } catch (error) {
      setActionError((error as Error).message);
    }
  }

  async function handleToggleStatus(device: AdminPosDeviceView) {
    setActionError(null);
    const nextStatus = device.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    setStatusUpdatingStableId(device.deviceStableId);
    try {
      await updateAdminPosDeviceStatus(device.deviceStableId, nextStatus);
      await loadDevices(storeStableId);
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setStatusUpdatingStableId(null);
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
          <h1 className="text-3xl font-semibold text-slate-900">POS 设备管理</h1>
          <Link
            href={`/${locale}/admin`}
            className="text-xs font-medium text-emerald-700 hover:text-emerald-600"
          >
            返回总览
          </Link>
        </div>
        <p className="text-sm text-slate-600">
          当前页面只管理顶部所选门店的 POS 设备。绑定码只会在创建或重置时展示，请及时保存。
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
            <h2 className="text-xl font-semibold text-slate-900">POS 设备初始认证</h2>
            <p className="text-sm text-slate-600">
              创建新设备并生成一次性绑定码，用于首次登录认证。
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-slate-600">设备名称</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              placeholder="例如：前台收银机 01"
            />
          </label>
          <div className="space-y-1 text-sm">
            <span className="text-slate-600">所属门店</span>
            <div className="min-h-10 rounded-md border bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700">
              {storeStableId || '正在确定门店…'}
            </div>
          </div>
        </div>
        {formError && <div className="mt-3 text-sm text-red-600">{formError}</div>}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={saving || !storeStableId}
            className="rounded-md border bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? '创建中…' : '生成绑定码'}
          </button>
        </div>
        <div className="mt-6 border-t pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">待认证设备</h3>
              <p className="text-sm text-slate-600">尚未完成认证的设备，可以重置绑定码。</p>
            </div>
            <button
              type="button"
              onClick={() => void loadDevices()}
              disabled={!storeStableId}
              className="rounded-md border px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              刷新列表
            </button>
          </div>
          {loading ? (
            <p className="mt-4 text-sm text-slate-500">
              {storeStableId ? '加载中…' : '正在确定当前门店…'}
            </p>
          ) : loadError ? (
            <p className="mt-4 text-sm text-red-600">{loadError}</p>
          ) : !hasDevices ? (
            <p className="mt-4 text-sm text-slate-500">当前门店暂无设备，请先创建。</p>
          ) : pendingDevices.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">当前没有待认证设备。</p>
          ) : (
            <div className="mt-4 space-y-3">
              {pendingDevices.map((device) => (
                <div key={device.deviceStableId} className="rounded-xl border p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="text-base font-semibold text-slate-900">
                        {device.name ?? '未命名设备'}
                      </div>
                      <div className="text-xs text-slate-500">
                        StableId: {device.deviceStableId}
                      </div>
                      <div className="text-xs text-slate-500">
                        门店：{device.storeStableId}
                      </div>
                    </div>
                    <span className="inline-flex w-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                      未认证
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 text-xs text-slate-600 sm:grid-cols-2">
                    <div>登记时间：{formatDateTime(device.enrolledAt)}</div>
                    <div>最近在线：—</div>
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
        </div>
      </section>

      <section className="rounded-2xl border bg-white/80 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">已认证设备管理</h2>
            <p className="text-sm text-slate-600">
              查看当前门店设备在线情况，并根据需要启用或停用设备。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadDevices()}
            disabled={!storeStableId}
            className="rounded-md border px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            刷新列表
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">
            {storeStableId ? '加载中…' : '正在确定当前门店…'}
          </p>
        ) : loadError ? (
          <p className="mt-4 text-sm text-red-600">{loadError}</p>
        ) : certifiedDevices.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">当前门店暂无已认证设备。</p>
        ) : (
          <div className="mt-4 space-y-3">
            {certifiedDevices.map((device) => (
              <div key={device.deviceStableId} className="rounded-xl border p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="text-base font-semibold text-slate-900">
                      {device.name ?? '未命名设备'}
                    </div>
                    <div className="text-xs text-slate-500">
                      StableId: {device.deviceStableId}
                    </div>
                  </div>
                  <span
                    className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                      device.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {device.status === 'ACTIVE' ? '启用中' : '已停用'}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 text-xs text-slate-600 sm:grid-cols-2">
                  <div>登记时间：{formatDateTime(device.enrolledAt)}</div>
                  <div>最近在线：{formatDateTime(device.lastSeenAt)}</div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleToggleStatus(device)}
                    disabled={statusUpdatingStableId === device.deviceStableId}
                    className="rounded-md border px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                  >
                    {statusUpdatingStableId === device.deviceStableId
                      ? '处理中…'
                      : device.status === 'ACTIVE'
                        ? '停用设备'
                        : '启用设备'}
                  </button>
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
