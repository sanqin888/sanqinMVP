# Post-Modularization Uber Financial Report Registry — State-Driven Reconciliation Contraction

Date: 2026-09-30  
Base: `origin/dev@a90e6191`  
Branch: `fix/uber-financial-state-driven-reconciliation`  
Status: **SOURCE IMPLEMENTED / LOCAL REVIEW PENDING / NO MIGRATION / NO NEW DEPENDENCY / NO GRAPH OR BASELINE CHANGE**  
Program status: repository-wide modularization and Phase 9 remain **CLOSED**. This is a post-modularization Accounting / External Channels reliability contraction.

## 1. Goal

Contract Uber financial-report reconciliation from a bounded global registry scan into state-driven work:

```text
list unresolved READY reports
  -> exact owner-side reconciliation-candidate lookup
  -> materialize READY artifacts
  -> reconcile Payment Details + Finance/Payout Summary
  -> mark only remaining READY members IMPORTED
```

The change must remove Accounting's dependency on a global `IMPORTED limit=200` scan without introducing a cursor, a new state machine, direct Uber persistence reads, provider Store UUID leakage, or any new financial authority.

## 2. Prior behavior and failure mode

Before this work, `AccountingProviderFinancialHistoryService.syncReadyUberReports()` loaded:

- latest `READY` reports, `limit=200`;
- latest `IMPORTED` reports, `limit=200`;
- combined both sets in Accounting;
- grouped them by `startDate|endDate`;
- required exactly one `PAYMENT_DETAILS_REPORT` and one `FINANCE_SUMMARY_REPORT`.

The Uber repository `list()` orders by `requestedAt DESC`. Therefore the imported set was only the latest 200 terminal reports. Once imported history exceeds that window, an older imported partner can disappear from Accounting's pairing pool while its counterpart remains READY. The resulting behavior is fail-closed/deferred rather than duplicate Journal posting, but the READY report can remain deferred indefinitely.

The old Accounting grouping key also contained only the requested period. Provider Store identity was intentionally removed from the cross-context contract in Phase 9 Slice 6A, so restoring `storeUuids` to Accounting would be an architecture regression.

## 3. Ownership-preserving design

### External Channels / Uber owner

`UberEatsReportingPort` gains one additive narrow capability:

`findFinancialReportReconciliationCandidates({ anchorReportStableId })`.

The public request contains only the stable report identity. The public result reuses the existing financial-report view and does **not** expose `storeUuids` or raw provider metadata.

Inside External Channels:

1. resolve the anchor report by `reportStableId`;
2. require the anchor to be `PAYMENT_DETAILS_REPORT` or `FINANCE_SUMMARY_REPORT` and status `READY | IMPORTED`;
3. read the owner-private normalized `storeUuids + startDate + endDate`;
4. query candidates with exact:
   - `storeUuids equals anchor.storeUuids`;
   - `startDate = anchor.startDate`;
   - `endDate = anchor.endDate`;
   - report type in Payment Details / Finance Summary;
   - status in `READY | IMPORTED`;
5. return all candidates without a `take`/history-window limit.

The existing `findExisting(reportType + storeUuids + startDate + endDate)` remains request-idempotency behavior and is not repurposed as a reconciliation selector.

### Accounting owner

Accounting continues to enumerate at most 200 unresolved READY reports as work seeds. For each eligible seed it:

1. preserves the existing 2026-06-01/accountingStartDate floor and `ORDERS_AND_ITEMS_REPORT` exclusion;
2. materializes the READY seed through the existing stable transport identity;
3. requests exact reconciliation candidates through `UberEatsReportingPort`;
4. requires exactly one Payment Details and one Finance Summary candidate;
5. materializes any READY partner not already processed in the run;
6. treats an IMPORTED partner as terminal materialized evidence and never re-downloads/re-materializes it;
7. runs the existing U-FR1C payout-reference/report-total reconciliation;
8. marks only members whose returned state is still READY as IMPORTED.

Candidate groups are de-duplicated by their stable report IDs inside one sync run so a READY+READY pair is reconciled once even though both reports may appear as READY seeds.

## 4. Duplicate and retry semantics

There is intentionally no new database uniqueness assumption for:

`storeUuids + startDate + endDate + reportType`.

Current persistence only makes `reportStableId` and `workflowId` unique. ERROR retries or historical workflow data can therefore produce multiple logical candidates. Exact lookup returns all matching READY/IMPORTED rows and Accounting keeps the existing U-FR1C safety rule:

- zero Payment or Summary candidate -> deferred;
- more than one Payment or Summary candidate -> ambiguous/deferred;
- no latest-wins, READY-first, or IMPORTED-first heuristic.

`REQUESTED` and `ERROR` rows are not reconciliation candidates.

## 5. Intentionally unchanged

This slice does not change:

- Phase 9 status;
- Journal, Expense, provider-financial or settlement authority;
- the Store-local rolling Uber request window: `max(accountingStartDate, today - 4 days)` through yesterday;
- Uber request idempotency or `findExisting()`;
- `eats.report.success -> READY`;
- stable report artifact persistence;
- `uber-report:<reportStableId>:<artifactUrl>` Accounting acquisition identity;
- Uber Reporting CSV parsing/materialization;
- payout-reference reconciliation policy;
- 2026-06-01 historical financial floor;
- crossing-accountingStartDate metadata;
- `ORDERS_AND_ITEMS_REPORT` exclusion;
- ERROR request retry behavior;
- Gmail;
- schema, indexes, unique constraints or migrations.

No cursor is introduced. READY remains the unresolved work state and IMPORTED remains terminal; IMPORTED is queried only as exact partner evidence for a READY anchor.

## 6. Regression coverage

Focused source tests cover:

- READY Payment + IMPORTED Summary recovery;
- IMPORTED Payment + READY Summary recovery;
- READY + READY pairing and one-run de-duplication;
- missing partner -> deferred;
- duplicate same-period/type candidates -> deterministic fail-closed;
- more than 200 unrelated IMPORTED historical rows do not hide the exact partner;
- exact repository query includes owner-private Store set, period, financial types and READY/IMPORTED statuses with no global `take`;
- pre-accountingStartDate reports remain skipped;
- `ORDERS_AND_ITEMS_REPORT` remains excluded;
- IMPORTED partners are not re-materialized;
- the public Reporting view still does not expose `storeUuids`;
- Accounting keeps using only `integrations/ubereats/public-api.ts` and no global IMPORTED scan.

Per `AGENTS.md`, no local lint/build/test/CI reproduction is run before user review. GitHub Actions remains the authoritative validation gate after explicit remote-delivery authorization.

## 7. Architecture effect and next gate

The existing Accounting -> External Channels public direction is reused and narrowed semantically around owner-side exact pairing. There is no new context direction, direct-import allowance, scanner ceiling, SCC, schema/migration, dependency or compatibility entry. `tools/architecture/context-baseline.json` remains unchanged.

After local review approval, push the feature branch, open a PR to `dev`, and require the normal GitHub Actions architecture/API/Web gates to pass before merge. Production/provider active verification is not required to establish the code-level contraction, but the next Uber financial-authority verification should confirm a real READY/IMPORTED partial-pair recovery if such a state is naturally available.
