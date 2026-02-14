'use client';

import Image from 'next/image';
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
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  async function handleDelete(url: string): Promise<void> {
    const confirmed = window.confirm(
      isZh ? '确定删除这张图片吗？删除后不可恢复。' : 'Delete this image? This action cannot be undone.',
    );
    if (!confirmed) return;

    setDeleteError(null);
    setDeletingUrl(url);
    try {
      await apiFetch<void>(`/admin/upload/image?url=${encodeURIComponent(url)}`, {
        method: 'DELETE',
      });
      setImages((prev) => prev.filter((img) => img !== url));
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : isZh ? '删除失败' : 'Delete failed');
    } finally {
      setDeletingUrl(null);
    }
  }

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

        {deleteError ? (
          <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {deleteError}
          </p>
        ) : null}

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
                <Image
                  src={url}
                  className="object-cover"
                  alt={isZh ? '图片库预览' : 'Gallery image'}
                  fill
                  sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, 20vw"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(url);
                  }}
                  disabled={deletingUrl === url}
                  className="absolute right-2 top-2 z-10 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={isZh ? '删除图片' : 'Delete image'}
                  title={isZh ? '删除图片' : 'Delete image'}
                >
                  {deletingUrl === url ? (isZh ? '删除中…' : 'Deleting...') : isZh ? '删除' : 'Delete'}
                </button>
                <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
