# Post-Modularization API TypeScript Strictness

Date: 2026-09-30  
Baseline: `origin/dev@b4829e90`  
Branch: `postmod/api-strict-bind-call-apply`  
State: **SLICE 1 PR #2629 / CI RETRY PENDING / CONFIG + ONE REDUNDANT ASSERTION CLEANUP / NO GRAPH OR BASELINE CHANGE**

## Scope

This work package implements only §7.3 Slice 1: enable API
`strictBindCallApply=true` as the smallest compiler-hardening step.

Explicitly out of scope:

- `noImplicitAny`;
- `noFallthroughCasesInSwitch` or any other strictness flag;
- repository-wide strictness flag-day work;
- dependency or lockfile changes;
- Prisma/schema/migration changes;
- architecture-boundary, scanner-baseline or SCC changes;
- payment, Clover, Uber provider protocol or Accounting authority changes;
- unrelated large-file refactors.

## Implementation-time read-only review

The review was repeated from the fresh `origin/dev@b4829e90` branch before editing.

- Production `apps/api/src` contains no `.bind(...)` call.
- The function-level `.call(...)` boundaries are the explicitly typed
  `getResponse.call(error)` in the Uber error mapper, the guarded
  `toJSON.call(obj)` serialization boundary, plus standard
  `Object.prototype.hasOwnProperty.call(...)` uses.
- Search hits for `.apply(...)` are ordinary repository/use-case/service method
  names rather than `Function.prototype.apply`.
- The first PR CI run showed that stronger call typing makes the existing Uber
  `getResponse.call(error) as unknown` assertion redundant; the slice removes only
  that no-op assertion. No `any`, `@ts-ignore`, ESLint suppression or weakened
  assertion is introduced.

## Source change

`apps/api/tsconfig.json` changes only the compiler flag:

```text
strictBindCallApply: false -> true
```

The first PR CI run then exposed one type-aware lint consequence in the existing
Uber error mapper: `getResponse.call(error)` already has type `unknown`, so the
trailing `as unknown` assertion is redundant and is removed. Runtime behavior and
provider protocol are unchanged.

`strictNullChecks=true`, `noImplicitAny=false` and
`noFallthroughCasesInSwitch=false` remain unchanged. The existing
`apps/api/tsconfig.strict.json` continues to extend the API base config, so the
GitHub Actions API strict declaration check validates this flag on remote CI.

## Verification and architecture status

Per `AGENTS.md`, no local lint, build, test or TypeScript CI-reproduction command
was run before user review. PR #2629 CI #6686 is the authoritative remote gate; its
first attempt exposed the redundant assertion above before the strict TypeScript step,
and a focused follow-up commit is being validated.

This compiler-option hardening changes no module ownership, public contract,
cross-context direction, direct-import debt, architecture allowance, SCC or
`tools/architecture/context-baseline.json` content: **NO GRAPH/BASELINE CHANGE**.

After user approval, the normal delivery gate is feature-branch push -> PR to
`dev` -> required GitHub Actions green -> merge. Only after that should §7.3's
next narrow strictness slice receive a fresh readiness inventory; it is not part of
this implementation.
