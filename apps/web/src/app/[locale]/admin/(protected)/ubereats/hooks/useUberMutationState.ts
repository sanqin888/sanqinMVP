"use client";

import { useCallback, useState } from 'react';
import type { OperationPhase } from '../types';

export type RunAction = (
  key: string,
  fn: () => Promise<unknown>,
  successText: string,
  shouldRefresh?: boolean,
) => Promise<void>;

const COMPLETED_MENU_PUBLISH_SUCCESS_TEXT = '已提交，等待 Uber 确认';

function getResultStatus(result: unknown): string | null {
  if (result === null || typeof result !== 'object') return null;
  const record = result as Record<string, unknown>;
  const status = record.phase ?? record.status;
  return typeof status === 'string' ? status : null;
}

export function resolveActionSuccess(
  result: unknown,
  successText: string,
): { phase: OperationPhase; message: string } {
  // Formal menu publish only resolves after the backend receives Uber's 204
  // upload response. There is no follow-up Uber webhook to wait for.
  if (successText === COMPLETED_MENU_PUBLISH_SUCCESS_TEXT) {
    return {
      phase: 'COMPLETED',
      message: '菜单已成功发布到 Uber',
    };
  }

  const resultStatus = getResultStatus(result);
  if (resultStatus === 'SUCCEEDED') {
    return {
      phase: 'COMPLETED',
      message: successText.includes('等待 Uber')
        ? 'Uber 已接受请求，处理完成'
        : successText,
    };
  }

  return {
    phase: successText.includes('等待 Uber') ? 'WAITING_WEBHOOK' : 'COMPLETED',
    message: successText,
  };
}

export function useUberMutationState(refresh: () => Promise<unknown>) {
  const [operations, setOperations] = useState<Record<string, OperationPhase>>(
    {},
  );
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const runAction = useCallback<RunAction>(
    async (key, fn, successText, shouldRefresh = true) => {
      setOperations((state) => ({ ...state, [key]: 'QUEUED' }));
      setActionError(null);
      setActionMessage(null);
      await Promise.resolve();
      setOperations((state) => ({ ...state, [key]: 'PROCESSING' }));

      try {
        const result = await fn();
        const success = resolveActionSuccess(result, successText);
        setOperations((state) => ({ ...state, [key]: success.phase }));
        setActionMessage(success.message);
        if (shouldRefresh) await refresh();
      } catch (error) {
        setOperations((state) => ({ ...state, [key]: 'RETRYABLE_FAILED' }));
        setActionError(error instanceof Error ? error.message : '操作失败');
      }
    },
    [refresh],
  );

  const actionLoading = Object.fromEntries(
    Object.entries(operations).map(([key, value]) => [
      key,
      value === 'QUEUED' || value === 'PROCESSING',
    ]),
  );

  return {
    operations,
    actionLoading,
    actionMessage,
    actionError,
    setActionError,
    runAction,
  };
}
