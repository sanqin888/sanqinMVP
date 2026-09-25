'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type {
  AccountingEvidenceFileManagerState,
  AccountingEvidenceFolder,
  AccountingEvidenceMoveResult,
  AccountingManagedEvidenceFile,
} from './contracts/evidence-file-manager';

type Props = {
  isZh: boolean;
  onClose: () => void;
};

type FolderFilter = 'ALL' | 'UNFILED' | string;

const ACCOUNTING_EVIDENCE_MOVE_MAX_FILES = 100;

export function AccountingEvidenceFileManager({ isZh, onClose }: Props) {
  const [state, setState] =
    useState<AccountingEvidenceFileManagerState | null>(null);
  const [activeFolder, setActiveFolder] = useState<FolderFilter>('ALL');
  const [selectedArtifactStableIds, setSelectedArtifactStableIds] = useState<
    string[]
  >([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [loading, setLoading] = useState(true);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [moving, setMoving] = useState(false);
  const [showMoveTargets, setShowMoveTargets] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await apiFetch<AccountingEvidenceFileManagerState>(
        '/accounting/evidence-file-manager',
      );
      setState(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleFiles = useMemo(
    () => filterAccountingEvidenceFiles(state?.files ?? [], activeFolder),
    [activeFolder, state?.files],
  );

  const selectedIds = useMemo(
    () => new Set(selectedArtifactStableIds),
    [selectedArtifactStableIds],
  );
  const allVisibleSelected =
    visibleFiles.length > 0 &&
    visibleFiles.every((file) => selectedIds.has(file.artifactStableId));

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setCreatingFolder(true);
    setError(null);
    try {
      const folder = await apiFetch<AccountingEvidenceFolder>(
        '/accounting/evidence-folders',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        },
      );
      setNewFolderName('');
      await load();
      setActiveFolder(folder.folderStableId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCreatingFolder(false);
    }
  }

  async function moveSelected(targetFolderStableId: string | null) {
    if (!selectedArtifactStableIds.length) return;
    setMoving(true);
    setError(null);
    try {
      await apiFetch<AccountingEvidenceMoveResult>(
        '/accounting/evidence-files/move',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            artifactStableIds: selectedArtifactStableIds,
            targetFolderStableId,
          }),
        },
      );
      setSelectedArtifactStableIds([]);
      setShowMoveTargets(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setMoving(false);
    }
  }

  function toggleSelected(artifactStableId: string) {
    if (selectedArtifactStableIds.includes(artifactStableId)) {
      setSelectedArtifactStableIds((current) =>
        current.filter((value) => value !== artifactStableId),
      );
      return;
    }
    if (
      selectedArtifactStableIds.length >= ACCOUNTING_EVIDENCE_MOVE_MAX_FILES
    ) {
      setError(
        isZh
          ? `一次最多选择 ${ACCOUNTING_EVIDENCE_MOVE_MAX_FILES} 个文件。`
          : `Select at most ${ACCOUNTING_EVIDENCE_MOVE_MAX_FILES} files at a time.`,
      );
      return;
    }
    setSelectedArtifactStableIds((current) => [
      ...current,
      artifactStableId,
    ]);
  }

  function toggleAllVisible() {
    const visibleIds = visibleFiles.map((file) => file.artifactStableId);
    const visibleIdSet = new Set(visibleIds);
    if (allVisibleSelected) {
      setSelectedArtifactStableIds((current) =>
        current.filter((value) => !visibleIdSet.has(value)),
      );
      return;
    }

    const merged = [
      ...new Set([...selectedArtifactStableIds, ...visibleIds]),
    ];
    if (merged.length > ACCOUNTING_EVIDENCE_MOVE_MAX_FILES) {
      setError(
        isZh
          ? `一次最多选择 ${ACCOUNTING_EVIDENCE_MOVE_MAX_FILES} 个文件。`
          : `Select at most ${ACCOUNTING_EVIDENCE_MOVE_MAX_FILES} files at a time.`,
      );
    }
    setSelectedArtifactStableIds(
      merged.slice(0, ACCOUNTING_EVIDENCE_MOVE_MAX_FILES),
    );
  }

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/65 p-2 sm:p-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="accounting-file-manager-title"
        className="mx-auto flex min-h-[calc(100vh-1rem)] max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:min-h-[calc(100vh-2.5rem)]"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div>
            <h2
              id="accounting-file-manager-title"
              className="font-semibold text-slate-900"
            >
              {isZh ? '证据文件管理' : 'Evidence file manager'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {isZh
                ? '文件夹只整理显示位置，不移动服务器上的原始文件。'
                : 'Folders organize evidence logically; source binaries stay in place.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            {isZh ? '关闭' : 'Close'}
          </button>
        </header>

        {error ? (
          <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="grid flex-1 gap-0 md:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 bg-slate-50 p-3 md:border-b-0 md:border-r">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void createFolder();
              }}
              className="mb-4 space-y-2"
            >
              <label className="text-xs font-medium text-slate-600">
                {isZh ? '新建文件夹' : 'New folder'}
              </label>
              <div className="flex gap-2">
                <input
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  maxLength={80}
                  placeholder={isZh ? '文件夹名称' : 'Folder name'}
                  className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                />
                <button
                  type="submit"
                  disabled={!newFolderName.trim() || creatingFolder}
                  className="rounded border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-sm font-medium text-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creatingFolder
                    ? isZh
                      ? '创建中…'
                      : 'Creating…'
                    : isZh
                      ? '新建'
                      : 'Create'}
                </button>
              </div>
            </form>

            <nav className="space-y-1">
              <FolderButton
                active={activeFolder === 'ALL'}
                label={isZh ? '全部文件' : 'All files'}
                count={state?.files.length ?? 0}
                onClick={() => setActiveFolder('ALL')}
              />
              <FolderButton
                active={activeFolder === 'UNFILED'}
                label={isZh ? '未归档' : 'Unfiled'}
                count={
                  state?.files.filter((file) => file.folder === null).length ??
                  0
                }
                onClick={() => setActiveFolder('UNFILED')}
              />
              {state?.folders.map((folder) => (
                <FolderButton
                  key={folder.folderStableId}
                  active={activeFolder === folder.folderStableId}
                  label={folder.name}
                  count={folder.fileCount}
                  onClick={() => setActiveFolder(folder.folderStableId)}
                />
              ))}
            </nav>
          </aside>

          <div className="min-w-0 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  disabled={!visibleFiles.length}
                />
                {isZh ? '选择当前列表' : 'Select visible'}
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-500">
                  {isZh
                    ? '已选择 ' +
                      selectedArtifactStableIds.length +
                      ` / ${ACCOUNTING_EVIDENCE_MOVE_MAX_FILES} 个文件`
                    : selectedArtifactStableIds.length +
                      ` / ${ACCOUNTING_EVIDENCE_MOVE_MAX_FILES} selected`}
                </span>
                <button
                  type="button"
                  disabled={!selectedArtifactStableIds.length || moving}
                  onClick={() => setShowMoveTargets((current) => !current)}
                  className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {moving
                    ? isZh
                      ? '移动中…'
                      : 'Moving…'
                    : isZh
                      ? '移动'
                      : 'Move'}
                </button>
              </div>
            </div>

            {showMoveTargets && selectedArtifactStableIds.length ? (
              <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="mb-2 text-sm font-medium text-slate-800">
                  {isZh ? '选择目标文件夹' : 'Choose destination folder'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={moving}
                    onClick={() => void moveSelected(null)}
                    className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
                  >
                    {isZh ? '未归档' : 'Unfiled'}
                  </button>
                  {state?.folders.map((folder) => (
                    <button
                      key={folder.folderStableId}
                      type="button"
                      disabled={moving}
                      onClick={() =>
                        void moveSelected(folder.folderStableId)
                      }
                      className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
                    >
                      {folder.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {state?.truncated ? (
              <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {isZh
                  ? '文件数量超过 ' +
                    state.fileLimit +
                    '，当前仅显示最新 ' +
                    state.fileLimit +
                    ' 个。'
                  : 'More than ' +
                    state.fileLimit +
                    ' files exist; only the newest ' +
                    state.fileLimit +
                    ' are shown.'}
              </p>
            ) : null}

            {loading ? (
              <p className="py-8 text-center text-sm text-slate-500">
                {isZh ? '加载中…' : 'Loading…'}
              </p>
            ) : null}

            {!loading && !visibleFiles.length ? (
              <p className="py-8 text-center text-sm text-slate-500">
                {isZh ? '这个位置还没有文件。' : 'No files in this location.'}
              </p>
            ) : null}

            <div className="divide-y divide-slate-200">
              {visibleFiles.map((file) => (
                <ManagedFileRow
                  key={file.artifactStableId}
                  file={file}
                  isZh={isZh}
                  checked={selectedIds.has(file.artifactStableId)}
                  onToggle={() => toggleSelected(file.artifactStableId)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FolderButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm',
        active
          ? 'bg-white font-medium text-slate-900 shadow-sm'
          : 'text-slate-600 hover:bg-white',
      ].join(' ')}
    >
      <span className="truncate">{label}</span>
      <span className="ml-2 text-xs text-slate-400">{count}</span>
    </button>
  );
}

function ManagedFileRow({
  file,
  isZh,
  checked,
  onToggle,
}: {
  file: AccountingManagedEvidenceFile;
  isZh: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">
          {accountingManagedEvidenceDisplayFilename(file)}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {file.kind} · {file.acquisitionMode} ·{' '}
          {formatAccountingEvidenceFileBytes(
            accountingManagedEvidenceDisplayByteSize(file),
            isZh,
          )}{' '}
          · {new Date(file.createdAt).toLocaleString()}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {isZh ? '位置' : 'Location'}:{' '}
          {file.folder?.name ?? (isZh ? '未归档' : 'Unfiled')}
        </p>
      </div>
    </label>
  );
}

export function accountingManagedEvidenceDisplayFilename(
  file: AccountingManagedEvidenceFile,
): string {
  return file.displayFilename ?? file.originalFilename ?? file.artifactStableId;
}

export function accountingManagedEvidenceDisplayByteSize(
  file: AccountingManagedEvidenceFile,
): number | null {
  return file.displayByteSize ?? file.byteSize;
}

export function filterAccountingEvidenceFiles(
  files: AccountingManagedEvidenceFile[],
  folder: FolderFilter,
): AccountingManagedEvidenceFile[] {
  if (folder === 'ALL') return files;
  if (folder === 'UNFILED') {
    return files.filter((file) => file.folder === null);
  }
  return files.filter((file) => file.folder?.folderStableId === folder);
}

function formatAccountingEvidenceFileBytes(
  value: number | null,
  isZh: boolean,
): string {
  if (value == null) return isZh ? '大小未知' : 'Size unknown';
  if (value < 1024) return value + ' B';
  const kb = value / 1024;
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  return (kb / 1024).toFixed(1) + ' MB';
}
