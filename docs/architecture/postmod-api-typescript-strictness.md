# Post-Modularization API TypeScript Strictness

Date: 2026-09-30  
Baseline: `origin/dev@31093556`  
Branch: `postmod/api-always-strict`  
State: **SLICE 1 MERGED / CI #6688 GREEN / SLICE 2 MERGED / CI #6690 GREEN / SLICE 3 MERGED / CI #6694 GREEN / SLICE 4 MERGED / CI #6698 GREEN / SLICE 5 MERGED / CI #6701 GREEN / SLICE 6 LOCAL / REVIEWED / `alwaysStrict=true` / CONFIG-ONLY / NO GRAPH OR BASELINE CHANGE**

## Scope

This work package applies §7.3 incrementally, one compiler-hardening flag at a time:

- Slice 1: `strictBindCallApply=true` — merged through PR #2629 / CI #6688 / merge `cf39b5ce`.
- Slice 2: `noFallthroughCasesInSwitch=true` — merged through PR #2630 / CI #6690 / merge `97277b6e`.
- Slice 3: `noImplicitAny=true` — merged through PR #2631 / CI #6694 / merge `8fd2d8bf`; API `@types/ws:^8.18.2` was explicitly authorized to close the third-party `engine.io -> ws` declaration gap.
- Slice 4: `useUnknownInCatchVariables=true` — merged through PR #2632 / CI #6698 / merge `b86e4354`; five unknown stringification boundaries were narrowly fixed after CI #6696.
- Slice 5: `noImplicitThis=true` — merged through PR #2633 / CI #6701 / merge `31093556` without a production source workaround.
- Slice 6: `alwaysStrict=true` — current local branch.

Explicitly out of Slice 6 scope:

- cleanup of existing explicit `any`;
- `strictFunctionTypes`, `strictPropertyInitialization` or `strict:true`;
- repository-wide strictness flag-day work;
- dependency or lockfile changes;
- Prisma/schema/migration changes;
- architecture-boundary, scanner-baseline or SCC changes;
- payment, Clover, Uber provider protocol or Accounting authority changes;
- unrelated exception-handling refactors.

## Slice 1 closeout

Slice 1 enabled only `strictBindCallApply=true`. Remote CI exposed one now-redundant
`as unknown` assertion at the Uber error-mapper `getResponse.call(error)` boundary and
then one format-only Prettier follow-up. Final CI #6688 passed all required jobs.

## Slice 2 closeout

Slice 2 enabled only `noFallthroughCasesInSwitch=true`. Its pre-edit inventory reviewed
34 production `switch` statements and found no statement-bearing intentional fallthrough.
PR #2630 required no production source workaround. CI #6690 passed all required jobs.

## Slice 3 closeout

Slice 3 enabled only `noImplicitAny=true`. Initial CI #6692 exposed a third-party
declaration gap rather than a SanQ source diagnostic:

```text
engine.io -> ws
TS7016: Could not find a declaration file for module 'ws'
```

After explicit dependency authorization, API `@types/ws:^8.18.2` was generated with the
repository pnpm workflow. The reviewed lockfile change contained only the API importer,
package/snapshot records and existing `@types/node` edge. CI #6693 passed before
documentation closeout; final reviewed head then passed CI #6694 and PR #2631 merged as
`8fd2d8bf`. No runtime WebSocket behavior changed.

## Slice 4 implementation-time read-only review

The review was repeated from fresh merged `origin/dev@8fd2d8bf` before editing.

- Production source contains many ordinary `catch (error)`, `catch (cause)` and similar
  bindings, so this flag has a broader textual footprint than Slices 1–3.
- No production `catch (...: any)` was found.
- Existing code already contains explicit `catch (...: unknown)` in Uber persistence,
  Orders, SendGrid, Twilio, Clover and Uber Direct paths, providing repository-native
  precedent for unknown-safe catch handling.
- Representative catch-variable property access is already narrowed by patterns such as:
  `error instanceof Error`, domain-specific error guards, `'code' in error`, or helpers
  that accept `unknown`.
- Representative integration/provider logging uses
  `error instanceof Error ? error.message/name : String(error)` rather than assuming an
  Error object.
