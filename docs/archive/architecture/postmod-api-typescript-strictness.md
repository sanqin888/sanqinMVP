# Post-Modularization API TypeScript Strictness

Date: 2026-10-01  
Baseline: `origin/dev@63e32160`  
Branch: `merged`  
State: **CLOSED / SLICE 1-10 MERGED / FINAL PR #2638 / FINAL CI #6718 GREEN / FINAL MERGE `63e32160` / API FULL STRICT / CURRENT-SEMANTICS UMBRELLA CLOSURE / NO GRAPH OR BASELINE CHANGE**

## Scope

This work package applies §7.3 incrementally, one compiler-hardening flag at a time:

- Slice 1: `strictBindCallApply=true` — merged through PR #2629 / CI #6688 / merge `cf39b5ce`.
- Slice 2: `noFallthroughCasesInSwitch=true` — merged through PR #2630 / CI #6690 / merge `97277b6e`.
- Slice 3: `noImplicitAny=true` — merged through PR #2631 / CI #6694 / merge `8fd2d8bf`; API `@types/ws:^8.18.2` was explicitly authorized to close the third-party `engine.io -> ws` declaration gap.
- Slice 4: `useUnknownInCatchVariables=true` — merged through PR #2632 / CI #6698 / merge `b86e4354`; five unknown stringification boundaries were narrowly fixed after CI #6696.
- Slice 5: `noImplicitThis=true` — merged through PR #2633 / CI #6701 / merge `31093556` without a production source workaround.
- Slice 6: `alwaysStrict=true` — merged through PR #2634 / CI #6704 / merge `3aa51dd0` without a production source workaround.
- Slice 7: `strictBuiltinIteratorReturn=true` — merged through PR #2635 / CI #6707 / merge `e4b01345` without a production source workaround.
- Slice 8: `strictPropertyInitialization=true` — merged through PR #2636 / CI #6712 / merge `fe08093a` with four narrow definite-assignment fixes and one scanner syntax-compatibility correction.
- Slice 9: `strictFunctionTypes=true` — merged through PR #2637 / CI #6715 / merge `b93f2ffd` without a production source workaround.
- Slice 10: `strict=true` — merged through PR #2638 / final CI #6718 / merge `63e32160` without a production source workaround; this closes §7.3.

Explicitly out of Slice 10 scope:

- cleanup of existing explicit `any`;
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

No production TypeScript source workaround was required. CI #6703 passed all required jobs, including API lint, API strict declaration, API/Web tests, Browser E2E, printer-agent and Windows-workstation; the final documentation head passed CI #6704 and PR #2634 merged as `3aa51dd0`.

## Slice 7 implementation-time read-only review

The review was repeated from fresh merged `origin/dev@3aa51dd0` before editing.

- No production `.next()` calls were found.
- No `.values().next()`, `.keys().next()` or `.entries().next()` chains were found.
- No `Symbol.iterator`, `IteratorResult`, `IterableIterator` or explicit `Iterator<...>` usage was found.
- Static review therefore found no application-level consumer depending on the historical broad builtin iterator return type.
- No dependency, provider protocol, payment behavior, Accounting authority or architecture change is required.

## Slice 7 source change

`apps/api/tsconfig.json` changes only:

```text
strictBuiltinIteratorReturn: <implicit false> -> true
```

The existing settings remain:

```text
strictNullChecks: true
noImplicitAny: true
strictBindCallApply: true
useUnknownInCatchVariables: true
noImplicitThis: true
alwaysStrict: true
noFallthroughCasesInSwitch: true
```

No production TypeScript source workaround was required. CI #6706 passed all required jobs, including API lint, API strict declaration, API/Web tests, Browser E2E, printer-agent and Windows-workstation; the final documentation head passed CI #6707 and PR #2635 merged as `e4b01345`.

## Slice 8 implementation-time read-only review

The review was repeated from fresh merged `origin/dev@e4b01345` before editing.

- Production class fields without declaration initializers were inventoried, with representative candidates reviewed in Uber order admission, API config, crypto config/credential vault, webhook verifier/persistence, Messaging template rendering, Uber Direct, and Clover credential vault.
- The reviewed matched fields are assigned on constructor paths; no field was found intentionally left uninitialized for later mutation as part of its public/runtime contract.
- DTO and response classes already follow the repository pattern of definite-assignment `!` for framework-populated required fields and `?` for optional fields.
- Constructor parameter properties and declaration initializers already satisfy the flag by construction.
- No dependency, provider protocol, payment behavior, Accounting authority, public contract, or architecture boundary change is required.

## Slice 8 source change

`apps/api/tsconfig.json` changes only:

```text
strictPropertyInitialization: <implicit false> -> true
```

The existing settings remain:

```text
strictNullChecks: true
noImplicitAny: true
strictBindCallApply: true
useUnknownInCatchVariables: true
noImplicitThis: true
alwaysStrict: true
strictBuiltinIteratorReturn: true
noFallthroughCasesInSwitch: true
```

Initial CI #6709 reached API build and exposed four TS2564 framework-populated declaration gaps: `CreatePosDeviceDto.name`, `CreatePosDeviceDto.storeStableId`, `UpdatePosDeviceStatusDto.status`, and Nest-injected `PosGateway.server`. The narrow fix adds definite-assignment `!` only to these four fields, matching existing repository DTO/response conventions. No constructor logic, runtime validation, WebSocket injection behavior, provider/payment/Accounting semantics, dependency, Prisma, or architecture boundary changes are introduced. Follow-up CI #6710 then failed at the architecture gate because the closed `pos-device.admin-db-id.v1` source guard required literal `storeStableId: string`. The scanner check is corrected to accept both `storeStableId: string` and `storeStableId!: string` while still rejecting `storeId` and `IsUUID`; the stable-business-ID rule and architecture baseline are unchanged.

