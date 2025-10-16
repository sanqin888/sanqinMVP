'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

type LoyaltyTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

type AccountResp = {
  userId: string;
  // 后端可能返回 pointsMicro（推荐）或 points（旧字段）之一，做兼容
  pointsMicro?: number | string;
  points?: number; // 兼容旧接口（单位“点”）
  tier: LoyaltyTier;
};

type LedgerEntry = {
  id: string;
  createdAt: string; // ISO 字符串
  type: 'EARN_ON_PURCHASE' | 'ADJUST' | 'REDEEM' | 'REFUND' | string;
  deltaMicro?: number | string;
  balanceAfterMicro?: number | string;
  deltaPoints?: number | string;
  balanceAfterPoints?: number | string;
  deltaPoints?: number | string;
  balanceAfterPoints?: number | string;
  note?: string | null;
  orderId?: string | null;
};

function toNumber(n: number | string | undefined | null): number {
  if (n === undefined || n === null) return 0;
  const x = typeof n === 'string' ? Number(n) : n;
  return Number.isFinite(x) ? (x as number) : 0;
}

// 把微积分（1 点 = 1_000_000 micro）转成可读的“点”
function microToPoints(micro?: number | string | null): number {
  return toNumber(micro) / 1_000_000;
}

function formatDate(s: string) {
  try {
    const d = new Date(s);
    return d.toLocaleString();
  } catch {
    return s;
  }
}

export default function LoyaltyCenterPage() {
  const [userIdInput, setUserIdInput] = useState('u-001');
  const [loading, setLoading] = useState(false);
  const [acc, setAcc] = useState<AccountResp | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const points = useMemo(() => {
    if (!acc) return 0;
    // 兼容：优先 pointsMicro，其次 points
    if (typeof acc.pointsMicro !== 'undefined') {
      return microToPoints(acc.pointsMicro);
    }
    if (typeof acc.points === 'number') {
      return acc.points;
    }
    return 0;
  }, [acc]);

  const fetchAll = useCallback(
    async (uid: string) => {
      setLoading(true);
      setErrorMsg(null);
      try {
        // account
        const aRes = await fetch(
          `${API_BASE}/api/loyalty/account?userId=${encodeURIComponent(uid)}`,
          { cache: 'no-store' },
        );
        if (!aRes.ok) throw new Error(`account http ${aRes.status}`);
        const aJson: AccountResp = await aRes.json();
        setAcc(aJson);

        // ledger
        const lRes = await fetch(
          `${API_BASE}/api/loyalty/ledger?userId=${encodeURIComponent(uid)}&limit=50`,
          { cache: 'no-store' },
        );
        if (!lRes.ok) throw new Error(`ledger http ${lRes.status}`);
        const lJson: LedgerEntry[] = await lRes.json();
        setLedger(lJson);
      } catch (e) {
        setErrorMsg((e as Error).message);
        setAcc(null);
        setLedger([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    // 初次加载用默认 u-001（你也可以改成从 URL 读）
    void fetchAll(userIdInput);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">会员中心</h1>
        <Link
          href="/test-order"
          className="text-sm underline hover:opacity-80"
        >
          去下单测试页
        </Link>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <label className="flex flex-col">
          <span className="text-sm text-gray-600">User ID</span>
          <input
            value={userIdInput}
            onChange={(e) => setUserIdInput(e.target.value)}
            className="border rounded-md px-3 py-2 min-w-[220px]"
            placeholder="例如：u-001"
          />
        </label>
        <button
          onClick={() => void fetchAll(userIdInput)}
          disabled={loading || !userIdInput.trim()}
          className="rounded-md border px-4 py-2 hover:bg-gray-50 disabled:opacity-60"
        >
          {loading ? '查询中…' : '查询'}
        </button>

        {errorMsg && <span className="text-sm text-red-600">错误：{errorMsg}</span>}
      </div>

      {/* 账户概览 */}
      <section className="rounded-lg border p-4">
        <h2 className="text-lg font-semibold mb-2">账户概览</h2>
        {acc ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-gray-600 text-sm">用户</div>
              <div className="font-medium break-all">{acc.userId}</div>
            </div>
            <div>
              <div className="text-gray-600 text-sm">等级</div>
              <div className="font-medium">{acc.tier}</div>
            </div>
            <div>
              <div className="text-gray-600 text-sm">积分余额（点）</div>
              <div className="font-medium">{points.toFixed(2)}</div>
            </div>
          </div>
        ) : (
          <div className="text-gray-500">无账户信息。</div>
        )}
      </section>

      {/* 积分流水 */}
      <section className="rounded-lg border p-4">
        <h2 className="text-lg font-semibold mb-2">最近流水（最多 50 条）</h2>
        {ledger.length === 0 ? (
          <div className="text-gray-500">暂无流水</div>
        ) : (
          <ul className="divide-y">
            {ledger.map((e) => {
              const deltaPoints =
                e.deltaPoints ?? microToPoints(e.deltaMicro);
              const balancePoints =
                e.balanceAfterPoints ?? microToPoints(e.balanceAfterMicro);
              const delta = toNumber(deltaPoints);
              const bal = toNumber(balancePoints);
              const sign = delta > 0 ? '+' : '';
              return (
                <li key={e.id} className="py-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">
                      {e.type.replaceAll('_', ' ')}
                      {e.orderId ? (
                        <span className="ml-2 text-xs text-gray-500">订单 {e.orderId}</span>
                      ) : null}
                    </div>
                    <div className="text-sm text-gray-600">{formatDate(e.createdAt)}</div>
                    {e.note ? (
                      <div className="text-sm text-gray-700 mt-1">备注：{e.note}</div>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {sign}{delta.toFixed(2)} 点
                    </div>
                    <div className="text-xs text-gray-500">余额：{bal.toFixed(2)} 点</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
