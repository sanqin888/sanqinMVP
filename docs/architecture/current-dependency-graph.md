# Current 12-context dependency graph

Repository-wide modularization status as of 2026-09-19: **SOURCE / ARCHITECTURE COMPLETE / CLOSED** at `origin/dev@1b18fb00`. This closeout does not claim provider production cutover for UberEats or Clover, and it does not turn post-modularization product/reliability work into a new architecture Phase. Remaining provider gates and engineering/product follow-ups are tracked in `POST_MODULARIZATION_BACKLOG.md`.

2026-09-21 post-modularization Accounting Expense payment-completion + records UX is **MERGED / CI GREEN / NO MIGRATION / NO NEW DEPENDENCY** through PR #2446 / final head `9439dd7b` / squash `502647b8`; final PR CI #6078 passed Architecture and all required API/Web checks. It stays wholly inside the existing Accounting L3 owner plus its Web adapter: confirmed Expenses with an empty payment-allocation set gain a one-way, audited completion route; already-completed or already-posted facts cannot be replaced in place. The Expenses page queries the full confirmed-Expense set with composable date/minimum-amount/payment filters before offset pagination and reuses the existing evidence boundary. No context direction, direct-import allowance, scanner baseline, public SCC, Prisma schema, Journal authority or Phase 9 status changes.

2026-09-21 Post-Modularization Accounting **B1-A Expense split ownership foundation** is **PRODUCTION DEPLOYED / MIGRATION VERIFIED / NO GRAPH CHANGE**. Source merged in PR #2448 as `8614633a`; user-generated migration `20260921224139_post_mod_accounting_b1a_expense_split_ownership` is applied in production and `AccountingExpenseSplit` exists.

2026-09-21 Post-Modularization Accounting **B1-B Expense owner-read + atomic Journal authority** is **PRODUCTION VERIFIED / CI GREEN / NO GRAPH CHANGE / NO REPORT CUTOVER** through PR #2449 / squash `324a16eb`; final head `acb8db42` passed CI #6086. Real reviewed Expense `expense_iet91ut05fafso8rl48kds9v` confirms Expense-owned split/payment persistence and same-transaction canonical Expense v1 Journal authority in production.

2026-09-21 Post-Modularization Accounting **B1-C0 Expense report parity preview** is **PRODUCTION PARITY EVIDENCE PASSED / MERGED / CI GREEN / READ-ONLY / NO GRAPH CHANGE** through PR #2450 / squash `f164be7a`; final head `12909b5d` passed CI #6090. Full-range read-only reconstruction from accounting start 2026-06-01 has zero split or Journal-anchor blockers and exact Expense P&L/input-tax/payment-account/OPERATING-cashflow parity.

2026-09-21 Accounting **B1-C1 authoritative Expense report cutover** is **PRODUCTION VERIFIED / MERGED / CI GREEN / NO MIGRATION / NO GRAPH CHANGE** through PR #2452 / squash `cdd3b47a`; final head `dc849d20` passed CI #6099. Production runs `cdd3b47a`; post-cutover Expense `expense_bmwt1anetgvhiglbc6wsjzf8` creates ExpenseSplit + canonical Expense v1 Journal and zero legacy Transaction rows, proving the Journal-only cutover in production. Authoritative P&L/export, account-balance and cashflow read canonical Journals including `EXPENSE_DOCUMENT`.

2026-09-22 Accounting **B1-C2 Expense compatibility contraction** is **PRODUCTION VERIFIED / CLOSED / MIGRATION DEPLOYED / NO GRAPH CHANGE**. Source merged through PR #2456 / `1cd8ee92`; migration `20260922041449_post_mod_accounting_b1c2_drop_legacy_accounting_transaction` is committed at `24e99b40`, CI #6110/#6111 passed and production applied it at `2026-09-22T04:34:24Z`. Production confirms `AccountingTransaction` and `AccountingSourceType` are absent, the two legacy diagnostics are unregistered, and post-migration Expense `expense_v618ly4fflr6jzyvgeiz3e16` still produced one ExpenseSplit, one complete payment allocation and one balanced canonical Expense Journal. No context direction or scanner allowance changed. The Expense compatibility gate is closed and B2 Canonical Sales Analytics is unblocked for readiness audit.

2026-09-22 Accounting **B2-P0 Canonical SALE continuity hardening** is **P0A PRODUCTION VERIFIED / P0B PRODUCTION VERIFIED + COMPLETE / NO GRAPH CHANGE**. P0A caught up the post-2026-09-13 gap through the existing guarded replay and production read-only verification showed 131 immutable SALE facts / 131 exactly-one canonical SALE Journal anchors / zero missing / zero duplicate for the catch-up window. P0B merged through PR #2459 as `2c4cb834`; CI #6118 passed all Architecture/API/Web gates. Forward Web Order `c6ab16o6d7urm906lohrep6yg` proves automatic convergence: paid `2026-09-22T15:09:16.738Z`, immutable SALE fact at `15:09:16.846Z`, exactly one canonical SALE Journal at `15:09:27.551Z`, debit=credit=1495 cents, with processor log `RECENT scanned=23 / alreadyPosted=22 / posted=1 / blocked=0 / failed=0 / complete=true`. The processor remains inside the existing Accounting -> Orders and Accounting -> Brand/Store public directions and Uber remains statement-authoritative until `liveOrderFactCutoverAt`; no Orders -> Accounting edge, direct foreign-owner Prisma read, queue/table, schema/migration, package, scanner allowance or public SCC change was introduced.

2026-09-22 Accounting **B2-A Sales Analytics contracts + attribution policy** is **MERGED / CI GREEN / NO GRAPH CHANGE** through PR #2461 / squash `1c1549c2`; final head `8f982260` passed CI #6125 after initial CI #6124 reported only formatting failures. Orders publishes `ORDER_SALES_ATTRIBUTION_READER` as a non-monetary public boundary for SALE/change descriptive attribution, while Accounting owns the Sales source/account/tender/coverage policy. The existing Accounting -> Orders public direction remains unchanged; no scanner allowance, SCC, schema/migration or route/UI authority change was introduced.

2026-09-22 Accounting **B2-B Canonical Journal Sales projection** is **MERGED / CI GREEN / NO GRAPH CHANGE** through PR #2462 / squash `fe9b08da`; final head `645f0423` passed CI #6130. The Accounting-owned read-only `/accounting/report/sales` projection reads canonical Journal amounts through `ACCOUNTING_DB`, joins Orders only through `ORDER_SALES_ATTRIBUTION_READER`, and reads provider identity/coverage from Accounting-owned persistence/query services. Broken Accounting provider-document or Uber historical-reversal references fail closed; missing Orders descriptive attribution remains explicitly `UNATTRIBUTED`. No new context direction, direct foreign-owner Prisma read, scanner allowance, SCC, schema/migration, package or posting mutation was introduced.

2026-09-22 Accounting **B2-C Sales UI cutover** is **MERGED / CI GREEN / NO GRAPH CHANGE** through PR #2463 / final head `b870ae1d` / squash `db7a7b65`; CI #6132 passed the required API/Web/Architecture gates. The Web Sales page consumes the existing canonical `/accounting/report/sales` contract and no longer reads P&L or `/accounting/report/slice` for its own display. This remained a Web consumer cutover only: no backend owner edge, schema/migration, package, scanner allowance, SCC or Journal mutation was added.

2026-09-22 Accounting **B2-D Dashboard Canonical Sales cutover** is **MERGED / CI GREEN / NO GRAPH CHANGE** through PR #2464 / final head `3530764e` / squash `9e0dac17`; CI #6134 passed all required API/Web/Architecture gates. Dashboard keeps its existing Accounting-owned summary/expense/attention read path and replaces only the channel/payment sales overview with the already-established `AccountingSalesAnalyticsReport` from `/accounting/report/sales`. Channel and canonical primary-payment rows display Journal-owned `netSalesRevenueCents`; tender/provider/source/daily detail stays on the full Sales page. No API owner edge, schema/migration, package, scanner allowance, SCC, posting or settlement mutation was added.

2026-09-22 Accounting **B2-E Legacy Sales slice cleanup** is **LOCAL SOURCE IMPLEMENTED / REVIEW PENDING / EXPECTED NO GRAPH-COUNT CHANGE** on branch `accounting/b2-e-legacy-sales-slice-cleanup` from `origin/dev@9e0dac17`. The zero-consumer `/accounting/report/slice` route, `AccountingOrderDimensionSlice`, `AccountingService.dimensionSlice()`, Accounting -> `OrderReportingFactsModule` composition dependency and paid-total-only `readPaidTotalDimensionsForRange()` contract/types are removed. The shared Orders reporting module remains required by `apps/api/src/reports/reports.module.ts` for operational `readMetricsForRange()` / `readItemsForRange()`, so the Accounting -> Orders context direction still exists through canonical financial facts and Sales attribution and the repository graph count is not expected to change. Production PWA update uses registered `next-pwa` with `skipWaiting: true`; deployed verification must still confirm a fresh/reloaded Accounting PWA no longer needs the retired route before B2-E is called production-verified. No schema/migration, package, scanner allowance, SCC, posting or settlement mutation is introduced.

Phase 3 is **PRODUCTION VERIFIED / CLOSED** for its approved scope as of 2026-09-04.
Phase 4 is **PRODUCTION VERIFIED / CLOSED** as of 2026-09-05 after the consolidated migration recovery,
deployment and active verification; its final source graph remains cycle-free under the recorded baseline.
2026-09-19 post-closeout Identity/Staff hardening is **MERGED / CI GREEN / NO MIGRATION** through PR #2418 / squash merge `1b18fb00`; PR CI #5972 passed the Architecture gate and all required API/Web checks. `StaffAdministrationService.updateStaff()` protects the existing last-active-admin invariant with a PostgreSQL/Prisma `Serializable` transaction plus whole-use-case `P2034` retry. The Staff owner/public boundary, Admin transport adapter, stable-ID contract and direct-import graph are unchanged; baseline remains Foundation **1** / External **1** / Identity **2** / Runtime **4**, total **8**, public SCC empty. The Admin Members STAFF/ADMIN overlap remains explicit development/test compatibility to be contracted later when membership-system testing no longer needs those identities.
Phase 8 External Channels is **SOURCE / ARCHITECTURE CLOSED** as of 2026-09-11 after consolidated Test Store verification passed for every currently exercisable capability. Financial-report live replay remains `CODE READY / LIVE TEST BLOCKED BY UBER CAPABILITY`, while Uber Production Verification, Production Store cutover and the production pilot remain separate provider gates.
Phase 9 Accounting / Reporting / Analytics Slice 0 readiness audit is complete at `origin/dev@1a69bd7d`; Slices 1-5B are merged/CI-green through PRs #2281/#2283/#2284/#2285/#2288, with Slice 5B squash merge `cbe8ad6f` after CI #5516 passed and its migration now deployed/runtime-smoke-verified on the running VM. Slice 5C readiness merged via PR #2290 / `7419c982`; 5C-A Unified Inbox Core merged via PR #2291 / `913e88aa` after CI #5526 passed; 5C-B Acquisition Cutover merged via PR #2292 / `6f1093a8` after CI #5530 confirmed the monotonic baseline Foundation **2**, External **1**, Identity **2**, Runtime **6**, total **11** with no public SCC; 5C-C Provider Financial Parsing + History merged via PR #2293 / `ce399a37` after final head `592bfdc0` passed CI #5535. Slice 5D readiness is complete, 5D-A Canonical Financial Facts Boundary is **MERGED / CI GREEN** through PR #2296 / `7f35878f`, and 5D-B0 Revenue Posting Boundary Hardening is **MERGED / CI GREEN** through PR #2297 / `124cd76c` after final head `064e098e` passed CI #5549. 5D-B1A Store Balance Liability CoA is **DEPLOYED / DB VERIFIED** through PR #2299 / squash merge `d74b2563`; final head `b4a1e0ec` passed CI #5553, and production migration `20260913010000_phase9_slice5d_b1a_store_balance_liability_coa` completed at `2026-09-13T01:54:09Z`. Post-deploy read-only verification shows 21 Accounting accounts, `account_store_balance_liability` as active CAD LIABILITY, and still 0 Journal entries/lines. 5D-B1B Canonical SALE Journal Posting Engine is **MERGED / CI GREEN** through PR #2304 / squash merge `5b35517a`; final head `551cd772` passed CI #5571: Accounting imports Orders and Loyalty only through their public financial-fact modules, maps replay-qualified SALE facts into deterministic Journal drafts, and delegates writes to the existing Accounting Journal writer. This adds an intentional public Accounting -> Orders capability edge and reuses the public Identity/Loyalty direction; CI #5571 confirmed no direct-import debt increase and no public SCC, while the legacy direct baseline remains Foundation **2**, External **1**, Identity **2**, Runtime **6**, total **11**. The new post service is not exposed through Controller/scheduler in B1B, so the legacy accrual route remains the only active revenue-posting entry and no dual-write/backfill is activated. The confirmed posting policies remain Points -> Sales Discount, Daily Special -> nominal/original Sales Revenue minus a separate Sales Discount, Store Balance -> liability, WECHAT_ALIPAY -> Cash, and legacy undated refund/amendment exceptions -> 5D-C. The sequence remains Unified Inbox/provider financial evidence -> canonical financial facts/revenue posting -> platform settlement/reconciliation. Clover/Uber Eats/Fantuan formal provider-financial history remains **2026-06-01**; the existing UI-managed `accountingStartDate` is the common POS/Web financial-statistics lower bound and is now configured to **2026-06-01** with `America/Toronto` Store-local semantics.
Phase 9 has since advanced through the 5D revenue/change Journal cutovers and C2 historical repair; C2 is production-verified with one documented unresolved CARD refund and final ledger totals **1228 JournalEntries / 3921 JournalLines / 1228 Audits**. Slice 6A is **MERGED / CI GREEN** through PR #2330 / `dc9a6f80`, contracting Uber report entitlement/mapping/provider UUID ownership fully behind the existing External Channels reporting boundary without changing the recorded context direction. Slice 6B is **MERGED / CI GREEN** through PR #2331 / squash merge `2f999ec0`; PR CI #5656 and post-merge CI #5657 were green. It remains a read-only provider-settlement shadow policy that reuses the existing Accounting -> Orders public financial-fact edge and Accounting-owned provider-document/Journal persistence reads, adds no new context direction or direct-import baseline, and introduces no settlement writer. The approved Uber authority split is statement-only before the real `liveOrderFactCutoverAt` and canonical Order Sales/Tax after that cutover; the 119 pre-live manually entered Uber SALE Journals are surfaced only as explicit reversal candidates, not silently hidden or deleted. Slice 6C-A1 Tip Revenue CoA provisioning is **MERGED / CI GREEN** through PR #2333 / squash merge `c468e6bd`; PR CI #5661 and post-merge CI #5662 were green, on top of the durable data-only migration merged via PR #2332 / merge commit `35de1d47`. `account_tip_revenue` is pinned as an active CAD `REVENUE` system account with no opening Journal/backfill, and the cumulative CoA migration architecture guard includes that seed. Slice 6C-A2 settlement mutation-authority hardening is **MERGED / CI GREEN** through PR #2334 / squash merge `f30275fb`; final head `b4dbdd82` passed PR CI #5667 and post-merge CI #5668. Preview v2 binds writable provider plans to globally latest revision, confirmed Inbox review evidence, explicit provider coverage and exact system-account class/currency/active facts; historical Uber reversal coverage must be unique, and parser `RECONCILIATION_ONLY` remains authoritative for Clover Tips. Slice 6C-B atomic provider settlement / historical Uber replacement writer is **MERGED / PR CI GREEN** through PR #2335 / squash merge `b3281410`; PR CI #5672 passed. Shadow authority v3 freezes original SALE Journal `idempotencyKey / idempotencyHash / version / sourceFactStableId`; the expected-plan-hash POST delegates one provider document plus every covered historical Uber reversal to one Accounting-owned Serializable replacement group and revalidates latest provider revision, confirmed review, coverage, system-account facts and historical Journal anchors inside the transaction. The execution service has no Prisma access, and no new context direction, schema/migration, scanner allowance, payout writer, revision-correction writer, Uber cutover setter or unknown-component mapping is introduced. The follow-up 6C-B live-verification PDF hardening merged through PR #2337 / `ff97871d`; PR CI #5679 and post-merge CI #5680 were green, and production is now running a later deployed head that contains this change. It replaces Accounting's handwritten PDF text decoder with local Poppler `pdftotext` and makes repeated-label money parsing skip non-money occurrences; this changes runtime extraction implementation only and leaves the architecture direct-import baseline, public context directions and SCC state unchanged. The Upload-library follow-up then removed the duplicate-lifecycle verification blocker, and the same June 2026 Uber statement was re-acquired as a fresh manual source in production. At that stage, live read-only verification confirmed `PENDING_REVIEW / PROVIDER_FINANCIAL_DOCUMENT / UBER_EATS`, successful default recognition rule `acct_recognition_uber_monthly_statement:v1`, readable Poppler Unicode including `三秦肉夹馍`, canonical parser period `2026-06-01..2026-06-30`, 28 normalized monthly-summary lines, Marketplace Fees `-61912` cents and Net Total `122285` cents, with payout sections explicitly excluded. The Inbox review follow-up keeps the same Accounting ownership and context graph while changing manual/Gmail recognition to editable classification/provider suggestions: Prisma adds `OTHER_DOCUMENT` plus nullable `AccountingInboxItem.selectedProvider`, Provider API evidence stays provider-owned, and no Journal or cross-context authority is added. Migration `20260915193047_add_other_document` persists that enum/nullable-column change; PR #2339 / squash merge `f78ae9e7` corrected stale expectations and CI #5685 passed. Provider recognition configuration then merged through PR #2340 / squash `866966a9`, with PR CI #5689 and post-merge CI #5690 green; its `AccountingProviderRecognitionMatchMode` / `AccountingProviderRecognitionRule` persistence was supplied by the user-generated `20260916002149_add_accounting_image_binary_retention` migration at `dev@3608c2e2`. Canonical provider financial mappings remain code-owned, Provider API intake bypasses editable recognition, and no new context direction, scanner allowance or Journal authority is introduced. Upload-library PR #2344 / `376cea32` and manual filename hardening PR #2346 / `03efff85` likewise remain Accounting-internal and do not change the context graph. The 6C-B ingestion and component-taxonomy gates closed with the real June statement confirmed/materialized under parser v3 and the approved finite component mappings. At the pre-replay verification stage, settlement/reversal Journals were still zero and the read-only shadow plus operator-authorization gates were satisfied; the later real June replay completion and 6D-A contraction state are recorded below.

Phase 9 Slice 6C-B.1 is **MERGED / CI GREEN / MIGRATION MERGED / PRODUCTION MATERIALIZATION VERIFIED** through PR #2351 / squash merge `a83cdce5`; final head `250875d1` passed CI #5736, and user-generated migration `20260916060832_slice6c_b1_uber_settlement_components` merged at `03df1c19`. The real June Uber statement is `CONFIRMED`, revision `1`, parser `accounting-provider-financial:v3`, with 28 normalized lines and provider coverage beginning `2026-06-01`; confirmation created zero provider-settlement/reversal Journals. Generic non-zero `OTHER / ADJUSTMENT` remains fail-closed. Slice 6C-B.2 Provider Settlement Review UI is now **MERGED / CI GREEN / DEPLOYED / REAL JUNE SHADOW VERIFIED** through PR #2354 / final head `c04677b0` / squash merge `7d0acc20`; PR CI #5747 passed. Production statement-bounded June shadow GETs returned HTTP 200 and read-only DB verification confirmed one latest CONFIRMED statement, provider draft `294164 / 294164`, Uber Pending `122285`, 83 historical SALE Journals, 83 READY reversals at `294474 / 294474`, and still zero settlement/reversal Journals. Slice 6C-B.3 Provider Settlement Operator Replay Gate is **MERGED / CI GREEN / DEPLOYED / OPERATOR GATE VERIFIED / REAL JUNE REPLAY EXECUTED + DB VERIFIED** through PR #2356 / final head `42d9e160` / squash merge `6f4e9f4d`; PR CI #5753 passed. The deployed gate reproduced the real June READY plan with visible deterministic hash, 84 prospective Journals (1 provider + 83 reversals), provider `294164 / 294164`, reversals `294474 / 294474`, and Uber Pending `122285`; final read-only pre-write verification found zero existing target settlement/reversal Journals and no changed prerequisites. That paragraph records the pre-write gate state; the later June replay was executed and DB-verified, as recorded in the 6D-A status immediately below. No Prisma/schema/migration, CoA, parser/mapping, settlement writer, provider wire, context direction or direct-import allowance changes. The expected direct-import baseline remains Foundation **1** / External **1** / Identity **2** / Runtime **6**, total **10**, public SCC empty.
Phase 9 Slice 6D-A legacy provider-settlement contraction is **MERGED / PR CI GREEN / MIGRATION PRODUCTION APPLIED**. Source merged through PR #2367 / squash `895cd35b` after CI #5790 passed. Production read-only verification found exactly 1 balanced provider-settlement Journal at `294164 / 294164` cents plus 83 balanced historical Uber reversal Journals at `294474 / 294474`, while `PlatformSettlementRecord = 0` and `AccountingTransaction = 0`. The source contraction removes only the obsolete flat `PlatformSettlementRecord` / `SettlementPlatform` schema surface, its CSV importer and `PlatformSettlementRecord -> AccountingTransaction` reconciliation API/service, plus the matching Web normalized-settlement/difference consumer. User-generated migration `20260917044832_phase9_slice6d_a_drop_legacy_platform_settlement` merged at `cb384c82`, contains only the expected table/type drops, and is production-applied as of `2026-09-17T06:07:07.381114Z`. Uber report artifact visibility remains, and canonical Provider Financial / Journal settlement ownership is unchanged. No context direction or scanner allowance is added; the expected direct-import baseline remains Foundation **1** / External **1** / Identity **2** / Runtime **6**, total **10**, public SCC empty.
Phase 9 Slice 7-A AccountingTransaction legacy Order/source contract contraction is **MERGED / PR CI GREEN / MIGRATION PRODUCTION APPLIED**. Source merged through PR #2369 / squash `e5997fb9` after CI #5793 passed; user-generated migration `20260917053632_phase9_slice7_a_contract_legacy_accounting_transaction_order_sources` merged at `af6fbc06` and is production-applied as of `2026-09-17T06:07:07.550296Z`. Fresh production verification before contraction found zero `AccountingTransaction` rows, zero non-null `orderId`, zero `ORDER` / `UBER` / `FANTUAN` sources and zero retired `AUTO_ORDER*` rows; closeout verification still finds `AccountingTransaction = 0`. The slice removes only the obsolete `AccountingTransaction.orderId` and `AccountingSourceType.ORDER/UBER/FANTUAN` contract plus its generic Transaction DTO/search/export/Order-validation plumbing; active `AccountingJournalSource.ORDER`, Expense-backed `AccountingTransaction`, `MANUAL/OTHER`, canonical owner-fact reads, Journal writers and settlement authority stay intact. Migration review confirms the enum is replaced with `MANUAL / OTHER` through an explicit cast and then `AccountingTransaction.orderId` is dropped, with no unrelated schema drift. `assertNoLegacyOrderRevenueAccrual()` remains until the separate generic single-entry income mutation surface is contracted. No new context edge or scanner allowance is introduced; expected baseline remains Foundation **1** / External **1** / Identity **2** / Runtime **6**, total **10**, public SCC empty.
Phase 9 Expense Review Slice is **MERGED / PR CI GREEN / MIGRATION PRODUCTION APPLIED** through PR #2372 / squash `38984b1a`; PR CI #5804 passed. The user-generated migration `20260917122856_phase9_expense_payment_allocations` merged at `9d14212d`, matches the authorized empty-Accounting contraction, and is production-applied as of `2026-09-17T13:13:54.978117Z`: it drops the retired `AccountingExpenseDocument.accountId` FK/index/column and creates Accounting-owned `AccountingExpensePaymentAllocation` persistence. Closeout verification still finds `AccountingExpenseDocument = 0` and `AccountingTransaction = 0`. Category split Transactions remain Expense/category facts and payment account ownership is represented only by allocations. The Web review/manual-entry changes remain adapter-only. No new context direction, public edge, direct-import allowance or scanner-baseline change was introduced; Accounting remains Foundation **1** / External **1** / Identity **2** / Runtime **6**, total **10**, with public SCC empty.

Phase 9 Slice 7-B Accounting actor/stable-user identity contraction is **MERGED / PR CI GREEN / CORRECTED RENAME MIGRATION PRODUCTION APPLIED** through PR #2375 / squash `141fd362`, with the corrected migration merged in PR #2376 / squash `412dc66b`; CI #5817 and #5819 passed. The source distinguishes human-only persisted `*UserStableId` fields from the Journal/Audit actor-reference space that legitimately contains either a user stable ID or registered `system:*` actor key. The originally unsafe DROP+ADD migration was confirmed unapplied in production before correction; the corrected value-preserving rename migration is now production-applied as of `2026-09-17T17:56:38.422201Z`, and read-only schema verification shows only the target ActorRef/UserStableId column names. Slice 7-C Accounting application/public contract Prisma-type contraction is **MERGED / PR CI GREEN / DEPLOYED / NO MIGRATION** through the same PR #2376 / squash `412dc66b`. Slice 7-D Accounting -> Orders paid-dimension reporting boundary contraction is **MERGED / PR CI GREEN / POST-MERGE CI GREEN / DEPLOYED / NO MIGRATION** through PR #2377 / final head `243e2b21` / squash `d616cef5`; PR CI #5822 and post-merge CI #5823 passed. Accounting removes its final direct `Prisma Order` read and consumes an Orders-owned public paidAt/totalCents dimension projection that preserves the old no-status-filter semantics and is explicitly non-canonical for revenue. The Slice 7 closeout tail strengthens the regression to scan all Accounting production source for contracted foreign-owner Prisma delegates and is now **MERGED / CI GREEN / SOURCE CLOSED** through PR #2379 / squash `17b48d7c` after PR CI #5828 passed. Accounting already has approved public owner-fact edges, so no new context direction, scanner allowance or SCC is introduced; authoritative baseline remains Foundation **1** / External **1** / Identity **2** / Runtime **6**, total **10**, public SCC empty. Generic `POST /accounting/tx` mutation semantics remain a later Slice 8A contraction decision rather than a Slice 7 identity/Prisma blocker.

