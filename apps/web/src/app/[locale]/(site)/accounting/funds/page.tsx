'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

import { apiFetch } from '@/lib/api/client';
import type { AccountingAccount } from '../contracts/chart';
import type {
  AccountingAccountTransfer,
  AccountingAccountTransferPurpose,
} from '../contracts/funds';
import type { AccountingTrialBalanceReport } from '../contracts/reports';

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const localDateToday = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const newRequestId = () => globalThis.crypto.randomUUID();

const parsePositiveCents = (raw: string): number | null => {
  const value = raw.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
};

const linkedTransferStableIdFromHash = (): string | null => {
  if (typeof window === 'undefined') return null;
  const prefix = '#transfer-';
  if (!window.location.hash.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(window.location.hash.slice(prefix.length));
  } catch {
    return null;
  }
};

const purposeLabel = (
  purpose: AccountingAccountTransferPurpose,
  isZh: boolean,
) =>
  purpose === 'ACCOUNT_ATTRIBUTION_CORRECTION'
    ? isZh
      ? '账户归属订正'
      : 'Account attribution correction'
    : isZh
      ? '实际账户转账'
      : 'Actual account transfer';

export default function AccountingFundsPage() {
  const params = useParams<{ locale: string }>();
  const isZh = params?.locale === 'zh';
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [trialBalance, setTrialBalance] =
    useState<AccountingTrialBalanceReport | null>(null);
  const [transfers, setTransfers] = useState<AccountingAccountTransfer[]>([]);
  const [fromAccountStableId, setFromAccountStableId] = useState('');
  const [toAccountStableId, setToAccountStableId] = useState('');
  const [amount, setAmount] = useState('');
  const [transferDate, setTransferDate] = useState(localDateToday);
  const [purpose, setPurpose] =
    useState<AccountingAccountTransferPurpose>('ACTUAL_TRANSFER');
  const [note, setNote] = useState('');
  const [requestId, setRequestId] = useState(newRequestId);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const eligibleAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.currency === 'CAD' &&
          account.accountClass === 'ASSET' &&
          (account.type === 'BANK' || account.type === 'CASH'),
      ),
    [accounts],
  );

  const balanceByAccount = useMemo(
    () =>
      new Map(
        (trialBalance?.accounts ?? []).map((account) => [
          account.accountStableId,
          account.closingNormalBalanceCents,
        ]),
      ),
    [trialBalance],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const linkedTransferStableId = linkedTransferStableIdFromHash();
      const [nextAccounts, nextTrialBalance, nextTransfers, linkedTransfers] =
        await Promise.all([
          apiFetch<AccountingAccount[]>('/accounting/accounts'),
          apiFetch<AccountingTrialBalanceReport>(
            '/accounting/report/trial-balance?currency=CAD',
          ),
          apiFetch<AccountingAccountTransfer[]>(
            '/accounting/account-transfers?limit=100',
          ),
          linkedTransferStableId
            ? apiFetch<AccountingAccountTransfer[]>(
                `/accounting/account-transfers?limit=1&transferStableId=${encodeURIComponent(linkedTransferStableId)}`,
              )
            : Promise.resolve([]),
        ]);
      setAccounts(nextAccounts);
      setTrialBalance(nextTrialBalance);
      setTransfers(
        Array.from(
          new Map(
            [...nextTransfers, ...linkedTransfers].map((transfer) => [
              transfer.transferStableId,
              transfer,
            ]),
          ).values(),
        ),
      );
      setFromAccountStableId((current) =>
        nextAccounts.some(
          (account) =>
            account.accountStableId === current &&
            account.currency === 'CAD' &&
            account.accountClass === 'ASSET' &&
            (account.type === 'BANK' || account.type === 'CASH'),
        )
          ? current
          : '',
      );
      setToAccountStableId((current) =>
        nextAccounts.some(
          (account) =>
            account.accountStableId === current &&
            account.currency === 'CAD' &&
            account.accountClass === 'ASSET' &&
            (account.type === 'BANK' || account.type === 'CASH'),
        )
          ? current
          : '',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    const linkedTransferStableId = linkedTransferStableIdFromHash();
    if (!linkedTransferStableId) return;
    window.document
      .getElementById(`transfer-${linkedTransferStableId}`)
      ?.scrollIntoView({ block: 'start' });
  }, [loading, transfers.length]);

  async function submitTransfer(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const amountCents = parsePositiveCents(amount);
    if (!fromAccountStableId || !toAccountStableId) {
      setError(
        isZh
          ? '请选择转出账户和转入账户。'
          : 'Select both the source and destination accounts.',
      );
      return;
    }
    if (fromAccountStableId === toAccountStableId) {
      setError(isZh ? '转出和转入账户不能相同。' : 'Accounts must be different.');
      return;
    }
    if (!amountCents) {
      setError(
        isZh
          ? '金额必须大于 0，且最多保留两位小数。'
          : 'Amount must be positive with at most two decimal places.',
      );
      return;
    }
    if (!transferDate) {
      setError(isZh ? '请选择转账日期。' : 'Select a transfer date.');
      return;
    }
    if (purpose === 'ACCOUNT_ATTRIBUTION_CORRECTION' && !note.trim()) {
      setError(
        isZh
          ? '账户归属订正必须填写原因/备注。'
          : 'Account attribution correction requires a note.',
      );
      return;
    }

    setBusy(true);
    try {
      await apiFetch<AccountingAccountTransfer>('/accounting/account-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          fromAccountStableId,
          toAccountStableId,
          amountCents,
          transferDate,
          purpose,
          note: note.trim() || null,
        }),
      });
      setMessage(
        isZh
          ? '账户转账已写入 canonical Journal。'
          : 'Account transfer posted to the canonical Journal.',
      );
      setFromAccountStableId('');
      setToAccountStableId('');
      setAmount('');
      setNote('');
      setPurpose('ACTUAL_TRANSFER');
      setRequestId(newRequestId());
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{isZh ? '资金' : 'Funds'}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          {isZh
            ? '管理 BANK / CASH 资金移动。账户间转账只改变资产账户归属，不产生收入或费用。'
            : 'Manage BANK / CASH movements. Account transfers reclassify assets without creating revenue or expense.'}
        </p>
      </header>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {message ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold">{isZh ? '资金账户' : 'Fund accounts'}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {trialBalance?.openingBalanceJournal.entryCount
              ? isZh
                ? '以下为 canonical Journal 的累计账面余额。'
                : 'These are cumulative canonical Journal balances.'
              : isZh
                ? '尚无期初余额 Journal；以下从财务起始日按 $0 期初累计，仅表示 SanQ 已记录交易产生的变动，不等于现实银行余额。'
                : 'No opening-balance Journal exists. Amounts accumulate from $0 at the Accounting start date and are not real-world bank balances.'}
          </p>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">{isZh ? '正在读取…' : 'Loading…'}</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {eligibleAccounts.map((account) => (
              <div
                key={account.accountStableId}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{account.name}</p>
                  <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-500">
                    {account.type}
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold">
                  {money(balanceByAccount.get(account.accountStableId) ?? 0)}
                </p>
                <p className="mt-1 break-all text-xs text-slate-400">
                  {account.accountStableId}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <form
        onSubmit={submitTransfer}
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div>
          <h2 className="text-lg font-semibold">
            {isZh ? '账户间转账' : 'Account transfer'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {isZh
              ? '资金账户不会自动预填；请明确选择转出和转入账户后再确认。'
              : 'Fund accounts are never auto-selected. Explicitly choose both accounts before posting.'}
          </p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">{isZh ? '转出账户' : 'From account'}</span>
            <select
              value={fromAccountStableId}
              onChange={(event) => setFromAccountStableId(event.target.value)}
              className="w-full rounded-lg border bg-white px-3 py-2"
            >
              <option value="">{isZh ? '请选择' : 'Select account'}</option>
              {eligibleAccounts.map((account) => (
                <option
                  key={account.accountStableId}
                  value={account.accountStableId}
                  disabled={account.accountStableId === toAccountStableId}
                >
                  {account.name} · {account.type}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-slate-500">{isZh ? '转入账户' : 'To account'}</span>
            <select
              value={toAccountStableId}
              onChange={(event) => setToAccountStableId(event.target.value)}
              className="w-full rounded-lg border bg-white px-3 py-2"
            >
              <option value="">{isZh ? '请选择' : 'Select account'}</option>
              {eligibleAccounts.map((account) => (
                <option
                  key={account.accountStableId}
                  value={account.accountStableId}
                  disabled={account.accountStableId === fromAccountStableId}
                >
                  {account.name} · {account.type}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-slate-500">{isZh ? '金额（CAD）' : 'Amount (CAD)'}</span>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full rounded-lg border px-3 py-2"
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-slate-500">{isZh ? '日期' : 'Date'}</span>
            <input
              type="date"
              value={transferDate}
              onChange={(event) => setTransferDate(event.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-slate-500">{isZh ? '用途' : 'Purpose'}</span>
            <select
              value={purpose}
              onChange={(event) =>
                setPurpose(event.target.value as AccountingAccountTransferPurpose)
              }
              className="w-full rounded-lg border bg-white px-3 py-2"
            >
              <option value="ACTUAL_TRANSFER">
                {isZh ? '实际账户转账' : 'Actual account transfer'}
              </option>
              <option value="ACCOUNT_ATTRIBUTION_CORRECTION">
                {isZh ? '账户归属订正' : 'Account attribution correction'}
              </option>
            </select>
          </label>

          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-slate-500">
              {isZh
                ? purpose === 'ACCOUNT_ATTRIBUTION_CORRECTION'
                  ? '订正原因 / 备注（必填）'
                  : '备注 / 参考号'
                : purpose === 'ACCOUNT_ATTRIBUTION_CORRECTION'
                  ? 'Correction reason / note (required)'
                  : 'Note / reference'}
            </span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              placeholder={
                isZh && purpose === 'ACCOUNT_ATTRIBUTION_CORRECTION'
                  ? '例如：订正入账录入错误'
                  : ''
              }
              className="w-full rounded-lg border px-3 py-2"
            />
          </label>
        </div>

        <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {isZh
            ? '账户归属订正应使用原错误所属期间的有效日期；已月结期间会由现有 period lock 拒绝写入。'
            : 'Attribution corrections should use an effective date in the affected period. Existing period locks reject closed months.'}
        </div>

        <button
          type="submit"
          disabled={
            busy ||
            !fromAccountStableId ||
            !toAccountStableId ||
            !amount.trim() ||
            !transferDate
          }
          className="mt-4 rounded-lg bg-[#87362E] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy
            ? isZh
              ? '正在入账…'
              : 'Posting…'
            : isZh
              ? '确认转账并入账'
              : 'Post account transfer'}
        </button>
      </form>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">{isZh ? '转账记录' : 'Transfer history'}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {isZh
            ? '记录来自 canonical Journal；订正与真实转账会明确区分。'
            : 'History comes from the canonical Journal and distinguishes corrections from real transfers.'}
        </p>

        <div className="mt-4 space-y-3">
          {transfers.map((transfer) => (
            <article
              id={`transfer-${transfer.transferStableId}`}
              key={transfer.transferStableId}
              className="scroll-mt-24 rounded-xl border border-slate-200 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {transfer.fromAccount.name} → {transfer.toAccount.name}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {transfer.transferDate} · {purposeLabel(transfer.purpose, isZh)}
                  </p>
                </div>
                <p className="text-lg font-semibold">{money(transfer.amountCents)}</p>
              </div>
              {transfer.note ? (
                <p className="mt-2 text-sm text-slate-700">{transfer.note}</p>
              ) : null}
              <p className="mt-2 break-all font-mono text-[11px] text-slate-400">
                {transfer.journalEntryStableId}
              </p>
            </article>
          ))}
          {!loading && transfers.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-500">
              {isZh ? '还没有账户间转账记录。' : 'No account transfers yet.'}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
