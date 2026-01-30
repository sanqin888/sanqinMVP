'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

export function ImageLibraryModal({
  onSelect,
  onClose,
  isZh,
}: {
  onSelect: (url: string) => void;
  onClose: () => void;
  isZh: boolean;
}) {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch<{ images: string[] }>('/admin/upload/list')
      .then((data) => {
        if (active) {
          setImages(data.images);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">
            {isZh ? '选择服务器图片' : 'Select from Server'}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label={isZh ? '关闭' : 'Close'}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-slate-500">Loading...</p>
        ) : images.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            {isZh ? '暂无已上传图片' : 'No images uploaded yet.'}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-4 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
            {images.map((url) => (
              <div
                key={url}
                onClick={() => onSelect(url)}
                className="group relative aspect-square cursor-pointer overflow-hidden rounded-md border border-slate-200 hover:border-emerald-500"
              >
                <img
                  src={url}
                  className="h-full w-full object-cover"
                  alt={isZh ? '图片库预览' : 'Gallery image'}
                />
                <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