- No evidence was found that enabling this flag requires an architecture boundary,
  provider protocol, payment behavior or Accounting authority change.
- Static search cannot prove every catch body is compatible. GitHub Actions' API strict
  declaration check remains the authoritative detector for any hidden direct property
  access or unsafe assignment.

## Source change

`apps/api/tsconfig.json` changes only:

```text
useUnknownInCatchVariables: <implicit false> -> true
```

The existing settings remain:

```text
strictNullChecks: true
noImplicitAny: true
strictBindCallApply: true
noFallthroughCasesInSwitch: true
```

Initial remote CI #6696 reached type-aware API lint before strict declaration and exposed five direct template-string uses of caught values now typed as `unknown`:

- Admin Business Uber store-status warning: 1;
- Catalog/Uber availability warning/result message: 2;
- Orders geocoding error log: 1;
- POS Store Status Uber sync warning: 1.

The narrow fix uses existing repository-safe patterns: `String(error)` for non-`Error` fallback and `error instanceof Error ? error.message : String(error)` where a readable message is desired. No catch control flow, return value, retry behavior, provider protocol or business semantics change. CI #6697 passed all required jobs, including API lint, API strict declaration, API/Web tests, Browser E2E, printer-agent and Windows-workstation; the final documentation head passed CI #6698 and PR #2632 merged as `b86e4354`.

## Slice 5 implementation-time read-only review

The review was repeated from fresh merged `origin/dev@b86e4354` before editing.

- No ordinary production `function (...) { ... }` or named function body was found relying on implicit `this`.
- No `.bind(this)`, `.call(this)` or `.apply(this)` usage was found in production source.
- The only explicit `this:` annotation found is the Uber error mapper's `(this: unknown) => unknown`, which is already deliberately typed for `getResponse.call(error)`.
- Class methods and arrow functions use lexical/class `this` and are not evidence of an implicit-`this` gap.
- No architecture boundary, provider protocol, payment behavior or Accounting authority change is indicated by the inventory.

## Slice 5 source change

`apps/api/tsconfig.json` changes only:

```text
noImplicitThis: <implicit false> -> true
```

The existing settings remain:

```text
strictNullChecks: true
noImplicitAny: true
strictBindCallApply: true
useUnknownInCatchVariables: true
noFallthroughCasesInSwitch: true
```

No production TypeScript source workaround was required. CI #6700 passed all required jobs, including API lint, API strict declaration, API/Web tests, Browser E2E, printer-agent and Windows-workstation; the final documentation head passed CI #6701 and PR #2633 merged as `31093556`.

## Slice 6 implementation-time read-only review

The review was repeated from fresh merged `origin/dev@31093556` before editing.

- API compilation uses `module:nodenext` and `target:ES2023`; runtime source is already module-oriented.
- No `with (...)` statement or other obvious sloppy-mode dependency was found in production source.
- `apps/api/src/types/optional-modules.d.ts` contains ambient `declare module` stubs only and emits no runtime JavaScript.
- No package-level module-mode change, dependency change, provider protocol change, payment behavior change or Accounting authority change is required.
- Static review therefore supports a config-only slice, with GitHub Actions remaining authoritative for emitted-code/build compatibility.

## Slice 6 source change

`apps/api/tsconfig.json` changes only:

```text
alwaysStrict: <implicit false> -> true
```

The existing settings remain:

```text
strictNullChecks: true
noImplicitAny: true
strictBindCallApply: true
useUnknownInCatchVariables: true
noImplicitThis: true
noFallthroughCasesInSwitch: true
```

No production TypeScript source workaround is included in the local review state.

## Verification and architecture status

Per `AGENTS.md`, no local lint, build, test or TypeScript CI-reproduction command is run
during this local review phase. After user approval, GitHub Actions is the authoritative
validation gate. If CI exposes a true implicit-`this` diagnostic, fix only the narrow
root typing issue; do not add `any`, `@ts-ignore`, broad assertions, lint suppression,
or disable the flag.

This compiler-option hardening changes no module ownership, public contract,
cross-context direction, direct-import debt, architecture allowance, SCC or
`tools/architecture/context-baseline.json` content: **NO GRAPH/BASELINE CHANGE**.
