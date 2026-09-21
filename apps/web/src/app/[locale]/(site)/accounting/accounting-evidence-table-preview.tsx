'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type { AccountingTabularPreview } from './contracts/tabular-preview';

type Props = {
  artifactStableId: string;
  filename: string | null;
  isZh: boolean;
};

export function AccountingEvidenceTablePreview({
  artifactStableId,
  filename,
  isZh,
}: Props) {
  const [sheetIndex, setSheetIndex] = useState(0);
  const [preview, setPreview] = useState<AccountingTabularPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isXlsx = useMemo(
    () => filename?.toLowerCase().endsWith('.xlsx') ?? false,
    [filename],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const query = isXlsx ? `?sheetIndex=${sheetIndex}` : '';
    void apiFetch<AccountingTabularPreview>(
      `/accounting/inbox/artifacts/${encodeURIComponent(artifactStableId)}/tabular-preview${query}`,
    )
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
  }, [artifactStableId, isXlsx, sheetIndex]);

  if (loading) {
    return (
      <div className="m-auto text-sm text-slate-500">
        {isZh ? '正在生成安全表格预览…' : 'Preparing safe table preview…'}
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="m-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
        <p className="font-medium text-amber-900">
          {isZh ? '无法生成表格预览' : 'Table preview unavailable'}
        </p>
        <p className="mt-2 text-sm leading-6 text-amber-800">
          {error ??
            (isZh
              ? '该文件无法安全解析。仍可使用右上角下载原文件。'
              : 'This file could not be parsed safely. The original file can still be downloaded from the header.')}
        </p>
      </div>
    );
  }

  const truncated =
    preview.truncatedRows ||
    preview.truncatedColumns ||
    preview.truncatedCells ||
    preview.sheetNamesTruncated;

  return (
    <div className="flex min-h-[65vh] w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
        <div className="text-xs text-slate-500">
          {preview.format} · {preview.previewRowCount}{' '}
          {isZh ? '行' : 'rows'} · {preview.previewColumnCount}{' '}
          {isZh ? '列' : 'columns'}
        </div>

        {preview.format === 'XLSX' && preview.sheetNames.length > 1 ? (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span>{isZh ? '工作表' : 'Worksheet'}</span>
            <select
              value={preview.activeSheetIndex ?? 0}
              onChange={(event) => setSheetIndex(Number(event.target.value))}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
            >
              {preview.sheetNames.map((sheetName, index) => (
                <option key={`${index}:${sheetName}`} value={index}>
                  {sheetName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {truncated ? (
        <p className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {isZh
            ? `为保证浏览安全，预览最多显示 ${preview.limits.maxRows} 行、${preview.limits.maxColumns} 列、单元格 ${preview.limits.maxCellCharacters} 字符、${preview.limits.maxSheets} 个工作表；原文件未被修改。`
            : `For safe browsing, preview is limited to ${preview.limits.maxRows} rows, ${preview.limits.maxColumns} columns, ${preview.limits.maxCellCharacters} characters per cell, and ${preview.limits.maxSheets} worksheets. The source file is unchanged.`}
        </p>
      ) : null}

      {preview.rows.length ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-full border-collapse text-left text-xs text-slate-800">
            <tbody>
              {preview.rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={rowIndex % 2 ? 'bg-slate-50' : 'bg-white'}
                >
                  {Array.from(
                    { length: preview.previewColumnCount },
                    (_, columnIndex) => (
                      <td
                        key={columnIndex}
                        className="max-w-[24rem] border-b border-r border-slate-200 px-2 py-1.5 align-top whitespace-pre-wrap break-words"
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
          {isZh ? '这个表格没有可预览内容。' : 'This table has no previewable content.'}
        </div>
      )}

      <p className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        {isZh
          ? '此处仅显示解析后的纯文本值，不执行公式、宏或外部链接。'
          : 'This view renders parsed plain-text values only. Formulas, macros, and external links are not executed.'}
      </p>
    </div>
  );
}

export function accountingEvidenceSupportsTabularPreview(input: {
  kind: string;
  filename: string | null;
}): boolean {
  if (input.kind === 'CSV') return true;
  return input.filename?.toLowerCase().endsWith('.xlsx') ?? false;
}
