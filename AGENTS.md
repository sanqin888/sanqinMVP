# Codex rules for sanqinMVP

## Hard constraints

### Dependency manifests and lockfiles

Do NOT create or modify dependency manifests or lockfiles unless I explicitly ask to add, remove, or update dependencies.

Protected files include:

* `**/package.json`
* `pnpm-lock.yaml`
* `package-lock.json`
* `yarn.lock`

Dependency installation for CI reproduction is allowed only under the rules below.

### Prisma migrations

Do NOT create, modify, delete, or regenerate Prisma migration files or folders unless I explicitly ask for a migration.

Protected path:

```text
apps/api/prisma/migrations/**
```

For ordinary Prisma schema changes, edit `schema.prisma` only.

---

# Dependency management

## Allowed clean dependency installation

Codex MAY run the following command to reproduce the dependency state used by GitHub CI:

```bash
pnpm install --frozen-lockfile --prefer-offline
```

This is allowed because it must use the committed lockfile and must not update it.

Prefer running this command before final CI-equivalent validation when the environment permits it.

Do not rely solely on a previously existing or cached `node_modules` directory when claiming CI-equivalent validation.

## Prohibited dependency commands

Unless I explicitly request a dependency change, do NOT run:

```bash
pnpm install
pnpm add
pnpm remove
pnpm update
npm install
npm uninstall
npm update
yarn
yarn add
yarn remove
yarn upgrade
```

Do not use any dependency command that may rewrite dependency manifests or lockfiles.

## If dependency state is inconsistent

If:

```bash
pnpm install --frozen-lockfile --prefer-offline
```

fails because `package.json` and `pnpm-lock.yaml` are inconsistent:

1. Do NOT regenerate or modify the lockfile.
2. Explain the inconsistency.
3. Identify the dependency change that appears to be required.
4. Provide the exact command I should run or explicitly approve.
5. Continue all work that can safely be completed without changing dependencies.
6. Clearly list the unresolved dependency action in the final response.

## Adding dependencies

If a new dependency appears necessary:

1. Explain why it is required.
2. Do NOT install it automatically.
3. Provide the exact proposed command.

Example:

```bash
pnpm --filter <package> add <dependency>
```

4. Continue implementing any work that does not require the new dependency.
5. Clearly identify the remaining dependency action in the final response.

---

# Prisma rules

## Schema changes

For Prisma model or schema changes:

* Edit `schema.prisma` only.
* Do NOT generate migration files unless explicitly requested.
* Propose an appropriate migration name.
* Provide the exact migration command I should run.

Example:

```bash
pnpm --filter api exec prisma migrate dev --name <migration-name>
```

## Allowed Prisma validation

Codex MAY run non-destructive Prisma commands such as:

```bash
pnpm --filter api prisma:generate
```

or:

```bash
pnpm --filter api exec prisma validate
```

when necessary for build, lint, type checking, tests, or CI reproduction.

## Prohibited Prisma migration commands

Unless I explicitly authorize migration execution, do NOT run:

```bash
prisma migrate dev
prisma migrate deploy
prisma migrate reset
```

or equivalent package commands.

If CI requires a migration that does not exist because migration creation was not authorized:

1. Do NOT create it.
2. Clearly state that CI may fail until the migration exists.
3. Propose a migration name.
4. Provide the exact command I should run.

---

# GitHub CI is the source of truth

GitHub Actions CI is the authoritative validation standard for this repository.

Before completing any coding task, inspect relevant workflow files under:

```text
.github/workflows/**
```

Do NOT assume generic commands such as:

```bash
pnpm lint
pnpm build
pnpm test
```

are sufficient.

Determine what GitHub Actions actually runs for the affected code and reproduce those checks as closely as possible.

---

# CI environment reproduction

Before final CI-equivalent validation, inspect the relevant GitHub workflow and identify:

* runner operating system;
* Node.js version;
* pnpm version;
* dependency installation command;
* Prisma generation steps;
* environment variables;
* required services;
* matrix jobs;
* build commands;
* lint commands;
* TypeScript checks;
* test commands;
* repository-specific validation scripts.

When available, report the current environment versions:

```bash
node --version
pnpm --version
```

Compare them with the versions configured by GitHub Actions.

For this repository, when the relevant workflow uses a clean frozen installation, prefer reproducing it with:

```bash
pnpm install --frozen-lockfile --prefer-offline
```

before running final CI checks.

Running the same CI command against stale dependencies is not equivalent to reproducing GitHub CI.

---

# Required pre-completion validation

Before describing a coding task as complete:

1. Inspect the relevant `.github/workflows/**` files.
2. Identify which jobs and steps can be affected by the changes.
3. Reproduce the relevant CI environment as closely as possible.
4. Run all applicable CI commands that can safely execute in the current environment.

Consider all relevant checks, including:

* dependency installation;
* Prisma Client generation;
* Prisma validation;
* lint;
* formatting validation;
* TypeScript type checking;
* strict TypeScript checks;
* shared-library type checks;
* unit tests;
* integration tests;
* end-to-end tests;
* application builds;
* workspace-specific builds;
* generated-code checks;
* Docker builds;
* repository-specific scripts;
* external integration smoke tests.

Do NOT claim that CI should pass unless all relevant reproducible checks actually passed.

---

# Match CI commands exactly

Prefer the exact command used by GitHub Actions rather than an equivalent or simplified command.

For example, if CI runs:

```bash
pnpm --filter api lint
```

do not treat:

```bash
pnpm lint
```

as an exact substitute.

If CI separately runs:

```bash
pnpm --filter web build
pnpm --filter api build
```

run every affected package's relevant command.

If CI runs:

```bash
pnpm --filter api test
```

do not replace it only with a narrower test selection unless the full CI test command is also run before completion.

If CI runs a repository script such as:

```bash
pnpm ci:check
```

prefer running that exact script rather than manually approximating its contents.

---

# Monorepo validation

This repository contains multiple applications and shared packages.

Do not assume that validating only the directly edited package is sufficient.

When changes affect:

* shared types;
* API contracts;
* schemas;
* generated types;
* shared libraries;
* configuration;
* imports;
* serialization formats;
* public interfaces;

identify all affected workspaces and validate downstream consumers where relevant.

For example, API contract changes may require checking both API and web packages.

---

# Type-aware ESLint rules

This repository uses type-aware ESLint validation.

Pay special attention to rules such as:

```text
@typescript-eslint/no-unsafe-assignment
@typescript-eslint/no-unsafe-member-access
@typescript-eslint/no-unsafe-call
@typescript-eslint/no-unsafe-return
@typescript-eslint/no-unsafe-argument
```

TypeScript compilation succeeding does NOT guarantee type-aware ESLint will succeed.

Be especially careful with values whose inferred types depend on installed type definitions, including:

* Jest mocks;
* `mock.calls`;
* `mock.results`;
* Prisma generated types;
* third-party SDKs;
* framework decorators;
* external callback types.

When inspecting Jest mock calls, prefer explicit stable typing rather than relying on inference that may vary with installed `@types/jest` or Jest versions.

For example, avoid leaving expressions effectively inferred as `any` when accessing:

```ts
mock.calls[0][0]
```

Use an explicit application-level type when necessary.

---

# Clean-environment awareness

GitHub Actions runs from a clean checkout.

Local or Codex environments may contain state that GitHub does not have.

During validation, check for reliance on:

```text
node_modules/
.next/
dist/
build/
coverage/
```

or other generated/cached files.

Also watch for:

* ignored files;
* untracked files;
* stale generated code;
* stale Prisma Client output;
* local `.env` values;
* local credentials;
* locally installed dependency versions;
* macOS vs Linux behavior;
* case-sensitive file paths;
* filesystem differences;
* Node.js version differences;
* pnpm version differences;
* timing-dependent tests;
* concurrency-dependent tests.

Do not use cached local state as proof that GitHub CI will pass.

---

# Git state validation

Before completing any coding task, run:

```bash
git status --short
```

or:

```bash
git status -sb
```

Check for:

* modified files related to the task;
* required files that remain untracked;
* accidentally generated files;
* unexpected package manifest changes;
* unexpected lockfile changes;
* unexpected Prisma migration files;
* debug artifacts;
* files required by the implementation but ignored by Git.

Do not silently leave required implementation files untracked.

Do not automatically delete unrelated user files.

---

# Diff validation

Before completing substantial changes, inspect the final diff.

Use:

```bash
git diff
```

and when useful:

```bash
git diff --stat
```

Verify that:

* only intended files were modified;
* no unrelated changes were introduced;
* no temporary debugging code remains;
* no secrets or credentials were added;
* dependency manifests were not changed without authorization;
* lockfiles were not changed without authorization;
* Prisma migrations were not created or modified without authorization.

Also run:

```bash
git diff --check
```

to detect whitespace errors where applicable.

---

# Git commit and validation consistency

Validation must apply to the same source state that will be committed or pushed.

Before final completion:

1. Run the relevant validation against the final intended code.
2. Inspect the final diff.
3. Inspect Git status.
4. If additional edits are made after validation, rerun affected checks.
5. Do not claim a previous validation result applies to code that changed afterward.

