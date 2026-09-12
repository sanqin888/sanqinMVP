'use client';

import {
  type AccountingInboxItem,
  latestParse,
  money,
} from './inbox-model';

type Props = {
  items: AccountingInboxItem[];
  loading: boolean;
  isZh: boolean;
  busySender: boolean;
  discardingId: string | null;
  onTrustSender: (email: string) => Promise<void>;
  onReviewExpense: (item: AccountingInboxItem) => void;
  onDiscard: (item: AccountingInboxItem) => Promise<void>;
};

export function AccountingInboxItemsList({
  items,
  loading,
  isZh,
  busySender,
  discardingId,
  onTrustSender,
  onReviewExpense,
  onDiscard,
}: Props) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">
        {isZh ? `待处理 ${items.length}` : `${items.length} pending / quarantined`}
      </h2>
      {loading ? (
        <p className="mt-3 text-sm text-slate-500">
          {isZh ? '加载中…' : 'Loading…'}
        </p>
      ) : null}
      {!loading && !items.length ? (
        <p className="py-5 text-sm text-slate-500">
          {isZh ? '当前没有待处理凭证。' : 'Nothing needs review.'}
        </p>
      ) : null}
      <div className="mt-3 divide-y">
        {items.map((item) => {
          const parse = latestParse(item);
          const title =
            item.artifact.emailSubject ||
            item.artifact.originalFilename ||
            item.artifact.senderEmail ||
            item.artifact.kind;
          const quarantined = item.status === 'QUARANTINED';
          return (
            <div
              key={item.inboxItemStableId}
              className="grid gap-3 py-4 lg:grid-cols-[1.5fr_1fr_auto] lg:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{title}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      quarantined
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.status}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {item.artifact.acquisitionMode} · {item.artifact.kind}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {item.artifact.senderEmail
                    ? `${isZh ? '发件人' : 'From'}: ${item.artifact.senderEmail} · `
                    : ''}
                  {new Date(item.createdAt).toLocaleString()}
                </p>
                {parse.providerParserPending ? (
                  <p className="mt-1 text-xs text-blue-700">
                    {isZh
                      ? 'CSV 已保留，等待平台财务解析。'
                      : 'CSV preserved for provider financial parsing.'}
                  </p>
                ) : parse.reviewDisposition ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {isZh ? '通用识别' : 'Generic review'}: {parse.reviewDisposition}
                    {parse.confidence ? ` · ${parse.confidence}` : ''}
                  </p>
                ) : null}
              </div>
              <div className="text-sm text-slate-600">
                {parse.totalCents != null ? (
                  <p>
                    {isZh ? '识别总额' : 'Detected total'}:{' '}
                    <strong>{money(parse.totalCents)}</strong>
                  </p>
                ) : null}
                {item.artifact.storedUrl ? (
                  <a
                    className="text-blue-600 hover:underline"
                    href={item.artifact.storedUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {isZh ? '查看原始文件' : 'Open evidence'}
                  </a>
                ) : item.artifact.bodyText ? (
                  <details>
                    <summary className="cursor-pointer text-blue-600">
                      {isZh ? '查看邮件正文' : 'View email body'}
                    </summary>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs">
                      {item.artifact.bodyText}
                    </pre>
                  </details>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {quarantined && item.artifact.senderEmail ? (
                  <button
                    disabled={busySender}
                    onClick={() =>
                      void onTrustSender(item.artifact.senderEmail ?? '')
                    }
                    className="rounded border px-3 py-1.5 text-sm text-emerald-700 disabled:opacity-50"
                  >
                    {isZh ? '信任此发件人' : 'Trust sender'}
                  </button>
                ) : null}
                {!quarantined &&
                item.status === 'PENDING_REVIEW' &&
                item.materializedEntityType !== 'PROVIDER_FINANCIAL_DOCUMENT' ? (
                  <button
                    onClick={() => onReviewExpense(item)}
                    className="rounded border px-3 py-1.5 text-sm text-blue-700"
                  >
                    {isZh ? '按费用审核' : 'Review as expense'}
                  </button>
                ) : null}
                <button
                  disabled={discardingId === item.inboxItemStableId}
                  onClick={() => void onDiscard(item)}
                  className="rounded border px-3 py-1.5 text-sm text-red-600 disabled:opacity-50"
                >
                  {discardingId === item.inboxItemStableId
                    ? isZh
                      ? '处理中…'
                      : 'Working…'
                    : isZh
                      ? '丢弃'
                      : 'Discard'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