Phase 9 Slice 8A backend cleanup is **MERGED / CI GREEN / SOURCE CLOSED / NO MIGRATION**. Slice 8A-1 Period + Journal merged through PR #2380 / squash `8bc1f77e` after CI #5834; 8A-2 Expenses / Inbox / Chart / settlement-read split through PR #2381 / `eaff4c0a` after CI #5840; 8A-3 generic single-entry Transaction contraction through PR #2382 / `14caf98a` after CI #5843; 8A-4 Financial Reports canonical fact cutover through PR #2383 / `66a1873b` after CI #5847; and 8A-5 Controller vertical split + closeout guard merged through PR #2384 / squash `bd09197d` after CI #5851. The god `AccountingController` and generic authenticated `/accounting/tx` mutation surface remain absent; Journal, Period, Chart, Expense/Inbox, Provider Settlement and Financial Reports are explicit capabilities, and twelve authenticated Accounting controllers are pinned by architecture regression. The approved sequence is now **8P Payroll -> 8B Accounting Web vertical-contract cleanup -> Phase 9 closeout**. The last confirmed direct-import baseline remains Foundation **1** / External **1** / Identity **2** / Runtime **4**, total **8**, public SCC empty.

Phase 9 Accounting Inbox Expense Review currency/prefill/layout follow-up is **MERGED / CI GREEN / NO MIGRATION** through PR #2385 / squash `6d216eab`; exact dev head `6d216eabed5d45ed2ed61e1c02293130c3fdb0d9` passed CI #5855 across Architecture and all API/Web gates. It remains Web-adapter-only: the editable currency initializes to CAD, recognized totals are operator-assist prefills, foreign/ambiguous evidence is visibly warned rather than silently converted, and payment allocations are presentation-reordered without changing Accounting persistence or validation. No context direction, public edge, direct-import allowance, scanner allowance, SCC or baseline change was introduced.

Phase 9 Slice 8P-A Payroll readiness/schema contract analysis is **MERGED / ANALYSIS CLOSED / NO MIGRATION** through PR #2386 / squash `5e968136`. Slice 8P-B1 Payroll schema/contracts foundation is **MERGED / STRUCTURAL MIGRATION PRESENT IN DEV**: source merged through PR #2387 / `6dae3bd8`, duplicate effective-date indexes were removed in `2110e508`, and the reviewed additive `20260918120954_phase9_payroll_b1_foundation` migration is present at dev head `963485a8`. Slice 8P-B2 Ontario statutory calculator is **MERGED / CI GREEN / NO MIGRATION** through PR #2388 / squash `bf175d2a`; final head `f6de240b` passed CI #5864. Slice 8P-B3 Payroll lifecycle + canonical YTD API is **MERGED / CI GREEN / COMPANION MIGRATION MERGED** through PR #2389; final head `dc48ea9a` passed CI #5868. Slice 8P-C Payroll operator UI + Pay Statement PDF is **MERGED / CI GREEN / NO PRISMA MIGRATION** through PR #2390 / final head `54c82a1c` / squash `b252382d`; CI #5877 passed all Architecture/API/Web gates and the user-generated pnpm lockfile passed frozen install. Slice 8P-D1 Payroll accrual Journal posting is **MERGED / CI GREEN / PAYROLL COA DATA MIGRATION MERGED** through PR #2391 / final head `266a91de` / squash `3bae5682`; CI #5884 passed Architecture/API/Web gates. D1 adds Payroll-owned accrual authority and the atomic `APPROVED -> POSTED` path through the existing Accounting Journal writer; reviewed data-only migration `20260918185000_phase9_slice8p_d0_payroll_coa` provisions the seven active CAD Payroll control accounts and the cumulative CoA guard pins them to TypeScript defaults. Slice 8P-D2 employee net-pay settlement is **MERGED / CI GREEN / COMPANION MIGRATION MERGED** through PR #2392 / final head `3e821f7f` / squash `6b1d2dcd`; reviewed additive migration `20260918200458_phase9_slice8p_d2_payroll_employee_payment` is in `dev`, PR CI #5888 passed after the stale architecture assertion was corrected, and post-merge CI #5889 passed all required gates. D2 adds one-full-settlement `PayrollEmployeePayment` persistence, owner-specific `payroll.employee-payment.v1` authority and an atomic liability-clearing Journal: debit net-pay payable, credit the selected active CAD BANK/CASH account, with amount forced to frozen `PayrollRun.netPayCents`. The API exposes GET/POST settlement routes and the Payroll UI exposes only account/date/reference, never an editable amount. Slice 8P-D3-A CRA remittance calendar policy is **MERGED / CI GREEN / NO MIGRATION** through PR #2393 / final head `58204478` / squash `73a70839`; PR CI #5891 and post-merge CI #5892 passed all required gates. It adds only versioned pure `CA-CRA-REMIT-2026-V1` payday→period/due-date derivation with Ontario-applicable CRA 2026 working-day/holiday handling. Slice 8P-D3-B1 CRA remittance persistence + canonical preview is **MERGED / CI GREEN / COMPANION MIGRATION MERGED** through PR #2394 / final head `f35249af` / squash `95cfbf70`; reviewed migration `20260918215432_phase9_slice8p_d3_cra_remittance` is in `dev`, PR CI #5897 and post-merge CI #5898 passed all required gates. Slice 8P-D3-B2 CRA remittance settlement / Journal / employer UI is **MERGED / PR CI GREEN / NO MIGRATION** through PR #2395 / final head `057330af` / squash `ccc76515`; PR CI #5901 passed all required API/Web/Architecture gates. It posts server-authoritative `payroll.cra_remittance.v1` liability settlement from immutable included-run evidence and retains BANK-only payment authority. Slice 8P-D4-B posted-run reversal authority + canonical YTD is **MERGED / CI GREEN / COMPANION MIGRATION MERGED** through PR #2396 / final head `ef0953ff` / squash `a9956fe7`; CI #5905 passed API/Web/Architecture gates and reviewed migration `20260918235731_phase9_slice8p_d4b_payroll_reversal_evidence` is in dev. It adds `payroll.run.reversal.v1` as an exact STANDARD inverse of D1 accrual, blocks reversal after EmployeePayment/CRA settlement or later finalized Payroll, and rebuilds REVERSED YTD as explicit `+ original / - reversal` effects; D4-D below supersedes the pre-production pay-date Journal timing so accrual/reversal period locks follow frozen `periodEnd`. Slice 8P-D4-C correction chain + operator workflow is **MERGED / CI GREEN / NO MIGRATION** through PR #2397 / final head `10b21117` / squash `c5ca3e1c`; CI #5908 passed all required gates. Correction creation is linear from the latest REVERSED predecessor, exposes only predecessor stable identity, freezes correction period/pay-date/store identity, reuses the normal calculate/approve/post pipeline, and completes reversal/correction controls in the Payroll UI. Slice 8P-D4-D Payroll accrual-date semantic correction is **MERGED / CI GREEN / NO MIGRATION** through PR #2399 / final head `143413ef` / squash `169017df`; PR CI #5915 and post-merge CI #5916 passed. Payroll accrual/reversal Journal `occurredAt` derives from frozen `PayrollRun.periodEnd`, while statutory calculation/YTD/CRA policy remains payday-based and employee/CRA settlements remain actual-payment-date based. During 8P-E controlled production verification on 2026-09-19, the accrual Journal posted correctly to `2026-06-30`; the Pay Statement financial/YTD content and export audit were correct, but the footer overflowed alone onto page 2. PR #2403 final head `41c358f0` passed PR CI #5930, squash-merged as `c8f7a6d8`, and post-merge CI #5931 passed; the deployed one-page PDF was then production re-verified. The same PR corrected employee-create feedback/selection without adding a name-uniqueness rule or changing Payroll semantics. The follow-up PR #2405 / final head `ba672c19` squash-merged as `01e38a2a`; PR CI #5938 and post-merge CI #5939 passed, the change is deployed, and the UI slice is **PRODUCTION VERIFIED / CLOSED / NO MIGRATION**. Production verification confirmed sticky employee context/run isolation, MONTHLY next-period prefill with manual-edit preservation, summary-first Employees/Year Opening maintenance, and employer-level CRA isolation. The Runs adapter derives the presentation-only next-period suggestion from the latest POSTED run while leaving `payDate` operator-confirmed and refusing to advance past unfinished/reversed payroll. This UI closeout does not close overall Payroll 8P-E: CRA-remittance settlement remains intentionally deferred to the next real remittance, and posted-run reversal/correction remains separate closeout evidence. It introduces no context direction, public edge, direct-import/scanner allowance, schema/migration, API contract or financial-semantic change. Expected baseline remains Foundation **1** / External **1** / Identity **2** / Runtime **4**, total **8**, public SCC empty.

Phase 9 Slice 8B readiness audit is **COMPLETE / READY FOR SOURCE IMPLEMENTATION / NO MIGRATION** against the post-#2405 dev state. The backend vertical/controller split is already stable; the remaining work is Web transport-contract consolidation. Current browser debt consists of duplicated page/feature-local Accounting HTTP DTOs, Inbox wire/UI-model mixing, Settlement -> Inbox UI-model coupling, repeated Report/Dashboard/Sales shapes, Payroll wire/helper mixing, and the deliberately retained Audit `operatorUserId` Web compatibility label. Approved implementation order is **8B-A Audit + contract foundation -> 8B-B Inbox/Expense/Settlement -> 8B-C Reports/Dashboard/Sales/Settings -> 8B-D Payroll -> 8B-E contract guard/closeout**. No Prisma/schema/migration, dependency manifest, Accounting route-set expansion, financial semantic, context direction, scanner allowance or SCC change is planned; baseline remains Foundation **1** / External **1** / Identity **2** / Runtime **4**, total **8**, public SCC empty.

Slice 8B-A Audit Web contract foundation is **MERGED / PR CI GREEN / NO MIGRATION** through PR #2408 / final head `7f6acd8d` / squash `c448ad60`; CI #5947 passed Architecture and all API/Web lint/build/strict/tests after a formatting-only retry from #5946. The Audit browser DTO lives under the Accounting Web contract surface, the HTTP filter/response identity is canonical `operatorActorRef`, and the Slice 7-B `operatorUserId` response remap is removed. No route path, persistence, financial semantics, package dependency or architecture edge changed; baseline remains Foundation **1** / External **1** / Identity **2** / Runtime **4**, total **8**, public SCC empty.

Slice 8B-B Inbox / Expense / Settlement Web contracts is **MERGED / PR CI GREEN / NO MIGRATION** through PR #2409 / final head `0ba43612` / squash `a810b524`; CI #5949 passed Architecture and all API/Web lint/build/strict/tests. Inbox wire DTOs, shared chart/account shapes, Expense document responses and provider-settlement responses now live under the Accounting Web contract surface; `inbox-model.ts` is UI-only, Expenses no longer carries page-local wire copies, and Settlement production sources no longer depend on the Inbox UI model or the deleted `settlement-model.ts`. No API response/route behavior, persistence, Journal/Expense/Inbox/provider-settlement semantics, package dependency, context direction or scanner allowance changed; baseline remains Foundation **1** / External **1** / Identity **2** / Runtime **4**, total **8**, public SCC empty.

Slice 8B-C Reports / Dashboard / Sales / Settings Web contracts is **MERGED / PR CI GREEN / NO MIGRATION** through PR #2410 / final head `5c0a14ea` / squash `2b01ef82`; CI #5951 passed Architecture and all API/Web lint/build/strict/tests. Canonical P&L/cashflow/account-balance/dashboard responses and the Orders-owned non-canonical paid-total dimension slice now use a shared Web report contract; Settings reuses chart contracts and moves automation/period-close and Inbox provider-recognition wire types out of components. No report calculations, Orders reporting semantics, automation/period behavior, API route/response behavior, persistence, package dependency, context direction or scanner allowance changed; baseline remains Foundation **1** / External **1** / Identity **2** / Runtime **4**, total **8**, public SCC empty.

Slice 8B-D Payroll first-class Web contracts is **MERGED / PR CI GREEN / NO MIGRATION** through PR #2411 / final head `a9bf76aa` / squash `6efa70ab`; CI #5953 passed Architecture and all API/Web lint/build/strict/tests. Payroll employer/employee/config/run/YTD/Year Opening/employee-payment/CRA-remittance wire facts now live in `contracts/payroll.ts`; browser parsing/formatting lives in `payroll/payroll-ui.ts`; the mixed `payroll-types.ts` is deleted; and Payroll payment/remittance account reads reuse the Accounting chart contract. No statutory formula, Payroll posting/payment/remittance policy, API route/response behavior, persistence, package dependency, context direction or scanner allowance changed; baseline remains Foundation **1** / External **1** / Identity **2** / Runtime **4**, total **8**, public SCC empty.

Slice 8B-E Accounting Web contract architecture guard + 8B source closeout is **MERGED / CI GREEN / PRODUCTION DEPLOYED / NO MIGRATION** through PR #2412 / final head `8163a8e0` / squash `11bf2589`; PR CI #5955, post-merge CI #5956 and dev verification CI #5957 all passed. At the 8B-E deployment point production `main` ran `11bf2589`; the later Phase 9 closeout fixes/evidence advanced production to `dbea68f3`. The last inline Inbox delete response and Reconciliation-local Uber report DTO moved to the Accounting contract surface. The recursive Web guard requires named `/accounting/*` `apiFetch<T>` responses to be imported from `contracts/*`, rejects inline/page-local response DTOs, keeps Inbox/Payroll UI-only modules private to their verticals, keeps deleted mixed-model files absent and pins Audit `operatorActorRef`. Source-closeout counts are page-local named Accounting response ownership **0**, inline response DTOs **0**, Settlement -> Inbox UI-model imports **0**, and Audit legacy Web label **0**. No runtime semantics, persistence, package dependency, context direction or scanner allowance changed. Final baseline remains Foundation **1** / External **1** / Identity **2** / Runtime **4**, total **8**, public SCC empty.

Phase 9 overall is **PRODUCTION VERIFIED / CLOSED**. The §18.21 five-Order cleanup was operator-executed and independently verified read-only: target Orders/events/Loyalty/Accounting facts are gone, the ADMIN test LoyaltyAccount is restored to zero test balances, global Journal debit/credit parity remains exact, and orphan/duplicate source-fact checks are zero. PR #2414 / squash `5717a568` fixed the Accounting date-only report timezone bug; PR #2415 / squash `dbea68f3` recorded the post-cleanup evidence; production `main` is now `dbea68f3`. The operator actively verified Toronto range `2026-09-01..2026-09-18` at **$1,906.93**, matching the canonical Journal projection. The 2258-cent historical exception remains fail-closed, Payroll 8P-E retains explicitly deferred real CRA-remittance and posted-run reversal/correction evidence, production period-close remains source/CI-characterized, and Uber July/provider-report completion remains a provider-evidence gate rather than architecture debt.

2026-09-21 Post-modularization Accounting Document Recognition Reliability Slice A is **MERGED / CI GREEN / NO MIGRATION / NO GRAPH CHANGE** through PR #2442 / squash `994f5a67`. It restores the existing Inbox Core successful-ParseRun `resultHash` invariant for structured-expense CSV and ambiguous provider-recognition CSV by reusing Accounting-owned deterministic JSON hashing. CSV parsing/classification, batch fail-closed behavior, Provider API routing, persistence ownership and Journal authority are unchanged. No new context direction, public edge, direct import, architecture allowance or SCC is introduced; the closed modularization baseline remains unchanged.

2026-09-21 post-modularization Accounting Document Recognition Reliability Slice B is **MERGED / PR CI GREEN / NO MIGRATION / NO GRAPH CHANGE** through PR #2443 / squash `6e89bc3b`. It implements ordinary Expense source-amount reconciliation plus auditable final-booking correction entirely inside Accounting. Poppler/Textract Expense extraction exposes fail-visible `MATCHED / MISMATCH / INSUFFICIENT` financial consistency, geometry-backed native-PDF amount pairing, and a Bell-style regression preventing HST/discount mispairing. Machine extraction remains immutable/read-only; the existing Expense booking fields remain the editable operator authority, and final confirmation records machine values, booked values, corrected-field names, operator and timestamp in `ExpenseDocument.extractionJson.bookingReview` plus a `CONFIRM_EXPENSE_BOOKING` audit entry. The earlier Expense review-table prototype was removed before merge, so there is no Prisma schema delta, cross-context capability direction, direct import, scanner allowance or SCC change. The authoritative Accounting direct-import baseline remains Foundation **1** / External **1** / Identity **2** / Runtime **4**, total **8**, public SCC empty; Phase 9 remains closed.

2026-09-21 post-modularization Accounting Slice C0 Expense Journal canonicalization is **MERGED / CI GREEN / READ-ONLY / NO MIGRATION / NO GRAPH CHANGE** through PR #2444 / squash `93e755d6`; final head `e953cf13` passed CI #6072. Production readiness was rechecked after the operator cleanup of the accidental Bell Expense: retained target ExpenseDocument/AccountingTransaction/Journal rows are all zero, while the source Inbox returned to `PENDING_REVIEW` with ParseRun evidence preserved. C0 adds only an Accounting-owned pure Expense->Journal policy plus authenticated shadow-preview transport/service. Canonical mapping is debit `account_general_operating_expense` with category dimension, debit `account_hst_recoverable`, and credit only reviewed CAD payment allocation accounts; missing allocation fails closed as `MISSING_PAYMENT_ALLOCATION`. Preview reports deterministic `READY / BLOCKED / ALREADY_POSTED`, draft hashes and range `planHash` without writing Journal, changing Expense confirmation, reports, `AccountingTransaction` mutations, schema, package dependencies, context directions, scanner allowances or SCC state. The authoritative baseline remains Foundation **1** / External **1** / Identity **2** / Runtime **4**, total **8**, public SCC empty.

2026-09-21 Accounting Document Recognition original Slice C Inbox pre-confirm UX closeout is **MERGED / CI GREEN / WEB-ONLY / NO MIGRATION / NO GRAPH CHANGE** through PR #2445 / final head `3cd7e645` / squash `da77b9a5`; final PR CI #6074 passed all required API/Web checks. It completes the originally audited A/B/C work package by showing recognition confidence in the Expense pre-confirm summary, explaining that opening Expense review does not post anything, surfacing the irreversible effects of final Expense confirmation and Provider Financial confirmation before the user acts, and labeling manual-upload evidence as `未确认 · 可永久删除` versus `已确认 · 受保护`. Existing backend confirmation/materialization/deletion semantics are unchanged. The previously merged Expense Journal C0 shadow preview is a separate future-roadmap readiness tool and is not part of this original Slice C scope; no C1 Journal cutover is started by this closeout.

2026-09-21 post-modularization Accounting Document Recognition Slice 3V-A is **MERGED / CI GREEN / NO GRAPH CHANGE** through PR #2439 / squash `0d6909bb`; final head `8c67ffc4` passed PR CI #6054 and merged-head CI #6055 passed API/Web. Native-PDF usability classification, persisted routing evidence, Poppler layout verification and the provider-financial v5 fail-closed rule remain entirely inside Accounting and are pinned by the existing Prisma-free Accounting architecture guard. No new cross-context import, public capability direction, scanner allowance, schema/migration, package/runtime dependency or public SCC was introduced.

2026-09-21 post-modularization Accounting Document Recognition Slice 3V-B is **DEV MERGED / CI GREEN / PRODUCTION VERIFICATION PENDING / NO GRAPH CHANGE** through PR #2440 / squash `0ac9117f`; final head `3c5c0400` passed PR CI #6057 and merged-head CI #6058 passed API/Web. `SCAN_CANDIDATE` PDFs replace the raw-PDF Textract fallback with Accounting-owned bounded `pdfinfo` + sequential `pdftocairo` rasterization and synchronous Textract image-page OCR; only LINE text/confidence/geometry is merged into PDF-level extraction with original page identities, while AnalyzeExpense semantic fields remain outside provider authority. Whole-document page/resource/line failures fail closed before provider parsing. Provider API remains on its existing CSV-owned path, receipt-image recognition is unchanged, and the two new PDF adapters are pinned as Prisma-free Accounting boundaries. No new cross-context import, public capability direction, scanner allowance, compatibility path, schema/migration, package/runtime dependency or public SCC is introduced. The authoritative Accounting direct-import baseline therefore remains Foundation **1** / External **1** / Identity **2** / Runtime **4**, total **8**, with public SCC empty. Phase 9 remains closed.

A separate post-modularization Accounting product roadmap exists at `ACCOUNTING_PRODUCT_ROADMAP.md`. Its repository-wide start gate is now **SATISFIED** after Identity/Staff atomicity PR #2418 and the final modularization closeout; it must not reopen Phase 9. Its approved sequence is Expense -> canonical Journal contraction, canonical Sales Analytics, Trial Balance, then the zero-opening **资产负债变动表 / Balance Movement Statement**; a formal Balance Sheet waits for a later real fiscal-year opening balance. Execution remains subject to a fresh Slice A readiness audit and normal review/authorization/PR/CI delivery.
Slice 6 merged via PR #2157 with final PR head `8547b46c`, squash merge `b91afb6a`, and
CI #5070 green; focused Uber menu item availability OFF -> ON, temporary suspension /
recovery, and option availability OFF -> ON verification were completed successfully.
Slice 2C remains explicitly DEFERRED and is not represented as completed by this
closure.

This snapshot records the **remaining direct cross-context import debt** enforced
by `tools/architecture/context-baseline.json` after Phase 3 closure plus the merged
post-closeout ownership/scanner hardening tail in PR #2160. Test files and registered
composition roots are excluded. Imports through `public-api`, `contracts`, `ports`,
`@shared/foundation`, `@shared/menu`, or `@shared/order` are approved public-contract
traffic and do not consume the debt counts below.

The CI architecture scanner is authoritative for the exact source scan. This file is
the human-readable working snapshot and must be refreshed at every modularization
boundary change. PR #2160 merged to `dev` as `3a20c8c5`; GitHub Actions CI #5080 passed
on final PR head `27b57f99`. The timed Store pause codec change has not yet been recorded
as production smoke-verified, so this document claims merged/CI evidence only for that
tail.

## Phase 3 Slice 6 cycle audit and contraction

Static closeout review found one public-contract cycle that the previous scanner
could not reject because public imports were counted separately from direct debt:

`catalog-pricing-offers -> external-channels -> catalog-pricing-offers`

Slice 6 first adds a strongly-connected-component cycle gate over public dependency
pairs that are not still grandfathered by an explicit legacy direct-import allowance.
The same slice then contracts the exposed cycle at source: Catalog availability
orchestration now supplies publication and suspend-window facts to the Uber public
availability command, while Uber menu wiring/API/worker composition no longer imports
Catalog availability surfaces. The reverse `external-channels -> catalog-pricing-offers`
public edge is therefore removed in source; the intended remaining availability
coordination direction is `catalog-pricing-offers -> external-channels` through the
Uber public capability. The first remote cycle-gate run additionally surfaced a
pre-existing public SCC among Catalog / Orders / Identity / Messaging. Because those
edges predate Slice 6, they are now captured as `legacyPublicCycleComponents`
contraction-only debt: they may shrink but cannot gain a new context or internal edge.
GitHub Actions CI #5070 passed on final PR head `8547b46c`; the Architecture gate found
no new direct pair and no new/expanded public-contract cycle. PR #2157 merged to `dev`
as `b91afb6a`, and the affected Uber availability flows were then actively verified.
No local scanner execution is claimed here.

## Post-closeout tail — monotonic guards and Store temporary-closure ownership

PR #2160 is **MERGED / CI GREEN**. It contracts the remaining
`brand-store -> store-operations-pos-print` direct import from `1 -> 0`. The timed
`temporaryCloseReason` codec (`buildAutoPauseReason` / `parseAutoPauseReason`) is now
implemented once under Brand/Store and exposed through `store/public-api.ts`; POS uses
that owner surface instead of owning the persistence format, while `StoreStatusService`
no longer imports POS internals. Existing encoded values and pause/resume semantics are
unchanged, with focused codec characterization coverage added.

The architecture scanner is hardened at the same time so legacy debt can only move
monotonically downward. A direct-import allowance whose observed count falls below its
baseline now fails as stale until the same PR lowers/removes the allowance. Likewise a
`legacyPublicCycleComponents` entry must exactly match the currently detected SCC
contexts and internal public edges; if the SCC shrinks or disappears, the old superset
baseline fails as stale. This prevents a previously removed direct edge or public-cycle
edge from being re-authorized later by an obsolete baseline. Initial CI #5078 exercised
that guard and exposed seven stale numeric allowances; the follow-up normalized those
allowances to the observed source counts, and final CI #5080 passed on PR head
`27b57f99` before squash merge `3a20c8c5`. No local scanner/lint/build/test run is
claimed. A POS timed-pause -> Uber status -> manual recovery smoke verification remains
to be recorded separately if/when exercised.

## Context map

| # | Context | Current paths |
|---:|---|---|
| 1 | architecture-foundation | `apps/api/src/common`, `libs/foundation` (`@shared/foundation`) |
| 2 | brand-store | `homepage`, `location`, `store` |
| 3 | catalog-pricing-offers | `application/menu`, `coupons`, `menu`, `promotions`, `libs/shared` |
| 4 | identity-customer-benefits | `admin`, `auth`, `benefits`, `loyalty`, `membership`, `phone-verification` |
| 5 | commerce-orders-fulfillment | `deliveries`, `orders`, `libs/order` |
| 6 | payments-clover | `clover`, `orchestration`, `payments` |
| 7 | store-operations-pos-print | `pos`, `tools/printer-server` |
| 8 | external-channels | `integrations` |
| 9 | messaging-notifications | `email`, `messaging`, `notifications`, `sms` |
| 10 | accounting-reporting-analytics | `accounting`, `analytics`, `reports` |
| 11 | web-pwa | `apps/web/src` |
| 12 | runtime-data-ci-ops | Prisma, data retention, CI, ops and architecture tooling |

## 2026-09-19 repository-wide final modularization tail audit

Status: **READ-ONLY AUDIT COMPLETE / NO MODULARIZATION-BLOCKING OWNER OR BOUNDARY TAIL IDENTIFIED**. No local scanner/lint/build/test command was run for this audit; the next reviewed PR CI remains authoritative for machine counts.

