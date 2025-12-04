//Users/apple/sanqinMVP/apps/web/src/app/delivery/[id]

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isStableId } from '../../../lib/stable-id';
import {
  DeliveryStatus,
  type DeliveryStatusValue,
  DELIVERY_STATUS_SEQUENCE,
  DELIVERY_STATUS_TRANSITIONS,
} from "@status/delivery-status";
type PageProps = { params: { id: string } };

export default function DeliveryDetailPage({ params }: PageProps) {
  const deliveryId = params?.id ?? '';
  const [validId, setValidId] = useState(true);

  useEffect(() => {
    setValidId(isStableId(deliveryId));
  }, [deliveryId]);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">配送详情</h1>
          <p className="break-all text-sm text-gray-500">ID: {deliveryId}</p>
        </div>
        <Link href="/test-order" className="text-sm text-blue-600 hover:underline">
          ← 返回测试面板
        </Link>
      </div>

      {!validId && (
        <div className="rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          无效的配送 ID，需为 cuid/uuid。
        </div>
      )}

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold text-gray-700">状态流转规划</h2>
        <ol className="flex flex-wrap gap-2 text-xs text-gray-600">
          {DELIVERY_STATUS_SEQUENCE.map((status) => (
            <li key={status} className="rounded-full border border-dashed px-3 py-1">
              {status}
            </li>
          ))}
        </ol>
        <p className="text-xs text-gray-500">
          深链规范：<code className="rounded bg-gray-100 px-1 py-0.5">sanqin://delivery/{deliveryId || ':id'}</code>
        </p>
      </section>
    </main>
  );
}
