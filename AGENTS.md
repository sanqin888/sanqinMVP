# Codex rules for sanqinMVP

## Hard constraints

* Do NOT create or modify any dependency manifest or lockfile:

  * `**/package.json`
  * `pnpm-lock.yaml`
  * `package-lock.json`
  * `yarn.lock`

  Unless I explicitly ask to add/remove dependencies.

* Do NOT create or modify Prisma migration files/folders:

  * `apps/api/prisma/migrations/**`

  Unless I explicitly ask to create a migration.

---

## Command restrictions

To avoid generating unintended files or changing dependency state:

* Never run:

  * `pnpm install`
  * `pnpm add`
  * `npm install`
  * `yarn add`

* Never run:

  * `prisma migrate dev`
  * `prisma migrate deploy`
  * `prisma migrate reset`

* Do not run commands that modify lockfiles, dependency manifests, or Prisma migration files unless I explicitly authorize them.

* If you believe a dependency or migration is required:

  1. Explain why it is required.
  2. Provide the exact command(s) I should run locally.
  3. Do NOT generate or modify the dependency/migration files yourself.
  4. Continue with all other work that can safely be completed without that dependency or migration.
  5. Clearly list the remaining manual action in the final response.

---

## Preferred behavior

### Prisma

* For Prisma model/schema changes:

  * Edit `schema.prisma` only.
  * Do NOT create migration files unless explicitly requested.
  * Propose an appropriate migration name.
  * Provide the exact migration command I should run locally.

Example:

```bash
pnpm --filter api exec prisma migrate dev --name <migration-name>
```

* `prisma generate` may be run when necessary for validation, provided it does not modify dependency manifests, lockfiles, or migration files.

### Dependencies

* If a new dependency is required:

  * Do NOT install it.
  * Explain why it is required.
  * Propose the exact command.

Example:

```bash
pnpm --filter <package> add <dependency>
```

* Continue implementing any parts that do not require the dependency when possible.

---

# CI validation requirements

## GitHub CI is the source of truth

GitHub Actions CI is the authoritative validation standard for this repository.

Before completing any coding task, inspect the relevant workflow files under:

```text
.github/workflows/**
```

Do NOT assume that running generic commands such as:

```bash
pnpm lint
pnpm build
pnpm test
```

is sufficient.

Instead, determine what GitHub Actions actually runs for the affected code and reproduce those checks as closely as possible.

---

## Required pre-completion validation

Before reporting a coding task as complete:

1. Inspect the relevant `.github/workflows/**` files.

2. Identify which CI jobs and steps can be affected by the changes.

3. Run the same validation commands used by those CI jobs whenever they can be safely executed in the current environment.

4. At minimum, consider all applicable checks including:

   * lint
   * formatting checks
   * TypeScript type checking
   * unit tests
   * integration tests
   * end-to-end tests
   * Prisma validation
   * Prisma client generation
   * application builds
   * workspace/package-specific builds
   * Docker builds
   * repository-specific validation scripts
   * generated-code validation
   * CI-specific scripts

5. Do NOT claim that CI should pass unless all relevant reproducible CI checks have actually been run successfully.

---

## Match CI commands exactly

When practical, prefer the exact command used by GitHub Actions instead of an equivalent or simplified command.

For example, if CI runs:

```bash
pnpm --filter api test
```

do not substitute it only with:

```bash
pnpm test
```

If CI separately runs:

```bash
pnpm --filter web build
pnpm --filter api build
```

both affected packages must be validated when relevant.

If CI runs a repository script such as:

```bash
pnpm ci:check
```

prefer running that exact script rather than manually approximating its contents.

---

## Monorepo validation

This repository contains multiple applications/packages.

Do not assume that validating only the directly edited package is sufficient.

When a change may affect shared code, APIs, generated types, schemas, contracts, configuration, or cross-package imports:

* identify all affected workspaces;
* run the relevant checks for each affected workspace;
* validate downstream consumers when reasonably necessary.

For example, an API contract or shared type change may require validation of both the API and web applications.

---

## Clean-environment awareness

Remember that GitHub Actions runs from a clean checkout and may expose problems that do not appear in an existing development environment.

During validation, pay special attention to:

* files that exist locally but are not tracked by Git;
* generated files;
* ignored files;
* stale build output;
* cached artifacts;
* locally available environment variables;
* locally installed dependencies;
* case-sensitive import paths;
* Linux vs macOS behavior;
* Node.js or pnpm version differences.

Do not rely on existing:

```text
node_modules/
.next/
dist/
build/
coverage/
```

or other generated/cached files as evidence that CI will pass.

---

## Git tracking validation

Before completing the task, always inspect Git state.

Run:

```bash
git status --short
```

or:

```bash
git status -sb
```

Check for:

* modified files related to the task;
* untracked files required by the implementation;
* accidentally generated files;
* unexpected dependency or lockfile changes;
* unexpected Prisma migration files;
* files required by the implementation that are ignored or missing from Git.

Do not silently leave required implementation files untracked.

Do not automatically delete unrelated user files.

---

## Diff validation

Before completing substantial changes, inspect the final diff.

Use an appropriate command such as:

```bash
git diff
```

and, when useful:

```bash
git diff --stat
```

Verify that:

* only intended files were modified;
* no unrelated changes were introduced;
* no debug code was accidentally left behind;
* no secrets or credentials were added;
* dependency manifests and lockfiles were not modified without authorization;
* Prisma migration files were not created or modified without authorization.

---

## Prisma CI validation

When `schema.prisma` or Prisma-related application code is changed, run applicable non-destructive checks such as:

```bash
prisma validate
```

and, when required:

```bash
prisma generate
```

or the equivalent repository/package command.

Do NOT run migration commands prohibited by this file.

If CI requires a migration that does not yet exist because migration creation was not authorized:

* do not create it;
* clearly state that CI may fail until the migration is generated;
* provide the exact migration command I should run.

---

## CI steps requiring unavailable services or secrets

Some GitHub Actions checks may require:

* GitHub secrets;
* production credentials;
* third-party API credentials;
* databases;
* Redis;
* external services;
* Docker services;
* network access;
* GitHub-only environment configuration.

If a CI step cannot be reproduced in the current environment:

1. Do NOT pretend that it was validated.
2. Do NOT mark it as passed.
3. Identify the exact CI job/step that could not be run.
4. Explain briefly why it could not be reproduced.
5. Report this limitation in the final response.

Use wording such as:

```text
Not locally verified:
- <workflow / job / step>
- Reason: requires <secret/service/environment>
```

---

## CI failure investigation

If GitHub CI output is provided, treat the actual CI failure as higher-confidence evidence than assumptions based on local checks.

When investigating a CI failure:

1. Identify the first meaningful failing step.
2. Read the actual error output.
3. Determine whether the failure is caused by:

   * the current code change;
   * environment differences;
   * missing generated files;
   * missing secrets/services;
   * dependency/version differences;
   * unrelated pre-existing failures.
4. Fix the root cause rather than disabling, bypassing, or weakening the check.

Do NOT modify CI merely to make a failing check green unless the workflow itself is actually incorrect.

Do NOT:

* add `continue-on-error`;
* suppress TypeScript errors;
* disable lint rules;
* skip tests;
* remove failing assertions;
* weaken coverage requirements;

solely to make CI pass unless explicitly instructed.

---

# Completion requirements

A coding task should only be described as fully validated when all relevant reproducible checks have passed.

Before the final response, verify:

* implementation is complete;
* relevant GitHub workflow files were inspected;
* relevant CI commands were run;
* tests passed where applicable;
* lint passed where applicable;
* type checking passed where applicable;
* builds passed where applicable;
* Prisma checks passed where applicable;
* `git status` was reviewed;
* final diff was reviewed for substantial changes;
* no unauthorized dependency files changed;
* no unauthorized migration files changed.

If any relevant validation could not be performed, clearly distinguish:

```text
Passed:
- ...

Not locally verified:
- ...

Manual action required:
- ...
```

Do not say:

```text
Everything should pass CI.
```

unless the relevant CI-equivalent checks were actually completed successfully.

Prefer precise statements such as:

```text
Local CI-equivalent checks passed for the affected API and web packages.
The GitHub-only integration job was not reproduced because it requires repository secrets.
```