The historical direct-import limits below are monotonic scanner ceilings and migration evidence, not a requirement to manufacture a zero-count graph. The final audit classifies composition-only Nest module wiring, owner-local Prisma/infrastructure usage and narrow infrastructure utilities as legitimate seams when they do not leak another context's business implementation or create a public SCC.

The Admin Members `POST /admin/members/:userStableId/ban` path was explicitly reviewed rather than hidden. `AdminMembersController` intentionally exposes the membership-management surface to ADMIN/STAFF, `AdminMembersService.listMembers()` intentionally does not filter `User.role`, and `AccountSecurityAdministrationService.setAccountStatus()` therefore supports member-system testing with STAFF/ADMIN identities. This is a deliberate development/test compatibility overlap while the membership system still needs those accounts for end-to-end verification, not a current modularization owner-debt blocker. It is also not the canonical Staff-administration path: normal Staff role/status administration continues to use `StaffAdministrationService` and its last-active-admin invariant. Once STAFF/ADMIN identities are no longer required for membership-system testing, a separately reviewed cleanup should restrict Member list/status mutation to customer/member identities and retire this testing overlap.

The following are **not** reopened as generic modularization debt:

- `payments.pos-card-legacy.v1` and `payments.web-checkout-v1.v1` remain explicit provider/cutover compatibility gates. Their removal depends on Clover device/production-merchant/settlement evidence and must not be accelerated merely to empty the compatibility register.
- The retained Orders -> Loyalty/Membership concrete mutation seam is bounded to the existing cross-owner atomic transaction. Splitting it or exporting `Prisma.TransactionClient` would weaken ownership/atomicity; absent a separately justified unit-of-work redesign, it is accepted as a transaction-composition seam rather than a zero-count target.
- POS -> Auth/Uber module composition plus POS-owned Prisma persistence, and External Channels -> Runtime/Foundation/Auth infrastructure/composition dependencies, remain legal composition/infrastructure seams already classified by their Phase closeouts. They should not receive facades whose only purpose is reducing counters.
- The former Phase 2 Store-status reverse helper tail is already closed: `parseAutoPauseReason` / `buildAutoPauseReason` are Brand/Store-owned and POS consumes them through `store/public-api.ts`. The former closed-compat annotation loophole is also closed; production source contains no active `@compat brand-store.default-store-identity.v1`, and the remaining occurrence is the architecture test that rejects its return.

The separate Commerce/Fulfillment **L3 reliability** tail is now source-implemented as a direct replacement: Orders owns the durable `OpsEvent` dispatch journal/processor and ADMIN+MFA reconciliation, Messaging continues to provide the existing Email-first / SMS-fallback delivery-dispatch alert capability, Web/Admin is only the operator adapter, and provider execution still crosses only the existing Deliveries public port. The private `order.paid.verified` / `OrderEventsBus` path is deleted rather than retained behind a flag. Provably safe failures receive up to 3 automatic retries; UNKNOWN remains fail-closed. This changes no context direction, public SCC or owner assignment and therefore does not reopen the closed modularization program. Printer-agent workspace packaging, the no-op `NotificationProcessor`, and similar dead/ops hygiene are likewise not owner-boundary blockers.

Therefore the repository-wide modularization tail is **fully dispositioned and CLOSED at the source/architecture level** after Staff atomicity PR #2418 passed reviewed CI #5972 and merged as `1b18fb00`: no remaining historical baseline count should be reduced solely for numeric cleanliness. The Admin Members STAFF/ADMIN overlap is an explicitly deferred development/test compatibility cleanup, the two Payment compatibilities remain provider/cutover gates, and Uber Direct durable dispatch is separate reliability work with production verification still pending, not a modularization blocker.

## Historical monotonic direct-import baseline

Counts are scanner allowance ceilings captured during the migration. Absence from the table means
there is no recorded direct-import allowance for that source context; any new
pair fails CI. Later Phase entries below record monotonic contractions and supersede these ceilings as evidence of current source shape.

| Source | Remaining direct targets |
|---|---|
| architecture-foundation | none |
| brand-store | architecture-foundation 2; runtime-data-ci-ops 3 |
| catalog-pricing-offers | architecture-foundation 2; identity-customer-benefits 3; runtime-data-ci-ops 10 |
| identity-customer-benefits | architecture-foundation 13; brand-store 4; commerce-orders-fulfillment 1; external-channels 1; runtime-data-ci-ops 10; store-operations-pos-print 4 |
| commerce-orders-fulfillment | architecture-foundation 8; identity-customer-benefits 2; runtime-data-ci-ops 10 |
| payments-clover | architecture-foundation 15; commerce-orders-fulfillment 1; identity-customer-benefits 13; messaging-notifications 2; runtime-data-ci-ops 8; store-operations-pos-print 2 |
| store-operations-pos-print | external-channels 1; identity-customer-benefits 1; runtime-data-ci-ops 5 |
| external-channels | architecture-foundation 2; identity-customer-benefits 2; runtime-data-ci-ops 23 |
| messaging-notifications | architecture-foundation 3; runtime-data-ci-ops 6 |
| accounting-reporting-analytics | architecture-foundation 1; external-channels 1; identity-customer-benefits 2; runtime-data-ci-ops 6 |
| web-pwa | none; cross-context shared contracts use registered public aliases |
| runtime-data-ci-ops | none; registered composition-root wiring is excluded |

2026-09-11 Phase 9 Slice 1 is **MERGED / CI GREEN** through PR #2281 / squash merge `f529f470`; final head `974066e7` passed CI #5494 after an initial Prettier-only lint follow-up. The three Accounting/Reports/Analytics controllers now consume `SessionAuthGuard`, `RolesGuard` and `Roles` through `auth/public-api.ts`, while the two existing `AuthModule` Nest composition seams remain direct. The monotonic baseline contracts `accounting-reporting-analytics -> identity-customer-benefits` **11 -> 2**, reducing total Accounting/Reporting/Analytics direct debt **25 -> 16**. Focused architecture coverage prevents the implementation-path imports from returning. No route, role, Prisma/schema/migration, accounting/revenue, Uber reporting, Web Clover, dependency or compatibility behavior changes; public SCC remains empty.

2026-09-11 Phase 9 Slice 2 is **MERGED / CI GREEN** through PR #2283 / squash merge `b35890d8`; final head `d6518ba1` passed CI #5500 after test-only lint/Prettier follow-ups. It adds characterization for ledger CRUD/idempotency/optimistic locking/audit evidence, month close/reopen/year-lock semantics, atomic Expense split writes, current provisional `Order.totalCents` revenue accrual, Accounting Uber financial-report request windows, and Reports KPI/timezone behavior. Production imports and ownership are unchanged, so `accounting-reporting-analytics` remains Foundation **3**, Orders **1**, External **1**, Identity **2**, Runtime **9**, total **16**, with `legacyPublicCycleComponents=[]`.

2026-09-11 Phase 9 Slice 3 is **MERGED / CI GREEN** through PR #2284 / squash merge `0f37901a`; final head `4399c841` passed CI #5503 after one Prettier-only follow-up. Ledger create/update/soft-delete and month close/reopen/year lock now execute period-state checks, financial mutation and audit evidence inside one Accounting-owned Prisma `Serializable` transaction with three-attempt `P2034` retry. Manual/inbox Expense split writes use the same atomic-write policy; split CREATE evidence is recorded atomically, inbox replacement records DELETE evidence for replaced ledger rows, and inbox status is re-read in-transaction to prevent concurrent double-confirmation. Architecture remained Foundation **3**, Orders **1**, External **1**, Identity **2**, Runtime **9**, total **16**, with `legacyPublicCycleComponents=[]`.

2026-09-11 Phase 9 Slice 4 is **MERGED / CI GREEN** through PR #2285 / squash merge `e3a3785d`; final head `f38d8feb` passed CI #5507 across API and Web. Reporting owns a projection-ready `REPORTING_ORDER_FACTS_QUERY` outbound contract, while Orders owns the public `ORDER_REPORTING_FACTS_READER` that executes existing Order/OrderItem persistence queries and decodes immutable `componentsJson` before facts cross the boundary. `ReportsModule` is a registered composition root for Orders -> Reporting wiring. Homepage depends on its own `HOMEPAGE_SALES_RANKING_QUERY`; `HomepageContentModule` is the registered composition root that adapts Reporting top-items into that Brand-owned port. The baseline contracts Accounting/Reporting/Analytics -> Orders **1 -> 0**, Accounting/Reporting/Analytics -> Runtime **9 -> 7**, Brand -> Accounting/Reporting/Analytics **2 -> 0**, and Brand -> Runtime **4 -> 3**; Accounting/Reporting/Analytics direct debt is Foundation **3**, External **1**, Identity **2**, Runtime **7**, total **13**. CI #5505 correctly rejected the initial Brand -> Reporting SCC, CI #5506 confirmed its removal and then stopped on Prettier-only lint, and final CI #5507 passed with `legacyPublicCycleComponents=[]`. No Reporting projection tables, migration/backfill/replay worker, Revenue Posting semantics, Uber provider behavior or Web Clover code was introduced.

2026-09-12 Phase 9 Slice 5 planning is **DESIGN-ONLY / NO GRAPH CHANGE**. The approved direction inserts a minimal double-entry Accounting core before canonical Revenue Posting, treats provider financial documents as settlement/reconciliation evidence rather than flat income rows, and now defines historical **Clover/Uber Eats/Fantuan** financial coverage from **2026-06-01**. The future Accounting Inbox reuses the existing nightly Gmail ingestion boundary with UI-managed trusted senders and content-based document classification; the existing Accounting Web manual file-upload window must become a first-class `MANUAL_UPLOAD` acquisition path through that same Inbox/parser/review pipeline, while provider API remains the third acquisition source. No source, Prisma schema/migration, scanner allowance, dependency manifest, provider-wire behavior or baseline count changes in this planning batch; Accounting/Reporting/Analytics remains Foundation **3**, External **1**, Identity **2**, Runtime **7**, total **13**, with `legacyPublicCycleComponents=[]`.

2026-09-12 Phase 9 Slice 5A readiness is **COMPLETE** and Slice 5B is **MERGED / CI GREEN / DEPLOYED / RUNTIME SMOKE VERIFIED** through PR #2288, final head `c2d01b89`, CI #5516 and squash merge `cbe8ad6f`. The target remains an Accounting-owned double-entry Journal + Chart-of-Accounts core only; current Expense/Revenue/statement/report/Web paths remain on their existing contracts until later slices. Current Accounting-owned records are explicitly disposable and require no historical compatibility/backfill solely for preservation. Clover evidence refines 5C: monthly processing statements are settlement evidence, while the daily Closeout arrives as structured **email body** content and is batch-control reconciliation evidence only. The merged journal introduced no new cross-context import, scanner allowance or public cycle, so Accounting/Reporting/Analytics remains Foundation **3**, External **1**, Identity **2**, Runtime **7**, total **13**. The 5B migration was applied on the running VM on 2026-09-12 and the user reported normal deployment/runtime smoke behavior.

2026-09-12 Phase 9 Slice 5C readiness is **MERGED / NO GRAPH CHANGE** through PR #2290 / squash merge `7419c982`; 5C-A Unified Inbox Core is **MERGED / CI GREEN** through PR #2291 / squash merge `913e88aa` after CI #5526; 5C-B Acquisition Cutover is **MERGED / CI GREEN** through PR #2292 / squash merge `6f1093a8` after CI #5530; and 5C-C Provider Financial Parsing + History is **MERGED / CI GREEN** through PR #2293 / squash merge `ce399a37`, final head `592bfdc0`, after CI #5535. 5C-A adds Accounting-owned SourceArtifact / ParseRun / InboxItem / TrustedSender / ProviderFinancialDocument / ProviderFinancialLine / provider-coverage persistence and an additive migration without Journal posting. 5C-B cuts Gmail body/attachments and current Web manual upload onto Unified Inbox, directly contracts the old receipt-upload route under explicit user authorization, and CI confirms the monotonic baseline Runtime **6**, Foundation **2**, External **1**, Identity **2**, total **11**, with no public SCC. 5C-C adds deterministic observed-format parsers for Clover Closeout/monthly, Uber monthly and Fantuan monthly evidence; provider financial evidence before **2026-06-01** is recognized but not materialized; Uber READY artifacts are accessed only through the existing External Channels public reporting boundary; Accounting automation requests only `PAYMENT_DETAILS_REPORT` + `FINANCE_SUMMARY_REPORT`; `ORDERS_AND_ITEMS_REPORT` is excluded; and unknown Uber API CSV schemas remain provider-parser-pending instead of being guessed. No new Prisma/schema/migration or dependency direction was introduced by 5C-C. The existing UI `accountingStartDate` is the future POS/Web financial-statistics lower bound and will be set to **2026-06-01**. The 5C-A migration has not yet been applied on the running VM.

2026-09-12 Phase 9 Slice 5D readiness is **COMPLETE / NO GRAPH CHANGE** at `origin/dev@8cacdf60`. The audit confirms the 5B Journal writer is ready for canonical fact consumption, but the provisional `Order.totalCents` revenue path cannot be promoted as-is. Production read-only evidence shows historical PaymentTransaction coverage is absent, Store Balance top-up/use is real, most existing OrderAmendment rows lack authoritative occurrence timestamps, and WECHAT_ALIPAY required an explicit Accounting funds-flow policy. The later user decision resolves WECHAT_ALIPAY as Cash and also fixes Points as Sales Discount, Daily Special as nominal Revenue + separate discount, Store Balance as liability, and undated legacy refunds/amendments as 5D-C exceptions. The current merged Accounting / Reporting / Analytics baseline remains Foundation **2**, External **1**, Identity **2**, Runtime **6**, total **11**, with `legacyPublicCycleComponents=[]`.

2026-09-12 Phase 9 Slice 5D-A is **MERGED / CI GREEN / NO GRAPH CHANGE** through PR #2296 / squash merge `7f35878f`; final head `ffa49ad6` passed CI #5545. Orders, Loyalty and Payments each expose a dedicated token-backed V1 financial-fact reader/module through their owner public surface; Accounting is deliberately not wired as a consumer in this slice, so no new cross-context runtime direction or scanner allowance is added. Orders additionally freezes new paid Orders into a separate append-only `orders.financial / order.financial_sale.v1` `OpsEvent` in the same create/finalize transaction across Web/POS, Unified Payment and external ingestion. This is intentionally distinct from `order.accepted`; the reader prefers immutable SALE snapshots and marks pre-cutover rows `LEGACY_CURRENT_ORDER`, preventing a later mutable row from rewriting the new immutable source fact. Loyalty exposes stable Store Balance principal movements without leaking ledger UUIDs; Payments exposes only final SUCCEEDED money facts and stable checkout business identity, not concrete Clover infrastructure or PaymentTransaction DB identity. No Prisma/schema/migration, Journal posting, package dependency or production Web Clover behavior changes are included. CI #5545 confirmed the merged Accounting / Reporting / Analytics baseline remains Foundation **2**, External **1**, Identity **2**, Runtime **6**, total **11**, with `legacyPublicCycleComponents=[]`.

2026-09-12 Phase 9 Slice 5D-B0 is **MERGED / CI GREEN / NO GRAPH CHANGE** through PR #2297 / squash merge `124cd76c`; final head `064e098e` passed CI #5549. After the user removed finance-affecting test Orders/accounts, the read-only historical baseline is 1215 financial-status Orders since 2026-06-01 Toronto midnight, zero Store Balance opening/post-cutover principal activity, zero PaymentTransaction and zero AccountingJournalEntry. Five mutable legacy SALE rows are owner-classified as non-replayable from current Order state (3 `SWAP_ITEM`, 2 ordinary `RETENDER`); reversal-only records remain separate 5D-C facts and do not erase the original SALE. Of 129 legacy Daily-Special Orders lacking immutable nominal-price evidence, the final conservative owner-side current-Catalog policy classifies **28** as `CATALOG_STABLE_MATCH` and **101** as `MANUAL_OVERRIDE`: 62 old generic Roujiamo rows fail identity compatibility, while all 39 Liangpi rows are held for manual reconstruction because compatible historical evidence reaches an $8.99 effective Daily-Special base while current Catalog base is $7.49, disproving price stability for that identity/history. This does not add a new Orders -> Catalog direction: Orders already consumes `CATALOG_ORDER_FACTS_READER`, and B0 reuses that public capability while preventing Accounting from reading Catalog or OrderAmendment internals. CI #5549 confirms Accounting remains Foundation **2**, External **1**, Identity **2**, Runtime **6**, total **11**, with public SCC empty. The same slice corrects `accountingStartDate` to Store-local midnight and adds a canonical-posting fail-closed requirement when the setting is absent. No Prisma/schema/migration, Journal posting, compatibility path or provider behavior is added.

2026-09-12 Phase 9 Slice 5D-B1A is **DEPLOYED / DB VERIFIED / NO GRAPH CHANGE** through PR #2299 / squash merge `d74b2563`; final head `b4a1e0ec` passed CI #5553. The additive migration completed in production at `2026-09-13T01:54:09Z`; post-deploy read-only verification shows 21 Accounting accounts, the new active CAD `account_store_balance_liability` classified LIABILITY, and 0 Journal entries/lines. No opening Journal or historical backfill was created. CI #5553 confirmed Accounting remains Foundation **2**, External **1**, Identity **2**, Runtime **6**, total **11**, public SCC empty.

2026-09-12 Phase 9 Slice 5D-B1B is **MERGED / CI GREEN** through PR #2304 / squash merge `5b35517a`; final head `551cd772` passed CI #5571. Accounting adds an internal canonical SALE mapper/posting service that consumes replay-qualified Orders facts plus Loyalty Store Balance principal only through owner `public-api` modules, then delegates the atomic Journal/Audit mutation to the existing Accounting Journal writer. The deterministic mapping covers Cash/WECHAT_ALIPAY, Clover pending, Uber pending, Store Balance liability, Sales Discounts, gross Sales Revenue, delivery, HST and card surcharge; preview blocks post-sale mutations, manual/unresolved historical pricing, pre-start-date facts and invariant failures. Payments is intentionally not required because historical PaymentTransaction coverage remains zero; it stays a later parity/reversal source. B1B introduces an intentional public Accounting -> Orders capability edge and reuses the existing public Identity/Loyalty direction, but does not increase direct-import debt; CI #5571 confirmed the direct baseline remains Foundation **2**, External **1**, Identity **2**, Runtime **6**, total **11**, with public SCC empty. The service is not exposed via AccountingController/scheduler, so no second active revenue write path, dual-write or historical backfill is activated in this slice.

2026-09-12 Phase 9 Slice 5D-B2A is **MERGED / CI GREEN** through PR #2306 / squash merge `d769672e`; final head `2926b964` passed CI #5576. Production read-only evidence confirms `accountingStartDate=2026-06-01`, Store timezone `America/Toronto`, and both Journal and provisional AccountingTransaction counts still zero before replay. B2A adds a read-only Accounting-owned canonical SALE range preview plus a narrow Loyalty batch fact read on the existing public boundary; it reuses the B1B policy, reports deterministic plan hash, READY/BLOCKED exception inventory, amount parity and aggregate Journal debit/credit parity, and writes no Journal rows. The coexistence with `/accounting/automation/order-accrual` is registered as `accounting.order-revenue-journal-cutover.v1` shadow-only compatibility; the old path remains the sole Revenue writer until B2B first retires/demotes it and only then enables canonical replay. CI #5576 confirmed no new context direction or direct-import allowance, with baseline Foundation **2**, External **1**, Identity **2**, Runtime **6**, total **11**, public SCC empty.

2026-09-13 Phase 9 Slice 5D-B2A.1 is **MERGED / CI GREEN / DEPLOYED / NO GRAPH CHANGE** through PR #2311 / squash merge `a68a9e53`; final head `e7a0c744` passed CI #5587. The user-approved historical Daily-Special reconstruction is constrained to an explicit manifest of the 105 reviewed `MANUAL_OVERRIDE` Order stable IDs and remains entirely inside the existing Orders-owned replay qualification boundary. Approved legacy rows use `MAX(current Catalog base, persisted historical effective base)` only to reconstruct nominal Daily-Special Revenue/discount presentation; historical option value remains persisted Order evidence, unlisted legacy rows keep the existing conservative `MANUAL_OVERRIDE` behavior, and immutable future SALE facts cannot enter this branch. No new public edge, direct import, scanner allowance, Prisma/schema/migration, Journal write or provider behavior is introduced; the recorded baseline therefore remains Foundation **2**, External **1**, Identity **2**, Runtime **6**, total **11**, public SCC empty. Production logs show two post-deploy preview HTTP 200 responses, and the user subsequently confirmed the actual preview body was reviewed and the expected 1210 replay-ready records parsed correctly. The exact fresh plan hash and runtime parity/balance/block checks remain enforced by B2B before the first write.

2026-09-13 Phase 9 Slice 5D-B2B is **PRODUCTION VERIFIED / CLOSED / NO GRAPH CHANGE** through PR #2313 / squash merge `72395609`; final head `6171aa96` passed CI #5595. The provisional `automation/order-accrual` controller route and `autoAccrueOrderRevenue()` implementation are removed before canonical Journal write authority is exposed. The Accounting-owned replay POST reuses the existing B2A owner-public reads and B1B Journal writer; it requires an exact recomputed `planHash`, zero amount delta, balanced draft totals, only `POST_SALE_MUTATION` blocks, exact stable-ID acknowledgement of that blocked inventory, and zero retired `AUTO_ORDER*` AccountingTransaction rows before writing. Production deployment verified the old endpoint unavailable (404) and the new replay route mapped; a fresh preview for `2026-06-01` through `2026-09-13` exclusive at `4750_Yonge_Street` produced plan `83f242b85a4f85b48db9803454ba9a14b023c2f574678806e03e71983c86c258`, 1215 candidates / 1210 READY / five mutation-only blocks, zero parity delta, and balanced debit/credit of 2,163,201 cents. The first replay persisted exactly 1210 Journal entries / 3864 lines / 1210 audit rows with 1210 distinct source facts and idempotency keys, zero mutation SALE rows and zero retired `AUTO_ORDER*` rows; a second same-plan replay left every count and amount unchanged, proving idempotent convergence. `accounting.order-revenue-journal-cutover.v1` is therefore closed. CI #5595 and production verification introduced no new cross-context import, public edge, scanner allowance, Prisma/schema/migration, provider behavior or dependency debt; the baseline remains Foundation **2**, External **1**, Identity **2**, Runtime **6**, total **11**, public SCC empty. The five blocked mutations remain 5D-C scope.

2026-09-13 Phase 9 Slice 5D-C0A is **MERGED / CI GREEN / NO GRAPH CHANGE** through PR #2317 / squash merge `311c2979`; final head `8bf87768` passed CI #5607. Orders now owns an immutable post-sale financial-fact capability (`order.financial_adjustment.v1` / `order.financial_reversal.v1`) backed only by Orders-owned `OpsEvent` persistence and exported through `ORDER_FINANCIAL_CHANGE_FACTS_READER`. The fact contract separates whole-Order tender before/after from the current change settlement declaration, requires a settlement method for non-zero tender movements, freezes redeemed-value returns separately, and preserves provider occurrence evidence for confirmed external cancellation. Accounting is deliberately not wired as a consumer in C0A, and Payments/Loyalty remain authoritative for actual money/liability reversal corroboration. CI introduced no new context direction, direct-import allowance, public SCC, Prisma/schema/migration, package dependency, Journal write or provider execution change; the baseline remains Foundation **2**, External **1**, Identity **2**, Runtime **6**, total **11**, public SCC empty. Deployment/runtime verification is not claimed by this source merge.

2026-09-13 Phase 9 Slice 5D-C0B is **MERGED / CI GREEN / NO GRAPH CHANGE** through PR #2319 / squash merge `fde52e19`; final head `701c18c0` passed CI #5612. Payments adds an owner-public `PAYMENT_REVERSAL_FINANCIAL_FACTS_READER` for managed REFUND/VOID transactions plus provider-webhook reversal deltas, while the existing `PAYMENT_FINANCIAL_FACTS_READER` resolves reversal Order/Store identity through the original provider-correlated SALE and its checkout binding. The durable `payment.reverse-sync.completed` event freezes provider occurrence time plus previous/current cumulative refunded base amount and per-event delta. Managed/webhook duplicate money facts, zero-delta webhook observations and over-refund aggregates fail closed or are suppressed. Accounting is deliberately not wired as a C0B consumer, and no new public direction, direct import, scanner allowance, Prisma/schema/migration, Journal write, Clover execution behavior or Web Ecommerce cutover is introduced; the recorded baseline remains Foundation **2**, External **1**, Identity **2**, Runtime **6**, total **11**, public SCC empty.

2026-09-14 Phase 9 Slice 5D-C1 readiness audit is **READY FOR FORWARD SHADOW PREVIEW / NOT READY FOR HISTORICAL RECONSTRUCTION OR JOURNAL POSTING**. The approved C1-A shape reuses the existing public Accounting -> Orders / Identity-Loyalty directions and intentionally adds Accounting consumption of the already-public Payments financial-fact capability; no owner internals, Prisma delegates or new persistence ownership are allowed. Matching is stable-ID based (`changeFactStableId` + `orderStableId` + owner fact IDs), CARD/Store Balance settlement requires Payments/Loyalty corroboration respectively, ambiguous provider matches remain blocked, webhook `null` refund components stay unknown, and the eight legacy exceptions remain outside automatic READY reconstruction. No Prisma/schema/migration is required by the audited design.

