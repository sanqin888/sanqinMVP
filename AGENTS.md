# Codex rules for sanqinMVP

## Hard constraints
- Do NOT create or modify any dependency manifest or lockfile:
  - **/package.json
  - pnpm-lock.yaml
  - package-lock.json / yarn.lock
  Unless I explicitly ask to add/remove dependencies.

- Do NOT create or modify Prisma migration files/folders:
  - apps/api/prisma/migrations/**
  Unless I explicitly ask to create a migration.

## Command restrictions (to avoid generating files)
- Never run: pnpm install / pnpm add / npm install / yarn add.
- Never run: prisma migrate dev / prisma migrate deploy / prisma migrate reset.
- If you believe a dependency or migration is required:
  1) Explain why,
  2) Provide the exact command(s) I should run locally,
  3) Stop and wait for approval. Do not generate the files yourself.

## Preferred behavior
- For Prisma changes: edit schema only (schema.prisma), and propose a migration name + command.
- For dependencies: propose pnpm --filter <pkg> add <dep> commands only.
