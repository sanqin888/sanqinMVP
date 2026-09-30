# Post-Modularization Uber Financial Report Registry — State-Driven Reconciliation Contraction

Date: 2026-09-30  
Implementation base: `origin/dev@a90e6191`  
Delivery: **PR #2612 / FINAL HEAD `3036cee6` / CI #6637 GREEN / SQUASH MERGE `271f4979`**  
Status: **MERGED / CI GREEN / PRODUCTION FINANCIAL VERIFICATION DEFERRED UNTIL UBER PRODUCTION ACCESS + REAL REPORT CONTENT / NO MIGRATION / NO NEW DEPENDENCY / NO GRAPH OR BASELINE CHANGE**  
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

Per `AGENTS.md`, no local lint/build/test/CI reproduction was run before user review. PR #2612 was then delivered through the repository workflow; CI #6637 passed the API lint/build/strict declaration/test gates, Architecture baseline, Web lint/build/tests, Browser E2E, printer-agent and Windows-workstation jobs before squash merge `271f4979`.

## 7. Architecture effect and production verification gate

The existing Accounting -> External Channels public direction is reused and narrowed semantically around owner-side exact pairing. There is no new context direction, direct-import allowance, scanner ceiling, SCC, schema/migration, dependency or compatibility entry. `tools/architecture/context-baseline.json` remains unchanged.

Code-level verification is complete. Production financial verification remains **event-triggered and deferred** because the Uber Test/Sandbox financial reports currently contain no real transaction rows suitable for validating payout-reference reconciliation. Do not fabricate production evidence from empty/synthetic provider reports merely to close the gate.

As of 2026-09-27, Uber GTS explicitly confirmed that the Production Access request had been escalated to its internal team for approval, and later confirmed that the supplied `orders.notification` / `store.status.changed` HTTP-200 evidence had been shared for further review and Production Access approval. An operator screenshot on 2026-09-30 still showed the Production App's longstanding `Production Access Requested` / `Scopes Requested — Your scope request is being verified` state, with the dashboard `Last Updated On` value still at 2026-08-03. Therefore that dashboard screen is **not** treated as evidence that the 2026-09-27 internal approval review has advanced or completed.

The next production evidence is required only after Uber grants Production Access and real merchant activity yields non-empty financial reports. At that point verify a real Payment Details + Finance/Payout Summary pair through materialization, U-FR1C MATCHED reconciliation and READY -> IMPORTED progression; if a natural partial pair exists, also confirm exact READY/IMPORTED recovery without re-materializing the IMPORTED partner. This deferred evidence does not reopen Phase 9 and does not block unrelated Accounting work.