## Verification and architecture status

CI #6709 exposed exactly four framework-populated declaration gaps; the narrow `!` annotations above address those sites only. CI #6710 exposed only the scanner's literal-source matching gap, corrected without relaxing the stable-ID rule. CI #6711 then passed the corrected architecture gate and all required jobs, including API build, API strict declaration, API tests and Browser E2E. The final documentation head passed CI #6712 and PR #2636 merged as `fe08093a`. No broader assertion surface, `any`, `@ts-ignore`, lint suppression, flag weakening, or architecture baseline update was required.

## Slice 9 implementation-time read-only review

The review was repeated from fresh merged `origin/dev@fe08093a` before editing.

- `strictFunctionTypes` risk is concentrated in function-valued properties/callbacks; method-style interface members such as Uber transaction/unit-of-work methods are not treated as equivalent variance evidence.
- Representative third-party callback surfaces reviewed include Express static `setHeaders`, Node/PDF/child-process stream listeners, Accounting OCR/PDF runner functions, provider SDK wrapper functions, Prisma/transaction callbacks and Nest `useFactory` providers.
- `apps/api/src/main.ts` currently annotates `express.static(...).setHeaders` as `(res: express.Response) => ...`; because the third-party callback contract may be broader than Express `Response`, this is a plausible narrow-parameter incompatibility under contravariant checking.
- Node/PDF/child-process stream listeners also contain explicit `Buffer` / `Error` parameter annotations and remain part of the remote compiler verification surface.
- Accounting runner aliases inspected so far use matching `Buffer` inputs and do not show an obvious local variance mismatch.
- SendGrid/Twilio wrappers are explicit SDK adapter/assertion boundaries; no dependency or protocol change is indicated by the flag.
- No evidence requires changing module ownership, provider/payment behavior, Accounting authority or a public contract.

## Slice 9 source change

`apps/api/tsconfig.json` changes only:

```text
strictFunctionTypes: <implicit false> -> true
```

The existing settings remain:

```text
strictNullChecks: true
noImplicitAny: true
strictBindCallApply: true
useUnknownInCatchVariables: true
noImplicitThis: true
alwaysStrict: true
strictBuiltinIteratorReturn: true
strictPropertyInitialization: true
noFallthroughCasesInSwitch: true
```

No production TypeScript source workaround was required. CI #6714 passed all required jobs, including the architecture gate, API build, API strict declaration, API/Web tests, Browser E2E, printer-agent and Windows-workstation. The reviewed Express `setHeaders`, stream-listener, Accounting runner, provider-wrapper, transaction-callback and Nest-factory surfaces required no compatibility edit.

## Slice 9 verification and architecture status

CI #6714 passed all required jobs with `strictFunctionTypes=true`, and the final documentation head passed CI #6715 before PR #2637 merged as `b93f2ffd`. No source workaround or architecture change was required.

## Slice 10 implementation-time read-only review

The review was repeated from fresh merged `origin/dev@b93f2ffd` before editing.

- The API currently uses TypeScript 5.9.3.
- `apps/api/tsconfig.json` already explicitly enables every current strict-family constituent audited through Slices 1–9: `strictNullChecks`, `noImplicitAny`, `strictBindCallApply`, `useUnknownInCatchVariables`, `noImplicitThis`, `alwaysStrict`, `strictBuiltinIteratorReturn`, `strictPropertyInitialization`, and `strictFunctionTypes`.
- `apps/api/tsconfig.strict.json` extends the base configuration and does not override or disable `strict` behavior.
- Slice 10 therefore adds the umbrella declaration without removing the explicit flags, preserving both the historical audit trail and the visible current strict surface.
- Under TypeScript 5.9.3 this is intended to be a current-semantics closure. The meaningful future delta is versioned: a later TypeScript release may add new checks to the `strict` umbrella, and any resulting diagnostics must be handled as part of that upgrade rather than suppressed.
- No dependency, Prisma/schema/migration, provider/payment/Accounting semantic, runtime, public-contract or architecture-boundary change is required.

## Slice 10 source change

`apps/api/tsconfig.json` adds only:

```text
strict: true
```

The individually audited strict-family flags remain explicit and unchanged.

No production TypeScript source workaround was required. CI #6717 passed all required jobs, including the architecture gate, API build, API strict declaration, API/Web tests, Browser E2E, printer-agent and Windows-workstation with `strict=true`.

## Slice 10 verification and architecture status

CI #6717 passed the architecture gate, API/Web lint/build/strict/tests, Browser E2E, printer-agent and Windows-workstation with `strict=true`. The final documentation head then passed CI #6718, and PR #2638 squash-merged to `dev` as `63e32160`. No production source workaround, dependency/lockfile, Prisma/schema/migration, provider/payment/Accounting semantic, public-contract, context-direction, scanner allowance, SCC, graph or architecture-baseline change was required.

## Final closure

§7.3 is **CLOSED**. The API is full strict under TypeScript 5.9.3, and every current strict-family constituent remains explicitly enabled alongside `strict=true` as audit evidence. No further source slice is planned for this work package. Future TypeScript upgrades may add new checks under the `strict` umbrella; any resulting diagnostics are upgrade-time compatibility work and must not be treated as reopening §7.3.

This umbrella closure changes no module ownership, public contract, cross-context direction, direct-import debt, architecture allowance, SCC or `tools/architecture/context-baseline.json` content: **NO GRAPH/BASELINE CHANGE**.