2026-09-14 Phase 9 Slice 5D-C1-A is **MERGED / CI GREEN / DEPLOYED / CASH + STORE BALANCE PRODUCTION VERIFIED / CARD STRICT-EVIDENCE NEGATIVE VERIFIED / PUBLIC EDGE ADDED WITH DIRECT BASELINE PRESERVED** through PR #2320 / squash merge `df70660f`; final head `91cde8c5` passed PR CI #5619 and merge SHA `df70660f` passed post-merge CI #5620. AccountingModule composes `OrderFinancialChangeFactsModule` and `PaymentFinancialFactsModule` through owner public surfaces, establishing the intended one-way Accounting -> Payments read capability alongside the existing Accounting -> Orders/Loyalty reads. Orders change facts add only a stable-Order batch operation on the already-existing public Accounting -> Orders edge, allowing whole-Order evidence matching before range filtering; Payments adds analogous stable-Order batch reads. `PaymentFinancialFactsModule` continues to alias the existing `PAYMENT_TRANSACTION_REPOSITORY` through `PaymentsModule`; CI #5614 proved that the attempted direct Prisma-backed composition would increase `payments-clover -> runtime-data-ci-ops` debt from **8 -> 9**, so that edge was removed rather than changing the baseline or adding an allowance. CI #5617 showed that the pre-existing Payments guard conflated any joint Orders+Payments import with execution orchestration. With explicit operator authorization, that guard is narrowed so execution coordination is still confined to Unified Payment orchestration, while the fixed Accounting canonical-change consumer set may combine only `orders/public-api` + `payments/public-api` for read-only financial reconciliation/shadow matching; the guard separately rejects owner deep imports, Payments execution/provider services and `createJournalEntry()` calls in that role. Production CASH verification confirmed missing-SALE-anchor blocking, subsequent READY adjustment/reversal drafting, zero unmatched Payment reversals, debit/credit parity **2936 / 2936 cents**, and deterministic plan/draft hashes across repeated reads. Production Accounting code still has no Orders/Payments/Loyalty deep import, and source review finds no reverse Payments/Orders/Loyalty -> Accounting import. The recorded direct-import baseline remains Foundation **2**, External **1**, Identity **2**, Runtime **6**, total **11**, and public SCC remains empty. No Prisma/schema/migration, canonical-change Journal write, provider execution path, Web Ecommerce cutover or compatibility allowance is added.

2026-09-14 Phase 9 Store Balance SALE tender semantic hotfix is **MERGED / CI GREEN / DEPLOYED / PRODUCTION VERIFIED / NO GRAPH CHANGE** through PR #2322 / squash merge `3697e6e1`; feature head `b40970a2` passed PR CI #5625 and merge SHA `3697e6e1` passed post-merge CI #5626. Production verification exposed that the Accounting B1B SALE mapper interpreted owner `paymentTotalCents` as external tender even though the Orders public contract defines it as the payable total after card surcharge. The fix remains wholly inside Accounting: it validates `paymentTotalCents = orderTotalCents + cardSurchargeCents` and derives external tender by subtracting Loyalty-owned Store Balance redeemed principal. Post-deploy verification confirmed the `$8.46` Store Balance SALE created a balanced **946 / 946** canonical SALE Journal and its full-refund C1-A candidate became READY; the combined CASH/Store-Balance shadow reached **3 READY / 0 BLOCKED / 3882 = 3882**. Orders/Loyalty public contracts, persistence ownership, Accounting -> Orders/Loyalty/Payments directions, scanner allowances and compatibility state are unchanged. The direct-import baseline remains Foundation **2**, External **1**, Identity **2**, Runtime **6**, total **11**, with public SCC empty.

2026-09-14 Phase 9 C1-A.1 governance remains the existing `payments.pos-card-legacy.v1` compatibility with **NO GRAPH CHANGE**. Accounting does not gain a POS rollout-policy dependency: legacy in-store CARD changes use explicitly labeled Orders-declared settlement authority, while Unified/Terminal CARD stays strict on Payments reversal evidence. Historical interpretation comes from immutable owner facts rather than a wall-clock cutover. The separate Phase 9 closeout data-hygiene gate still requires deliberately created test fixtures and their dependent Order/change/payment/Loyalty/Accounting artifacts to be inventoried and resolved before the authoritative final closeout snapshot.

2026-09-14 Phase 9 C1-A.1 implementation is **MERGED / CI GREEN / DEPLOYED / PRODUCTION VERIFIED / NO GRAPH CHANGE** through PR #2325 / final head `7e4ae569d153f95172535d1122a5ef7d010d6f5f` / squash merge `35ece2dafbbcd0e49685821690208544d4d1aee8`; PR CI #5635 and post-merge CI #5636 passed. Orders added only the additive immutable `posCardExecutionEvidence` owner-fact field, and Accounting continues to consume the same Orders + Payments public financial-fact surfaces introduced in C1-A. Production verification returned **4 READY / 0 BLOCKED / 4728 = 4728**, preserved the prior CASH + Store Balance **3882 = 3882**, and made the existing legacy CARD full reversal READY at **846 = 846** under `LEGACY_ORDER_DECLARED` with zero Payment facts/reversal facts; read-only DB checks also remained zero for Payment checkout/transaction evidence and canonical-change Journals/Audits. No Accounting -> POS edge, direct-import allowance, SCC/cycle, Prisma/schema/migration or rollout-config dependency was introduced. The recorded baseline remains Foundation **2**, External **1**, Identity **2**, Runtime **6**, total **11**, public SCC empty.

2026-09-14 Phase 9 Slice 5D-C1-B is **MERGED / CI GREEN / DEPLOYED / PRODUCTION VERIFIED / NO GRAPH CHANGE** through PR #2327 / final head `dda6e7453144802c1472dd9995cd3a7183c4f1f0` / squash merge `939d71255b232a11a4b580ac76275c267f6a2bdc`; PR CI #5642 and post-merge CI #5643 passed. The C1-A shadow reader remains the sole Orders/Payments/Loyalty reconciliation reader; the Accounting-local execution service consumes only that Accounting-owned shadow plan and the existing Accounting Journal service, so it creates no additional owner-context import direction. Production verification used fresh plan hash `91a1e9220a7d6324df86a2aaf80e9f58b492ddedecb739888c7a79e2e0f6b3ca`, posted exactly four canonical change Journals / thirteen lines / four CREATE Audits at balanced **4728 / 4728** cents, and an identical retry left all counts unchanged. The legacy CARD reversal retained explicit `LEGACY_ORDER_DECLARED` authority without fabricated Payments reversal evidence. No owner deep import, scanner allowance, reverse dependency, Prisma/schema/migration, legacy `AccountingTransaction` writer or production Web Clover path was added. CI confirmed the recorded baseline remains Foundation **2**, External **1**, Identity **2**, Runtime **6**, total **11**, with public SCC empty.

2026-09-14 Phase 9 Slice 5D-C2 is **PRODUCTION VERIFIED / PASS WITH ONE DOCUMENTED UNRESOLVED EXCEPTION / NO GRAPH CHANGE**. The operator approved an exact-stable-ID one-time historical reconstruction for seven of the eight pre-C0A exceptions: five post-sale mutation Orders were materialized as Orders-owned netted-final-state `order.financial_sale.v1` OpsEvents, and two historical CARD full refunds were materialized as Orders-owned `order.financial_reversal.v1` OpsEvents after direct Clover Dashboard verification. The repair did not add a runtime fallback, Payments evidence, owner deep import, public-contract edge, scanner allowance, Prisma/schema/migration, compatibility token or direct Accounting ledger write; Accounting consumed the seven facts only through the existing guarded SALE/change replay boundaries. Production replay added exactly **7 JournalEntries / 21 JournalLines / 7 CREATE Audits** on top of the C1-B baseline, ending at **1228 / 3921 / 1228** with legacy `AUTO_ORDER* = 0`. `cmsrqiohb000ons01ppnwp759` remains deliberately unresolved because its Orders FULL_REFUND state could not be corroborated by a Clover refund, and no reversal OpsEvent/Journal was created. Dependency ownership therefore remains unchanged: Foundation **2**, External **1**, Identity **2**, Runtime **6**, total **11**, public SCC empty.

2026-09-14 Phase 9 Slice 6A is **SOURCE IMPLEMENTED / LOCAL REVIEW GATE / NO GRAPH DIRECTION CHANGE EXPECTED** on branch `phase9-slice6a-uber-reporting-identity-boundary`. The existing Accounting -> External Channels reporting edge is narrowed: `UberEatsReportingPort.requestFinancialReports()` no longer exposes provider `storeUuids`; Accounting submits only business dates and allowed report types, while External Channels owns `eats.report` entitlement evaluation plus provisioned `UberStoreMapping` resolution and provider UUID normalization. Accounting no longer reads `UBER_EATS_APP_SCOPES` or queries `uberStoreMapping` for reporting. The implementation reuses the existing Uber mapping repository/config providers and adds no new cross-context import direction, Prisma adapter, scanner allowance, schema/migration, compatibility path or package dependency. The recorded direct baseline is therefore intended to remain Foundation **2**, External **1**, Identity **2**, Runtime **6**, total **11**, public SCC empty; authoritative scanner/CI confirmation is deferred until user review and GitHub Actions.

2026-09-15 Phase 9 Accounting Inbox structured expense CSV fallback is **MERGED / CI GREEN / NO GRAPH CHANGE** through PR #2341 / final head `156854c4` / squash merge `9c358405`; PR CI #5692 and post-merge CI #5693 passed. This revises the old 5C-B transport assumption without moving ownership: manual/Gmail CSV still enters the Accounting-owned Inbox and first evaluates the existing Accounting provider-recognition capability; only an unambiguous provider miss can enter an Accounting-local structured-expense parser. Provider API CSV stays on the existing provider-owned financial path. The new parser is generic (semantic date/amount headers plus stronger bill/invoice evidence or vendor/description context), fail-closed for ambiguous/bare/malformed schemas, and introduces no cross-context import. Single-row structured expense evidence may seed the existing editable Expense suggestion; multi-row or partially invalid CSV is recorded only as a batch candidate and is blocked from the one-artifact/one-expense confirmation path. No schema/migration, package dependency, scanner allowance, public edge, Journal authority or financial-posting policy changes; the recorded direct-import baseline remains Foundation **2**, External **1**, Identity **2**, Runtime **6**, total **11**, public SCC empty.

2026-09-15 Phase 9 Accounting image OCR + post-confirm binary retention is **MERGED / CI GREEN / DEPLOYED / FUNCTIONAL VERIFICATION IN PROGRESS** through PR #2342 / final head `f90f513a` / squash merge `a4c418f2`; PR CI #5699 passed, and the follow-up user-generated migration `20260916002149_add_accounting_image_binary_retention` reached `dev@3608c2e2` with CI #5701 green before production deployment. OCR and retention stay wholly inside Accounting: original bytes are the OCR source; post-confirm compression is a separately audited image-storage lifecycle using the existing Sharp/Tesseract stack. A dedicated TransactionClient-only retention writer owns the Accounting-internal persistence while orchestration reaches it through the existing `AccountingOperationsService`; there is no new context import or `PrismaService` boundary. Confirmed image Expense attachments use an Accounting-local stable artifact-content URL so derivative acceptance never rewrites posted Transaction/Expense URLs. The persistent image-optimization queue covers `ORIGINAL_PRESENT`, `CANDIDATE_READY`, and `PURGE_PENDING`, allowing browser refresh/reopen recovery without adding another ownership edge. Initial PR CI correctly rejected a third direct Accounting -> architecture-foundation upload-path import; the final fix centralized acquisition/controller/retention storage-root access behind one Accounting-local adapter and tightened that pair from **2 -> 1** rather than widening the scanner allowance. CI confirmed Foundation **1**, External **1**, Identity **2**, Runtime **6**, total **10**, public SCC empty. The migration is now merged and deployed; no package dependency, external/public context edge, provider wire contract, Journal authority or posting-policy change was introduced.

2026-09-15 Phase 9 manual Upload library + evidence-state permissions is **MERGED / CI GREEN / NO GRAPH CHANGE** through PR #2344 / final head `00cf803a` / squash merge `376cea32`; PR CI #5709 passed. The change stays wholly inside the existing Accounting/Web boundary: an Accounting-owned `Prisma.TransactionClient` writer owns permanent deletion of eligible never-confirmed `MANUAL_UPLOAD` evidence, while the existing acquisition service owns physical-file cleanup. The Upload library is an Accounting-local read model; Gmail/Provider API evidence and confirmed/provider-financial/transaction-backed evidence remain protected. Manual Duplicate registration stores `storedUrl = null` atomically in the existing SourceArtifact registration transaction and acquisition removes the just-written redundant raw file, so duplicate metadata remains visible without a second retained binary. CI confirmed no new public/deep context import, Prisma schema/migration, package dependency, scanner allowance, Journal authority or posting-policy change; the direct-import baseline remains Foundation **1**, External **1**, Identity **2**, Runtime **6**, total **10**, public SCC empty.

2026-09-15 Phase 9 Accounting manual-upload filename encoding hardening is **MERGED / CI GREEN / DEPLOYED / PRODUCTION VERIFIED / NO GRAPH CHANGE** through PR #2346 / final head `ff804de9` / squash merge `03efff85`; PR CI #5717 passed. Production read-only evidence had confirmed browser UTF-8 filenames were being interpreted as Latin-1 at the Multer multipart `originalname` boundary (`三秦肉夹馍` -> `ä¸ç§¦èå¤¹é¦`). The fix remains Accounting-local: new `MANUAL_UPLOAD` filenames are conservatively normalized before detection/persistence/parser recognition; historical mojibake test rows are intentionally outside compatibility scope and may be permanently deleted through the Upload library; Gmail/Provider API filename semantics are unchanged. On 2026-09-16 America/Toronto, the operator confirmed the production filename defect is resolved for new manual uploads. No schema/migration, package dependency, context edge, scanner allowance, Journal authority or posting-policy change was introduced; CI preserved Foundation **1**, External **1**, Identity **2**, Runtime **6**, total **10**, public SCC empty.

2026-09-16 Phase 9 Accounting Inbox receipt-image OCR quality hardening is **MERGED / CI GREEN / DEPLOYED / QUALITY GATE VERIFIED / OCR RECOGNITION STILL FAILED / NO GRAPH CHANGE** through PR #2349 / final head `eb784b99` / squash merge `74c484fa`; CI #5729 passed. The change remains wholly inside Accounting and reuses the existing Accounting receipt-image policy plus Sharp/Tesseract infrastructure: original SourceArtifact bytes remain the only OCR source; a bounded analysis preview drives generic geometry-based receipt-width estimation and adaptive ordered vertical segmentation so longer receipts add OCR regions rather than being globally squeezed, while receipt contrast/binary strategies, deterministic quality scoring and a bounded mixed-language fallback replace the prior single `eng+chi_sim / --psm 6` pass. Segmented text is merged in source order with deterministic overlap-line deduplication, and receipts beyond the explicit region budget fail closed instead of silently reducing text scale. Production re-upload confirmed that the new quality gate rejects low-quality OCR instead of materializing garbage, but the same real receipt still failed recognition at score `265`. No image-retention writer/query, PDF/CSV/provider parser, public API, Prisma schema/migration, package/system dependency, scanner allowance, Journal authority or financial-posting policy changes were introduced. CI confirmed Foundation **1**, External **1**, Identity **2**, Runtime **6**, total **10**, public SCC empty.

2026-09-16 Phase 9 Accounting Inbox real-receipt OCR follow-up is **SOURCE IMPLEMENTED / REMOTE SUBMISSION IN PROGRESS / NO GRAPH CHANGE EXPECTED** on `phase9-accounting-image-ocr-real-receipt`. The same Accounting-local OCR boundary now uses its <=1000px grayscale analysis preview to accept only a high-confidence light-paper horizontal band before vertical segmentation, with full-width fallback when uncertain; the second English receipt strategy uses a bounded sliding-window local-mean threshold instead of a fixed global threshold. OCR normalization/scoring and parse-error diagnostics are tightened without widening any runtime ownership edge. No image-retention lifecycle, PDF/CSV/provider parser, Prisma schema/migration, package/system dependency, public API, scanner allowance, Journal authority or financial-posting policy change is introduced. Expected direct-import baseline remains Foundation **1**, External **1**, Identity **2**, Runtime **6**, total **10**, public SCC empty pending GitHub Actions after user review.

2026-09-16 Phase 9 Expense Inbox ownership + CAD functional-currency hardening is **MERGED / PR CI GREEN / POST-MERGE CI GREEN / NO GRAPH CHANGE** through PR #2359 / final head `db0fe8ba` / squash merge `f77b66d0`; PR CI #5763 and post-merge CI #5764 passed. Accounting Inbox now owns evidence-backed Expense review through category aggregation and confirmation; the temporary product-item calculator moves from Expenses into the Inbox UI and still persists only category totals. Expense confirmation collapses the former two-step pending-materialization path into one Accounting-owned Serializable transaction that creates the confirmed ExpenseDocument, CAD category Transactions/Audits and confirmed materialization link atomically while keeping Inbox mutation inside the designated writer boundary. Source-document currency/amount stays recognition evidence while booked Expense/Transaction money is explicitly CAD and non-CAD payment accounts fail closed. The operator subsequently executed the reviewed legacy-data cleanup; read-only verification confirms the seven old Gmail pending ExpenseDocuments and old random-ID CIBC account are gone while canonical `account_primary_bank` remains valid. No Prisma schema/migration, dependency manifest, Textract runtime, context import, scanner allowance, Journal authority, provider settlement or revenue-posting policy changes; CI preserved Foundation **1** / External **1** / Identity **2** / Runtime **6**, total **10**, public SCC empty.

2026-09-16 Phase 9 Textract Expense Recognition Provider is **MERGED / PR CI GREEN / POST-MERGE CI GREEN / DEPLOYED / REAL RECEIPT + DATE-ARBITRATION VERIFIED / LINE-ITEM-HINT FOLLOW-UP LOCAL / NO GRAPH CHANGE** through PR #2360 / final head `cea260e0` / squash merge `8cd2168f`, followed by date hardening PR #2362 / final head `25b64577` / squash merge `93322a61`; PR/post-merge CI #5767/#5768 and #5775/#5776 passed. AWS Textract `AnalyzeExpense` remains behind the Accounting-local recognition boundary and opt-in `ACCOUNTING_TEXTRACT_ENABLED`. Images use a transient auto-oriented/high-confidence receipt-cropped bounded JPEG for Textract and fall back to existing Tesseract on provider/preparation failure; the immutable SourceArtifact and post-confirm image-retention lifecycle are unchanged. Native-text PDFs stay on local Poppler/provider parsing; only empty-text scanned PDFs may try the synchronous Textract fallback, with no S3/SNS/SQS/async-job path. Production re-upload of the known Foody `$42.38` receipt confirmed `AWS_TEXTRACT`, applied crop `624x1920`, matched subtotal/tax/total and all three line-item prices, while the provider's incorrect USD suggestion remained non-canonical (`sourceCurrency = null`). The date follow-up is now deployed/verified: despite provider candidates normalizing to both `2026-09-01` and `2026-09-08`, the latest ParseRun correctly leaves `date = null` for Inbox review. The authorized `phase9-textract-line-item-hints` follow-up stays inside Accounting/Web and adds only a bounded ParseRun review projection plus additive browser consumption: at most 50 description/price/confidence hints, Textract-backed generic parser v3 (other generic paths remain v2), auto-prefill only for complete reconciled hint sets, and a CAD source-currency gate before recognized source amounts may aggregate into CAD categories. These hints remain non-canonical review evidence and never become SKU/Expense/Journal rows. No package, Prisma schema/migration, context import, scanner allowance, Journal authority or posting-policy change is introduced. Direct-import baseline remains Foundation **1** / External **1** / Identity **2** / Runtime **6**, total **10**, public SCC empty.

2026-09-07 Phase 6 Slice 1 merged through PR #2231 / `1ad42319` after final head `f3550efd` passed PR CI #5318. It contracts three Payments/Clover -> Commerce deep imports by moving POS refund and reverse-sync orchestration onto the existing Orders public `POS_ORDER_OPERATIONS` capability. The monotonic pair baseline is therefore `payments-clover -> commerce-orders-fulfillment 8 -> 5`, and current Payments/Clover total outgoing direct debt is **54**. Public SCC remains empty. The Phase 6 readiness baseline refresh merged through PR #2232 / `94cff60f` after final head `f35bcd5f` passed CI #5321.

Phase 6 Slice 1B merged through PR #2233 / `be21c8c5` after final head `0a2a01d8` passed CI #5326. `PreparedPaymentOrderSnapshot` is normalized to V2 before public port contraction: persisted preparation removes internal `User.id`, `Coupon.id`, `OrderItem.id` and `UserCoupon.id`, makes `storeStableId` explicit, and preserves assigned-coupon selection as a non-identity boolean while Benefits resolves its own records through stable identities. Unified-payment idempotency hashing also excludes internal `selectedUserCouponId` and `checkoutIntentId`, retaining only stable order facts plus the assigned-coupon business intent. V1 read compatibility is intentionally not retained for the coordinated non-business-hours cutover; the production `PaymentCheckoutAttempt` table was re-audited at **0 rows** before implementation. Slice 1B itself leaves `payments-clover -> commerce-orders-fulfillment` at **5** and Payments/Clover total at **54**.

Phase 6 Slice 1C merged through PR #2234 / `bf95051f` after final head `a042ea10` passed CI #5329. Orders now exposes the unchanged V2 preparation contract through `PAYMENT_ORDER_PREPARATION`, backed by `OrdersService` via `useExisting`, and `PaymentCheckoutAttemptService` consumes that public port instead of deep-importing `orders.service`. This removes exactly one production direct import: the monotonic baseline contracts `payments-clover -> commerce-orders-fulfillment` **5 -> 4**, Payments/Clover total outgoing direct debt **54 -> 53**, and public SCC remains empty. Confirmed-payment finalization, OrdersModule composition imports and the production Web Clover legacy controller remain intentionally outside this slice.

Phase 6 Slice 2A merged through PR #2235 / `b1051c24` after final head `6169d4dd` passed CI #5332. POS now exposes payment-status and reverse-sync realtime delivery through `POS_PAYMENT_REALTIME`, backed by the existing `PosGateway` via `useExisting`, and the two Payment orchestration services consume that public capability instead of deep-importing `pos.gateway`. This removed exactly two production direct imports: `payments-clover -> store-operations-pos-print` **11 -> 9**, Payments/Clover total outgoing direct debt **53 -> 51**, and CI confirmed the architecture baseline with public SCC empty. Socket.IO event names/payloads, Payment truth, POS feature/config/guard/full-refund transport, module composition and Web Clover remain unchanged.

Phase 6 Slice 2B merged through PR #2236 / `e2d72e17` after final head `db442930` passed CI #5335. The three Payment/POS controllers consume the existing `PosDeviceGuard` through `pos/public-api.ts`, and the Unified Payment Core composition module imports the existing `PosDeviceModule` from that owner public surface. The initial barrel attempt failed API tests because eager `PosModule` loading created broad runtime circular initialization; the final design therefore retains the direct `PosModule` Nest composition import as legal wiring. The monotonic baseline contracts `payments-clover -> store-operations-pos-print` **9 -> 5**, reducing Payments/Clover total outgoing direct debt **51 -> 47**, and CI confirmed public SCC remained empty.

Phase 6 Slice 2C merged through PR #2237 / `51dd19ec` after final head `e76c5087` passed PR CI #5338. POS exposes legacy/manual full-refund management through `POS_FULL_REFUND_MANAGEMENT`, backed by the existing `PosOrdersService` via `useExisting`, while the Payment orchestration service and full-refund controller consume only the POS public token/port/input instead of `pos-orders.service`. POS keeps Web external-payment gating, Uber/manual-flow exclusion, amendable-status policy, operator/reason validation and audit decoration; managed Clover success/uncertainty/failure semantics remain unchanged. The monotonic baseline contracts `payments-clover -> store-operations-pos-print` **5 -> 2**, reducing Payments/Clover total outgoing direct debt **47 -> 44**; CI confirmed the baseline and public SCC remained empty. The remaining two production direct imports are the explicitly retained `PosModule` Nest composition edge and `PosCardPaymentFeatureConfig`.

Phase 6 Slice 2D merged through PR #2238 / `37f3e939` after final head `5e35bd7f` passed CI #5340. It is a docs-only ownership/cutover decision and therefore makes **no graph or baseline change**: `payments-clover -> store-operations-pos-print` remains **2** and Payments/Clover total remains **44**. `PosCardPaymentFeatureConfig` is classified as temporary `payments.pos-card-legacy.v1` compatibility, not as a lasting POS public policy or Payments capability. It is removed together with the legacy direct-paid CARD path and route-choice branches after POS ↔ Clover Terminal realtime synchronization/recovery, real-device acceptance, settlement proof, production stability and zero legacy invocation satisfy the registered cutover gate. The direct `PosModule` import remains legal Nest composition.

Phase 6 Slice 3A merged through PR #2239 / `239d8f74` after final head `782da646` passed CI #5343. It is an identity/persistence normalization and intentionally makes **no graph or baseline change**: `payments-clover -> commerce-orders-fulfillment` remains **4** and Payments/Clover total remains **44**. `PaymentCheckoutAttempt.plannedOrderId/orderId` and confirmed-payment `internalOrderId` plumbing are removed so Payments/orchestration no longer generate or persist Orders-owned UUIDs; Orders generates `Order.id` inside the existing atomic finalization transaction and only `orderStableId` remains across the checkout/recovery boundary. POS managed refund also stops propagating Order UUID into Payments. `PaymentTransaction.orderId` remains nullable and unchanged for a separate stable-reference decision before Web Unified Payment migration.

2026-09-08 Phase 6 Slice 3B merged through PR #2240 / `893fde49` after final head `6eb4b38c` passed CI #5346. It contracts the remaining confirmed-payment business import without changing the finalization transaction. Orders exposes `PAYMENT_ORDER_FINALIZATION`, backed by the existing `OrdersService` via `useExisting`; the public result contains only `orderStableId`, `orderNumber` and `pickupCode`, while the transaction continues to own Order creation, Benefits/Coupon COMMIT and durable `order.accepted`. `PosCardPaymentOrchestrationService` consumes the public finalization port and reuses `POS_ORDER_OPERATIONS.getByStableIdForStore()` for completed-checkout recovery instead of importing `OrdersService`. The monotonic baseline contracts `payments-clover -> commerce-orders-fulfillment` **4 -> 3**, reducing Payments/Clover total direct debt **44 -> 43**; CI confirmed the architecture baseline and public SCC remained empty.

