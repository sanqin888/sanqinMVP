import { spawn } from 'node:child_process';
import sharp from 'sharp';

const OCR_TIMEOUT_MS = 20_000;
const OCR_MAX_OUTPUT_BYTES = 512 * 1024;
const OCR_MAX_DIMENSION = 3000;

export type AccountingImageOcrResult = {
  text: string;
  engine: 'TESSERACT';
};

export async function extractAccountingImageText(
  buffer: Buffer,
): Promise<AccountingImageOcrResult> {
  const prepared = await sharp(buffer, {
    failOn: 'error',
    limitInputPixels: 80_000_000,
  })
    .rotate()
    .resize({
      width: OCR_MAX_DIMENSION,
      height: OCR_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();

  const text = await runTesseract(prepared);
  return { text: text.replace(/\s+/g, ' ').trim(), engine: 'TESSERACT' };
}

function runTesseract(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'tesseract',
      ['stdin', 'stdout', '-l', 'eng+chi_sim', '--psm', '6'],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const clearTimer = () => {
      if (timer) clearTimeout(timer);
    };
    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimer();
      reject(error);
    };
    const finishResolve = (value: string) => {
      if (settled) return;
      settled = true;
      clearTimer();
      resolve(value);
    };

    timer = setTimeout(() => {
      child.kill('SIGKILL');
      finishReject(new Error('Accounting image OCR timed out'));
    }, OCR_TIMEOUT_MS);

    child.on('error', (error) => {
      finishReject(
        new Error(`Accounting image OCR unavailable: ${error.message}`),
      );
    });
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > OCR_MAX_OUTPUT_BYTES) {
        child.kill('SIGKILL');
        finishReject(new Error('Accounting image OCR output exceeded limit'));
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrBytes >= 16 * 1024) return;
      const remaining = 16 * 1024 - stderrBytes;
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
            `Accounting image OCR failed with exit code ${code ?? 'unknown'}${detail ? `: ${detail}` : ''}`,
          ),
        );
        return;
      }
      finishResolve(Buffer.concat(stdoutChunks).toString('utf8'));
    });

    child.stdin.on('error', (error) => {
      finishReject(
        new Error(`Accounting image OCR input failed: ${error.message}`),
      );
    });
    child.stdin.end(buffer);
  });
}
