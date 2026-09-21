import { spawn } from 'node:child_process';

export const ACCOUNTING_SCANNED_PDF_RASTER_POLICY = {
  maxPages: 6,
  rasterDpi: 200,
  commandTimeoutMs: 10_000,
  maxInfoOutputBytes: 64 * 1024,
  maxRasterPageBytes: 20 * 1024 * 1024,
  maxStderrBytes: 16 * 1024,
} as const;

export type AccountingPdfInfoRunner = (buffer: Buffer) => Promise<string>;
export type AccountingPdfPageRasterRunner = (
  buffer: Buffer,
  page: number,
  dpi: number,
) => Promise<Buffer>;

function assertPdfBuffer(buffer: Buffer): void {
  if (
    buffer.length < 5 ||
    buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
  ) {
    throw new Error('Accounting scanned PDF input is invalid');
  }
}

export async function inspectAccountingPdfPageCount(
  buffer: Buffer,
  runner: AccountingPdfInfoRunner = runPdfInfo,
): Promise<number> {
  assertPdfBuffer(buffer);
  const output = await runner(buffer);
  const match = /^Pages:\s+(\d+)\s*$/im.exec(output);
  if (!match) {
    throw new Error('Accounting scanned PDF page count is unavailable');
  }
  const pageCount = Number(match[1]);
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error('Accounting scanned PDF page count is invalid');
  }
  return pageCount;
}

export async function rasterizeAccountingPdfPage(
  buffer: Buffer,
  page: number,
  runner: AccountingPdfPageRasterRunner = runPdfToCairoPage,
): Promise<Buffer> {
  assertPdfBuffer(buffer);
  if (!Number.isInteger(page) || page < 1) {
    throw new Error('Accounting scanned PDF page number is invalid');
  }
  const raster = await runner(
    buffer,
    page,
    ACCOUNTING_SCANNED_PDF_RASTER_POLICY.rasterDpi,
  );
  if (!raster.length) {
    throw new Error(`Accounting scanned PDF page ${page} raster is empty`);
  }
  if (
    raster.length > ACCOUNTING_SCANNED_PDF_RASTER_POLICY.maxRasterPageBytes
  ) {
    throw new Error(
      `Accounting scanned PDF page ${page} raster exceeded byte limit`,
    );
  }
  return raster;
}

function runPdfInfo(buffer: Buffer): Promise<string> {
  return runPopplerCommand({
    command: 'pdfinfo',
    args: ['-'],
    buffer,
    operation: 'page inspection',
    maxStdoutBytes:
      ACCOUNTING_SCANNED_PDF_RASTER_POLICY.maxInfoOutputBytes,
  }).then((output) => output.toString('utf8'));
}

function runPdfToCairoPage(
  buffer: Buffer,
  page: number,
  dpi: number,
): Promise<Buffer> {
  return runPopplerCommand({
    command: 'pdftocairo',
    args: [
      '-jpeg',
      '-singlefile',
      '-f',
      String(page),
      '-l',
      String(page),
      '-r',
      String(dpi),
      '-',
      '-',
    ],
    buffer,
    operation: `page ${page} rasterization`,
    maxStdoutBytes:
      ACCOUNTING_SCANNED_PDF_RASTER_POLICY.maxRasterPageBytes,
  });
}

function runPopplerCommand(params: {
  command: 'pdfinfo' | 'pdftocairo';
  args: string[];
  buffer: Buffer;
  operation: string;
  maxStdoutBytes: number;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(params.command, params.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const clearTimer = () => clearTimeout(timer);
    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimer();
      reject(error);
    };
    const finishResolve = (value: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimer();
      resolve(value);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finishReject(
        new Error(`Accounting scanned PDF ${params.operation} timed out`),
      );
    }, ACCOUNTING_SCANNED_PDF_RASTER_POLICY.commandTimeoutMs);

    child.on('error', (error) => {
      finishReject(
        new Error(
          `Accounting scanned PDF ${params.operation} unavailable: ${error.message}`,
        ),
      );
    });
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > params.maxStdoutBytes) {
        child.kill('SIGKILL');
        finishReject(
          new Error(
            `Accounting scanned PDF ${params.operation} output exceeded limit`,
          ),
        );
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (
        stderrBytes >= ACCOUNTING_SCANNED_PDF_RASTER_POLICY.maxStderrBytes
      ) {
        return;
      }
      const remaining =
        ACCOUNTING_SCANNED_PDF_RASTER_POLICY.maxStderrBytes - stderrBytes;
      const bounded = chunk.subarray(0, remaining);
      stderrBytes += bounded.length;
      stderrChunks.push(bounded);
    });
    child.on('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        const detail = Buffer.concat(stderrChunks).toString('utf8').trim();
        finishReject(
          new Error(
            `Accounting scanned PDF ${params.operation} failed with exit code ${code ?? 'unknown'}${detail ? `: ${detail}` : ''}`,
          ),
        );
        return;
      }
      finishResolve(Buffer.concat(stdoutChunks));
    });
    child.stdin.on('error', (error) => {
      finishReject(
        new Error(
          `Accounting scanned PDF ${params.operation} input failed: ${error.message}`,
        ),
      );
    });
    child.stdin.end(params.buffer);
  });
}