2026-09-08 Phase 6 Slice 4A merged through PR #2241 / `00768897` after final head `d38dce42` passed PR CI #5348. The two remaining `OrdersModule` composition imports in `clover-web-checkout-orchestration.module.ts` and `pos-card-payment-orchestration.module.ts` consume the already-existing Orders public surface instead of `orders/orders.module`. This does not remove the Payments -> Orders dependency; it reclassifies exactly two implementation-path imports as approved public composition traffic while preserving the same Nest module class and wiring. The monotonic baseline contracts `payments-clover -> commerce-orders-fulfillment` **3 -> 1**, reducing Payments/Clover total direct debt **43 -> 41**. The sole remaining direct Payments -> Orders edge is the protected production Web `clover-pay.controller.ts -> OrdersService` seam. CI confirmed the architecture baseline and public SCC remained empty.

2026-09-08 Phase 6 Slice 4B merged through PR #2243 / `aa765f9d`; merged-dev CI #5354 passed API and Web. It intentionally makes **no graph/baseline change**. `CloverPlatformPaymentsGateway` plus its Platform v3 canonical HTTP/raw mapping moved from `clover-payment-provider.adapter.ts` into `payments/infrastructure/clover/platform/clover-platform-payments.gateway.ts`; `PaymentsModule` also stops exporting the internally consumed `PAYMENT_PROVIDER` and `CreatePaymentAttemptUseCase`. These are intra-context ownership/export contractions: `payments-clover -> commerce-orders-fulfillment` remains **1**, Payments/Clover total direct debt remains **41**, and no new public SCC/context edge is introduced. Architecture guards keep Platform concrete infrastructure unavailable to orchestration/POS/Orders and prevent Platform HTTP/raw mapping from returning to the adapter.

2026-09-08 Phase 6 Slice 4C merged through PR #2244 / `bc96c706` after final head `31efc862` passed PR CI #5358; merged-dev CI #5359 also passed API and Web. It intentionally makes **no graph/baseline change**. `CloverProviderConfig` and all in-context consumers separate the live Web Ecommerce compatibility configuration from Unified merchant/OAuth/Platform and Terminal device/REST Pay configuration. Missing Unified/Terminal variables fail closed with no fallback to the production Web merchant/token/base URL; production webhook ingress stays on the live Web merchant/auth scope. `payments-clover -> commerce-orders-fulfillment` remains **1**, Payments/Clover total direct debt remains **41**, and the public SCC/context graph is unchanged.

2026-09-08 Phase 6 Slice 4D merged through PR #2245 / `1cc4a829` after final head `c665b469` passed PR CI #5361; post-merge CI #5362 passed API and Web. It intentionally makes **no graph/baseline change**. Terminal REST Pay removes the temporary static OAuth-token configuration path and consumes the same `CLOVER_UNIFIED_MERCHANT_ID` database-backed `CloverMerchantAccessTokenService` lifecycle already used by Platform v3. The transport keeps its static device configuration internal, resolves Unified credentials only at request time, force-refreshes once on HTTP 401, and distinguishes pre-send credential unavailability from post-send network uncertainty. The deployed production SanQ runtime has since completed non-device Test Merchant OAuth/Platform verification, including `ACTIVE` store binding, canonical Platform v3 read, natural token refresh/rotation and post-restart encrypted-credential reuse; these runtime checks do not alter dependency counts. `payments-clover -> commerce-orders-fulfillment` remains **1**, Payments/Clover total direct debt remains **41**, and no new public SCC/context edge or scanner allowance is introduced. Device/Terminal financial verification remains pending a Clover Dev Kit.

2026-09-09 Phase 6 Web Clover cutover readiness audit is documentation/read-only governance only and makes **no graph/baseline change**. The protected Web `clover-pay.controller.ts -> OrdersService` compatibility seam remains the sole direct `payments-clover -> commerce-orders-fulfillment` implementation edge; the pair baseline therefore stays **1**, Payments/Clover total direct debt stays **41**, and public SCC remains empty. The audit classifies Platform v3 as the future canonical Web payment/refund truth but explicitly defers Web Unified Payment migration, production shadow reads, refund migration and legacy cleanup until Test App/device acceptance is complete and Unified authorization has moved from the Test Merchant to the operating production Clover merchant. No new scanner allowance is created for that deferral.

The 2026-09-09 Phase 6 source/architecture closeout likewise makes **no graph/baseline change**. It records that the bounded-context source objectives are complete at Payments/Clover direct debt **41** with public SCC empty, while the remaining Terminal and Web payment migrations continue under the two registered payment compatibility gates. Non-payment contexts may therefore become the next modularization owners without reclassifying protected payment seams as unfinished ordinary import debt.

2026-09-09 Phase 7 Slice 1 contracts the POS staff-auth implementation imports onto the already-existing Identity public surface. Four POS controllers now consume `SessionAuthGuard`, `RolesGuard`, and `Roles` through `auth/public-api.ts`; `PosModule` consumes `RolesGuard` publicly while intentionally retaining only the legal `PosModule -> AuthModule` Nest composition import. The monotonic baseline therefore contracts `store-operations-pos-print -> identity-customer-benefits` **14 -> 1**, reducing Store Operations / POS / Print total direct debt **29 -> 16**. PR #2250 final head `4b44debc` passed final PR CI #5374 after an initial Prettier-only architecture-spec lint failure in #5373, then squash-merged as `66f29561`. No route, guard ordering/role semantics, POS device credential behavior, Orders/Payments/Clover/Uber/printing behavior, Prisma/schema/migration, dependency or compatibility path changes. Public SCC remained empty; the retained direct Identity edge is the explicit AuthModule composition seam.

2026-09-09 Phase 7 Slice 2 contracts the remaining POS -> Brand/Store implementation imports behind a narrow Store-owned read capability. Brand/Store defines `STORE_STATUS_READER` / `StoreStatusReaderPort` with only the watchdog's schedule/temporary-close/timezone/close-time projection, binds it to the existing `StoreStatusService` through `useExisting`, and exports the token plus `StoreStatusModule` through `store/public-api.ts` without exposing the concrete service. `StoreStatusService` simultaneously stops importing its own public barrel and uses its internal config/schedule contracts directly, avoiding a public-api/module/service barrel cycle without `forwardRef` or wrapper wiring. POS injects the read port and imports the Store module only through the public surface. The monotonic direct allowance `store-operations-pos-print -> brand-store` is removed **2 -> 0**, reducing Store Operations / POS / Print total direct debt **16 -> 14**. PR #2251 final head `424d06fa` passed final PR CI #5378 and squash-merged as `8f78f0b5`; the architecture gate confirmed public SCC remained empty. No runtime store-status, watchdog, Uber pause/resume, Prisma/schema/migration, payment, printing, dependency or compatibility behavior changed.

2026-09-09 Phase 7 Slice 3 contracts only neutral API Foundation implementation-path usage. `common/public-api.ts` exposes `AppLogger`, `StableIdPipe`, and `ZodValidationPipe`; POS logger consumers and the POS Orders controller consume those utilities through the Foundation public surface, while `pos/public-api.ts` stops re-exporting the two Foundation-owned pipes. `common/pos-connectivity.ts` is intentionally not promoted into the Foundation public barrel because its heartbeat metadata/timeouts/status-resolution semantics are POS operational behavior also consumed by Uber order admission. The monotonic baseline therefore contracts `store-operations-pos-print -> architecture-foundation` **7 -> 2**, reducing Store Operations / POS / Print total direct debt **14 -> 9**. PR #2252 final head `fedeb9fe` passed final PR CI #5382 and squash-merged as `d3b7996b`. The two remaining Foundation edges explicitly preserve the unresolved POS-connectivity ownership signal; no route, validation behavior, provider protocol, Prisma/schema/migration, payment, printing, dependency or compatibility behavior is changed.

2026-09-09 Phase 7 Slice 4 is an ownership contraction with **no graph/baseline count change**. `PosConnectivityWatchdogService` stops reading Uber-owned `UberStoreMapping` persistence and no longer knows provider `uberStoreId`; it sends only SanQ `storeStableId` plus the existing ONLINE/PAUSED intent through the Uber public store-status capability. Uber's existing merchant application/persistence boundary resolves provisioned mappings internally via `findProvisionedMappingsByStoreStableId()` and reuses the existing provider-target sync path, preserving status payloads, idempotency, telemetry/alerts and fail-fast retry semantics. POS still reads POS-owned `PosDevice` heartbeat persistence directly, so `store-operations-pos-print -> runtime-data-ci-ops` remains **5**; the legal `PosModule -> UberEatsModule` composition edge keeps `store-operations-pos-print -> external-channels` at **1**. Phase 7 total direct debt therefore remains **9**, with public SCC empty after merge `af8b4d63`; PR #2253 final PR CI #5387 and resulting `dev` push CI #5388 both passed.

2026-09-09 Phase 7 Slice 5A is the **expand/shadow** half of the POS-connectivity persistence contraction and intentionally makes **no direct-import or public-SCC baseline change**. A POS-owned `PosConnectivityReadModel` purpose-built read fact is added in Prisma and maintained by `PosDeviceService`; Uber order admission reads it only for parity while the existing `PosDevice` + `common/pos-connectivity` calculation remains authoritative under registered compatibility `pos-connectivity.read-model-shadow.v1`. No `Uber -> POS public-api` dependency is added, preventing a reverse public edge while POS already consumes Uber public capabilities. PR #2254 squash-merged as `8abf3162`; exact PR-head CI #5393 and post-merge #5394/#5395 were green, the additive migration was deployed, and deliberate Uber Test Store/POS verification confirmed ONLINE shadow parity, OFFLINE -> provider Store unavailable, UNKNOWN projection when no heartbeat-capable ACTIVE POS exists, recovery to a fresh ONLINE lease, printer-server exclusion and zero projection/shadow failures. Therefore the configured Store Operations / POS / Print direct-debt baseline remains **9** (`architecture-foundation 2`, `external-channels 1`, `identity-customer-benefits 1`, `runtime-data-ci-ops 5`) and `legacyPublicCycleComponents` remains configured empty.

2026-09-09 Phase 7 Slice 5A.1 hardens the same shadow path before authority cutover and intentionally makes **no graph/baseline count change**. Heartbeat-capable authenticated activity advances the POS-owned projection monotonically; credential activity rechecks `status=ACTIVE` before recording `lastSeenAt`; the POS watchdog invokes the owner repair path during connectivity polling; and the rollout-era `UNKNOWN` fail-open safety is retired so both watchdog/provider availability and Uber admission treat “no active order-receiving POS” as unavailable while retaining the existing `POS_OFFLINE` provider reason-code contract. `common/pos-connectivity` and Uber's direct legacy `PosDevice` read deliberately remain until Slice 5B, so Store Operations direct debt stays **9** and no reverse `Uber -> POS` public/source edge is added. PR #2256 final head `873da579` passed exact PR CI #5401, squash-merged as `ee727ef2`, and post-merge CI #5402 passed. The merged state was deployed; production logs verified `pos_connectivity_unknown` at 16:43:17 followed by Uber store-status HTTP 200 / `SUCCEEDED`, repeated disabled-device heartbeat rejection with HTTP 401, recovery store-status HTTP 200 / `SUCCEEDED`, and `pos_connectivity_restored` / ONLINE at 16:46:18 with zero projection/shadow failure logs. The compatibility gate is therefore satisfied.

2026-09-09 Phase 7 Slice 5B completed the POS-connectivity ownership contraction through PR #2258. External Channels defines the required `UBER_POS_CONNECTIVITY_QUERY` / `UberPosConnectivityQueryPort`; the existing `UberOrderImportPrismaAdapter` is reused under both repository and connectivity-query tokens and reads only the POS-owned `PosConnectivityReadModel`. The optional mixed `getPosStoreConnectivity` repository method, configured-default-store guard, Uber direct `PosDevice` read, shadow compare/failure logging and Uber import of `common/pos-connectivity` were removed. The connectivity helper moved into `apps/api/src/pos`, contracting `store-operations-pos-print -> architecture-foundation` **2 -> 0** and `external-channels -> architecture-foundation` **11 -> 10**. Store Operations / POS / Print total direct debt contracted **9 -> 7** (`external-channels 1`, `identity-customer-benefits 1`, `runtime-data-ci-ops 5`), while `external-channels -> runtime-data-ci-ops` remained **24** because no second Prisma adapter was introduced. Final PR head `09ddc06c` passed CI #5408 and squash-merged as `d1c7d7b3`; the architecture baseline remained public-SCC free.

2026-09-09 Phase 8 Slice 8.1 via PR #2260 contracts only existing Auth/Foundation implementation paths onto already-established owner public surfaces. The four Uber access-decorator imports for `AdminMfaGuard`, `Roles`, `RolesGuard`, and `SessionAuthGuard` now consume `auth/public-api.ts`, reducing `external-channels -> identity-customer-benefits` **6 -> 2**. Six layer-legal `AppLogger` consumers in Uber API/infrastructure now consume `common/public-api.ts`, reducing `external-channels -> architecture-foundation` **10 -> 4**. The two application-layer `AppLogger` imports remain intentionally direct because the existing `UberTelemetryPort` is not behavior-equivalent for these merchant diagnostic logs: its structured workflow path filters current store context and `captureEvent()` would add persistence side effects. The remaining Foundation edges are those two application logger imports plus `getLogContext()` and `getUploadsAccountingDir()`; the remaining Identity edges are `SESSION_COOKIE_NAME` and the legal `AuthModule` composition seam. External outgoing direct debt therefore contracts **41 -> 31** while Runtime remains **24** and Orders remains **1**. PR #2260 final head `8efeb5e6` passed CI #5414, including the architecture baseline gate, confirming the public SCC remains empty, and squash-merged as `fc9bfc01`.

2026-09-09 Phase 8 Slice 8.2A contracts Store schedule semantic ownership without changing the dependency counter. The existing Uber application `UBER_BUSINESS_SCHEDULE_QUERY_PORT` is now composed at `ubereats.module.ts` from `UBER_STORE_CONFIG_QUERY` plus the Store public `STORE_SCHEDULE_READER`; all three direct Uber persistence `BusinessHour` accesses are removed, and the remaining schedule consumers resolve through that application port. The existing `store/public-api.ts` import already represented the legitimate `external-channels -> brand-store` public capability edge, so no new public edge or direct-import allowance is introduced. `external-channels -> runtime-data-ci-ops` remains **24**, Orders **1**, Identity **2**, Foundation **4**, and `tools/architecture/context-baseline.json` is intentionally unchanged. Focused architecture coverage rejects any production Uber persistence `.businessHour` access. PR #2261 final head `ce47baf1` passed CI #5418 and squash-merged as `87ebad20`; no local scanner/lint/build/test result was claimed.

2026-09-09 Phase 8 Slice 8.2B implements the authorized two-step Catalog/External dependency inversion on `dev@87ebad20`. `CatalogUberAvailabilityOrchestrationService` now depends on a Catalog-owned outbound availability-sync port; the concrete Uber binding remains only in the already excluded `catalog-uber-availability-orchestration.module.ts`, so the Catalog business-source -> External public edge is removed without changing synchronous best-effort runtime behavior. Catalog now owns a dedicated `CATALOG_EXTERNAL_MENU_FACTS_READER` public capability that maps canonical categories/items/modifier groups to stable IDs and ISO timestamps. `ubereats.module.ts` adapts that public reader to the Uber-owned `UBER_CATALOG_MENU_FACTS_QUERY` port for both API and dedicated worker composition, producing the intended one-way External -> Catalog canonical-read dependency while keeping `legacyPublicCycleComponents=[]`. Of the audited 17 Catalog Prisma delegate reads in Uber persistence, 15 are removed; the two deferred restore-source-price reads were transaction-sensitive only in the sense that they occurred inside the same callback as Uber writes, not because they used Serializable isolation or Catalog row locking. The deep-import counters remain Runtime **24**, Orders **1**, Identity **2**, Foundation **4**, so `tools/architecture/context-baseline.json` remains unchanged. PR #2262 final head `05291115` passed CI #5427 and squash-merged as `00561c82`.

2026-09-10 Phase 8 Slice 8.2B.3 closes the remaining Catalog semantic-read tail without changing the dependency counter. `UberMenuConfigImportPrismaAdapter.restoreItemPrice()` and `restoreOptionPrice()` now resolve source price/availability through the existing Uber-owned `UBER_CATALOG_MENU_FACTS_QUERY`, whose composition is backed by Catalog-owned `CATALOG_EXTERNAL_MENU_FACTS_READER`; the Uber override plus audit writes remain transactional, while no Catalog Prisma delegate crosses into Uber persistence. The production Uber persistence direct-access set for `MenuCategory`, `MenuItem`, `MenuOptionGroupTemplate`, and `MenuOptionTemplateChoice` therefore contracts **17 -> 15 -> 0**. No new public edge, schema/migration, runtime-debt allowance or machine-baseline change is introduced; Runtime remains **24**, Orders **1**, Identity **2**, Foundation **4**. PR #2263 final head `f001d37a` passed CI #5432 with the architecture gate and complete API/Web validation green, then squash-merged as `f7b8710a`.

2026-09-10 Phase 8 Slice 8.3A0 removes the reverse Orders -> External semantic-persistence tail before canonical Order read/transition contraction. Readiness audit found `UberOrderItemModifier` was write-only in production source: `OrderIngestionService` was its sole producer and no production reader existed, while the modifier facts actually consumed by downstream order/print flows remain in `OrderItem.optionsJson`. A pre-migration read-only DB inventory found 17 modifier rows across 12 OrderItems / 11 Uber orders and zero non-Uber rows. The user confirmed all current Uber Eats integration data is test-only and explicitly authorized destructive removal. The slice removes `NormalizedOrderItem.external.modifiers`, the ingestion `uberOrderItemModifier.createMany()` write, the `OrderItem.uberModifiers` relation, the `UberOrderItemModifier` Prisma model, and adds migration `20260910111500_contract_uber_order_item_modifier` to drop the table without `CASCADE`. PR #2264 source head `18034f19` passed CI #5435, including Prisma generation, architecture, API and Web validation, and squash-merged as `2589225d`. This does not alter the scanner's import-edge counts: External -> Orders remains **1** until 8.3B transition ownership contraction, while the semantic Orders -> External persistence write is eliminated. Deployment and active verification are complete: migration `20260910111500_contract_uber_order_item_modifier` is applied, the obsolete table is absent, and Test Store order `82A94` retained canonical modifier options through POS/printing while ACCEPT succeeded with Uber HTTP 200; Slice 8.3A0 is `PRODUCTION VERIFIED`.

Post-8.3A0 readiness on `dev@2589225d` inventories the remaining direct canonical Order reads in `uber-order-action-prisma.adapter.ts`, `uber-order-sync-prisma.repository.ts`, `uber-operations-prisma.repositories.ts` and `uber-order-import-prisma.adapter.ts`. Slice 8.3A is planned as a dedicated Orders-owned external-order facts reader/module using stable identities only, leaving status/amendment/lifecycle writes untouched. The current `findByExternalOrderId()` DB-UUID leak must contract to `orderStableId` before cancellation ownership moves. Slice 8.3B then owns the atomic ACCEPT/READY/CANCEL/DENY transition seam; Slice 8.3C owns cancellation amendment/refund/lifecycle semantics and will separately decide whether the write-only `UberOrderCancellation` table should be removed or retained with stable identity. No new direct-import/public-cycle allowance is authorized by this plan.

2026-09-10 Phase 8 Slice 8.3A establishes the Orders-owned canonical read boundary and is now merged. `ORDER_EXTERNAL_FACTS_READER` plus `OrderExternalFactsModule` provide provider-neutral stable facts; `ubereats.module.ts` adapts them to Uber action/sync/operations query ports for API and worker, while the worker does not import `OrdersModule`. All nine pure canonical Order read operations moved out of Uber persistence. The three write-coupled reads remained at the 8.3A merge point—two action-completion reads and one cancellation read—so 8.3B/8.3C atomicity was unchanged. The application-facing existing-order chain uses `orderStableId`, while the cancellation transaction resolves `Order.id` internally. Deleting the old Uber sync Prisma repository contracted `external-channels -> runtime-data-ci-ops` **24 -> 23**, reducing External total **31 -> 30**; External -> Orders remained **1** and public SCC remained empty. PR #2267 final head `9b996892` passed CI #5445, squash-merged as `51bf9091`, and merged-head CI #5446 also passed.

2026-09-10 Phase 8 Slice 8.3B is merged. Orders owns `ORDER_EXTERNAL_TRANSITION_COORDINATOR` and the narrow `OrderExternalTransitionModule`; the coordinator opens the shared transaction, executes an opaque same-transaction External extension first, then owns canonical `Order.status`, `makingAt` / `readyAt`, conditional-update re-read and idempotent `order.accepted`. `UberOrderActionPrismaAdapter.completeWithinTransaction()` retains only Uber action claimed-row validation, exact `taskId + PROCESSING + leaseToken` fence, provider HTTP success persistence and lease cleanup. `ubereats.module.ts` is the sole composition binding for `UBER_ORDER_ACTION_REPOSITORY`; both API and worker import the narrow Orders transition module, and the worker still does not import `OrdersModule`. The old deep `orders/order-lifecycle` import and all `tx.order.*` / `tx.opsEvent.*` accesses disappeared from the Uber action adapter. PR #2268 final head `24d034e7` passed CI #5448 and squash-merged as `29485a62`; merged-head CI #5449 also passed. The architecture scanner accepted removal of `external-channels -> commerce-orders-fulfillment`, so that direct debt is **1 -> 0**, External total **30 -> 29**, Runtime remains **23**, and public SCC remains empty.

2026-09-10 Phase 8 Slice 8.3C is **PRODUCTION VERIFIED** after explicit architecture and destructive-migration authorization. Orders owns provider-confirmed cancellation finalization through `ORDER_EXTERNAL_CANCELLATION_FINALIZER`: the owner validates `channel + orderStableId + externalOrderId`, reads canonical total/payment facts, atomically upserts the deterministic external-cancellation `OrderAmendment`, converges status to `refunded`, and appends idempotent `order.cancelled`. Uber persistence no longer opens a canonical cancellation transaction or touches `tx.order.*`, `tx.orderAmendment.*`, cancellation `tx.opsEvent.*`, or an Orders DB UUID; the dead top-level import `cancellation` input/branch is removed while provider detail parsing remains unchanged. Source/DB audit found `UberOrderCancellation` had one writer, zero readers and 21 test-era rows; every row had matching durable `UberWebhookInbox` evidence and `OrderAmendment`, with no orphan/missing parity rows. PR #2269 final head `35defb4b` passed CI #5453 and squash-merged as `982b4de1`; merged-head CI #5454/#5455 also passed. After the new runtime was deployed, Test Store order E3563 completed normally and Uber delivered real `orders.failure` event `4afc3ecf-f339-5a92-8eed-769d29f4cc7d`; it was processed in one attempt with no error and `refundCents=367`, while the legacy table stayed at 21 rows. The authorized migration `20260910131300_contract_uber_order_cancellation` was then applied successfully without rollback; the legacy table is absent, retained inbox/amendment evidence remains, all containers are healthy, and API/worker logs show no legacy/missing-table errors. Import-graph counts remain External -> Orders **0**, Runtime **23**, External total **29**, public SCC empty.

2026-09-10 Phase 8 Slice 8.4 is merged through PR #2271 as `466ae633`; merged-head CI #5464 passed API + Web. The evidence-driven audit found one uncovered L3 crash/replay side-effect gap in `eats.report.success`: CSV artifact filenames used `Date.now()`, so replay after artifact persistence but before report READY/inbox success could create duplicate physical files. The implemented change keeps the artifact store inside External Channels but derives deterministic artifact identity from `workflowId + logical section + content hash`, publishes via flushed same-directory temp file plus atomic hard-link, reuses byte-identical existing artifacts, and fails closed on content mismatch. No Prisma/migration, package, DI, provider wire, public-edge or scanner allowance changes were introduced; External -> Orders remains **0**, Runtime **23**, External total **29**, public SCC empty.

2026-09-10 Phase 8 Slice 8.5 merged through PR #2272 as `fb6f3bb8` and is **PRODUCTION VERIFIED**. OpsTicket persistence/query/retry no longer expands canonical `storeStableId` into provider UUID aliases; store-status alert dedupe no longer accepts provider-scoped ticket rows or legacy `OFFLINE` ticket context; menu availability no longer treats `uberStoreId` as a `storeStableId` alias. No Slice 8.5 data-cleanup migration is included: the inventoried 15 provider-UUID OpsTickets and one historical `storeId='default'` Reconciliation row, together with the rest of the current Uber test dataset, remain untouched until Uber Production Verification passes and a complete cleanup is separately reviewed. PR-head CI #5467 and merged-head CI #5468 passed API + Web; post-deploy verification confirmed canonical Operations/Reconciliation queries, POS pause/resume Store Status `200/SUCCEEDED`, item availability off/on `204/SYNCED`, clean identity logs and no new provider-UUID-scoped OpsTicket. This is a compatibility/identity contraction with **no context graph or machine baseline count change**: External -> Orders stays **0**, Runtime **23**, External direct debt **29**, public SCC empty.

2026-09-10 Phase 8 Slice 8.6A merged through PR #2275 as `f8896493`; PR CI #5476 and merged-head CI #5477 passed API + Web. `uber-merchant-provisioning.service.ts` and `uber-merchant-store-mapping.service.ts` now depend on application-owned `UBER_DIAGNOSTIC_LOG_PORT`; `UberTelemetryService` implements that log-only capability with `AppLogger`, while `diagnosticLog()` performs no `OpsEvent` persistence. The monotonic machine allowance contracts `external-channels -> architecture-foundation` **4 -> 2**, reducing External direct debt **29 -> 27**. The remaining two Foundation direct imports are infrastructure-only `getLogContext()` and `getUploadsAccountingDir()`. External -> Orders remains **0**, Runtime **23**, Identity **2**, and public SCC remains empty.

2026-09-10 Phase 8 closeout active verification found a menu-publish schedule wiring defect with **no dependency-graph effect**: Dry Run/formal Publish still synthesized seven-day `00:00–23:59` availability even though Slice 8.2A had already moved draft/read schedule ownership behind `UBER_BUSINESS_SCHEDULE_QUERY_PORT`. PR #2277 passed CI #5483, squash-merged as `574c5beb`, and merged-head CI #5484 passed. The merged forward-fix routes `UberMenuSnapshotPrismaAdapter` through that existing application port/Store-owned `STORE_SCHEDULE_READER`, maps canonical BusinessHour rows with `toUberServiceAvailability`, and makes `PublishUberMenuUseCase` consume `snapshot.serviceAvailability`. External -> Foundation remains **2**, Orders **0**, Runtime **23**, Identity **2**, total External direct debt **27**, and public SCC remains empty.

