'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

type MatchMode = 'ANY' | 'ALL';
type Provider = 'CLOVER' | 'UBER_EATS' | 'FANTUAN';
type DocumentType = 'BATCH_CONTROL' | 'STATEMENT' | 'API_REPORT' | 'OTHER';

type ProviderRecognitionRule = {
  ruleStableId: string;
  provider: Provider;
  documentType: DocumentType;
  requiredKeywords: string[];
  optionalKeywords: string[];
  optionalMatchMode: MatchMode;
  priority: number;
  isActive: boolean;
  version: number;
  updatedByUserStableId: string | null;
  persisted: boolean;
  changed?: boolean;
};

type Props = {
  isZh: boolean;
};

const providerLabels: Record<Provider, string> = {
  CLOVER: 'Clover',
  UBER_EATS: 'Uber Eats',
  FANTUAN: 'Fantuan',
};

export function AccountingProviderRecognitionRulesSettings({ isZh }: Props) {
  const [rules, setRules] = useState<ProviderRecognitionRule[]>([]);
  const [keywordDrafts, setKeywordDrafts] = useState<
    Record<string, { required: string; optional: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await apiFetch<ProviderRecognitionRule[]>(
        '/accounting/inbox/provider-recognition-rules',
      );
      setRules(loaded);
      setKeywordDrafts(
        Object.fromEntries(
          loaded.map((rule) => [
            rule.ruleStableId,
            {
              required: rule.requiredKeywords.join('\n'),
              optional: rule.optionalKeywords.join('\n'),
            },
          ]),
        ),
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

  function editRule(
    ruleStableId: string,
    patch: Partial<ProviderRecognitionRule>,
  ) {
    setRules((current) =>
      current.map((rule) =>
        rule.ruleStableId === ruleStableId ? { ...rule, ...patch } : rule,
      ),
    );
  }

  async function saveRule(rule: ProviderRecognitionRule) {
    setBusyRuleId(rule.ruleStableId);
    setMessage(null);
    setError(null);
    try {
      const draft = keywordDrafts[rule.ruleStableId];
      const updated = await apiFetch<ProviderRecognitionRule>(
        `/accounting/inbox/provider-recognition-rules/${encodeURIComponent(rule.ruleStableId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requiredKeywords: keywordsFromTextarea(
              draft?.required ?? rule.requiredKeywords.join('\n'),
            ),
            optionalKeywords: keywordsFromTextarea(
              draft?.optional ?? rule.optionalKeywords.join('\n'),
            ),
            optionalMatchMode: rule.optionalMatchMode,
            priority: rule.priority,
            isActive: rule.isActive,
          }),
        },
      );
      setRules((current) =>
        current.map((candidate) =>
          candidate.ruleStableId === rule.ruleStableId ? updated : candidate,
        ),
      );
      setKeywordDrafts((current) => ({
        ...current,
        [rule.ruleStableId]: {
          required: updated.requiredKeywords.join('\n'),
          optional: updated.optionalKeywords.join('\n'),
        },
      }));
      setMessage(
        updated.changed === false
          ? isZh
            ? '规则没有变化，无需写入。'
            : 'No rule changes to save.'
          : isZh
            ? '平台结算资料识别规则已保存，并写入审计记录。'
            : 'Provider recognition rule saved and audited.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyRuleId(null);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">
        {isZh ? '平台结算资料识别规则' : 'Provider statement recognition'}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        {isZh
          ? '这里只控制“这份资料属于哪个平台/类型”的系统建议，不修改 Sales、Fee、Tax、Net Total 等财务字段映射。所有必填关键词都必须出现；可选关键词可按 ANY / ALL 匹配。数字越小优先级越高，同优先级同时命中会放弃自动判断，交给 Inbox 人工确认。'
          : 'These rules only control the suggested provider/document type. They do not change code-owned mappings for Sales, Fees, Tax, Net Total, or other financial facts. All required keywords must match; optional keywords use ANY or ALL. Lower priority numbers win, and a same-priority tie fails closed to manual Inbox review.'}
      </p>

      {message ? (
        <p className="mt-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="mt-4 text-sm text-slate-500">
          {isZh ? '加载中…' : 'Loading…'}
        </p>
      ) : null}

      <div className="mt-4 space-y-4">
        {rules.map((rule) => (
          <div key={rule.ruleStableId} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-medium">
                  {providerLabels[rule.provider]} ·{' '}
                  {documentTypeLabel(rule.documentType, isZh)}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {rule.persisted
                    ? `${isZh ? '已自定义' : 'Customized'} · v${rule.version}`
                    : isZh
                      ? '当前使用系统默认规则；首次实际修改后才会写入数据库。'
                      : 'Using the system default; the first real change creates a persisted override.'}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={rule.isActive}
                  onChange={(event) =>
                    editRule(rule.ruleStableId, {
                      isActive: event.target.checked,
                    })
                  }
                />
                {isZh ? '启用' : 'Enabled'}
              </label>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="font-medium">
                  {isZh ? '必填关键词（每行一个）' : 'Required keywords (one per line)'}
                </span>
                <textarea
                  className="min-h-28 rounded border px-3 py-2 font-mono text-xs"
                  value={
                    keywordDrafts[rule.ruleStableId]?.required ??
                    rule.requiredKeywords.join('\n')
                  }
                  onChange={(event) =>
                    setKeywordDrafts((current) => ({
                      ...current,
                      [rule.ruleStableId]: {
                        required: event.target.value,
                        optional:
                          current[rule.ruleStableId]?.optional ??
                          rule.optionalKeywords.join('\n'),
                      },
                    }))
                  }
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">
                  {isZh ? '可选关键词（每行一个）' : 'Optional keywords (one per line)'}
                </span>
                <textarea
                  className="min-h-28 rounded border px-3 py-2 font-mono text-xs"
                  value={
                    keywordDrafts[rule.ruleStableId]?.optional ??
                    rule.optionalKeywords.join('\n')
                  }
                  onChange={(event) =>
                    setKeywordDrafts((current) => ({
                      ...current,
                      [rule.ruleStableId]: {
                        required:
                          current[rule.ruleStableId]?.required ??
                          rule.requiredKeywords.join('\n'),
                        optional: event.target.value,
                      },
                    }))
                  }
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
              <label>
                {isZh ? '可选关键词匹配' : 'Optional match'}
                <select
                  className="mt-1 block rounded border px-3 py-2"
                  value={rule.optionalMatchMode}
                  onChange={(event) =>
                    editRule(rule.ruleStableId, {
                      optionalMatchMode: event.target.value as MatchMode,
                    })
                  }
                >
                  <option value="ANY">ANY</option>
                  <option value="ALL">ALL</option>
                </select>
              </label>
              <label>
                {isZh ? '优先级' : 'Priority'}
                <input
                  type="number"
                  min="0"
                  max="10000"
                  className="mt-1 block w-28 rounded border px-3 py-2"
                  value={rule.priority}
                  onChange={(event) =>
                    editRule(rule.ruleStableId, {
                      priority: Number(event.target.value),
                    })
                  }
                />
              </label>
              <button
                type="button"
                disabled={busyRuleId !== null}
                onClick={() => void saveRule(rule)}
                className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
              >
                {busyRuleId === rule.ruleStableId
                  ? isZh
                    ? '保存中…'
                    : 'Saving…'
                  : isZh
                    ? '保存规则'
                    : 'Save rule'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function keywordsFromTextarea(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function documentTypeLabel(documentType: DocumentType, isZh: boolean) {
  switch (documentType) {
    case 'BATCH_CONTROL':
      return isZh ? '批次控制 / Closeout' : 'Batch control / Closeout';
    case 'STATEMENT':
      return isZh ? '结算单 / Statement' : 'Statement';
    case 'API_REPORT':
      return 'API Report';
    case 'OTHER':
      return isZh ? '其他' : 'Other';
  }
}
