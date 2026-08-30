# Architecture scanner

Run from the repository root:

```bash
node tools/architecture/scan-architecture.mjs --check
node tools/architecture/scan-architecture.mjs --report
```

`--check` enforces:

- exactly 12 registered contexts;
- no unclassified production source roots;
- no new direct cross-context dependency pair;
- no increase in a recorded direct-import allowance;
- unique, complete compatibility entries;
- no unregistered `@compat <compat_id>` annotation.

Imports through `public-api`, `contracts`, `ports`, and registered public
shared-package aliases are reported but do not consume legacy debt allowances.
When a PR removes direct imports, lower the matching value in
`context-baseline.json` in the same PR. Never raise a limit merely to make CI
green; either use a public contract/port or update the architecture decision and
compatibility plan explicitly.