2026-09-11 Phase 8 Slice 8.6B closes the approved External Channels source/architecture scope with **no graph or machine-baseline change**. Consolidated final-state verification covered canonical menu publish schedule/timezone/tax, item/option restore-source-price audits, scheduled ACCEPT replay without duplicate canonical acceptance/print activation, immediate ACCEPT + READY, manual DENY convergence, 8.6A prep-time diagnostic logging without diagnostic-only `OpsEvent`, and zero active action/inbox leases after testing. One best-effort worker wake exceeded its 500 ms timeout but the durable inbox processed normally immediately afterward, so no lost-work condition was observed. Financial-report replay remains `CODE READY / LIVE TEST BLOCKED BY UBER CAPABILITY`; Production Client/Store cutover and pilot remain separate gates. Final External direct debt stays **27** (`architecture-foundation 2`, `identity-customer-benefits 2`, `runtime-data-ci-ops 23`; Orders direct debt 0) with `legacyPublicCycleComponents=[]`.

## Phase 4 final baseline and production verification

**Phase 4 — Identity / Customer / Benefits + Messaging Boundary Contraction** is complete and tracked in
`docs/architecture/phase-4-identity-customer-benefits-messaging.md`. The final monotonic baseline after Slice 6
and the production-verified rollout records these direct-debt totals:

- payments-clover: **59**
- external-channels: **42**
- identity-customer-benefits: **33**
- commerce-orders-fulfillment: **30**
- store-operations-pos-print: **31**
- accounting-reporting-analytics: **25**
- catalog-pricing-offers: **15**
- messaging-notifications: **10**
- brand-store: **8**

The reduction in Orders/POS counts is baseline normalization of source debt that had
already contracted; it does not reopen those contexts as the next primary owner phase.
After Slice 2E-B, Payments/Clover at **59** is numerically above Identity/Customer/Benefits
at **37**, but that does not change the active Phase 4 owner scope. Slice 2E-A reduced Messaging
from **14 -> 10** by retiring SNS/SQS infrastructure; Slice 2E-B then removes the final direct
Identity -> Messaging pair, returns OrderEventsBus ownership to Orders and eliminates Uber's
Messaging bridge without recreating a public SCC. Identity, Commerce and External outgoing debt
now contract to **37 / 31 / 42** respectively. Slice 2E-B is merged via PR #2177 after final head
`dc07e820` passed CI #5137 and squash-merged as `718b2133`.

Slice 3 then contracts the internal Customer ownership surface without changing those counts:
`CustomerService` owns onboarding/profile/address/marketing-consent behavior, the retired
`MembershipOnboardingService` is deleted, and broad Membership reads no longer perform implicit
User creation/profile/PHONE_VERIFY mutations. Existing member HTTP routes stay unchanged,
Identity -> Messaging direct debt remains **0**, and the public SCC baseline remains empty. Slice 3
merged through PR #2178 after final head `73f7d2e1` passed CI #5140 and squash-merged as
`e813d918`.

Slice 4A then moves Staff list/update/invite administration and the self/last-active-admin invariants
from the Admin transport adapter behind the Identity-owned `STAFF_ADMINISTRATION` public port, with
`StaffAdministrationService` as its internal implementation. `AdminStaffController` no longer imports
Prisma or Prisma-generated role/status types and no longer owns invite delivery; the Identity owner
coordinates the existing `STAFF_INVITE_DELIVERY` public capability while reusing AuthService's
existing invite lifecycle. `AdminModule` also drops its historical direct Prisma provider and Staff
invite delivery wiring. This contracts Identity -> Runtime **14 -> 12** and Identity total
**37 -> 35** without adding a new direct Identity -> Messaging debt or reopening the public SCC. The
existing non-atomic active-admin count/update semantics and current ADMIN/STAFF transport behavior are
intentionally preserved. Slice 4A merged through PR #2179 after final head `f235893e` passed CI #5144
and squash-merged as `f91a849e`.

Slice 4B contracts Admin/member Customer/Security ownership without changing the numeric context graph.
Stage 1 merged via PR #2180 as `252cd26f` after final head `a2f52ddf` passed CI #5150.
Stage 2 merged via PR #2181 as `060e9417` after final head `f2cbf835` passed CI #5153:
`CUSTOMER_ADMINISTRATION` makes CustomerService the owner of Admin profile mutation/address reads, while
`ACCOUNT_SECURITY_ADMINISTRATION` owns stable-ID-scoped session/trusted-device management and
ACTIVE/DISABLED account status. `TrustedDevice.trustedDeviceStableId` is added through the authorized
additive migration; the browser-facing legacy `id` alias now carries the same stable identity rather
than the Prisma UUID. Identity -> Architecture remains **13**, Identity -> Runtime **12**, Identity total
**35**, Identity -> Messaging **0**, and the public SCC baseline remains empty. The TrustedDevice
migration was successfully applied to production when the consolidated Phase 4 rollout began on 2026-09-05.

Slice 4C is **PRODUCTION VERIFIED** via PR #2182 plus UUID recovery PR #2190. Final Slice 4C head
`7cb071ad` passed GitHub Actions CI #5158 and squash-merged to `dev` as `3119ce76`; recovery head
`8392e42f` passed CI #5182, squash-merged as `ccf0aee9`, and the merged dev source passed CI #5183. The approved
additive migration adds nullable `Order.userStableId`, deterministically backfills it from the existing
`Order.userId -> User.id` association with count/mismatch/orphan checks, and adds the
`(userStableId, createdAt)` index. The two existing `/admin/members/:userStableId/orders` and
`/top-items` transports move physically into Orders with the same guards/roles/response semantics;
Admin no longer queries Order/OrderItem persistence. Orders queries its own `userStableId` snapshot
and uses only the narrow Customer existence public capability to preserve `404 member not found`, so
no User DB UUID crosses the boundary and no Identity -> Orders public edge is introduced.
`OrdersModule` also switches its historical Membership module import to `membership/public-api`,
contracting Commerce -> Identity direct debt **5 -> 4** and Commerce outgoing total **31 -> 30** while
the public SCC baseline remains empty. The consolidated rollout exposed a historical persistence mismatch before this migration could complete:
production `Order.userId` is `TEXT` while `User.id` is `UUID`. The first Phase 4 migration applied successfully,
then `20260905145500_add_order_user_stable_id` failed with PostgreSQL `42883` and rolled back. Read-only production
verification found all **45/45** non-null `Order.userId` values are valid UUID text and map to `User.id`. The recovery
therefore adds ordered prerequisite `20260905144000_normalize_order_user_id_uuid`, models `Order.userId` as
`String? @db.Uuid`, converts it with `USING "userId"::uuid`, and deliberately adds no FK/NOT NULL/delete semantics
before retrying the untouched stable-ID migration. Production recovery completed successfully: `Order.userId`
is now PostgreSQL UUID, **45/45** member-linked Orders have matching `userStableId`, and orphan/mismatch counts
are **0**.

Slice 4D-A is **PRODUCTION VERIFIED** via PR #2183. Final head
`cec141ba` passed GitHub Actions CI #5162 and squash-merged to `dev` as `07dc1206`. The Identity-owned
`MEMBER_RECHARGE_VERIFICATION` public capability owns the existing `pos-recharge` member/contact
resolution, challenge/token lifecycle and Admin delegation boundary while `AdminMembersService` retains
the unchanged amount/token input validation and `LoyaltyService.applyTopup()` orchestration.

Slice 4D-H is **PRODUCTION VERIFIED** via PR #2184. Final head
`4d850ba1` passed CI #5165 and squash-merged as `7853e4f9`. Recharge Email/SMS share one Identity-owned
challenge policy and DB-backed per-member send budget (one per 60 seconds, five per rolling 24 hours).
SMS uses Messaging `PHONE_VERIFICATION_DELIVERY` only for delivery rather than delegating its challenge
lifecycle to `PhoneVerificationService`. New recharge codes use required `MEMBER_RECHARGE_OTP_SECRET`,
and non-zero six-digit generation uses `crypto.randomInt`. POS rejects backend `{ ok:false }` sends
without entering `code-sent`; the approved rollout remains an atomic cutover with no legacy-secret fallback.

Slice 4D-I is **PRODUCTION VERIFIED** via PR #2185. Final head
`d4b85e3a` passed GitHub Actions CI #5168 and squash-merged to `dev` as `b27ad8ce`. The new
Identity-internal `OtpChallengePolicyService` centralizes DB-backed cooldown/quota/supersession behavior
for Login 2FA, Phone Enrollment, Membership Login, Checkout, Email Verify, POS Recharge and generic Phone
Verification. `email_verify` contracts from 24 hours to 10 minutes; public membership-login/checkout flows
add a 30/hour IP spray budget; successful sends revoke older pending codes only after provider success;
failed provider sends revoke only the new challenge; and code-based verification consistently applies the
five-attempt revoke behavior. Generic Phone Verification no longer keeps process-local Map/timer rate-limit
state. Messaging remains delivery-only, with additive `ok/error` status on Auth challenge delivery.
No Prisma/dependency/context-import change is introduced. Expected numeric graph baselines remain
Identity -> Architecture **13**, Identity -> Runtime **12**, Identity total **35**, Identity -> Messaging
**0**, Commerce -> Identity **4**, with the public SCC baseline empty.

Slice 5A is **PRODUCTION VERIFIED** via PR #2186. Final head
`3b904dd1` passed GitHub Actions CI #5171 and squash-merged to `dev` as `c28df1b5`. The authorized additive
migration adds nullable `LoyaltyLedger.orderStableId`, deterministically backfills the existing Order mapping
with count/mismatch/orphan checks, and deliberately leaves the existing `(orderId, type, sourceKey)` internal
idempotency key plus nullable `orderId` in place. All order-linked Loyalty ledger writes dual-write the stable
identity inside their existing transaction; manual no-order adjustments remain identity-null.
`LOYALTY_LEDGER_READER` now returns the persisted stable identity directly, so both Admin Members and Membership
stop performing `Order.id -> orderStableId` enrichment. The normal order-create path allocates its stable ID
before Loyalty writes, while payment/refund/amendment/top-up paths reuse their already-known stable identity.
Consolidating Loyalty Runtime imports through `loyalty-prisma.ts` contracts Identity -> Runtime **12 -> 10** and
Identity total **35 -> 33**. No new public dependency edge is introduced, so the public SCC baseline remains
empty. Production migration verification later confirmed **89/89** order-linked ledger rows carry matching
`orderStableId`, the **2** manual no-order adjustments remain NULL, and orphan/mismatch counts are **0**.

### Phase 4 Slice 6 final dependency/SCC closeout — 2026-09-05

Final audit base is `origin/dev@0f58cf83` after Slice 5B merged through PR #2187. Final head `42891cf4` passed
CI #5174 and the merge SHA passed dev push CI #5175; both runs passed the Architecture baseline/SCC gate.

The final graph remains Payments/Clover **59**, External **42**, Identity/Customer/Benefits **33**, Store
Operations/POS/Print **31**, Commerce/Orders/Fulfillment **30**, Accounting **25**, Catalog/Offers **15**,
Messaging **10**, Brand/Store **8**. Slice 5B did not require a numeric allowance change because the new
`LOYALTY_ORDER_USAGE_READER` reused the already-existing Commerce -> Identity/Benefits direction.
`legacyPublicCycleComponents` remains empty and no reduced allowance is stale.

Slice 5B is **PRODUCTION VERIFIED**. Orders detail/public-summary, legacy Web
external-payment reconstruction and POS/receipt/email print now delegate order usage to the Benefits-owned
stable-ID reader. Production-source search finds `this.prisma.loyaltyLedger` only under `apps/api/src/loyalty/**`;
`orderStableById` and `getSettledBalancePaymentCentsForOrder` have no remaining source matches. The non-unique
`LoyaltyLedger(orderStableId)` read index is present through the separate additive migration
`20260905204500_add_loyalty_ledger_order_stable_id_index`, while the 5A migration remains untouched.

Two visible debts are intentionally deferred rather than hidden to force a lower number. First,
`MembershipService.getMemberSummary()` still reads Order/OrderItem persistence and deep-imports the Orders-
internal `OrderItemOptionsSnapshot`; that remains the **Identity -> Commerce = 1** allowance. Replacing it with
an Orders public reader while Commerce already consumes Identity/Benefits would recreate a public SCC, so it
requires a later composite read-model/orchestration ownership design. Second, Phase 3 Slice 2C remains
transaction-sensitive: Points/Balance COMMIT, Coupon COMMIT and Order creation still share the same Prisma
transaction, and both Benefits COMMIT implementations consume the supplied transaction client. Closeout does
not split that atomicity or expose `Prisma.TransactionClient` across a public boundary.

Loyalty's paid-settlement Order lookup and UUID-based refund rollback also remain part of its intentionally
retained internal `LoyaltyLedger.orderId` idempotency/refund implementation from Slice 5A; they are not a
Commerce-side read-owner leak and are not silently reclassified as closed debt.

Production rollout is complete. The failed 14:55 Order migration was marked rolled back, then 14:40 UUID
normalization, the retried 14:55 stable-ID backfill, the 19:30 Loyalty stable-ID migration and the 20:45 Loyalty
index migration all applied successfully before the new API/Web/Uber worker were activated. Post-deploy evidence:
TrustedDevice **2/2 populated + unique**; Order member identity **45/45 populated with 0 orphan/mismatch**;
LoyaltyLedger **89/89 order-linked stable IDs populated with 0 orphan/mismatch**, with **2** manual no-order rows
remaining NULL by design. Active member/Admin/OTP/points/balance/receipt/refund/POS-recharge smoke checks completed
without relevant 5xx/Prisma/OTP runtime errors. Recharge SMS is N/A under the current email-first account mix;
separate SMS Login 2FA negative/cooldown/success behavior was verified.

No further safe Phase 4 dependency contraction is identified. Phase 4 is **PRODUCTION VERIFIED / CLOSED** and the
final numeric baseline plus empty public SCC remain authoritative. The POS Order Management "full query" page bug
found during verification is separate: it loaded only the newest 30 Orders even though older production rows are
present, so its server-side historical query/pagination repair does not reopen Phase 4.

### Phase 5 Slice 0 Orders/Fulfillment readiness + characterization — 2026-09-05

Audit base is `origin/dev@a464c1c3` after PR #2192. Slice 0 changes tests and architecture documentation only: no
production implementation, public contract, Prisma schema/migration, dependency, active/closed compatibility path,
architecture allowance or provider wire behavior is changed. The compatibility review queue only records the
EventEmitter/outbox candidate as resolved without assigning a `compat_id`. The exact direct-debt totals therefore
remain Payments/Clover **59**,
External **42**, Identity/Customer/Benefits **33**, Store Operations/POS/Print **31**, Commerce/Orders/Fulfillment
**30**, Accounting **25**, Catalog/Offers **15**, Messaging **10**, Brand/Store **8**; the public SCC baseline remains
empty.

The Phase 5 readiness inventory originally found Orders cross-owner persistence through Catalog `MenuItem`, Customer
`User`/`UserAddress`, Benefits `LoyaltyAccount`, checkout/payment `CheckoutIntent`, provider
`UberOrderItemModifier`, and the durable lifecycle's `PosPrintJob` existence probe. Phase 5 subsequently contracted
Catalog, Customer, Benefits and Print ownership. Phase 8 Slice 8.3A0 now removes the remaining test-era
`UberOrderItemModifier` dead write/schema after confirming there is no production reader and retaining the canonical
modifier snapshot on `OrderItem.optionsJson`; the production-sensitive `CheckoutIntent` seam remains outside this
slice. Historical concrete-service debts are tracked in the owning Phase records rather than treated as new edges.

Behavior coverage was locked before movement. Slice 0 added focused characterization for confirmed-payment
finalization, `createAmendment()`, Uber Direct request/response mapping, the then-existing guarded `paid -> making`
same-process prep fast path, and exact sequential AUTO print deduplication behavior. Slice 1E retains the guarded
status-write characterization but intentionally removes that prep-event side effect.

The Slice 0 in-memory/durable audit found no deliberate fan-out into both initial-print mechanisms. After Slices
1B-1E, the coexistence itself was removed: channel/provider acceptance records durable `order.accepted`,
`OrderPreparationService` writes `making + durable order.prep_started` atomically, and already-active orders do not append
another durable prep fact. Slice 2 then closes the print-handoff hardening debt: Orders no longer reads AUTO `PosPrintJob`
existence, Print owns AUTO/REPRINT/AMENDMENT identity and routing, per-target delivery is row-lock claimed before socket
emit, ACK/timeout are terminal-state guarded, stale DELIVERED rows recover after restart, and the Windows agent suppresses
repeated physical delivery by stable `jobId + target`. No private `OrderEventsBus` prep_started producer/consumer remains.
The former Uber Direct provider-durability debt is source-implemented in the 2026-09-19 post-modularization reliability slice as a direct replacement: the private `order.paid.verified` bus is removed, Orders durable dispatch is authoritative, provably safe failures receive up to 3 automatic retries, and UNKNOWN stays fail-closed with explicit Admin reconciliation. Production verification remains outstanding evidence, but there is no old/new dispatch compatibility route left to contract.

Detailed evidence and next-slice guidance are in
`docs/architecture/phase-5-commerce-orders-fulfillment.md`.

### Phase 5 Slice 1A POS cash payment-summary snapshot readiness — 2026-09-05

Slice 1A is a backward-compatible additive contract/snapshot change and does not alter the measured context graph. The direct-debt totals remain Payments/Clover **59**, External **42**, Identity/Customer/Benefits **33**, Store Operations/POS/Print **31**, Commerce/Orders/Fulfillment **30**, Accounting **25**, Catalog/Offers **15**, Messaging **10**, Brand/Store **8**; the public SCC baseline remains empty.

The POS cash browser now supplies optional `cashReceivedCents` on canonical `/pos/orders` creation. Orders validates it only for authenticated in-store cash orders, derives `cashChangeCents` from the server-calculated remaining cash tender using the existing POS upward-to-5-cent cash rounding rule, and persists only those two receipt-display facts in the existing `Order.paymentBreakdownJson`. `Order.totalCents`, tax, discounts, benefit settlement and refund semantics remain unchanged; in particular Slice 1A deliberately does not add in-store `externalCents`, so the existing Web external-payment reconstruction/refund interpretation is not broadened.

`PrintPosPayloadService` can now recover persisted cash receipt facts into the existing print payload, while the current browser `/print` transient fields remain valid for older PWA bundles. No lifecycle transition, `order.accepted` / `order.prep_started` producer, PrintJob kind, printer transport, Clover provider behavior, Prisma schema/migration or architecture allowance changes in 1A. The actual POS first-print convergence from `REPRINT:* + advance` to durable `accepted -> prep_started -> AUTO` remains Slice 1B.

### Phase 5 Slice 1B POS ordinary durable lifecycle cutover — 2026-09-05

Slice 1B changes runtime orchestration but **does not change the measured context graph or architecture allowance baseline**. Direct-debt totals remain Payments/Clover **59**, External **42**, Identity/Customer/Benefits **33**, Store Operations/POS/Print **31**, Commerce/Orders/Fulfillment **30**, Accounting **25**, Catalog/Offers **15**, Messaging **10**, Brand/Store **8**; the public SCC baseline remains empty.

Canonical in-store creation now writes the Orders-owned durable `order.accepted` fact atomically with the paid Order, then asks the existing `OrderLifecycleOutboxProcessor` to drain after commit. The same durable path owns `making + order.prep_started` and AUTO first-print materialization. The POS payment browser no longer performs first-print `REPRINT:*` or the first `advance`, so the old create/print/advance orchestration is contracted rather than retained in parallel. The existing POS -> Orders operations boundary is expanded narrowly with store-scoped `activateImmediatePreparation()` so a manual `/advance` arriving while an in-store Order is still `paid` also joins that same durable path; later `making -> ready` advancement and explicit operator reprint remain separate store-operation capabilities.

This slice adds no new cross-context import: `OrdersService -> order-lifecycle`, `PosOrderOperationsService -> OrderLifecycleOutboxProcessor`, and the durable-origin marker inside Fulfillment are all Commerce/Orders/Fulfillment internal wiring. The existing Orders -> POS print-type/dispatch debt is unchanged and remains scheduled for the later Print ownership slice. No Prisma schema/migration, Clover/Web payment path, Uber provider behavior, dependency manifest, SCC member/edge or scanner baseline is changed.

The cutover is intentionally not represented as an active compatibility path: the user authorized no support for an old cached POS payment bundle after cutover. PR #2195 subsequently merged as `e4a783a5` after final head `c8ed5579` passed PR CI #5200. Under the repository-wide verification cadence adopted on 2026-09-06, Slice 1B does not carry a standalone post-deployment active-test gate; its runtime/printing/PWA coverage is accumulated into the consolidated Phase 5 closeout verification plan.

### Phase 5 Slice 1C Web/local durable lifecycle convergence — 2026-09-05

Slice 1C also leaves the measured context graph and architecture allowance baseline unchanged. Direct-debt totals remain Payments/Clover **59**, External **42**, Identity/Customer/Benefits **33**, Store Operations/POS/Print **31**, Commerce/Orders/Fulfillment **30**, Accounting **25**, Catalog/Offers **15**, Messaging **10**, Brand/Store **8**; the public SCC baseline remains empty.

The Web payment path still creates a `paid` Order without `order.accepted`; acceptance remains a store-operation decision made by the existing auto-accept/manual `/pos/orders/:id/advance` flow. That decision now enters Orders through the narrow `PosOrderOperationsPort.acceptWebOrder()` capability. Orders locks the store-scoped paid Web Order and appends durable `order.accepted`. For IMMEDIATE Web orders, after acceptance commit the POS-facing orchestration synchronously invokes the same idempotent `OrderPreparationService` materializer used by durable replay, which atomically writes `making + order.prep_started`; the accepted-event 500 ms scan remains crash/restart recovery if eager preparation is interrupted. Once prep_started exists the lifecycle outbox is eagerly woken for AUTO materialization. Scheduled Web orders retain only the accepted fact until the existing scheduler reaches `prepStartAt`. The generic POS status route also redirects local `paid -> making` attempts into the corresponding durable Web/in-store command instead of the legacy direct status mutation.

No new cross-context import is introduced: the new port method, `OrderPreparationService` command and outbox wake are all existing Commerce/POS-public-boundary wiring. Fulfillment now suppresses memory-origin AUTO printing for both Web and in-store Orders, so their first print is durable-only; the memory prep channel remains temporarily for provider/legacy work outside Slice 1C. Web Clover charge/session/finalization, Uber runtime, PrintJob identity/protocol, Prisma schema/migrations and scanner/SCC baselines are unchanged. Slice 1C merged via PR #2196 as `61f5917d` after final head `3dc21e5d` passed PR CI #5204; merged-dev CI #5205 also passed. Its runtime verification scope is now accumulated into the Phase 5 closeout verification gate rather than a standalone Slice deployment test.

### Phase 5 Slice 1D POS Clover Terminal durable lifecycle convergence — 2026-09-06

Slice 1D contracts the pre-production Terminal finalization path onto the same Orders durable acceptance/preparation/AUTO-print lifecycle established by Slices 1B/1C. `OrdersService.createFromConfirmedPaymentSnapshot()` still owns the existing atomic Benefits tender COMMIT + Coupon COMMIT + paid Order creation transaction, but now appends the idempotent `orders.lifecycle/order.accepted` fact inside that **same** Prisma transaction. The outer Terminal orchestrator never receives or transports a transaction client.

`PosCardPaymentOrchestrationService` no longer imports `PrintPosPayloadService`, no longer calls `PosGateway.sendPrintJob()`, and no longer creates `PAYMENT_CHECKOUT:<attemptId>` first-print identities. New successful finalization and COMPLETED/recovery paths call the existing public `POS_ORDER_OPERATIONS.activateImmediatePreparation(orderStableId, storeStableId)` capability; that command requires the accepted fact, writes `making + durable order.prep_started` idempotently, and wakes the same durable AUTO materializer. `PosGateway` remains because the orchestration still owns best-effort POS card-payment status publication; realtime delivery is not part of this Slice.

Historical pre-Slice-1D Terminal prototype Orders are deliberately not backfilled with `order.accepted`: the existing-order branch in confirmed-payment finalization remains read-only. Therefore a historical COMPLETED recovery cannot create a new AUTO first print merely because the lifecycle implementation changed. New Slice-1D Orders have accepted atomically with creation, so retries after any crash between Order creation, checkout completion, preparation and printing converge through the same idempotent durable path.

This removes two direct Payments/Clover -> Commerce internal imports (`OrderDto` and `PrintPosPayloadService`) by replacing them with the existing Orders public surface while the still-deferred direct `OrdersService` confirmed-payment finalization call remains. The monotonic allowance therefore contracts `payments-clover -> commerce-orders-fulfillment` **10 -> 8**, and Payments/Clover total outgoing direct debt **59 -> 57**. The public SCC baseline remains empty. No Prisma schema/migration, package dependency, Web Clover Ecommerce behavior, Terminal provider/payment-state truth, UNKNOWN/reconciliation, refund, pricing/promotion or Benefits COMMIT semantics change.

Per the 2026-09-06 Phase-level verification cadence, Terminal payment/lifecycle/recovery/initial-print behavior is recorded as Phase 5 closeout verification scope rather than a standalone Slice deployment checklist. PR #2197 merged as `9a338704` after final head `04a4a5ed` passed PR CI #5207; merged-dev CI #5208 also passed.

### Phase 5 Slice 1E Uber durable lifecycle convergence — 2026-09-06

Slice 1E closes the final known store-facing bypass around the durable accepted/preparation lifecycle. Uber external ACCEPT still completes in the dedicated durable action worker and atomically records local `paid + orders.lifecycle/order.accepted`; no Uber wire/provider contract, webhook, worker composition, provider truth or action idempotency changes. The source change is on the POS/Orders side after that acceptance fact already exists.

