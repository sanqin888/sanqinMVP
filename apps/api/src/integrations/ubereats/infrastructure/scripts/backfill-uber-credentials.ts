import { PrismaClient } from '@prisma/client';
import { UberCredentialVaultService } from '../crypto/uber-credential-vault.service';

type LegacyCredentialRow = {
  id: string;
  accessToken: string | null;
  refreshToken: string | null;
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
};

type AuditCounts = {
  total: bigint;
  incomplete: bigint;
  plaintext: bigint;
};

const prisma = new PrismaClient();
const vault = new UberCredentialVaultService(process.env);
const verifyOnly = process.argv.includes('--verify-only');
const batchSizeArgument = process.argv.find((value) =>
  value.startsWith('--batch-size='),
);
const batchSize = Number(batchSizeArgument?.split('=')[1] ?? '100');

if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
  throw new Error('batch-size 必须是 1 到 1000 之间的整数');
}

async function audit(): Promise<{
  counts: AuditCounts;
  decryptFailures: number;
}> {
  const [counts] = await prisma.$queryRaw<AuditCounts[]>`
    SELECT
      COUNT(*)::bigint AS "total",
      COUNT(*) FILTER (
        WHERE "encryptedAccessToken" IS NULL
          OR ("refreshToken" IS NOT NULL AND "encryptedRefreshToken" IS NULL)
      )::bigint AS "incomplete",
      COUNT(*) FILTER (
        WHERE "accessToken" IS NOT NULL OR "refreshToken" IS NOT NULL
      )::bigint AS "plaintext"
    FROM "UberMerchantConnection"
  `;
  const encrypted = await prisma.$queryRaw<
    Pick<
      LegacyCredentialRow,
      'encryptedAccessToken' | 'encryptedRefreshToken'
    >[]
  >`
    SELECT "encryptedAccessToken", "encryptedRefreshToken"
    FROM "UberMerchantConnection"
    WHERE "encryptedAccessToken" IS NOT NULL
       OR "encryptedRefreshToken" IS NOT NULL
  `;
  let decryptFailures = 0;
  for (const row of encrypted) {
    try {
      if (row.encryptedAccessToken) vault.decrypt(row.encryptedAccessToken);
      if (row.encryptedRefreshToken) vault.decrypt(row.encryptedRefreshToken);
    } catch {
      decryptFailures += 1;
    }
  }
  return { counts, decryptFailures };
}

async function backfillBatch(): Promise<number> {
  return prisma.$transaction(async (transaction) => {
    const rows = await transaction.$queryRawUnsafe<LegacyCredentialRow[]>(
      `SELECT "id", "accessToken", "refreshToken", "encryptedAccessToken", "encryptedRefreshToken"
       FROM "UberMerchantConnection"
       WHERE ("accessToken" IS NOT NULL AND "encryptedAccessToken" IS NULL)
          OR ("refreshToken" IS NOT NULL AND "encryptedRefreshToken" IS NULL)
       ORDER BY "id"
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      batchSize,
    );
    for (const row of rows) {
      const encryptedAccessToken =
        row.encryptedAccessToken ??
        (row.accessToken ? vault.encrypt(row.accessToken) : null);
      const encryptedRefreshToken =
        row.encryptedRefreshToken ??
        (row.refreshToken ? vault.encrypt(row.refreshToken) : null);
      if (!encryptedAccessToken || !row.accessToken) {
        throw new Error('发现无法回填的 Uber access token 行');
      }
      if (vault.decrypt(encryptedAccessToken) !== row.accessToken) {
        throw new Error('Uber access token 回填解密校验失败');
      }
      if (
        row.refreshToken &&
        (!encryptedRefreshToken ||
          vault.decrypt(encryptedRefreshToken) !== row.refreshToken)
      ) {
        throw new Error('Uber refresh token 回填解密校验失败');
      }
      await transaction.$executeRaw`
        UPDATE "UberMerchantConnection"
        SET "encryptedAccessToken" = ${encryptedAccessToken},
            "encryptedRefreshToken" = ${encryptedRefreshToken}
        WHERE "id" = ${row.id}
      `;
    }
    return rows.length;
  });
}

async function main(): Promise<void> {
  let processed = 0;
  if (!verifyOnly) {
    for (;;) {
      const count = await backfillBatch();
      processed += count;
      process.stdout.write(
        `${JSON.stringify({ event: 'uber_credential_backfill_batch', processed: count, processedTotal: processed })}\n`,
      );
      if (count < batchSize) break;
    }
  }
  const result = await audit();
  const summary = {
    event: 'uber_credential_backfill_audit',
    total: Number(result.counts.total),
    incomplete: Number(result.counts.incomplete),
    plaintext: Number(result.counts.plaintext),
    decryptFailures: result.decryptFailures,
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (summary.incomplete !== 0 || summary.decryptFailures !== 0)
    process.exitCode = 1;
}

void main()
  .catch(() => {
    process.stderr.write(
      'Uber credential 回填失败；详情已省略以避免泄露凭据\n',
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