When a commit exists, verify that the intended changes are actually included in the commit.

Do not assume that files visible in the workspace are present in the pushed commit.

---

# CI-specific environment differences

Some GitHub Actions steps may require:

* GitHub Secrets;
* repository variables;
* Docker;
* PostgreSQL;
* Redis;
* external APIs;
* Uber sandbox credentials;
* production credentials;
* network access;
* GitHub-only environment configuration.

If a CI step cannot be reproduced:

1. Do NOT pretend it passed.
2. Do NOT mark it as locally validated.
3. Identify the exact workflow/job/step.
4. Explain why it could not be reproduced.
5. Clearly report the limitation in the final response.

Use a format such as:

```text
Not locally verified:
- <workflow / job / step>
- Reason: requires <secret/service/environment>
```

---

# External integration tests

Tests involving external services may be nondeterministic or unavailable outside GitHub.

For Uber Eats and other external integrations:

* do not invent credentials;
* do not substitute production credentials for sandbox credentials;
* do not weaken tests because credentials are unavailable;
* do not disable CI checks simply to obtain a green result.

If a smoke test is conditionally skipped by GitHub CI, accurately report that it was skipped rather than passed.

---

# CI failure investigation

When GitHub CI output is available, actual GitHub CI results take precedence over assumptions based on local checks.

When investigating a CI failure:

1. Identify the first meaningful failing job and step.
2. Read the actual error output.
3. Inspect the exact source revision tested by GitHub.
4. Determine whether the failure is caused by:

   * the current code change;
   * a dependency/environment mismatch;
   * stale generated files;
   * missing files;
   * missing secrets;
   * external services;
   * Node/pnpm differences;
   * Linux/macOS differences;
   * flaky tests;
   * unrelated pre-existing failures.
5. Fix the root cause.

Do not immediately modify CI itself unless the workflow is actually incorrect.

---

# Do not weaken validation just to make CI green

Do NOT do any of the following solely to make CI pass:

* add `continue-on-error`;
* disable failing tests;
* add `.skip`;
* remove assertions;
* weaken assertions;
* disable TypeScript checks;
* suppress TypeScript errors;
* add broad `any` casts;
* disable ESLint rules;
* add broad ESLint ignore comments;
* weaken coverage thresholds;
* hide failures;
* bypass validation scripts.

If a suppression or CI change is genuinely appropriate, explain why before applying it.

---

# Fix root causes, not symptoms

Prefer:

```text
proper typing
correct dependency state
correct generated types
correct interfaces
correct mocks
correct test fixtures
correct environment reproduction
```

over:

```text
as any
eslint-disable
@ts-ignore
test.skip
continue-on-error
```

Do not introduce unsafe casts merely to satisfy lint unless there is no safer representation and the reason is explicitly justified.

---

# Completion requirements

A task may be described as fully validated only when all relevant reproducible CI checks have passed against the final intended source state.

Before the final response, verify:

* implementation is complete;
* relevant GitHub workflows were inspected;
* dependency state was reproduced from the committed lockfile when possible;
* Node.js version was checked against CI;
* pnpm version was checked against CI;
* relevant Prisma generation/validation passed;
* lint passed;
* build passed;
* TypeScript strict checks passed;
* affected shared packages passed;
* tests passed;
* `git diff --check` passed when applicable;
* `git status` was reviewed;
* final diff was reviewed;
* no unauthorized dependency files changed;
* no unauthorized lockfile changes occurred;
* no unauthorized Prisma migration files changed;
* validation applies to the final code state.

---

# Final response format

At completion, clearly distinguish successful validation, unverified checks, and required manual actions.

Preferred format:

```text
Validation passed:
- pnpm install --frozen-lockfile --prefer-offline
- pnpm --filter api prisma:generate
- pnpm --filter api lint
- pnpm --filter api build
- ...
- git diff --check
- git status --short

Not locally verified:
- <check>
- Reason: <reason>

Manual action required:
- <action>
```

Do not say:

```text
Everything should pass CI.
```

unless the relevant CI-equivalent checks actually passed against the final source state.

Prefer precise wording such as:

```text
All locally reproducible GitHub CI checks passed against a dependency state recreated from the committed lockfile.

The Uber sandbox smoke test was not locally reproduced because it requires GitHub repository secrets.
```

If the dependency installation step could not be reproduced, say:

```text
All runnable CI commands passed in the existing environment, but GitHub's clean frozen dependency installation was not reproduced, so exact dependency-state equivalence was not verified.
```
