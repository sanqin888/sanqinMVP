# Uber 商户凭据一次性回填

此流程必须在部署删除明文字段的代码和迁移前完成。工具只输出批次和审计计数，不输出行 ID、token、密文或异常详情。

1. 保持当前兼容读取版本在线，并确认生产密钥环通过 secrets manager 注入。
2. 在包含旧明文字段的数据库上分批执行：
   `pnpm --filter api exec ts-node src/scripts/backfill-uber-credentials.ts --batch-size=100`
3. 可重复执行。每行更新在事务内完成，写入后会立即解密并与内存中的原值比较；失败会回滚该批次。
4. 在切换应用版本前执行只读门禁：
   `pnpm --filter api exec ts-node src/scripts/backfill-uber-credentials.ts --verify-only`
   只有 `incomplete=0` 且 `decryptFailures=0` 时命令才以 0 退出。`plaintext` 是尚待迁移删除的明文行数，不影响此阶段门禁；迁移后字段会被物理删除。
5. 保存每批 JSON 计数和最终审计输出作为变更记录。不得提高应用日志级别来排查 token，也不得查询或复制 token 到工单。
6. 获得维护者批准后，由维护者运行：
   `pnpm --filter api prisma migrate dev --name remove_plaintext_uber_tokens`
7. 审阅生成的迁移仅删除 `accessToken`、`refreshToken`，再部署本变更。禁止在第 4 步门禁通过前关闭兼容读取或执行删除列迁移。

本次 QA 不生成 migration 文件。