A staff `/advance` or direct `/status -> making` request arriving while an accepted Uber order is still `paid` no longer falls through to generic `OrdersService` status mutation. The POS adapter resolves the existing Orders-owned fulfillment timing and routes IMMEDIATE orders to `activateImmediatePreparation()` and SCHEDULED explicit early-starts to `activateScheduledPreparation()`. Both commands require the durable accepted fact and write `making + durable order.prep_started` through `OrderPreparationService`; therefore staff cannot manufacture preparation before successful Uber acceptance.

With Web, ordinary in-store, Terminal and Uber paid entry points all on durable preparation, the old private same-process `order.prep_started` first-print channel has no production caller. Slice 1E removes its emitter/listener API and Fulfillment memory-origin branch. `OrderEventsBus` remains only for `order.paid.verified`, which still drives the explicitly deferred Uber Direct provider dispatch path. Initial `AUTO` printing is now reachable only from durable `order.prep_started`; explicit `REPRINT:*` and `AMENDMENT:*` operations remain independent.

This is same-context lifecycle contraction plus use of the already-public POS -> Orders preparation surface, so it adds no direct/public context edge and requires no baseline update. Direct-debt totals remain Payments/Clover **57**, External Channels **42**, Identity/Customer/Benefits **33**, Store Operations/POS/Print **31**, Commerce/Orders/Fulfillment **30**, Accounting **25**, Catalog/Offers **15**, Messaging **10**, Brand/Store **8**; the public SCC baseline remains empty. The existing 500 ms lifecycle poll remains unchanged because the dedicated Uber worker cannot safely wake an API-process in-memory consumer; it continues to bridge/recover accepted immediate Uber orders until a later durable trigger design changes that boundary.

### Phase 5 Slice 2 Print handoff / dispatch idempotency — 2026-09-06

Slice 2 keeps the measured context graph unchanged while tightening the existing Orders -> POS/Print handoff. Orders/Fulfillment no longer chooses persistence `kind`; it emits only `INITIAL | REPRINT | AMENDMENT` intent through the existing public-surface listener. The POS/Print owner generates `AUTO`, fresh `REPRINT:<uuid>` and `AMENDMENT:<uuid>` identities and target routing. The lifecycle consumer no longer queries Print-owned `PosPrintJob`; successful INITIAL handoff is checkpointed with Orders-owned durable `order.initial_print_handoff`, so replay remains idempotent without a Commerce -> Print persistence read.

`PosGateway` now claims each target under a database row lock before socket emission. Only `PENDING/FAILED` can become `DELIVERED`; concurrent callers see the committed claim and cannot emit the same delivery. ACK and timeout use the same row-lock discipline, `COMPLETED` is terminal, and reconnect recovery turns stale `DELIVERED` targets into retryable `FAILED/ACK_TIMEOUT`. The unchanged printer wire envelope is hardened on the Windows agent by persistent/in-flight `jobId + target` deduplication, with a bounded local completion file written by temp-file replacement.

The POS amendment path is repaired in the same Print-ownership slice because it is an existing AMENDMENT handoff defect rather than a new cross-context capability. VOID/ADD/SWAP creates a kitchen difference ticket; combo components come from the immutable before/after OrderItem snapshots; labels use only the positive delta between before/after label plans; and amount or payment-method changes create a customer-only full-receipt REPRINT. Orders also centralizes normal-create and amendment-ADD option/component materialization in an internal `OrderItemSnapshotBuilder`; pricing/Daily Special/promotion stay in `calculateLineItems`, while amendment keeps its explicit unit price and does not invoke pricing policy.

No new cross-context import or public SCC member is introduced, and no architecture allowance is relaxed. Direct-debt totals therefore remain Payments/Clover **57**, External Channels **42**, Identity/Customer/Benefits **33**, Store Operations/POS/Print **31**, Commerce/Orders/Fulfillment **30**, Accounting **25**, Catalog/Offers **15**, Messaging **10**, Brand/Store **8**; the public SCC baseline remains empty. No Prisma schema/migration, package/lockfile, Web Clover, Uber wire/provider behavior or Benefits transaction semantics change.

### Phase 5 pre-Slice 3 Uber Direct dispatch-failure alert hardening — 2026-09-06

The previously dormant delivery-dispatch-failure notification is now wired to the active `FulfillmentProcessor -> UberDirectService.createDelivery()` failure path. Commerce owns the decision that an Uber Direct delivery creation failed, Identity exposes only active Admin alert recipients through a stable-ID public query, and Messaging owns bilingual template rendering plus channel routing. Alert delivery is email-first per Admin and falls back to SMS only when email is unavailable or fails; provider/recipient internals do not leak back into Commerce.

`OrdersModule` also switches its Notification module composition import to `../notifications/public-api`, so `commerce-orders-fulfillment -> messaging-notifications` direct debt contracts **4 -> 3** and Commerce total outgoing direct debt contracts **30 -> 29**. The new Fulfillment imports use registered Identity/Messaging public surfaces, so no new direct-debt allowance is created and the public SCC baseline remains empty. No Prisma schema/migration, package/lockfile, Uber Direct provider request/response contract, order lifecycle, payment behavior or external route changes. PR #2200 merged as `f9e0014b` after final head `0feb44fa` passed PR CI #5220; Phase-level runtime verification remains deferred to Phase 5 closeout.

### Phase 5 Slice 3 — Orders -> Messaging public boundary contraction — 2026-09-06

The remaining Order-ready and invoice delivery calls are now expressed as Messaging-owned public capabilities. `ORDER_READY_NOTIFICATION` receives only the already-resolved trusted contacts, Order presentation facts and stable customer identity; Orders retains eligibility/contact/locale policy while Messaging retains rendering and email-first/SMS-fallback delivery. `ORDER_INVOICE_DELIVERY` accepts a neutral Messaging-owned receipt snapshot, so Orders still builds the receipt while Email owns invoice rendering/provider delivery without importing the POS `PrintPosPayloadDto`.

The source graph therefore contracts `commerce-orders-fulfillment -> messaging-notifications` **3 -> 0** and Commerce outgoing direct debt **29 -> 26**. Removing the invoice renderer's POS DTO import also contracts `messaging-notifications -> store-operations-pos-print` **1 -> 0** and Messaging outgoing direct debt **10 -> 9**. Both zero edges are removed from the monotonic legacy baseline, and an explicit scanner guard prevents concrete Messaging imports or POS/Prisma/Commerce leakage from returning through the two public contracts. The public SCC baseline remains empty. No schema/migration, dependency, route, payment, pricing, refund, lifecycle, compatibility or provider-wire change is part of Slice 3. PR #2201 final head `90cddfd0` passed CI #5225 and merged to `dev` as `62790355`; Phase-level runtime verification remains deferred to Phase 5 closeout.

### Phase 5 Slice 4A — low-risk direct-edge + dead-code contraction — 2026-09-06

Slice 4A merged via PR #2202 as `6e2da654` after final head `09cdd74d` passed rerun CI #5228. Orders transport gets both session guards from `auth/public-api.ts`, and Orders geocoding uses the Brand/Store-owned `LOCATION_GEOCODER` public capability rather than `LocationService` / `LocationModule` internals. The Location owner keeps the concrete Google Maps HTTP implementation private and exports only the token-backed port; existing geocoding behavior is unchanged.

The same atomic contraction deletes verified uncalled `OrdersService` tails (`ensureLoyaltyAccountWithTx`, `normalizeDropoff`, `buildUberPickupOverride`, `dispatchPriorityDelivery`) and removes the obsolete `OrdersService -> UberDirectService` injection. The active Uber Direct provider path remains `FulfillmentProcessor -> UberDirectService` and is intentionally unchanged. The monotonic direct-import baseline contracts `commerce-orders-fulfillment -> brand-store` **2 -> 0** and `commerce-orders-fulfillment -> identity-customer-benefits` **4 -> 2**, reducing Commerce outgoing direct debt **26 -> 22**. Architecture guards prevent the old deep imports and dead tails from returning; the public SCC baseline remains empty. No Prisma schema/migration, dependency, HTTP route, Web Clover, Uber wire/provider, pricing, refund, lifecycle or Benefits COMMIT semantics change.

### Phase 5 Slice 4B — Catalog persistence contraction — 2026-09-06

Slice 4B merged through PR #2203 after final head `7f8c0c9f` passed PR CI #5232; squash merge `b8f838ff` then passed merged-dev CI #5233. Earlier CI runs exposed lint-only issues and one final `tx.menuItem.findMany` hidden-item read; the final source routes every protected Orders Catalog read through the stable-ID-only `CATALOG_ORDER_FACTS_READER` and the scanner rejects any `.menuItem.` delegate in those consumers. Catalog exposes the same public capability for hidden-item facts, immutable OrderItem materialization facts and current label/packaging configuration. Orders retains the Web-vs-POS hidden-item policy, immutable snapshot assembly and physical label-plan decisions; only persistence ownership moves behind Catalog.

`OrderItemSnapshotBuilder` no longer imports Prisma-generated Catalog models or reads `MenuItem`; its prior DB-UUID fallbacks are not carried into the public contract because all legitimate create/amendment paths already normalize business stable IDs. `OrderLabelPlanService` no longer reads MenuItem/packaging persistence and uses `packagingType.stableId` instead of a packaging-row UUID for its ephemeral internal instance key. The three Orders consumers are scanner-guarded against direct MenuItem persistence access and deep Catalog imports, while the public contract is guarded against Prisma/concrete-service/DB-ID leakage. This extends the already-existing Commerce -> Catalog public direction (`@shared/menu`) without changing the legacy direct-import table: Commerce remains **22**, Catalog remains **15**, and the public SCC baseline remains empty. No schema/migration, dependency, route, pricing/promotion, payment/refund, Benefits transaction or provider-wire semantics change.

### Phase 5 Slice 4C — Customer runtime read contraction — 2026-09-06

Slice 4C merged through PR #2204 after final head `3efd8930` passed PR CI #5236; squash merge `1f58f1a3` is the current `dev` base for the follow-up repair. Customer exposes `CUSTOMER_ORDER_CONTEXT_READER` through `membership/public-api.ts`; the existing `CustomerService` remains the single Prisma-backed owner for verified contact/language and saved-address lookup. Orders supplies only `userStableId` / `addressStableId`, and no User DB UUID, Prisma model or concrete Customer implementation crosses the public boundary.

Orders no longer reads `User` or `UserAddress` persistence directly. Order-ready member contact/locale fallback and delivery verified-phone/saved-address facts use the Customer public capability, while Commerce keeps trusted-contact precedence, delivery requirements and notification policy. `getByStableIdWithOwner()` now returns persisted `Order.userStableId` directly; the production Phase 4 stable-ID backfill already verified 45/45 linked Orders with 0 orphan/mismatch and all current member Order creation paths dual-write the stable identity.

This is hidden persistence-ownership contraction, so the direct-import table does not change: `commerce-orders-fulfillment -> identity-customer-benefits` remains **2** and Commerce total remains **22**. Those two counted direct imports are the still-deferred concrete `LoyaltyService` and `MembershipService` seam, not Customer reads. The public SCC baseline remains empty, and scanner guards prevent Orders from regaining User/UserAddress delegates or leaking Prisma/DB IDs through the Customer contract. No schema/migration, dependency, route, payment/refund, pricing, lifecycle, provider-wire or Benefits COMMIT transaction behavior changes.

Read-only production audit during 4C found a separate existing functional debt: both current `UserAddress.addressStableId` rows used the historical `a...` prefix, while Orders' existing `normalizeStableId()` accepts only canonical `c...` CUID values. Slice 4C-A fixes only the Customer-owned generator and its focused fixtures so new addresses use the canonical StableId format; Orders validation is not widened. The source repair merged through PR #2205 after final head `227643935d6c8ad02e39ef1b91fff176c49bb204` passed CI #5238, with squash merge `c02c3bac`; the two historical production rows have now been deterministically repaired by restoring the first character from `a` to `c`, and the saved-address resolution path is verified. This follow-up changes no imports, context ownership, direct-debt count, scanner allowance, or SCC baseline: Commerce remains **22** and the public SCC remains empty.

### Phase 5 Slice 4D — Benefits runtime read contraction — 2026-09-06

Slice 4D merged through PR #2206 after final head `4c6795de89e775dffd3228d8c9d34f617bf1c936` passed final PR CI #5242; squash merge `a88d82f7b5dd9917dd4789e965fa252e1b3fda7d`. It adds the Benefits-owned stable-ID-only `ORDER_BENEFITS_READER` for coupon-for-order projection, current payment-tender availability and loyalty-only redeem capacity. Member existence remains Customer ownership and Orders reuses `CUSTOMER_EXISTENCE_READER` to preserve the historical `member not found` behavior. Orders quote pricing, Web stored-balance validation and loyalty-only order eligibility consume those public owner capabilities; `createLoyaltyOnlyOrder()` no longer reads `LoyaltyAccount` persistence directly. Internal User/Coupon DB UUID resolution needed for Benefits facts stays inside the Benefits implementation, while Commerce continues to own pricing, promotion acceptance and insufficient-balance decisions. Normal checkout availability still excludes active payment holds; loyalty-only eligibility deliberately preserves the historical raw-account-points check.

The existing `LoyaltyService` and `MembershipService` direct imports are deliberately retained only for the preparation/transaction/mutation seam that cannot be safely replaced without changing atomicity: prepared-payment internal identity, same-transaction Tender/Coupon COMMIT + Order creation, transactional normal-order coupon/Loyalty reserve/deduct, and refund/amendment/paid-side-effect mutations. Therefore the monotonic direct-import table intentionally remains `commerce-orders-fulfillment -> identity-customer-benefits = 2` and Commerce total remains **22**; public SCC remains empty. The scanner instead prevents regression of direct `loyaltyAccount` reads, concrete tender/max-redeem runtime reads, DB-ID leakage through the new contract, and any expansion beyond the two preserved concrete member/coupon read call sites. No schema/migration, dependency, route, payment/refund, pricing, lifecycle, provider-wire or Benefits COMMIT semantics change.

### Phase 5 Slice 4E — Uber Direct provider implementation contraction — 2026-09-06

Slice 4E merged through PR #2207 after final head `4cc113e6b47bf95ac4a72a6a34c87eabe0143c1a` passed final PR CI #5245; squash merge `24e7976d1851788a3d80cae37f95f92b0d5ffb6f`. It removes the remaining production `FulfillmentProcessor -> UberDirectService` concrete dependency. Deliveries exposes `UBER_DIRECT_DELIVERY_DISPATCHER` plus stable request/result types through `deliveries/public-api.ts`; the existing `UberDirectService` implements the port internally, and `DeliveriesModule` binds the token with `useExisting` while exporting only that token. `OrdersModule` now composes Deliveries through the public surface rather than deep-importing `deliveries.module`.

Fulfillment still owns Uber-delivery eligibility and builds exactly the same `orderRef`, pickup code, manifest, destination and pickup-ready input. The provider adapter still owns HTTP/auth, payload transformation and response normalization, and Fulfillment still persists the returned `deliveryId` into `Order.externalDeliveryId`. The existing provider-create failure -> Admin alert behavior and the provider-success/local-persistence-failure distinction are unchanged; the latter remains log-only to avoid accidentally creating a duplicate provider delivery. The broader in-memory `order.paid.verified` durability/idempotency gap remains deferred.

This is a same-context provider-implementation contraction, so the numeric direct-import table does not change: Commerce remains **22** and public SCC remains empty. Scanner guards prevent `FulfillmentProcessor` from importing `UberDirectService`, prevent `OrdersModule` from deep-importing `deliveries.module`, keep the public dispatch contract free of Nest/Prisma/Http/concrete-service/internal Order DB IDs, and require `DeliveriesModule` to export only the token-backed capability. Existing Uber Direct characterization continues to lock provider wire behavior, while Fulfillment coverage locks the request handed to the dispatcher and the existing failure semantics.

### Phase 5 Slice 4F — Fulfillment / Print payload boundary contraction — 2026-09-06

Slice 4F merged through PR #2208 after final head `f6ca667c46d3a0e4783c6354ac9bdaea9f68569c` passed PR CI #5247; squash merge `3cc775f141ab08180e8d8751a519dc89ea173a93`. It makes the receipt/kitchen payload an Orders-owned public output contract. `PrintPosPayloadService` implements `OrderPrintPayloadReaderPort`, `OrdersModule` exports only `ORDER_PRINT_PAYLOAD_READER`, and the payload contract preserves the existing print shape without Prisma or POS implementation types. `FulfillmentProcessor` consumes the local Orders contract instead of a POS DTO.

The POS print-payload route keeps its existing route, store-scope check and response shape but now injects the reader token from `orders/public-api.ts`; it no longer deep-imports `PrintPosPayloadService`. The former POS-owned `print-pos-payload.dto.ts` is removed, eliminating its reverse deep import of Orders item-option snapshots. Print job identity, target routing, socket dispatch, agent wire payload and ACK/retry semantics remain unchanged.

The legacy direct graph therefore contracts in both directions: Commerce -> Store Operations **2 -> 0** and Store Operations -> Commerce **2 -> 0**. Commerce outgoing direct debt becomes **20**, Store Operations becomes **29**, both zero edges are removed from the monotonic baseline, and the public SCC remains empty. Scanner and focused architecture coverage prevent the DTO/concrete-service deep imports from returning.

### Phase 5 Slice 5A — Order invoice use-case decomposition — 2026-09-06

Slice 5A merged through PR #2209 after final head `7346ec58f66b03c38738a700edcee090f24c36df` passed final PR CI #5255; squash merge `3a37a6251ad5fde63dcd3f8275277cd1a8d9ae43`. `OrderInvoiceUseCase` extracts the invoice leaf from the broad `OrdersService`. Both existing invoice HTTP routes call the dedicated use case directly. It normalizes/validates the requested email, reads the Orders-owned print projection through `ORDER_PRINT_PAYLOAD_READER`, preserves the existing fulfillment mapping and delegates the unchanged invoice payload through Notifications-owned `ORDER_INVOICE_DELIVERY`.

`OrdersService` no longer owns invoice methods or injects either invoice delivery or the concrete `PrintPosPayloadService`; those dependencies were exclusive to this leaf. The use case remains internal to Orders composition and is not exported as a cross-context service. Focused characterization preserves recipient normalization, print-payload lookup, invoice delivery input and `invalid_email` fail-fast behavior. Scanner guards prevent the invoice leaf from being folded back into `OrdersService`.

This same-context decomposition changes no direct-import baseline: Commerce remains **20**, Store Operations remains **29**, and public SCC remains empty. Create/finalize/refund/amendment transaction behavior and the deliberately preserved Benefits transaction seam are untouched.

### Phase 5 Slice 5B — Ready-notification use-case decomposition — 2026-09-06

`OrderReadyNotificationUseCase` extracts the complete post-`ready` notification leaf from `OrdersService`. The status owner still validates `ORDER_STATUS_TRANSITIONS`, performs the compare-and-set status mutation, writes `makingAt` / `readyAt`, and owns paid/refunded side effects; only after a successful `ready` write does it fire `void orderReadyNotificationUseCase.handle(updated)`.

The new use case preserves the existing notification policy exactly: delivery orders are not notified; order number resolves from `clientRequestId ?? orderStableId`; member contact/language facts come through `CUSTOMER_ORDER_CONTEXT_READER`; checkout verified contacts outrank member contacts; only Uber orders may fall back to external order contacts; locale uses member language then checkout locale then `en`; delivery still goes through Notifications-owned `ORDER_READY_NOTIFICATION`; and structured success/failure logging keeps the same PII redaction. Its internal Promise chain preserves the old non-blocking timing semantics.

Persistence access needed only to interpret checkout metadata is composed through the existing Orders-local `orders-prisma` facade, so the extraction does not add a new Commerce -> Runtime source edge. The scanner prevents ready-notification policy, Notifications delivery symbols, contact/locale resolution and redaction from returning to `OrdersService`, prevents deep Notification/Email/Prisma imports in the use case, and keeps the use case internal to `OrdersModule`. Direct-import totals remain Commerce **20**, Store Operations **29**, Commerce -> Runtime **10**, with public SCC empty.

Before the main Identity/Messaging slices, the planned cross-phase readiness/contraction
work is now complete and production verified:

1. **Slice 0A — Admin PromotionRule ownership contraction.** Merged via PR #2163 /
   `aa302629` after final GitHub Actions CI #5092 passed. PromotionRule management
   validation/CRUD sits behind the Offers-owned `PROMOTION_RULE_MANAGEMENT` capability;
   Admin no longer owns Prisma or Prisma-generated rule types. Raw persistence remains
   behind the existing `PromotionsService` Prisma entry, so Catalog -> Runtime stays at
   `10`. The retired Admin service is deleted, focused characterization/mapping tests are
   present, the central scanner reserves the delegate to Offers, and Identity -> Runtime
   contracts `18 -> 16`. The authorized Admin response contraction also removes unused
   DB `id`/`createdAt`/`updatedAt`/`deletedAt` fields while preserving all business fields,
   routes and request semantics. Active Admin create/edit/refresh/delete verification was
   completed on 2026-09-04, so the original 0A ownership slice is production VERIFIED.
2. **Slice 0A verification hotfix — POS server-authoritative promotion pricing.** PR #2166
   merged as `bb833550` after final head `567a1aba` passed CI #5102. It adds a narrow POS
   pricing quote to the existing Orders public capability so the POS adapter displays
   automatic promotions and the retained staff manual discount from the canonical server
   quote before taking payment. The POS payment adapter is also contracted to local
   `channel=in_store` only: the staff UberEats channel selector/payment method and their
   legacy branches are removed, while Uber webhook/import/runtime remains unchanged. Active
   production verification on 2026-09-04 confirmed same-item BOGO pricing appears in POS,
   the staff manual discount remains separate and stackable, and the completed order/payment
   amount matches the server-authoritative checkout total. The hotfix is therefore
   **PRODUCTION VERIFIED**. This is a method/transport expansion plus adapter cleanup on an
   already-existing POS -> Orders public boundary; it introduces no new context edge,
   direct-import debt, SCC member/edge, Prisma ownership, or baseline change. Offers still
   owns promotion policy and Orders still owns order pricing truth.
3. **Slice 0B — Catalog -> Orders public-cycle edge contraction.** PR #2168 merged as
   `b2d42c32` after final head `739938c5` passed GitHub Actions CI #5107. The reverse
   dependency was exactly the two Offers imports of Orders-owned `Channel`. Promotion
   applicability now uses the Offers-owned `PromotionRuleChannel = 'web' | 'in_store'`;
   Orders performs one exhaustive boundary mapping (`web -> web`, `in_store -> in_store`,
   `ubereats -> no PromotionRule context`). The authenticated Admin PromotionRule editor
   exposes only Web/POS channels, and the owner validator rejects the historical dead
   `ubereats` configuration value. Production data was read-only audited before
   implementation and contained **0** PromotionRule rows whose `channels` array included
   `ubereats`, so no schema/migration or data rewrite was required. Active production
   verification on 2026-09-04 confirmed the Admin channel contraction, Web PromotionRule
   pricing, POS BOGO/manual-discount behavior and Uber selection isolation; Slice 0B is
   therefore **PRODUCTION VERIFIED**. Uber order ingestion/runtime/wire behavior remains
   unchanged and continues to persist provider-supplied order amounts through the separate
   ingestion path rather than SanQ PromotionRule evaluation.

The prior Store temporary-close codec item is no longer a Phase 4 Slice 0 task because
PR #2160 already moved that persistence encoding to Brand/Store and removed the final
`brand-store -> store-operations-pos-print` direct edge.

Slice 0B removed the public edge
`catalog-pricing-offers -> commerce-orders-fulfillment`; Orders therefore left the legacy
SCC while `commerce-orders-fulfillment -> catalog-pricing-offers` remained the correct
one-way pricing-consumer dependency.

Phase 4 Slice 1 removes the remaining owner-reversed
`messaging-notifications -> identity-customer-benefits` public edge by moving email
verification challenge/account ownership to Identity and leaving Messaging with delivery
only. PR #2171 merged as `afa1bff6` after final head `94955b27` passed CI #5116. The former
three-context Catalog / Identity / Messaging component is no longer strongly connected:
`identity-customer-benefits -> catalog-pricing-offers` and
`catalog-pricing-offers -> messaging-notifications` may remain as forward consumer flows,
but there is no return path from Messaging to Identity. The
`legacyPublicCycleComponents` baseline is empty and the monotonic SCC guard rejects any
future public edge that recreates the cycle. Production deployment/verification is
intentionally deferred to the Phase 4 batch rollout.

Slice 2A contracts Auth challenge delivery behind the Messaging-owned
`AUTH_CHALLENGE_DELIVERY` public capability. Auth keeps challenge/session/MFA lifecycle;
Messaging owns OTP configuration/template/provider dispatch. Auth's seven concrete
Email/SMS/Messaging imports disappear while the welcome-notification pair remains, so
`identity-customer-benefits -> messaging-notifications` contracts **22 -> 15** and total
Identity outgoing direct debt contracts **60 -> 53**. Known-user delivery now crosses the
public boundary with `userStableId`, not the internal User DB UUID. PR #2172 merged as
`c8e91303` after final head `29bf23b7` passed CI #5120; deployment remains deferred to the
Phase 4 batch rollout.

Slice 2B contracts the five remaining Phone Verification Messaging implementation imports
behind the dedicated `PHONE_VERIFICATION_DELIVERY` public capability. Identity continues to
own phone normalization, IP/daily rate limits, non-zero OTP/hash policy, `AuthChallenge`,
10-minute expiry, attempts/consume/token validation and `sms_send_failed`; Messaging owns
only messaging snapshot/template/SMS provider dispatch. The historical OTP template purpose
stays fixed at `verify`, while caller purpose remains challenge metadata and Messaging
metadata. `identity-customer-benefits -> messaging-notifications` contracts **15 -> 10** and
total Identity outgoing direct debt contracts **53 -> 48**. PR #2173 merged as `41428324`
after final head `d63bc307` passed CI #5123; HTTP routes, Clover phone-proof validation and
AdminMembers' current PhoneVerificationService dependency remain unchanged. Deployment stays
deferred to the Phase 4 batch rollout.

