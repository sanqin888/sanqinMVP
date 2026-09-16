export function normalizeAccountingManualUploadFilename(
  filename: string,
): string;
export function normalizeAccountingManualUploadFilename(filename: null): null;
export function normalizeAccountingManualUploadFilename(
  filename: string | null,
): string | null {
  if (!filename) return filename;

  for (const character of filename) {
    if ((character.codePointAt(0) ?? 0) > 0xff) return filename;
  }

  const parameterBytes = Buffer.from(filename, 'latin1');
  const decoded = parameterBytes.toString('utf8');
  if (decoded === filename || decoded.includes('\uFFFD')) return filename;
  if (!Buffer.from(decoded, 'utf8').equals(parameterBytes)) return filename;
  return decoded;
}
