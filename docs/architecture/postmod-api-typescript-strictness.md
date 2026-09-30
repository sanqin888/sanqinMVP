# Post-Modularization API TypeScript Strictness

Date: 2026-09-30  
Baseline: `origin/dev@97277b6e`  
Branch: `postmod/api-no-implicit-any`  
State: **SLICE 1 MERGED / CI #6688 GREEN / SLICE 2 MERGED / CI #6690 GREEN / SLICE 3 LOCAL / REVIEWED / `noImplicitAny=true` / NO GRAPH OR BASELINE CHANGE**

## Scope

This work package applies §7.3 incrementally, one compiler-hardening flag at a time:

- Slice 1: `strictBindCallApply=true` — merged through PR #2629 / CI #6688 / merge `cf39b5ce`.
- Slice 2: `noFallthroughCasesInSwitch=true` — merged through PR #2630 / CI #6690 / merge `97277b6e`.
- Slice 3: `noImplicitAny=true` — current local branch.

Explicitly out of Slice 3 scope:

- cleanup of existing explicit `any`;
- any additional strictness flag;
- repository-wide strictness flag-day work;
- dependency or lockfile changes;
- Prisma/schema/migration changes;
- architecture-boundary, scanner-baseline or SCC changes;
- payment, Clover, Uber provider protocol or Accounting authority changes;
- unrelated large-file refactors.

## Slice 1 closeout

Slice 1 enabled only `strictBindCallApply=true`. Remote CI exposed one now-redundant
`as unknown` assertion at the Uber error-mapper `getResponse.call(error)` boundary and
then one format-only Prettier follow-up. Final CI #6688 passed API/Web lint, build, strict
declaration, tests, Browser E2E, printer-agent and Windows-workstation. Runtime/provider
semantics did not change.

## Slice 2 closeout

Slice 2 enabled only `noFallthroughCasesInSwitch=true`. Its pre-edit inventory reviewed
34 production `switch` statements and found no statement-bearing intentional fallthrough.
PR #2630 required no production source workaround. CI #6690 passed all required jobs,
including the API strict declaration check, and merged as `97277b6e`.

## Slice 3 implementation-time read-only review

The review was repeated from fresh merged `origin/dev@97277b6e` before editing.

- `apps/api/tsconfig.json` now has `strictNullChecks=true`,
  `strictBindCallApply=true`, and `noFallthroughCasesInSwitch=true`; the only remaining
  explicit compiler relaxation in that base config is `noImplicitAny=false`.
- Regex inventory found no ordinary named production function with an untyped standalone
  parameter and no constructor parameter lacking a declared type.
- The sole shorthand-method match is `async enqueue(input)` in
  `integrations/ubereats/test/uber-service-test.helpers.ts`, inside an object explicitly
  typed as `UberWebhookInboxPort`; `input` therefore receives contextual typing.
- Production source contains two explicit `any` sites:
  `Observable<any>` in the request-id interceptor and `any[]` in the Uber image
  validator. These are not implicit-any diagnostics and are intentionally not modified by
  Slice 3.
- There are no production `@ts-ignore` directives. Existing `@ts-expect-error` hits are
  contract-negative tests, not production escape hatches.
- No source workaround is justified by the static inventory. The authoritative answer to
  whether any less-obvious implicit-any diagnostic remains will come from GitHub Actions'
  API strict declaration check after user review and remote authorization.

## Source change

`apps/api/tsconfig.json` changes only:

```text
noImplicitAny: false -> true
```

`strictNullChecks=true`, `strictBindCallApply=true` and
`noFallthroughCasesInSwitch=true` remain unchanged.

## Verification and architecture status

Per `AGENTS.md`, no local lint, build, test or TypeScript CI-reproduction command is run
during this local review phase. The next gate, after explicit user approval, is
feature-branch push -> PR to `dev` -> all required GitHub Actions green -> merge.

This compiler-option hardening changes no module ownership, public contract,
cross-context direction, direct-import debt, architecture allowance, SCC or
`tools/architecture/context-baseline.json` content: **NO GRAPH/BASELINE CHANGE**.

If remote CI exposes true implicit-any diagnostics, fix their application-level types
narrowly on this Slice 3 branch. Do not respond by reintroducing `noImplicitAny=false`,
adding broad `any`, ignore directives or lint suppressions. Explicit-any cleanup remains
a separate follow-up decision.
