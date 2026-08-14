# Codex rules for sanqinMVP

## 1. Core principles

* Make the smallest correct change needed for the task.
* Preserve existing behavior unless the task explicitly requires changing it.
* Fix root causes rather than hiding errors or weakening validation.
* GitHub Actions is the authoritative validation standard for this repository.
* Before completing a coding task, inspect the relevant files under `.github/workflows/**` and reproduce applicable CI checks as closely as possible.
* If these instructions conflict with the actual GitHub workflow, follow the workflow for validation while continuing to respect the safety constraints below.

---

## 2. Dependencies

Do not create or modify dependency manifests or lockfiles unless I explicitly request a dependency change.

Protected files include:

```text
**/package.json
pnpm-lock.yaml
package-lock.json
yarn.lock
```

For clean CI reproduction, Codex MAY run:

```bash
pnpm install --frozen-lockfile --prefer-offline
```

Do not run dependency-changing commands such as `pnpm add`, `pnpm remove`, `pnpm update`, ordinary `pnpm install`, or equivalent npm/yarn commands unless explicitly authorized.

If the frozen install fails because the manifest and lockfile are inconsistent:

1. Do not modify or regenerate the lockfile.
2. Identify the inconsistency.
3. Explain the dependency change that appears necessary.
4. Provide the exact command I should run or approve.
5. Continue any work that can safely be completed without that dependency change.

If a new dependency is required, explain why and propose the exact command instead of installing it automatically.

---

## 3. Prisma

Do not create, modify, delete, or regenerate files under:

```text
apps/api/prisma/migrations/**
```

unless I explicitly request a migration.

For ordinary Prisma schema changes:

* `schema.prisma` may be edited.
* Prisma Client generation is allowed.
* Prisma schema validation is allowed.
* Migration execution or generation is not allowed unless explicitly authorized.

Allowed non-destructive commands include:

```bash
pnpm --filter api prisma:generate
pnpm --filter api exec prisma validate
```

Do not run:

```text
prisma migrate dev
prisma migrate deploy
prisma migrate reset
```

or equivalent migration commands unless explicitly authorized.

If a migration is required, propose an appropriate migration name and provide the exact command I should run.

---

## 4. CI validation

Before declaring a coding task complete:

1. Inspect the relevant `.github/workflows/**` files.
2. Determine which jobs and workspaces are affected by the changes.
3. Match the CI environment and commands as closely as practical.
4. Run every applicable CI check that can safely run in the current environment.
5. Run validation against the final intended source state.

Prefer the exact commands used by GitHub Actions rather than simplified equivalents.

For example, if CI runs:

```bash
pnpm --filter api lint
```

do not treat a generic:

```bash
pnpm lint
```

as an exact substitute.

The current repository CI validates the `web`, `api`, and affected shared packages. Inspect `.github/workflows/ci.yml` for the current commands rather than assuming this list remains unchanged.

When appropriate, CI-equivalent validation currently includes:

```bash
pnpm install --frozen-lockfile --prefer-offline

pnpm --filter web lint
pnpm --filter web build
pnpm --filter web exec tsc -p tsconfig.strict.json --pretty false

pnpm --filter api prisma:generate
pnpm --filter api lint
pnpm --filter api build
pnpm --filter api exec tsc -p tsconfig.strict.json --pretty false

pnpm --filter @shared/menu exec tsc -p tsconfig.strict.json --pretty false
pnpm --filter @shared/order exec tsc -p tsconfig.strict.json --pretty false

pnpm --filter api test
```

Only run checks applicable to the affected code during development, but before claiming full CI-equivalent validation, run all relevant CI commands.

If additional edits are made after validation, rerun the checks affected by those edits.

---

## 5. Monorepo and type safety

This is a monorepo. Changes to shared types, API contracts, schemas, generated types, shared libraries, serialization formats, configuration, or public interfaces may affect multiple workspaces.

Validate downstream consumers when relevant.

This repository uses type-aware ESLint. Successful TypeScript compilation alone does not guarantee lint success.

Do not fix type, lint, or test failures by weakening safety unless there is a specific justified reason.

Avoid shortcuts such as:

```text
as any
@ts-ignore
broad eslint-disable comments
test.skip
weakened assertions
continue-on-error
disabled validation
```

Prefer correct application-level types, interfaces, mocks, fixtures, and implementation changes.

Be especially careful with inferred external types such as Jest mocks, Prisma-generated types, SDK responses, framework callbacks, and third-party libraries.

---

## 6. Clean-environment awareness

GitHub Actions runs from a clean checkout. Local or Codex environments may contain cached or generated state that CI does not have.

Do not treat existing local state as proof that CI will pass.

Watch for differences involving:

```text
node_modules/
.next/
dist/
build/
coverage/
generated files
local .env files
local credentials
Node.js versions
pnpm versions
Linux vs macOS behavior
case-sensitive paths
```

When claiming CI-equivalent validation, prefer dependency state reproduced from the committed lockfile.

If an applicable CI step requires unavailable secrets, services, credentials, Docker infrastructure, network access, or another GitHub-only resource, do not pretend it passed.

Report it explicitly as not locally verified.

For external integrations:

* never invent credentials;
* never substitute production credentials for sandbox/test credentials;
* never weaken tests because credentials are unavailable.

---

## 7. Git and diff safety

Before completing a coding task, review the final repository state.

Run:

```bash
git status --short
```

or:

```bash
git status -sb
```

For substantial changes, also inspect:

```bash
git diff
git diff --stat
git diff --check
```

Verify that:

* only intended files were changed;
* required implementation files are not left untracked;
* no temporary/debug artifacts remain;
* no secrets or credentials were added;
* dependency manifests or lockfiles were not changed without authorization;
* Prisma migrations were not changed without authorization;
* unrelated user changes were not deleted or overwritten.

Do not automatically discard, reset, or delete unrelated user changes.

Validation results must correspond to the final source state that will be committed or pushed.

---

## 8. CI failure investigation

When actual GitHub CI results are available, they take precedence over assumptions based on local checks.

For a CI failure:

1. Find the first meaningful failing job and step.
2. Read the actual error.
3. Confirm the source revision GitHub tested.
4. Determine whether the cause is code, dependencies, generated files, environment differences, missing files/secrets, external services, or a flaky/pre-existing failure.
5. Fix the root cause.

Do not modify or weaken the CI workflow merely to make a failing code change appear green unless the workflow itself is genuinely incorrect.

---

## 9. Completion reporting

Do not say that CI "should pass" unless the relevant reproducible CI checks actually passed against the final source state.

At completion, report results concisely using this structure when applicable:

```text
Validation passed:
- <commands/checks that actually passed>

Not locally verified:
- <workflow/job/step>
- Reason: <reason>

Manual action required:
- <action, if any>
```

If a clean frozen dependency installation was not reproduced, state that exact dependency-state equivalence with GitHub CI was not verified.

If everything relevant was reproduced successfully, it is acceptable to say:

```text
All locally reproducible GitHub CI checks passed against the final source state using dependencies reproduced from the committed lockfile.
```
