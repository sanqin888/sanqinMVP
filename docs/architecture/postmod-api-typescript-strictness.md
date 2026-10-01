# Post-Modularization API TypeScript Strictness

Date: 2026-09-30  
Baseline: `origin/dev@97277b6e`  
Branch: `postmod/api-no-implicit-any`  
State: **SLICE 1 MERGED / CI #6688 GREEN / SLICE 2 MERGED / CI #6690 GREEN / SLICE 3 PR #2631 / CI #6693 GREEN / `noImplicitAny=true` / `@types/ws` TYPE-DECLARATION DEVDEPENDENCY / NO GRAPH OR BASELINE CHANGE**

## Scope

This work package applies §7.3 incrementally, one compiler-hardening flag at a time:

- Slice 1: `strictBindCallApply=true` — merged through PR #2629 / CI #6688 / merge `cf39b5ce`.
- Slice 2: `noFallthroughCasesInSwitch=true` — merged through PR #2630 / CI #6690 / merge `97277b6e`.
- Slice 3: `noImplicitAny=true` — current PR #2631.

Explicitly out of Slice 3 scope:

- cleanup of existing explicit `any`;
- any additional strictness flag;
- repository-wide strictness flag-day work;
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

- `apps/api/tsconfig.json` had `strictNullChecks=true`,
  `strictBindCallApply=true`, and `noFallthroughCasesInSwitch=true`; the only remaining
  explicit compiler relaxation in that base config was `noImplicitAny=false`.
- Regex inventory found no ordinary named production function with an untyped standalone
  parameter and no constructor parameter lacking a declared type.
- The sole shorthand-method match was `async enqueue(input)` in
  `integrations/ubereats/test/uber-service-test.helpers.ts`, inside an object explicitly
  typed as `UberWebhookInboxPort`; `input` therefore receives contextual typing.
- Production source contains two explicit `any` sites:
  `Observable<any>` in the request-id interceptor and `any[]` in the Uber image
  validator. These are not implicit-any diagnostics and are intentionally not modified by
  Slice 3.
- There are no production `@ts-ignore` directives. Existing `@ts-expect-error` hits are
  contract-negative tests, not production escape hatches.

## Source and dependency change

`apps/api/tsconfig.json` changes:

```text
noImplicitAny: false -> true
```

Initial remote CI #6692 then exposed a third-party declaration gap rather than a SanQ
source diagnostic:

```text
engine.io -> ws
TS7016: Could not find a declaration file for module 'ws'
```

After explicit dependency authorization, the API adds:

```text
devDependency: @types/ws ^8.18.2
```

The dependency was generated on the user's development Mac with the repository's pnpm
workflow and pushed back to the same Slice 3 branch. Review of commit `650363d9` confirms
the manifest adds only `@types/ws`; the pnpm lockfile adds only the corresponding
API importer entry, package entry and snapshot, plus its dependency on the already-present
`@types/node@22.19.3`. There is no unrelated version drift or transitive churn.

`strictNullChecks=true`, `strictBindCallApply=true` and
`noFallthroughCasesInSwitch=true` remain unchanged.

## Verification and architecture status

CI #6693 passed all required jobs on head `650363d9`:

- API/Web lint and build;
- API strict declaration with `noImplicitAny=true`;
- shared strict declaration;
- API/Web tests;
- Browser E2E;
- printer-agent;
- Windows-workstation.

The first failed run #6692 is retained as evidence that the type declaration dependency
was required; the fix did not weaken the compiler or add a source-level escape hatch.

This compiler-option hardening changes no module ownership, public contract,
cross-context direction, direct-import debt, architecture allowance, SCC or
`tools/architecture/context-baseline.json` content: **NO GRAPH/BASELINE CHANGE**.

Explicit-any cleanup remains a separate follow-up decision and should not be silently
combined with this compiler-flag slice.
