# Post-Modularization API TypeScript Strictness

Date: 2026-09-30  
Baseline: `origin/dev@cf39b5ce`  
Branch: `postmod/api-no-fallthrough-cases`  
State: **SLICE 1 MERGED / CI #6688 GREEN / SLICE 2 LOCAL / REVIEWED / `noFallthroughCasesInSwitch=true` / NO GRAPH OR BASELINE CHANGE**

## Scope

This work package now contains two deliberately narrow §7.3 compiler-hardening slices:

- Slice 1: `strictBindCallApply=true` — merged through PR #2629 / CI #6688 / merge `cf39b5ce`.
- Slice 2: `noFallthroughCasesInSwitch=true` — current branch.

Explicitly out of Slice 2 scope:

- `noImplicitAny`;
- any other strictness flag;
- repository-wide strictness flag-day work;
- dependency or lockfile changes;
- Prisma/schema/migration changes;
- architecture-boundary, scanner-baseline or SCC changes;
- payment, Clover, Uber provider protocol or Accounting authority changes;
- unrelated large-file refactors.

## Slice 1 closeout

Slice 1 enabled only `strictBindCallApply=true`. The first remote CI attempt exposed that
`getResponse.call(error) as unknown` in the Uber error mapper had become a redundant
assertion under stronger call typing; that no-op assertion was removed. A second attempt
caught only Prettier layout. Final CI #6688 passed API/Web lint, build, strict declaration,
tests, Browser E2E, printer-agent and Windows-workstation. Runtime/provider semantics did
not change.

## Slice 2 implementation-time read-only review

The review was repeated from fresh merged `origin/dev@cf39b5ce` before editing.

- `apps/api/src` contains 34 production `switch` statements.
- Search found no `fallthrough`, `fall through` or `falls through` marker comments.
- Switches that mutate local state use explicit `break` statements.
- Switches that map values use `return` or `throw`.
- Grouped empty labels, for example provider settlement `PROMOTION` followed by
  `SUBSIDY`, intentionally share one result and are valid under
  `noFallthroughCasesInSwitch`.
- The Uber webhook dispatcher, promotion engine/rule adapter, Accounting balance movement
  and provider settlement policies were inspected as representative non-trivial cases.
- No statement-bearing intentional fallthrough was found, so the static review requires
  no production source workaround.

## Source change

`apps/api/tsconfig.json` changes only:

```text
noFallthroughCasesInSwitch: false -> true
```

`strictNullChecks=true`, `strictBindCallApply=true` and `noImplicitAny=false` remain
unchanged. The existing `apps/api/tsconfig.strict.json` extends the API base config, so
GitHub Actions' API strict declaration check is the authoritative validation gate.

## Verification and architecture status

Per `AGENTS.md`, no local lint, build, test or TypeScript CI-reproduction command is run
for this default workspace phase. The user has already authorized remote delivery, so the
normal gate is feature-branch push -> PR to `dev` -> all required GitHub Actions green ->
merge.

This compiler-option hardening changes no module ownership, public contract,
cross-context direction, direct-import debt, architecture allowance, SCC or
`tools/architecture/context-baseline.json` content: **NO GRAPH/BASELINE CHANGE**.

Only after Slice 2 merges should §7.3's next narrow strictness item receive a fresh
readiness inventory; `noImplicitAny` must not be bundled into this slice.
