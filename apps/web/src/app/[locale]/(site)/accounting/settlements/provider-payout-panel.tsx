'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type { AccountingAccount } from '../contracts/chart';
import type { AccountingFinancialProvider } from '../contracts/core';
import type { AccountingProviderPayout } from '../contracts/payouts';
import { ProviderPayoutSettlementBankCsvPanel } from './provider-payout-settlement-bank-csv-panel';
import { ProviderFeeBankWithdrawalPanel } from './provider-fee-bank-withdrawal-panel';

const PROVIDERS: AccountingFinancialProvider[] = [
  'CLOVER',
  'UBER_EATS',
  'FANTUAN',
];

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const localDateToday = (): string => {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const linkedPayoutStableIdFromHash = (): string | null => {
  if (typeof window === 'undefined') return null;
  const prefix = '#payout-';
  if (!window.location.hash.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(window.location.hash.slice(prefix.length));
  } catch {
    return null;
  }
};

const parseCents = (raw: string): number | null => {
  const value = raw.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
};

const providerLabel = (
  provider: AccountingFinancialProvider,
  isZh: boolean,
): string => {
  if (provider === 'UBER_EATS') return 'Uber Eats';
  if (provider === 'FANTUAN') return isZh ? '饭团' : 'Fantuan';
  return 'Clover';
};

export function ProviderPayoutPanel({
  isZh,
  knownStoreStableIds,
}: {
  isZh: boolean;
  knownStoreStableIds: string[];
}) {
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [payouts, setPayouts] = useState<AccountingProviderPayout[]>([]);
  const [provider, setProvider] =
    useState<AccountingFinancialProvider>('CLOVER');
  const [storeStableId, setStoreStableId] = useState('');
  const [payoutDate, setPayoutDate] = useState(localDateToday);
  const [amount, setAmount] = useState('');
  const [destinationBankAccountStableId, setDestinationBankAccountStableId] =
    useState('');
  const [providerReference, setProviderReference] = useState('');
  const [payoutStableId, setPayoutStableId] = useState('');
  const [bankRowDecisionStableId, setBankRowDecisionStableId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const eligibleBanks = useMemo(
    () =>
      accounts.filter(
        (account) => account.currency === 'CAD' && account.type === 'BANK',
      ),
    [accounts],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payoutQuery = new URLSearchParams({ limit: '100' });
      const linkedPayoutStableId = linkedPayoutStableIdFromHash();
      if (linkedPayoutStableId) {
        payoutQuery.set('payoutStableId', linkedPayoutStableId);
      }
      const [nextAccounts, nextPayouts] = await Promise.all([
        apiFetch<AccountingAccount[]>('/accounting/accounts'),
        apiFetch<AccountingProviderPayout[]>(
          `/accounting/provider-payouts?${payoutQuery.toString()}`,
        ),
      ]);
      setAccounts(nextAccounts);
      setPayouts(nextPayouts);
      setDestinationBankAccountStableId((current) =>
        nextAccounts.some(
          (account) =>
            account.accountStableId === current &&
            account.currency === 'CAD' &&
            account.type === 'BANK',
        )
          ? current
          : (nextAccounts.find(
              (account) =>
                account.currency === 'CAD' && account.type === 'BANK',
            )?.accountStableId ?? ''),
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
    const linkedPayoutStableId = linkedPayoutStableIdFromHash();
    if (!linkedPayoutStableId) return;
    const target = window.document.getElementById(
      `payout-${linkedPayoutStableId}`,
    );
    target?.closest('details')?.setAttribute('open', '');
    target?.scrollIntoView({ block: 'start' });
  }, [loading, payouts.length]);

  useEffect(() => {
    if (!storeStableId && knownStoreStableIds.length > 0) {
      setStoreStableId(knownStoreStableIds[0]);
      setConfirmed(false);
      setPayoutStableId('');
      setBankRowDecisionStableId('');
    }
  }, [knownStoreStableIds, storeStableId]);

  const bankName = (accountStableId: string): string =>
    accounts.find((account) => account.accountStableId === accountStableId)
      ?.name ?? accountStableId;

  function invalidateConfirmation() {
    setConfirmed(false);
    setPayoutStableId('');
    setBankRowDecisionStableId('');
    setError(null);
    setMessage(null);
  }

  async function recordPayout(event: FormEvent) {
    event.preventDefault();
    const amountCents = parseCents(amount);
    if (!storeStableId.trim()) {
      setError(isZh ? '请输入门店 Stable ID。' : 'Enter the store stable ID.');
      return;
    }
    if (!payoutDate) {
      setError(isZh ? '请选择到账日期。' : 'Select the bank receipt date.');
      return;
    }
    if (!destinationBankAccountStableId) {
      setError(isZh ? '请选择银行账户。' : 'Select a bank account.');
      return;
    }
    if (amountCents === null) {
      setError(
        isZh
          ? '到账金额必须是大于 0、最多两位小数的金额。'
          : 'Amount must be greater than zero with at most two decimals.',
      );
      return;
    }
    if (!confirmed) {
      setError(
        isZh
          ? '请先确认这笔金额已经实际进入所选银行账户。'
          : 'Confirm that this amount actually reached the selected bank account.',
      );
      return;
    }

    const stableId =
      payoutStableId || `payout_${window.crypto.randomUUID()}`;
    if (!bankRowDecisionStableId && !payoutStableId) {
      setPayoutStableId(stableId);
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const posted = bankRowDecisionStableId
        ? await apiFetch<AccountingProviderPayout>(
            '/accounting/provider-payouts/from-bank-row-decision',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                decisionStableId: bankRowDecisionStableId,
              }),
            },
          )
        : await apiFetch<AccountingProviderPayout>(
            '/accounting/provider-payouts',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                payoutStableId: stableId,
                provider,
                storeStableId: storeStableId.trim(),
                payoutDate,
                destinationBankAccountStableId,
                amountCents,
                currency: 'CAD',
                providerReference: providerReference.trim() || null,
              }),
            },
          );
      setMessage(
        isZh
          ? `${providerLabel(posted.provider, true)} 到账 ${money(posted.amountCents)} 已记账。`
          : `${providerLabel(posted.provider, false)} bank receipt of ${money(posted.amountCents)} posted.`,
      );
      setAmount('');
      setProviderReference('');
      setPayoutStableId('');
      setBankRowDecisionStableId('');
      setConfirmed(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-lg font-semibold">
          {isZh ? '平台到账' : 'Provider bank receipts'}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          {isZh
            ? '这里记录银行实际收到的 Clover / Uber Eats / 饭团打款。它与月结单独立：只做 BANK ← Provider Pending 的资产转移，不重复记录销售、税或平台费用。'
            : 'Record actual Clover, Uber Eats, or Fantuan deposits received by the bank. This is independent from monthly statements and posts only BANK ← Provider Pending, without recreating sales, tax, or fees.'}
        </p>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      <form
        className="grid gap-3 rounded-xl border border-emerald-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-3"
        onSubmit={(event) => void recordPayout(event)}
      >
        <label className="text-xs text-slate-600">
          {isZh ? '平台' : 'Provider'}
          <select
            className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value as AccountingFinancialProvider);
              invalidateConfirmation();
            }}
          >
            {PROVIDERS.map((value) => (
              <option key={value} value={value}>
                {providerLabel(value, isZh)}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-slate-600">
          {isZh ? '门店 Stable ID' : 'Store stable ID'}
          <input
            list="accounting-provider-payout-stores"
            className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
            value={storeStableId}
            onChange={(event) => {
              setStoreStableId(event.target.value);
              invalidateConfirmation();
            }}
            placeholder="4750_Yonge_Street"
          />
          <datalist id="accounting-provider-payout-stores">
            {knownStoreStableIds.map((store) => (
              <option key={store} value={store} />
            ))}
          </datalist>
        </label>

        <label className="text-xs text-slate-600">
          {isZh ? '银行到账日期' : 'Bank receipt date'}
          <input
            type="date"
            className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
            value={payoutDate}
            onChange={(event) => {
              setPayoutDate(event.target.value);
              invalidateConfirmation();
            }}
          />
        </label>

        <label className="text-xs text-slate-600">
          {isZh ? '实际到账金额（CAD）' : 'Actual amount received (CAD)'}
          <input
            inputMode="decimal"
            className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              invalidateConfirmation();
            }}
            placeholder="0.00"
          />
        </label>

        <label className="text-xs text-slate-600">
          {isZh ? '到账银行账户' : 'Destination bank account'}
          <select
            className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
            value={destinationBankAccountStableId}
            onChange={(event) => {
              setDestinationBankAccountStableId(event.target.value);
              invalidateConfirmation();
            }}
          >
            <option value="">
              {isZh ? '选择 CAD BANK 账户' : 'Select a CAD BANK account'}
            </option>
            {eligibleBanks.map((account) => (
              <option
                key={account.accountStableId}
                value={account.accountStableId}
              >
                {account.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-slate-600">
          {isZh ? '平台 / 银行参考号（可选）' : 'Provider / bank reference (optional)'}
          <input
            className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
            value={providerReference}
            onChange={(event) => {
              setProviderReference(event.target.value);
              invalidateConfirmation();
            }}
            placeholder={isZh ? '例如 EFT / payout ID' : 'e.g. EFT / payout ID'}
          />
        </label>

        {!eligibleBanks.length && !loading ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 sm:col-span-2 xl:col-span-3">
            {isZh
              ? '没有可用的 active CAD BANK 会计账户，请先在财务设置中建立银行账户。'
              : 'No active CAD BANK Accounting account is available. Create a bank account in Accounting settings first.'}
          </p>
        ) : null}

        <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:col-span-2 xl:col-span-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={confirmed}
            onChange={(event) => {
              setConfirmed(event.target.checked);
              setError(null);
            }}
          />
          <span>
            {isZh
              ? '我已核对银行记录：以上日期和金额已经实际进入所选银行账户。月结单上的“Net payout”不能代替这个确认；记账后不能直接编辑这条 canonical payout。'
              : 'I verified the bank record: this date and amount actually reached the selected bank account. A monthly statement “Net payout” does not replace this confirmation; the canonical payout cannot be edited in place after posting.'}
          </span>
        </label>

        <div className="sm:col-span-2 xl:col-span-3">
          <button
            disabled={
              busy ||
              loading ||
              !confirmed ||
              !storeStableId.trim() ||
              !payoutDate ||
              !destinationBankAccountStableId ||
              parseCents(amount) === null
            }
            className="rounded-lg bg-[#87362E] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy
              ? isZh
                ? '正在记账…'
                : 'Posting…'
              : isZh
                ? '确认到账并记账'
                : 'Post bank receipt'}
          </button>
        </div>
      </form>

      <ProviderPayoutSettlementBankCsvPanel
        isZh={isZh}
        knownStoreStableIds={knownStoreStableIds}
        eligibleBanks={eligibleBanks}
        onUseDeposit={(deposit) => {
          setProvider(deposit.provider);
          setPayoutDate(deposit.payoutDate);
          setAmount((deposit.amountCents / 100).toFixed(2));
          setDestinationBankAccountStableId(
            deposit.destinationBankAccountStableId,
          );
          setProviderReference('');
          setConfirmed(true);
          setPayoutStableId('');
          setBankRowDecisionStableId(deposit.decisionStableId);
          setError(null);
          setMessage(
            isZh
              ? '已选择已确认的银行流水行；正式记账将由服务端按该决定原子创建 payout 并绑定回流水行。'
              : 'A confirmed bank row is selected. Posting will atomically create the payout from that server-owned decision and bind it back to the row.',
          );
        }}
      />

      <ProviderFeeBankWithdrawalPanel
        isZh={isZh}
        knownStoreStableIds={knownStoreStableIds}
        eligibleBanks={eligibleBanks}
      />

      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">
          {isZh
            ? `最近到账记录（${payouts.length}）`
            : `Recent bank receipts (${payouts.length})`}
        </summary>
        <div className="mt-3 overflow-x-auto">
          {loading ? (
            <p className="text-sm text-slate-500">
              {isZh ? '正在读取到账记录…' : 'Loading bank receipts…'}
            </p>
          ) : payouts.length === 0 ? (
            <p className="text-sm text-slate-500">
              {isZh ? '还没有平台到账记录。' : 'No provider bank receipts yet.'}
            </p>
          ) : (
            <table className="min-w-[920px] w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-2 py-2">{isZh ? '日期' : 'Date'}</th>
                  <th className="px-2 py-2">{isZh ? '平台' : 'Provider'}</th>
                  <th className="px-2 py-2">{isZh ? '门店' : 'Store'}</th>
                  <th className="px-2 py-2">{isZh ? '银行' : 'Bank'}</th>
                  <th className="px-2 py-2 text-right">{isZh ? '金额' : 'Amount'}</th>
                  <th className="px-2 py-2">{isZh ? '参考号' : 'Reference'}</th>
                  <th className="px-2 py-2">Journal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payouts.map((payout) => (
                  <tr
                    key={payout.payoutStableId}
                    id={`payout-${payout.payoutStableId}`}
                  >
                    <td className="px-2 py-2">{payout.payoutDate}</td>
                    <td className="px-2 py-2 font-medium">
                      {providerLabel(payout.provider, isZh)}
                    </td>
                    <td className="px-2 py-2 font-mono text-[11px]">
                      {payout.storeStableId}
                    </td>
                    <td className="px-2 py-2">
                      {bankName(payout.destinationBankAccountStableId)}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold">
                      {money(payout.amountCents)}
                    </td>
                    <td className="px-2 py-2">
                      {payout.providerReference ?? '—'}
                    </td>
                    <td className="px-2 py-2 font-mono text-[11px]">
                      {payout.journalEntryStableId ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>
    </section>
  );
}
