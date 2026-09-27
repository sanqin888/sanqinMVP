'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type { AccountingTabularPreview } from '../contracts/tabular-preview';

type Props = {
  reportStableId: string;
  reportType: string;
  startDate: string;
  endDate: string;
  artifactUrl: string;
  artifactIndex: number;
  isZh: boolean;
};

export function UberReportTablePreview({
  reportStableId,
  reportType,
  startDate,
  endDate,
  artifactUrl,
  artifactIndex,
  isZh,
}: Props) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<AccountingTabularPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewUrl = useMemo(
    () => accountingUberReportPreviewUrl(reportStableId, artifactUrl),
    [artifactUrl, reportStableId],
  );

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);

    void apiFetch<AccountingTabularPreview>(previewUrl)
      .then((result) => {
        if (!active) return;
        setPreview(result);
      })
      .catch((cause) => {
        if (!active) return;
        setPreview(null);
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, previewUrl]);

  const title = `${reportType} · CSV ${artifactIndex + 1}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        {isZh ? '预览' : 'Preview'}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="uber-report-preview-title"
            className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[96rem] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:min-h-[calc(100vh-3rem)]"
          >
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h2
                  id="uber-report-preview-title"
                  className="truncate font-semibold text-slate-900"
                >
                  {title}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {startDate} — {endDate}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={artifactUrl}
                  download
                  className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-100"
                >
                  {isZh ? '下载原 CSV' : 'Download CSV'}
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {isZh ? '关闭' : 'Close'}
                </button>
              </div>
            </header>

            <div className="flex min-h-[70vh] flex-1 bg-slate-100 p-2 sm:p-4">
              {loading ? (
                <div className="m-auto text-sm text-slate-500">
                  {isZh ? '正在生成表格预览…' : 'Preparing table preview…'}
                </div>
              ) : error || !preview ? (
                <div className="m-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
                  <p className="font-medium text-amber-900">
                    {isZh ? '无法生成表格预览' : 'Table preview unavailable'}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-amber-800">
                    {error ??
                      (isZh
                        ? '该 CSV 暂时无法安全解析；仍可下载原文件。'
                        : 'This CSV could not be parsed safely. The original file can still be downloaded.')}
                  </p>
                </div>
              ) : (
                <UberReportPreviewTable
                  preview={preview}
                  reportType={reportType}
                  isZh={isZh}
                />
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function UberReportPreviewTable({
  preview,
  reportType,
  isZh,
}: {
  preview: AccountingTabularPreview;
  reportType: string;
  isZh: boolean;
}) {
  const {
    hasPaymentDetailsDescriptionRow,
    descriptions,
    header,
    bodyRows,
  } = splitUberReportPreviewRows(reportType, preview.rows);
  const truncated =
    preview.truncatedRows ||
    preview.truncatedColumns ||
    preview.truncatedCells;

  return (
    <div className="flex min-h-[70vh] w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
        <div className="text-xs text-slate-500">
          {preview.format} · {preview.previewRowCount}{' '}
          {isZh ? '行' : 'rows'} · {preview.previewColumnCount}{' '}
          {isZh ? '列' : 'columns'}
        </div>
        <div className="text-xs text-slate-500">
          {isZh
            ? '仅显示纯文本值，不执行公式或链接'
            : 'Plain-text values only; formulas and links are not executed'}
        </div>
      </div>

      {truncated ? (
        <p className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {isZh
            ? `预览最多显示 ${preview.limits.maxRows} 行、${preview.limits.maxColumns} 列，单元格最多 ${preview.limits.maxCellCharacters} 字符；原 CSV 未被修改。`
            : `Preview is limited to ${preview.limits.maxRows} rows, ${preview.limits.maxColumns} columns, and ${preview.limits.maxCellCharacters} characters per cell. The source CSV is unchanged.`}
        </p>
      ) : null}

      {hasPaymentDetailsDescriptionRow ? (
        <p className="border-b border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          {isZh
            ? 'Payment Details 的 Uber 字段说明保留为表头悬停提示；表格使用第二行 machine header。'
            : 'Uber field descriptions are preserved as header hover text; the second CSV row is used as the Payment Details machine header.'}
        </p>
      ) : null}

      {preview.rows.length ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-max border-collapse text-left text-xs text-slate-800">
            <thead>
              <tr>
                {Array.from(
                  { length: preview.previewColumnCount },
                  (_, columnIndex) => (
                    <th
                      key={columnIndex}
                      title={descriptions[columnIndex] || undefined}
                      className="sticky top-0 z-10 max-w-[20rem] border-b border-r border-slate-300 bg-slate-100 px-2 py-2 align-top font-semibold whitespace-pre-wrap break-words"
                    >
                      {header[columnIndex] ?? ''}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={rowIndex % 2 ? 'bg-slate-50' : 'bg-white'}
                >
                  {Array.from(
                    { length: preview.previewColumnCount },
                    (_, columnIndex) => (
                      <td
                        key={columnIndex}
                        className="max-w-[20rem] border-b border-r border-slate-200 px-2 py-1.5 align-top whitespace-pre-wrap break-words"
                      >
                        {row[columnIndex] ?? ''}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="m-auto text-sm text-slate-500">
          {isZh ? '这个 CSV 没有可预览内容。' : 'This CSV has no previewable content.'}
        </div>
      )}
    </div>
  );
}

export function splitUberReportPreviewRows(
  reportType: string,
  rows: string[][],
): {
  hasPaymentDetailsDescriptionRow: boolean;
  descriptions: string[];
  header: string[];
  bodyRows: string[][];
} {
  const hasPaymentDetailsDescriptionRow =
    reportType === 'PAYMENT_DETAILS_REPORT' && rows.length >= 2;
  return {
    hasPaymentDetailsDescriptionRow,
    descriptions: hasPaymentDetailsDescriptionRow ? (rows[0] ?? []) : [],
    header: hasPaymentDetailsDescriptionRow
      ? (rows[1] ?? [])
      : (rows[0] ?? []),
    bodyRows: hasPaymentDetailsDescriptionRow ? rows.slice(2) : rows.slice(1),
  };
}

export function accountingUberReportPreviewUrl(
  reportStableId: string,
  artifactUrl: string,
): string {
  return `/accounting/automation/uber-reports/${encodeURIComponent(
    reportStableId,
  )}/tabular-preview?artifactUrl=${encodeURIComponent(artifactUrl)}`;
}