Slice 2C contracts Admin's four concrete Email dependencies into two narrow Email public
capabilities. Staff invite create/resend/revoke state remains in Identity/Admin while
`STAFF_INVITE_DELIVERY` delegates the existing invite email path. POS member recharge email
OTP keeps contact/profile matching, challenge lifecycle and recharge-token semantics in
Identity, while `MEMBER_RECHARGE_EMAIL_DELIVERY` owns the bilingual message body,
`MessagingTemplateType.OTP`, `pos_recharge_otp` tag and provider dispatch. The delivery
boundary uses `userStableId` rather than the internal User DB UUID. Admin no longer imports
`EmailService` or `EmailModule`; `identity-customer-benefits -> messaging-notifications`
contracts **10 -> 6** and total Identity outgoing debt contracts **48 -> 44**. PR #2174 merged
as `e27489cf` after final head `2c18e3c5` passed CI #5126; deployment remains deferred to the
Phase 4 batch rollout.

Slice 2D contracts Auth and Membership lifecycle notifications behind the narrow
`CUSTOMER_LIFECYCLE_NOTIFICATION` public capability. Auth retains the new-user decision and
maps only stable customer/contact/name/language facts for registration welcome delivery.
Membership retains the persisted marketing-consent decision and invokes subscription welcome
only after `email + marketingEmailOptIn` are true; the existing marketing opt-in coupon trigger
still runs afterward. Messaging retains template rendering, registration email-to-SMS fallback,
provider routing and audit metadata, but registration/subscription sends now link by
`userStableId` rather than the User DB UUID. `identity-customer-benefits ->
messaging-notifications` contracts **6 -> 2** and total Identity outgoing debt contracts
**44 -> 40**. PR #2175 merged as `0cb3ce11` after final head `a0fa3f85` passed CI #5130;
deployment remains deferred to the Phase 4 batch rollout.

Slice 2E-A retires the user-confirmed unused AWS SNS/SQS infrastructure. The SNS HTTP webhook
and SES SQS processor are deleted, MessagingModule no longer needs Prisma for SNS persistence,
and runtime SNS/SQS environment wiring is removed while AWS SES/SMS send providers remain
available. This contracts `messaging-notifications -> architecture-foundation` **4 -> 3**,
`messaging-notifications -> runtime-data-ci-ops` **9 -> 6**, and Messaging total outgoing direct
debt **14 -> 10**. PR #2176 merged as `7746402b` after final head `11f73e88` passed CI #5132;
deployment remains deferred to the Phase 4 batch rollout.

Slice 2E-B locally moves `OrderEventsBus` out of Messaging and makes it private Orders/Fulfillment
fast-path infrastructure while preserving the separate durable lifecycle outbox. Loyalty no longer
subscribes to that bus; Orders invokes the stable-ID-only `LOYALTY_ORDER_PAID_SETTLEMENT` public
capability in the existing Orders -> Identity direction, so the empty public SCC baseline remains
empty. The final direct Identity -> Messaging imports contract **2 -> 0**, Identity -> Runtime
contracts **15 -> 14**, Commerce -> Messaging contracts **8 -> 4**, and External -> Messaging
contracts **2 -> 0**. Totals become Identity **37**, Commerce **31**, External **42**, Messaging
**10**. Uber order ingestion drops its dead paid-lifecycle flag and no longer needs a Messaging
bridge in API or worker composition; Uber wire behavior remains unchanged. The existing internal
`LoyaltyLedger.orderId` UUID remains deferred persistence debt; the new public boundary carries
only `orderStableId`.

## Phase 1 boundary changes reflected here

- `@shared/order` now owns Order contracts directly; `@shared/menu` no longer
  re-exports Order contracts.
- Daily-special policy now belongs to Promotions/Pricing instead of `common`.
- StableId validation primitives now live in neutral `@shared/foundation`; API
  `common` re-exports that implementation for existing server callers and Web
  imports the foundation package directly. Menu/Order packages no longer own or
  re-export those primitives.
- Web regular JSON transport is guarded separately: one browser client, one
  App Router BFF, and one server-side API helper; raw/direct fetch exceptions are
  explicit architecture allowances.
- Existing cycles remain migration debt for later phases. Phase 1 did not create
  a new direct context pair; CI rejects any such regression.

## Phase 2 Brand/Store boundary closed

- `apps/api/src/store/public-api.ts` now defines the narrow canonical Brand/Store
  configuration read contract. It exposes stable store identity and canonical
  BrandConfig/StoreConfig facts, but not the Store database UUID and not Benefits
  policy fields that happen to be duplicated in `BrandConfig` during transition.
- `PrismaBrandStoreConfigReader` is the single registered Prisma reader for that
  snapshot. It reads `BrandConfig` plus `Store`/`StoreConfig`, fails closed when
  canonical rows are missing, and never creates fallback configuration.
- Configured store stable identity now belongs to the Brand/Store public surface
  as `resolveConfiguredStoreStableId()`. Existing Orders, Clover, POS, Admin and
  Uber callers were moved off `common/store-id.ts`, lowering direct
  architecture-foundation debt without changing the resolved store value.
- `StoreStatusService` no longer reads or creates `BusinessConfig`. Store schedule
  reads now go through the Brand/Store-owned `STORE_SCHEDULE_READER`, with
  `storeStableId` resolved to `storeDbId` only inside the Prisma adapter. The
  BusinessHour/Holiday hard-coded store UUID defaults are removed by the
  store-scope migration, and BusinessHour uniqueness is scoped to
  `(storeDbId, weekday)` instead of weekday globally.
- Accounting, Promotions, PublicMenu, AdminMenu, and Orders now read store-local
  timezone through the canonical Store snapshot. Public/Admin menu reads no longer
  create a default `BusinessConfig` row as a side effect; Orders also no longer
  creates `BusinessConfig` while resolving pricing or daily-special time.
- POS exchange-rate configuration now uses the combined Brand/Store snapshot:
  `StoreConfig.timezone` controls the store clock and
  `BrandConfig.wechatAlipayExchangeRate` supplies the existing manual fallback.
  The POS exchange-rate module no longer imports Prisma directly, while the
  externally visible fallback source label remains unchanged for compatibility.
- POS StoreStatus/Connectivity now uses the canonical Brand/Store boundary for both
  reads and writes. Timed-pause status/timezone reads, manual pause/resume, and the
  watchdog's recovery race re-check no longer query or mutate `BusinessConfig`.
  The guarded POS StoreStatus transport now carries its authenticated device
  `storeStableId` through reads, pause/resume writes, and timed-pause
  compare-and-set reconciliation instead of letting the Brand/Store owner infer a
  configured store. The deployment-scoped connectivity watchdog resolves its
  configured `storeStableId` once, scopes ACTIVE POS-device heartbeats to that
  Store relation, and passes the same explicit identity through StoreStatus and
  pause reconciliation. The public `/public/store-status` route keeps its existing
  deployment-store behavior but resolves that identity at the transport boundary.
  The timed auto-resume compare-and-set remains inside the Brand/Store writer so
  an outdated expiry task cannot clear a newer pause; each store CAS updates only
  its canonical StoreConfig because the former singleton BusinessConfig mirror has
  been fully removed. POS is architecture-gated against regressing to Prisma
  configuration delegates or implicit store selection.
- POS Orders and Daily Summary browser timezone context now comes from the guarded
  `/pos/store-context` adapter. `PosDeviceGuard` supplies the authenticated device
  `storeStableId`, and the adapter requests that exact Store snapshot through
  `BRAND_STORE_CONFIG_READER`; the POS browser no longer uses the implicit
  `/staff/store/config` fallback for its own store context.
- Orders historical NULL-store compatibility is contracted in the current batch after
  direct production verification found `Order.storeId IS NULL = 0`. Store-scoped Orders
  and scheduled queries now match only the explicit canonical `storeStableId`; scheduled
  preparation no longer admits a NULL store row. Accepted, reprint, and amendment print
  dispatch now fail closed with a structured missing-store error instead of routing an
  unscoped order to `resolveConfiguredStoreStableId()`. Architecture scanning registers
  the affected Orders paths and rejects those NULL/configured-store fallbacks returning.
- Admin Brand/Store transport now uses only the owner-aligned staff contracts. Canonical
  staff Web Store consumers require an explicit `storeStableId` and use
  `/staff/stores/:storeStableId/*` adapters backed by `BRAND_STORE_CONFIG_READER/WRITER`
  and the Store schedule ports. The selector writes a valid `?store=` context before
  Store settings load. The singular `/staff/store/*` compatibility routes and the
  legacy `/admin/business/*` config/hours/holidays/temporary-close transport are both
  removed; the standalone legacy `BusinessHoursModule` is retired with that transport.
  Admin no longer writes `BusinessConfig`, `BrandConfig`, `StoreConfig`,
  `BusinessHour`, or `Holiday` through Prisma directly. The Brand/Store owner writer
  now writes only canonical `BrandConfig`/`StoreConfig` rows. Mirror-off production
  verification and the fail-closed destructive contraction are complete: the Prisma
  `BusinessConfig` model, physical table, sync trigger, and sync function are gone.
- Uber menu schedule/tax and store-status source reads now cross the Brand/Store
  boundary through an Uber application-owned `UBER_STORE_CONFIG_QUERY` port. The
  sole Uber composition root wires that port to `BRAND_STORE_CONFIG_READER` for
  both HTTP and dedicated-worker runtimes; Uber persistence no longer reads or
  creates `BusinessConfig`. Active Uber admin/source labels now identify
  `StoreConfig` as the canonical timezone/tax source; provider wire behavior is unchanged.
  Uber architecture CI now rejects any production `.businessConfig` regression.
- Messaging configuration now caches the canonical Brand/Store snapshot instead
  of a Prisma `BusinessConfig` model and no longer creates configuration on read.
  Brand support contact fields feed message templates, while Store name/address/
  phone feed invoice contact details so support and store-phone semantics are no
  longer conflated.
- `BrandStoreConfigModule` is exported through `store/public-api.ts`; its reader
  and writer tokens, identity/contract implementation, composition module, and
  shared Prisma implementation stay owner-internal. Cross-context consumers wire
  the public module and inject the public tokens instead of deep-importing internals.
- The architecture scanner protects the public surface from cross-context deep
  imports, prevents the canonical reader/writer from regressing to legacy persistence,
  requires canonical writes plus temporary-closure CAS, forbids any API runtime
  `.businessConfig` delegate, requires the Prisma `BusinessConfig` model to stay absent,
  and pins the registered contraction migration to atomic fail-closed parity/dependency
  checks with trigger → function → table DDL and no `CASCADE`. It also keeps POS
  Orders/Summary browser store context on the guarded POS endpoint and prevents
  canonical Admin Store clients/settings or the staff transport adapter from
  restoring implicit `/staff/store/*` routes or optional `storeStableId` contracts.
- Admin remains an Identity/Customer/Benefits adapter path for dependency-map
  accounting, but its Business configuration persistence now crosses the
  Brand/Store public writer boundary. No new direct context edge is introduced.
- Admin POS-device management crosses the Store Operations/POS `public-api.ts`
  management boundary. The former Admin Prisma device service and Prisma-generated
  status/store UUID DTO dependencies are removed, lowering Identity/Customer/Benefits
  runtime-data direct-import debt by five. Canonical Web requests use only
  `storeStableId`/`deviceStableId`; `pos-device.admin-db-id.v1` is now contracted,
  so unscoped list aliases, inbound Store/device DB UUID translation, the POS
  compatibility port/provider, and the Brand/Store legacy DB-ID resolver are absent.

## Phase 2 Benefits loyalty policy reader/writer boundary closed

- `apps/api/src/loyalty/public-api.ts` exposes narrow `LOYALTY_POLICY_READER` and
  `LOYALTY_POLICY_WRITER` contracts owned by Identity/Customer/Benefits. Loyalty
  earn/redeem/referral rates, tier multipliers, and tier thresholds remain
  explicitly excluded from the Brand/Store public configuration contract even
  though transitional columns currently live in `BrandConfig`.
- Membership program rules, Admin member tier-progress thresholds, and all
  LoyaltyService policy reads use the Benefits snapshot backed by transitional
  `BrandConfig` columns. Transaction-bound reads remain inside their existing
  Prisma transaction through `getLoyaltyPolicySnapshotWithTx(tx)`.
- Admin Members policy saves now use `/admin/benefits/loyalty-policy`, whose
  Benefits-owned writer preserves the established rounding/non-negative rules,
  while tightening `redeemDollarPerPoint` to the existing business invariant
  `> 0`; Phase B writes `LoyaltyProgramPolicy`, the `BusinessConfig` compatibility
  copy, and `BrandConfig` in one transaction. The compatibility copies are still
  required because the existing DB trigger is one-way (`BusinessConfig` -> canonical
  config); allowing either transitional copy to become stale could revert Benefits
  values on a later unrelated legacy config write.
- The general Admin Settings page no longer declares or resubmits Loyalty policy
  fields. During the Benefits transition, legacy `PATCH /admin/business/config` and
  `PUT /admin/business/temporary-close` rejected all ten Loyalty keys with HTTP 400;
  the later Brand/Store transport contraction now removes those routes entirely.
  `AdminBusinessService` still does not import or invoke Benefits policy readers or
  writers, and repository-wide Web code remains gated from restoring the retired
  `/admin/business/*` transport or routing Loyalty policy through it.
- Admin Members now reads editable settings from `GET /admin/benefits/loyalty-policy`
  through the Benefits settings reader, while POS payment reads the runtime policy
  from `GET /pos/loyalty-policy` through a POS adapter protected by the existing
  Session/Role/PosDevice guards. Both browser consumers use the centralized Web
  Loyalty API client rather than the legacy Admin Business response.
- Orders quote/create redemption conversion reads `redeemDollarPerPoint` through
  `LOYALTY_POLICY_READER`; the points/cents arithmetic remains characterized in an
  Orders-owned pure helper. Orders delivery pricing, sales tax, store coordinates,
  Uber Direct enablement, and daily-special store-local timezone now read through
  `BRAND_STORE_CONFIG_READER`; Orders no longer reads or creates `BusinessConfig`.
  The architecture scanner registers Orders as a migrated Brand/Store consumer and
  forbids reintroducing the `BusinessConfig` symbol or delegate there.
- `benefits.business-config-loyalty-policy.v1` is **closed**. Phase A expanded and
  backfilled `LoyaltyProgramPolicy`, Phase B established transitional triple-write/parity,
  Phase C cut runtime reads to the dedicated row, and Phase D completed the persistence
  contraction. Editable settings, runtime/transaction reads, and writes now use only
  `LoyaltyProgramPolicy`; `BrandConfig` and `BusinessConfig` no longer contain Loyalty
  policy columns; `syncBusinessConfigToCanonicalConfig()` contains no Loyalty propagation;
  and the architecture scanner rejects both application regression and reactivation of
  this persistence compatibility. Production direct verification covered Admin policy
  change/restore, POS policy load, Web pure-points order plus exact refund reversal,
  public membership rules, unrelated Store write/restore, database metadata, and the
  relevant error logs.
- `brand-store.business-config.v1` is **closed**. The application cutover and mirror-off
  production proof completed first, then migration
  `20260902044000_contract_brand_store_business_config` rechecked the 29 overlapping fields,
  expected trigger/function binding, row counts, and database dependencies under locks before
  dropping trigger → function → table without `CASCADE`. Post-deployment verification on
  2026-09-02 confirmed `BusinessConfig`, `BusinessConfig_sync_canonical_config`, and
  `syncBusinessConfigToCanonicalConfig()` are absent while `BrandConfig`, the configured
  Store, and `StoreConfig` remain intact. An Admin Brand PATCH persisted the new canonical
  exchange rate `5.2`; POS pause/resume both returned 200, Uber status sync succeeded in both
  directions, final StoreConfig state is open, and API/worker error scans were clean.

## Phase 3 Catalog / Pricing / Offers started

- Phase 3 Slice 1 is tracked in
  `docs/architecture/phase-3-catalog-pricing-offers.md`.
- Orders now consumes Pricing only through `apps/api/src/promotions/public-api.ts`.
  The public surface exposes the existing promotion evaluator/types plus a narrow
  `PROMOTION_CONTEXT_READER`; `OrdersService` no longer imports the Pricing
  service, evaluator, engine or coupon adapter internals directly.
- The corresponding architecture allowance
  `commerce-orders-fulfillment -> catalog-pricing-offers` is removed from the
  baseline, contracting that direct-import debt from 5 to 0.
- Loyalty's two promotion-engine imports and Admin's Promotions module wiring now
  use the same public surface, lowering
  `identity-customer-benefits -> catalog-pricing-offers` from 10 to 7 in Slice 1.
- Slice 2 adds an explicit `apps/api/src/benefits` owner root and Benefits-owned
  coupon claim/trigger/admin-issuance contracts. `CouponsModule` is no longer
  global and exports only those narrow tokens instead of concrete services.
- Auth, Loyalty, Membership, Promotions and Admin now consume coupon-entitlement
  behavior through `benefits/public-api.ts`; CouponTemplate/CouponProgram
  validation and CRUD are exposed through `coupons/public-api.ts`. The remaining
  `identity-customer-benefits -> catalog-pricing-offers` allowance is therefore
  removed, contracting that direct-import debt from 7 to 0. Removing Admin's two
  direct Prisma imports also contracts `identity-customer-benefits ->
  runtime-data-ci-ops` from 23 to 21.
- The legacy Coupon implementation stays physically under `coupons` until its
  Prisma/Messaging dependencies can be contracted without raising another debt
  allowance. Slice 2 itself left Payments-facing coupon HOLD/COMMIT/RELEASE unchanged.
- Slice 2B is **MERGED** via PR #2139 / `6a022c8c`. Unified Payment preparation now
  injects Benefits-owned Points/Balance and Coupon reservation ports, and the POS
  payment composition module imports the Benefits public reservation module instead
  of `LoyaltyModule` / `MembershipModule` directly. Coupon HOLD carries
  `userStableId` rather than the snapshot's internal User DB UUID. Four production
  deep imports disappeared, lowering `payments-clover -> identity-customer-benefits`
  from 17 to 13; CI architecture/lint/build/test gates were green before merge.
- Slice 2C is **DEFERRED** after a 2026-09-03 readiness audit. The transaction-bound
  COMMIT remains inside `OrdersService.createFromConfirmedPaymentSnapshot()` because
  Points/Balance COMMIT, Coupon COMMIT and Order creation currently protect one
  atomic Prisma transaction. Replacing only the two COMMIT calls would not remove
  the broader `OrdersService` Benefits dependency, while splitting the transaction
  or publishing `Prisma.TransactionClient` would violate the current transaction
  boundary rules. Revisit only after a safe transaction-scoped capability exists.
- Slice 3 is merged via PR #2141 / `a29aae1d`. Admin menu CRUD/read-model/application
  decisions now live in Catalog-owned `CatalogAdminService` exposed via
  `menu/public-api.ts`. The legacy `AdminMenuService` is deleted; Admin
  controller/module no longer own Prisma or Brand/Store configuration reads. The two
  removed Admin Prisma imports contract `identity-customer-benefits ->
  runtime-data-ci-ops` from 21 to 19. A new Catalog Prisma import is offset by
  deleting the redundant local `PrismaService` provider from `PromotionsModule`, so
  `catalog-pricing-offers -> runtime-data-ci-ops` remains 10 rather than increasing.
- Slice 3's temporary Admin availability/provider coordination is contracted by
  Slice 5. `AdminMenuAvailabilityOrchestrationService` is deleted; Admin menu now
  consumes a public application orchestration surface and no longer wires
  `UberEatsModule` directly. Catalog availability facts are exposed through a narrow
  public reader that Uber composition adapts into an application query port;
  `UberMenuAvailabilityPrismaAdapter` no longer reads Catalog `MenuItem` /
  `MenuOptionTemplateChoice` Prisma delegates and stays DB-only for Uber mapping /
  OpsTicket facts. The fixed-component
  `publishToUberEats` provider-capability restriction now lives in orchestration
  rather than `CatalogAdminService`. Removing the old Admin service's foundation
  logger import and Admin module's direct `UberEatsModule` wiring lowers
  `identity-customer-benefits -> architecture-foundation` from 14 to 13 and
  `identity-customer-benefits -> external-channels` from 2 to 1. The replacement
  cross-context calls use public surfaces, so no new debt pair is introduced. The
  scanner is tightened to prevent the old Admin/provider and Uber/Catalog persistence
  paths from returning. Production Web Clover, Prisma schema/migrations and Uber
  wire contracts remain unchanged. Active verification passed item permanent OFF/ON,
  temporary-today availability and option OFF/ON. PR #2148 removed the stale
  `isAvailable` field from ordinary Admin item saves; after hard refresh, final
  verification at 00:11:00/00:11:05 Toronto observed two normal item PUT 200s and zero
  Uber availability updates in the surrounding minute. Slice 5 is production verified.
- Slice 5B locally contracts Daily Special ownership into Offers. The existing
  `PromotionsService` implements the new `DAILY_SPECIAL_OFFERS` capability and remains
  the sole `MenuDailySpecial` persistence owner for store-time activation/effective
  pricing without adding a new Prisma direct edge. Catalog supplies only item stable-ID/base-
  price facts; Admin full-menu/list/bulk-write composition lives in `application/menu`,
  and Public Menu / Orders consume the Offers public capability rather than the
  `menuDailySpecial` Prisma delegate. `CatalogAdminModule` isolates the reusable Catalog
  owner provider so Uber worker availability composition does not inherit HTTP-side
  Daily Special/StoreConfig wiring. The central scanner now reserves
  `MenuDailySpecial` Prisma access exclusively for the Offers service. No direct debt
  pair/count is expected to change because replacement traffic uses public surfaces.
- Slice 4 is merged via PR #2142 / `3629bc3b`; coupon-issued notification requests
  now cross the Messaging public boundary. `CouponProgramTriggerService` injects the
  `COUPON_ISSUED_NOTIFICATION` port from `notifications/public-api.ts`, maps the
  current User/CouponProgram records into a narrow snapshot, and no longer imports
  `NotificationService`. `CouponsModule` also imports `NotificationModule` only via
  the public surface. Only `userStableId` crosses the public boundary; `EmailService`
  resolves the existing internal `MessagingSend.userId` relation inside Messaging
  persistence. Removing both former deep imports contracts
  `catalog-pricing-offers -> messaging-notifications` from 2 to 0, and the baseline
  allowance is deleted so any direct edge in that direction now fails CI.
- Pre-Phase-3 Uber boundary hardening is now **PRODUCTION VERIFIED** (2026-09-03):
  - PR #2130 / `32d3925f` contracted Uber Store Policy ownership so order admission
    reads auto-accept/allergen policy through `UBER_STORE_CONFIG_QUERY` ->
    `BRAND_STORE_CONFIG_READER` instead of persistence-adapter policy methods.
  - PR #2131 / `4b615f49` contracted Uber store identity naming: SanQ store context
    is explicitly `storeStableId`, provider identity remains `uberStoreId`, and
    persistence still writes the SanQ stable ID into `Order.storeId`.
  - PR #2132 / `0c0a678e` exposed Orders ingestion through the public
    `ORDER_INGESTION` boundary, removed Uber's concrete `OrderIngestionService`
    dependency, preserved the same-transaction Uber action/cancellation callback,
    and lowered `external-channels -> commerce-orders-fulfillment` from 5 to 1.
  - Active production/sandbox verification covered auto-accept ON, auto-accept OFF
    with manual acceptance, immediate order completion, Uber cancel/refund, and a
    scheduled order moving from scheduled queue into active preparation. The
    scheduled activation produced one print job with kitchen/customer delivery
    ACKs; three test orders persisted under `4750_Yonge_Street`, no duplicate
    ingestion was found, webhook processing completed on first attempt, and the
    Uber worker error/warn/failure scan was clean.
  - The allergen DENY_LIST case is recorded as **N/A (Uber Test Store limitation)**
    because the sandbox customer flow does not expose an allergen-entry control;
    it is not a failed verification item.
- PR #2134 / `e69b913d` fixed the Admin Uber pending-order read contract/UI mismatch:
  `orderStableId` and `totalCents` are returned again, `pickupCode` is exposed, and
  the table now shows a human-readable pickup code while truncating the two long
  IDs. CI is green; production UI re-verification remains pending the next deploy.

## Carried debt outside Phase 3 Slice 2

- `web.api-envelope-direct-payload.v1` was closed on 2026-09-02. Checkout now has
  zero regular JSON browser direct fetches, and the architecture scanner no longer
  carries a Checkout allowance.
- Payments/Clover is no longer frozen as one context. The dependency counts above
  are unchanged by this documentation-only policy revision. POS Clover Terminal is
  active pre-production modularization work and may be structurally contracted
  before real-device access returns when production Web Ecommerce behavior is
  unchanged. The current Web Clover path remains guarded production; a Web-impacting
  modularization change is allowed only when it is a documented critical blocker
  and must carry focused regression coverage plus post-deployment active payment
  verification before being marked production verified.
- A central chronological modularization index now lives at
  `docs/architecture/modularization-worklog.md`. Creating the worklog and making it
  a required per-slice progress record is documentation governance only and does
  not change the dependency counts or architecture baseline in this snapshot.
- Phase 2 Brand/Store identity and configuration contraction is **CLOSED** at
  `origin/dev@0917f66c`. `brand-store.business-config.v1`,
  `benefits.business-config-loyalty-policy.v1`, `pos-device.admin-db-id.v1`, and
  `brand-store.default-store-identity.v1` are all closed. The final Phase 2 Uber
  persistence migration removed the eight implicit `storeId` database defaults and
  post-deploy verification proved explicit `4750_Yonge_Street` Reconciliation
  persistence, successful POS pause/resume Uber status sync, successful published-item
  availability sync, zero new `storeId='default'` persistence, and clean API/worker
  error scans. The earlier decision to preserve historical Test Store identity compatibility
  until Production cutover was later superseded by Phase 8 Slice 8.5: that slice
  contracts the provider-ID compatibility source without reopening the already-closed
  Phase 2 ownership decision. The test records themselves remain intentionally retained
  until Uber Production Verification passes, when the complete Uber test dataset will
  be handled by a separately reviewed cleanup.

## Reading the graph

- A count is debt, not permission to add more coupling.
- When a PR removes a direct import, lower/remove the matching baseline in the
  same PR so the dependency cannot return.
- New cross-context work must target the owner's `public-api`, `contracts`, or
  `ports` surface.
- Recompute this snapshot at every phase boundary; a new cycle, new direct pair,
  or ambiguous identity field blocks phase closure.
