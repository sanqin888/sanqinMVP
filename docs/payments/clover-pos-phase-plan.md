# SanQ 支付域模块化 + Clover POS 实时同步分阶段实施方案

**状态：** Phase Execution Plan v4（2026-09-08 sandbox sequencing revision）  
**日期：** 2026-08-26；冻结/模块化执行规则修订于 2026-09-03；sandbox/config sequencing 修订于 2026-09-08  
**关联文档：** `docs/payments/clover-pos-integration-charter.md`

## 0. 总体原则

所有阶段必须遵守以下硬性原则：

1. 任何中间版本都必须可部署。
2. 在新 Clover Terminal 链路完成并通过实机验收前，旧 POS CARD 链路必须始终可用。
3. 新能力优先 additive，不提前删除旧逻辑。
4. 新 POS Clover Terminal 链路默认 feature flag = false。
5. 切流必须和代码部署分离。
6. timeout / 网络异常不得直接按失败处理。
7. 所有金融副作用必须有幂等保护。
8. Refund / Void 未经 Clover 明确成功或 reconciliation 确认前，不得提前把 Order 标记 refunded。
9. Orders 不得直接认识 Clover。
10. Payments 不得直接依赖 Orders internals。
11. 每阶段完成后必须给出改动报告，再决定是否进入下一阶段。
12. 所有代码修改前继续遵守 `AGENTS.md`、GitHub Actions、architecture tests 和现有模块边界。
13. 新核心从 Phase D 起即按 Web / POS 最终共用设计。POS Clover Terminal 当前属于 pre-production prototype，其结构性模块化不再等待 Clover developer/sandbox merchant 阻塞解除；但 real-device 验收、feature-flag 切流和 settlement 证明仍按后续门禁执行。
14. 现有 Web Clover Ecommerce 是 guarded production path：默认保持生产行为不变；如果它成为模块化关键进度阻塞，可按 charter 1.1 做最小必要修改。任何 Web-impacting slice 必须先记录影响/替代方案/回退策略，并在部署后给出并完成受影响场景的主动实测，用户确认前不得标记 production verified。
15. 会被并发消费并改变 external due 的内部权益（积分、储值余额、优惠券）必须先 HOLD；支付成功后 COMMIT，明确失败后 RELEASE，UNKNOWN/RECONCILING 继续 HELD。
16. external payment 发起前必须持久化 immutable order/pricing snapshot 和 tender allocation；进入 PROCESSING 后 recovery 不得按当前价格/促销重新定价。

### 0.1 2026-09-03 模块化执行规则修订

Clover developer/sandbox merchant 身份问题现在只阻塞**真实设备验收、支付切流和需要真实 Clover 事实的验证**，不再阻塞 POS Terminal 原型内部的模块化/边界整理。生产 Web Clover 也不再是绝对冻结区；当且仅当它成为明确的模块化关键阻塞时，可以修改，但必须使用最小影响方案并执行 charter 1.1 的 guarded-production 验证门禁。不得把“允许修改”解释为提前进入 Phase G/H cutover 或删除 legacy compatibility。

执行顺序：

```text
Phase A  Payment Domain Foundation
Phase B  Clover Provider Separation
Phase C  Clover Terminal Backend Capability
Phase D  Unified Payment Core + POS First Consumer（flag=false）
Phase E  Refund / Void
Phase F  Clover Webhook / Reverse Sync
Phase G  Web Ecommerce Migration to Unified Payment Core
Phase H  Full Verification / Cutover
Phase I  Production Stability Window
Phase J  Legacy Cleanup
```

### 0.2 2026-09-08 Phase 6 / Sandbox bring-up 执行顺序修订

新的 Clover Test Merchant 和 Test App 已完成非设备 sandbox bring-up：SanQ OAuth、`ACTIVE` Store binding、Platform v3 canonical read、数据库凭据加解密、自然 access-token refresh/rotation 与 API 重启后的 rotated credential 恢复都已实测通过。当前剩余 provider 阻塞收缩为 Cloud Pay Display/device、真实 Terminal Sale/reconciliation/refund/recovery 与 full POS acceptance；这些项目需要 Clover Dev Kit。2026-09-09 的只读 Web cutover readiness audit 已完成，结论为 **`CONDITIONAL PASS FOR FUTURE SHADOW READ / NO-GO FOR CUTOVER`**。Platform v3 是未来 Web payment/refund canonical truth，但 Web `/v1/charges` execution、UNKNOWN/reconciliation、Orders preparation/finalization 与 CheckoutIntent context 仍需作为一个受控迁移整体处理，不能做 transport-only replacement。用户已明确决定在 Test App/device 验收完成并把 App 安装/授权到实际运营 production Clover merchant 之前，不再修改 Web 支付链路，也不做 production Web v3 shadow query；届时先重新做 production-merchant readiness/correlation audit，再决定 Phase G。

Phase 6 后半段当前执行状态：

```text
Slice 4B  Clover provider internal capability cleanup                 [DONE]
    -> Slice 4C  Unified/Sandbox configuration isolation             [DONE]
    -> Slice 4D  Unified Clover OAuth credential convergence         [DONE]
    -> Test Merchant OAuth + Platform v3 + credential lifecycle      [VERIFIED]
    -> Cloud Pay Display/device availability                          [PENDING DEV KIT]
    -> controlled sandbox Sale / reconciliation / refund / recovery  [PENDING DEV KIT]
    -> full POS Terminal acceptance                                   [PENDING DEV KIT]
    -> Web Clover cutover readiness audit                             [DONE: CONDITIONAL SHADOW-READ PASS / CUTOVER NO-GO]
    -> Phase G Web Ecommerce migration to Unified Payment Core        [DEFERRED UNTIL PRODUCTION MERCHANT INSTALL/AUTH]
```

#### Slice 4B 边界

4B 只做 provider infrastructure ownership cleanup：把 `CloverPlatformPaymentsGateway` 及其 Platform v3 canonical HTTP/raw mapping 从 `clover-payment-provider.adapter.ts` 移入 `payments/infrastructure/clover/platform/**`，保持 adapter 注入/调用语义不变；同时收掉无外部消费者的 `PAYMENT_PROVIDER` / `CreatePaymentAttemptUseCase` module exports，并用 architecture guards 锁住 Platform gateway 不得被 orchestration/POS/Orders 直接 import。4B 不修改 Web `/v1/charges`、OAuth、Terminal、webhook、Prisma 或部署配置。

**Implementation status (2026-09-08): MERGED / CI GREEN.** PR #2243 已 squash merge 为 `aa765f9d`，merged-dev CI #5354 的 API/Web 均通过。Gateway + Platform canonical HTTP/raw mapping 已迁入 `platform/clover-platform-payments.gateway.ts`，adapter/module/spec import 已同步，两个无外部消费者的 module exports 已移除并新增 source guard。该批是 Payments/Clover context 内部收口，architecture baseline/direct-debt 数字保持不变。

#### Slice 4C 配置隔离

4C 必须把三类配置语义分开：

1. **Legacy Web Ecommerce production**：现有 `CLOVER_BASE`、`CLOVER_MERCHANT_ID`、`CLOVER_ACCESS_TOKEN` 和 `NEXT_PUBLIC_CLOVER_*` 在 POS sandbox bring-up 期间保持现值/现消费者不变。
2. **Unified Clover core**：新增独立 merchant/store、Platform v3 与 OAuth 配置族（`CLOVER_UNIFIED_*`），当前填 Test Merchant/Test App sandbox 值，未来生产切换时只替换配置值，不再改变业务语义。
3. **Terminal-only**：REST Pay base、device ID、RAID、timeout 使用独立 `CLOVER_TERMINAL_*` 配置。

Unified/Terminal 配置缺失必须 fail closed。禁止 Unified/Terminal 回退到 live Web merchant、token 或 Ecommerce base。现有 production Clover webhook merchant/auth scope 在 4C 不改变，sandbox bring-up 先依赖 Terminal execution + Platform canonical reconciliation。

**Implementation status (2026-09-08): MERGED / CI GREEN.** PR #2244 final head `31efc862` 通过 PR CI #5358，squash merge 为 `bc96c706`，merged-dev CI #5359 的 API/Web 也全部通过。`CloverProviderConfig` 已按 Web Ecommerce / Unified / Terminal 三种 purpose 拆开字段语义；Platform/OAuth 只读取 `CLOVER_UNIFIED_*`，Terminal base/device/RAID/timeout 只读取新的 `CLOVER_TERMINAL_*`，且缺少 base、device、RAID 或合法 10-300 秒 timeout 时直接不可用。OAuth 缺 Unified merchant/store/Platform base/client/secret/authorize/API/callback 任一关键配置时在 provider traffic 前返回配置错误，并拒绝为非 configured Unified merchant 启动授权。4C 历史状态仍暂留 `CLOVER_TERMINAL_OAUTH_TOKEN` 给下一 Slice 删除，但不会借用 `CLOVER_ACCESS_TOKEN`；production webhook 继续使用 legacy Web `CLOVER_MERCHANT_ID`。`docker-compose.yml` 只新增空值 placeholder，没有提交 Test Merchant/token/secret。Focused config/OAuth/Platform/Terminal tests 与 architecture guard 已同步；4C 不改变 dependency baseline、Prisma、Web `/v1/charges` 或 `POS_CLOVER_TERMINAL_PAYMENT_ENABLED`。

#### Slice 4D credential convergence

4D 将 Terminal 从静态 `CLOVER_TERMINAL_OAUTH_TOKEN` 改为复用现有 `CloverMerchantAccessTokenService`。Platform v3 与 Terminal REST Pay 使用同一 Unified merchant OAuth authorization、refresh/recovery lifecycle；OAuth store mapping 也基于 Unified merchant/store 配置，不再借用 legacy Web merchant identity。静态 Terminal token 不作为 fallback 保留。

**Implementation status (2026-09-08): MERGED / CI GREEN / DEPLOYED / NON-DEVICE SANDBOX VERIFIED.** PR #2245 final head `c665b469` 通过 PR CI #5361，squash merge 为 `1cc4a829`，post-merge CI #5362 的 API/Web 也全部通过。`CloverProviderConfig.terminalAccessToken` 与 deployment placeholder 已删除；`CloverTerminalTransport` 继续同步检查 Unified merchant + Terminal base/device/RAID/timeout，但真正发 HTTP 前异步通过 `CloverMerchantAccessTokenService.getAccessToken(CLOVER_UNIFIED_MERCHANT_ID)` 取数据库凭据。Terminal 收到 HTTP 401 时只执行一次 `{ forceRefresh: true }` 并使用相同 idempotency key 重试一次。实现显式区分“credential unavailable、请求尚未发送”和“fetch 已发送但网络/timeout 不确定”：前者使 Sale/Refund/Void fail closed 且 `fetch=0`，后者继续保持 `UNKNOWN` 并交给 reconciliation。Focused tests 已覆盖 DB token header、401 refresh/retry、Web token 不回退、credential unavailable 与 socket-loss UNKNOWN；architecture guard 禁止静态 Terminal token 回归。4D 没有 Prisma、public contract、dependency baseline、Web `/v1/charges`、production webhook 或 rollout flag 改动，且部署后仍未开启 Terminal route。

#### 2026-09-08/09 non-device sandbox verification

- Production SanQ runtime 使用独立 `CLOVER_UNIFIED_*` Test Merchant/Test App 配置完成 OAuth，`CloverMerchantAuthorization` 最终为 `ACTIVE` 并绑定 `4750_Yonge_Street`。
- 当前已验证的 sandbox App 权限组合为 Merchant READ + Payments READ + Orders READ，另保持 Ecommerce enabled；没有添加 Clover write permission。Orders READ 是当前 canonical payment query 的实际依赖，因为 `PAYMENT_EXPAND` 包含 `order`，currency mapping 允许 `payment.currency ?? order.currency` fallback。
- 未添加 Orders READ 时，数据库中的有效 access token 已成功到达 Clover Platform，但带 `expand=...order` 的 canonical payment read 返回 HTTP 403；更新 Test App 权限、在 Test Merchant 中卸载/重装并重新 OAuth 后，同一只读查询返回 HTTP 200，故意使用不存在的 `externalPaymentId` 最终映射为 `CLOVER_PLATFORM_PAYMENT_NOT_FOUND`。
- 等待 access token 自然过期后再次执行相同查询，`CloverMerchantAccessTokenService` 自动 refresh/rotate credential：`tokenVersion 2 -> 3`、`refreshedAt` 写入、access/refresh expiry 均前移，随后 Platform v3 仍返回 HTTP 200。API recreate 后再次查询时 `tokenVersion` 保持 3，证明新进程能够重新加载 credential key ring、从 PostgreSQL 解密 rotated credential 并继续使用。
- 没有为了实测故意破坏有效 token 来制造 401；`401 -> forceRefresh -> retry once` 继续以 focused automated test 作为异常恢复证据。Cloud Pay Display/device availability、Sale、cancel、void/refund、timeout/UNKNOWN/recovery、Terminal reconciliation 与 full POS E2E 都仍等待 Clover Dev Kit。

#### Sandbox / production data safety

`POS_CLOVER_TERMINAL_PAYMENT_ENABLED` 在 OAuth/Platform/device bring-up 阶段继续默认关闭。只有在明确的非营业/测试窗口才允许为 full POS E2E 打开 Terminal route。Clover sandbox 只隔离 provider 资金环境，并不会隔离 SanQ 自己的数据库：如果 full POS flow 运行在 production API，它仍可能产生 `PaymentTransaction`、`PaymentCheckoutAttempt`、Order、print/reporting 等生产库事实。若要求 SanQ 测试数据也完全隔离，应另行批准 staging runtime/database，而不是在 production runtime 内增加隐式 sandbox/production 双环境切换。

当前不为 sandbox/production 并存新增 Prisma environment 字段。`CloverMerchantAuthorization.storeStableId @unique` 继续表示一个 runtime/store 只绑定一个 active Unified merchant；未来 production Unified merchant 绑定前必须明确 revoke/unbind sandbox authorization。若以后确实需要同一 runtime 长期同时保留两套 active authorization，再单独做 schema 设计并按 `AGENTS.md` 取得 migration 授权。

#### Gate C-2B — Terminal Display Lifecycle / async customer wait (2026-10-13, LOCAL REVIEW)

- MacBook-isolated Sandbox C-2 acceptance: final Canadian Sale (`capture: true`, `final: true`) completed CAD $5.65; canonical PaymentTransaction `SUCCEEDED`, checkout `COMPLETED`, and order `making`. Clover device stayed spinning until an explicitly issued `/connect/v1/device/welcome` returned HTTP 200 and restored the Welcome screen. This is device UI cleanup evidence, not an additional financial transaction.
- The opt-in POS `asyncTerminalFlow` returns `PROCESSING` after a persisted provider-start claim. The backend continues one guarded Sale in-process and publishes full payment snapshots via the existing POS realtime port/WebSocket. Duplicate starts reuse the persisted attempt; an interrupted or ambiguous provider result must reconcile using canonical Platform evidence, never charge again just because HTTP/WS disconnected.
- Terminal Sale and post-definitive-failure `/connect/v1/device/read-confirmation` use `X-Clover-Timeout: 0`, avoiding an application-imposed interaction countdown. Remote Pay protocol/network/process lifetime may still end a request, in which case the POS fails closed and preserves the payment evidence.
- After a definitive `DECLINED`/`FAILED`, released reservations are not automatically reused. The device may show a bounded, sanitized reason and wait for the customer to explicitly select Retry or Cancel; POS can also send a **device interaction cancel**. A confirmed Retry yields a realtime decision, and the POS creates a fresh attempt/idempotency pair for a new checkout. It does not retry from an `UNKNOWN`/`RECONCILING` or merely from a timeout. There is no automatic timed retry.
- `SUCCEEDED` and completed paid Order precede best-effort Welcome; device UI errors never undo money facts. Device cancellation acknowledgements are not payment cancellation evidence. All changes remain isolated to the feature-flagged POS Terminal path; production Web Ecommerce, migration/schema, journal and refund contracts are unchanged.
- **Recovery limitation / hardening gate:** long-running device operations and prompt choice are held in memory while the API process lives. Browser reload can recover persisted payment status and rejoin WebSocket; an API restart or lost Clover connection does **not** transparently reattach to the device prompt. After process loss the terminal must be inspected/reconciled by the operator; do not silently start another Sale or claim indefinite end-to-end persistence. This is an explicit acceptance limitation before production rollout.
- **Benefits hold lifecycle — deferred follow-up gate C-2C:** the current checkout preparation window is 20 minutes. Expired pre-provider attempts are released only in `PREPARING`/`PREPARED`; once `PROCESSING`, benefit reservations may remain held past their original expiration until finalization/reconciliation. Unlimited customer wait makes abandoned sessions/expired benefit reservation semantics an explicit pre-production operational audit, **not** a reason to auto-release an ambiguous in-flight payment.

##### Gate C-2C — Long-wait benefits HOLD / expiry audit (NEXT AFTER C-2B, READ-ONLY)

**Goal:** determine whether the new indefinite device wait can safely coexist with the existing 20-minute checkout preparation TTL, loyalty points/stored-balance HOLD and coupon/user-coupon reservation expiry/commit/release paths. Do not reopen canonical Payment Core or change production Web behavior in this audit.

- **Ownership and data-flow inventory:** trace `PaymentCheckoutAttempt.expiresAt` and status transitions, `LoyaltyTenderReservation.expiresAt`/HELD/COMMITTED/RELEASED, `Coupon.reservationExpiresAt`, `UserCoupon.reservationExpiresAt`, and all owner-owned cleanup, eligibility, reservation, commit, and release calls. Distinguish the pre-provider `PREPARING/PREPARED` expiration from in-flight `PROCESSING/UNKNOWN/RECONCILING` and already-paid `SUCCEEDED/FINALIZING/COMPLETED`.
- **Long-wait cases (>20 minutes):** no card interaction; successful card completion after hold expiry; definitive decline/failure and explicit customer Retry/Cancel; POS device Cancel while Sale status is uncertain; browser refresh, backend restart or connection loss, reconciliation after the original deadline; concurrent coupon redemption / balance or points consumption; repeated API calls and duplicate attempts.
- **Hard invariants:** never release or reallocate an in-flight HOLD based only on elapsed time; never create paid Order or COMMIT benefits without confirmed canonical success; never refund/re-charge based on missing UI acknowledgement; keep final releases/commits idempotent and owner-boundary-compliant. If expiry breaks a late successful payment, mark the resulting discrepancy for explicit reconciliation/manual review rather than fabricating a decline.
- **Decision output:** provide an evidence-backed status matrix and tests to add, identify any abandonment/indefinite-lock operational risk, and compare (A) existing HOLD semantics with monitoring, (B) owner-managed reservation renewal/lease after provider start, (C) a separate terminal session lifecycle/abandonment policy. Name the owner of any change, rollback strategy, migration requirements (if any), and Sandbox test plan **before** implementation.
- **Historical audit gate:** C-2B could merge independently while C-2C remained `PENDING AUDIT`. This line describes the pre-C-2C decision, not the implementation status below.

##### C-2C1 + C-2C2 implementation — 2026-10-13 (PR #2803 MERGED / MIGRATION REVIEWED / DEV CI #7200 GREEN)

- **C-2C1, Payments owner:** original `/connect/v1/payments` Sale HTTP 209 carries distinct `TERMINAL_SALE_CANCELLED` evidence. It may converge a concurrent POS `/device/cancel` `UNKNOWN/RECONCILING` to `CANCELLED`; a cancel ACK, 200 body text or uncorrelated provider observation cannot do this. Canonical Platform success remains authoritative; conflicting final facts fail closed for review. No automatic timeout release and no change to Web Ecommerce.
- **C-2C2, checkout/Benefits orchestration:** additive nullable `PaymentCheckoutAttempt.benefitsReleasedAt` and index record the point at which both idempotent owner RELEASE ports have succeeded. A bounded API bootstrap / 60-second poll re-drives only POS Terminal `CANCELLED/DECLINED/FAILED` attempts without that checkpoint, across owner partial failures and API restarts. No release is attempted solely because `expiresAt` elapsed, or for `PROCESSING/UNKNOWN/RECONCILING/SUCCEEDED/FINALIZING/COMPLETED`. This is **durable eventual completion**, not an instantaneous cross-owner database transaction; if immediate all-or-nothing visibility is required, a separate authorized owner-boundary design is needed.
- **Progress log:** `docs/architecture/modularization-worklog2.md` (the established continuation of the read-only first-volume worklog).
- **Source/migration gate:** PR #2803 merged into dev as `9f1e5843` after CI #7198 passed (Browser E2E infrastructure retry). User-generated `20261013172827_add_checkout_benefits_release_checkpoint` landed on dev at `abc321ab`; the SQL is reviewed additive-only (one nullable timestamp and one index; no DROP, rewrite or NOT NULL) and dev CI #7200 passed all jobs. **Production migration application, deployment and provider Sandbox active acceptance remain pending**, including device-boundary timeouts (superseding the earlier 25+ minute goal), card success, Clover/POS cancellation, partial-release recovery and no double charge.

##### C-2C3 — Store-scoped long-wait operator review (2026-10-13, PR #2804 MERGED / CI #7201 GREEN)

- **POS read-only surface:** authenticated ADMIN/STAFF + enrolled POS device may read `GET /pos/payments/card/benefits-review`, scoped to the authenticated device's Store stable ID. It returns a bounded 25-row review queue for (a) in-flight/paid-but-unfinalized Terminal checkouts whose original **pre-provider** preparation expiry has passed and (b) definitive failed/cancelled Terminal checkouts with no all-owner Benefits release checkpoint. No customer identity/phone/PII is returned.
- **Truth semantics:** `LONG_WAIT` means an original preparation deadline passed, **not** proven Clover payment timeout, expired current Benefits ownership, cancellation or eligibility for recharging. `RELEASE_PENDING` means the durable all-owner release checkpoint is absent, **not** a manual release authorization; the existing C-2C2 worker continues idempotent retry. The displayed tender values are frozen allocation snapshots, not live Benefits ledger balances. Fail-closed UI and manual refresh, no auto cancel, extra charge, release, TTL change or reconciliation mutation.
- **Boundaries:** checkout persistence owner handles the only scoped Prisma read; POS orchestration and the existing guarded controller expose the projection; a small dedicated POS Web component provides the review view. No new Prisma/schema/migration, provider transport, production Ecommerce, feature-flag rollout or module import allowance.
- **Verification:** PR #2804 merged as `9877dd82` after CI #7201 passed all seven jobs. Source tests cover scoped selection, limit and sanitized projection plus controller/device Store identity and disabled Terminal read-only access. Compact Sandbox acceptance and production deployment remain pending.

##### C-2C4 — Compact-observed HTTP 504 / explicit original-Sale resume (2026-10-13, PR #2811 MERGED / CI #7218 GREEN)

- **Observed device constraint:** MacBook Sandbox T1 passed. During T2 the Compact stopped accepting payment after approximately three minutes and original `POST /connect/v1/payments` returned HTTP 504. The subsequent Platform v3 `externalPaymentId` search returned no row; both checkout and PaymentTransaction remained `UNKNOWN` with `CLOVER_PLATFORM_PAYMENT_NOT_FOUND`. The former 25-minute unattended-card requirement is superseded by testing against provider-observed device interaction time; this does **not** redefine 504/NOT_FOUND as proof of cancellation.
- **Payments/Clover ownership:** Terminal transport now tags only an original HTTP 504 Sale with `CLOVER_TERMINAL_SALE_HTTP_504` as sanitized `resultCode`; canonical Platform search remains financial authority and its `NOT_FOUND` remains `UNKNOWN`. A dedicated Payments application command first re-queries canonical truth, refuses payment success/other uncertainty and requires a configured AVAILABLE idle device, then atomically claims the original unresolved 504 by status + resultCode + canonical NOT_FOUND + null providerPaymentId in the existing PaymentTransaction repository. The claim consumes the original replay permission once; if device Welcome cannot be confirmed, recovery fails closed without issuing Sale.
- **Original identity:** the **only** manual replay uses the persisted original PaymentTransaction ID, `attemptId`, `Idempotency-Key`, `externalPaymentId`, frozen amount and CAD currency, with the existing `POST /connect/v1/payments` final-capture operation. A second 504 cannot re-arm the replay claim. Competing POS clicks/workers are guarded by an atomic DB claim, not merely an in-memory flag. Source code preserves the provider-start async/realtime path and does not impose a SanQ card-interaction timeout. No auto-Sale on 504 or automatic new payment identity.
- **Store-facing interaction:** authenticated POS device gains additive `POST /pos/payments/card/resume-original` and optional `canResumeOriginalSale` snapshot/realtime flag. Only a verified original 504 + canonical NOT_FOUND shows the separately labelled **恢复原付款** action; the existing `重新确认结果` read-only reconciliation and post-definitive `重试` new-attempt path remain separate. The resume request returns a RECONCILING acknowledgement while backend resumes asynchronously, publishes eventual snapshots and reuses the existing order finalization pathway on canonical success.
- **Failure/Benefits boundary:** a busy/unavailable Compact, ambiguous provider outcome, device Welcome failure, process crash between claim and outbound replay or repeated 504 remains an explicit `UNKNOWN/RECONCILING` investigation case with Benefits HOLD intact. Only confirmed `SUCCEEDED` may COMMIT/create the Order, and only definitive `DECLINED/CANCELLED/FAILED` may invoke existing idempotent owner RELEASE; no timer/Platform NOT_FOUND alone releases Benefits. Provider one-time replay guarantees are conditional on Clover's same-idempotency behavior and require real Compact Sandbox evidence before release approval.
- **Scope/gates:** existing guarded POS Terminal feature flag only; no Prisma/schema/migration, dependencies, compatibility register change, Web Ecommerce provider traffic, Accounting semantics or architecture import allowance. PR #2811 final head `88a74128`, merged to `dev` as `864ed8e0` after PR CI #7218 passed all seven required jobs. Compact active verification and production deployment remain pending. A pre-existing Sandbox attempt recorded *before* this change has no dedicated 504 marker and cannot be automatically promoted to replay eligibility. Rollback is feature flag off and preserve all recorded UNKNOWN evidence. The post-merge `dev` push CI is a separate run and must not be confused with the successful PR run.

##### C-2C5 — Compact Sandbox controlled acceptance readiness (2026-10-13, READ-ONLY PLAN / REAL DEVICE PENDING)

- **Test topology:** use the existing **MacBook-isolated** SanQ API/Web/PostgreSQL/POS proxy setup and Canada Test App/Test Merchant/Compact authorization. Do not run this test through production SanQ API or PostgreSQL merely because Clover is a Test Merchant: Clover sandbox funds do not sandbox local order, Benefits, checkout or payment facts. Confirm local DB identity and reviewed additive C-2C2 `benefitsReleasedAt` migration state before preparing new payment attempts. The pre-C-2C4 T2 `UNKNOWN` row lacks the 504 evidence marker and must not be manually replayed by inventing one.
- **Environment preflight:** check clean latest `dev` pull includes merge `864ed8e0`, local database migration status, separate local API/Web/proxy health, POS enrolled device/Store identity, Compact network availability, Unified OAuth/Test Merchant mapping, and locally enabled Terminal feature flag. Capture *redacted* device status JSON field names/values when the Compact is idle, busy and just after original 504. In particular `prepareOriginalSaleResume()` requires a real `state`, `status` or `device.status` equal to AVAILABLE, IDLE or READY and a confirmed HTTP 200 Welcome; generic HTTP 200 with no state must fail closed.
- **S1 normal Sale baseline:** one small Test Merchant card checkout with optional points/balance/coupon HOLD. Expect one original `POST /connect/v1/payments` with `capture/final=true`; Platform canonical `SUCCEEDED`, checkout `COMPLETED`, one paid Order, Benefits COMMIT, final charged amounts and Welcome. Recheck once: no second Sale and no duplicate Order.
- **S2 provider timeout / eligibility:** start a *new* test checkout, do not approve at the terminal until Compact returns its observed original Sale HTTP 504 (approximately three minutes previously; use observed device behavior, not a fixed SanQ timer). Require persisted PaymentTransaction `UNKNOWN/RECONCILING`, `resultCode=CLOVER_TERMINAL_SALE_HTTP_504`, `failureCode=CLOVER_PLATFORM_PAYMENT_NOT_FOUND`, no paid Order, no Benefits RELEASE and `canResumeOriginalSale=true` only after canonical NOT_FOUND. Generic network timeout, provider busy or a stale browser response must not qualify.
- **S3 one-time original recovery:** after confirming device idle status, click **恢复原付款** once. Observe one atomic `CLOVER_TERMINAL_SALE_HTTP_504_RESUME_CLAIMED` transition and the same `PaymentTransaction.id`, `attemptId`, `idempotencyKey`, `externalPaymentId`, amount/currency on the resumed Clover Sale. Check Compact Welcome/re-entry; if real Clover accepts and the customer completes payment, require Platform canonical success, exactly one Order/COMMIT and one actual provider charge. If Clover refuses same-key replay or the device status differs from the accepted idle set, **STOP** with the actual sanitized error/status; do not infer provider idempotency compatibility from unit tests or force a second new-identity Sale.
- **S4 unsafe branches:** without creating uncontrolled duplicate funds, characterize a busy/offline Compact, unavailable Welcome, double-click/multi-client command, browser reload, API process interruption after claim, second 504, and delayed canonical success/decline. Require no new Sale except the single atomic claimed original replay, no auto retry after claim, no Order/Benefits COMMIT without canonical success, and no RELEASE unless a definitive final outcome exists. UI may need manual reconciliation if the process dies after the claim.
- **S5 Benefits and cancellation matrix:** confirm original Sale HTTP 209 cancellation versus device-cancel ACK and `UNKNOWN` remain distinct, with release checkpoint only after owner idempotent RELEASE completes for definitive `CANCELLED/DECLINED/FAILED`. Confirm late `SUCCEEDED` does not release HOLD based on original preparation deadline, and scoped long-wait/release-pending operator read remains read-only. Do not attempt a 25-minute unattended-card run as a mandatory gate while the observed Clover session ends around three minutes.
- **Evidence / decision:** save only sanitized attempt ID, transaction ID, provider external/payment IDs, UTC timestamp and Store stable ID, idempotency fingerprint (not credential), original/result HTTP status, Compact idle/Welcome result, canonical query status, checkpoint status, Order count and device/operator screenshots without card/PAN/tokens/PII. Mark each scenario PASS/FAIL/BLOCKED with device behavior. Full Sandbox acceptance is **BLOCKED** until S2/S3 are actually observed; PR CI success alone is not proof. Any required protocol or payment-owner boundary change must receive a separate impact/alternatives analysis and user authorization before implementation. The next release gate remains an independently approved deployment/production verification, not automatic dev-to-main promotion.

##### C-2C7 Slice A — Compact original 504 bounded display-only recovery (2026-10-15, PR #2815 MERGED / CI #7229 GREEN)

- **Real Sandbox evidence:** 2026-10-14 A2 observed `GET /connect/v1/device/status` HTTP 200 `IDLE`, followed by `POST /connect/v1/device/welcome` HTTP 200 and an actual return to the welcome screen. 2026-10-15 A1 repeated the original Sale HTTP 504 after approximately 121 seconds; `GET /connect/v1/payments/external/{externalPaymentId}` returned HTTP 200 `keys=[]`, and device status was `AVAILABLE / IDLE` at approximately +5, +10 and +21 seconds. No immediate-zero-latency idle proof and no production-device verification are claimed.
- **Payments/Clover transport owner:** only the existing post-original-Sale-504 best-effort display cleanup accepts HTTP 404, correlated `queryStatus=NOT_FOUND`, or the Compact-observed HTTP 200 empty JSON/object/body. Empty response remains **uninterpretable as payment truth**; nonempty/unrelated Payment responses fail closed. The cleanup reads explicit device `IDLE/AVAILABLE/READY` status up to three times with two-second gaps and sends one Welcome, never device Cancel, another Sale, or financial status updates. Failed/busy/unreadable status or Welcome leaves the payment unresolved. Existing `prepareOriginalSaleResume` retains its single status check before same-identity replay.
- **In-process coordination only:** the same `CloverTerminalTransport` instance serializes Sale and the Welcome-check sequence, preventing a new Sale from being sent by that instance while display cleanup is underway. **This is not a distributed terminal lease** and cannot prevent another API worker, independently deployed instance, or direct external device client from concurrently starting a Sale. Multi-instance/production rollout requires a separate terminal-scoped coordination readiness gate and user authorization; do not claim cross-process mutual exclusion.
- **Unchanged boundaries:** original Payment remains `UNKNOWN/RECONCILING` with canonical Platform v3 authority; Benefits HOLD, definitive RELEASE, Order finalization, one-time original-identity replay claim, feature flags and protected production Web Ecommerce remain untouched. No Prisma/schema/migration, shared contract, dependency, API route or compatibility baseline changes. Additional POS operator **Cancel payment** while actively waiting is explicitly deferred to a separate slice because a device Cancel acknowledgement alone is not definitive financial cancellation.
- **Validation:** focused transport regression cases added for HTTP 200 empty device responses, malformed/active reads, BUSY-to-IDLE bounded polling, persistent BUSY, and same-process Sale/Welcome ordering. Local lint/build/tests intentionally not run per `AGENTS.md`; PR #2815 CI #7229 passed; fresh post-merge Compact Sandbox A1/A2 replay and any production verification remain pending. Rollback: disable POS Terminal flag or revert this scoped source change; unresolved payment facts must remain intact.

##### C-2C7 R2 — Sandbox-only operator-attested unresolved 504 closure (2026-10-16, PR #2819 + HOTFIX #2820 MERGED / PR CI #7251 ALL 7 GREEN / MIGRATION APPLIED / MACBOOK SANDBOX RECOVERY VERIFIED)

**R2 explicit-device-idle evidence safety hotfix (2026-10-15, PR #2820 MERGED `dev@9094b6d7` / FINAL HEAD `26df6c44` / PR CI #7251 ALL 7 GREEN):** Existing Terminal Availability deliberately retains `AVAILABLE` as a compatibility fallback when REST Pay Display `GET /connect/v1/device/status` returns HTTP 200 with no state. This coarse availability is **not evidence of an idle device**. The Clover transport now carries an additive `providerStateExplicit` observation marker without changing the existing `state`, `available`, Sale, Cancel or Welcome behavior. The Sandbox-only `SandboxTerminalManualRecoveryService` requires `available === true`, exact `terminalId`, `providerStateExplicit === true`, and a device-reported `providerState` exactly `AVAILABLE/IDLE/READY`, both **before** operator assessment/CAS `RECONCILING → FAILED` and **before** final `NEEDS_REVIEW → FINALIZED` after fresh canonical NOT_FOUND and Benefits RELEASE. State-less 200, inferred AVAILABLE, unknown/processing/busy state or mismatched Terminal fails closed: no early financial write; after an accepted human decision, no premature fence release. Existing strict idle/Welcome remains required. Focused mapping and R2 regression cases cover these gates. No Prisma/schema/migration, dependency, architecture graph/baseline, protected Web Ecommerce or provider finality semantics change. Local lint/build/tests were deferred under AGENTS.md; final PR head `26df6c44` passed GitHub CI #7251 (seven jobs) before squash merge to `dev@9094b6d7`. The earlier PR CI #7250 failed an API spec Prettier check and a registry-limited Browser E2E container pull; the formatting error was corrected on the same PR branch, and final CI #7251 passed both.

- **Authorization/scope:** user completed R1 MacBook Sandbox active verification and explicitly authorized R2. This is a deliberately narrow **non-provider operational finality exception**, not a replacement for the normal Clover 209 / canonical payment truth rule. Under no circumstances does 504 or Platform NOT_FOUND *automatically* mean CANCELLED/FAILED. R2 is opt-in only in a development/test process, with an explicit `POS_CLOVER_SANDBOX_MANUAL_RECOVERY_ENABLED=true` setting, a loopback PostgreSQL DATABASE_URL, sandbox `CLOVER_UNIFIED_PLATFORM_API_BASE`, configured Test Merchant distinct from the production Web merchant, and configured Compact device. Production NODE_ENV, remote DB and live Platform all fail closed.
- **Human evidence:** authenticated ADMIN/STAFF operating an enrolled Store-bound POS device must manually inspect the original Clover Test Merchant Open order / No Payments, enter that Clover Order ID and an explanation (minimum 12 characters), acknowledge potential delayed payment / conflict risk, and type `CONFIRM UNPAID`. Controller persists `actorUserStableId` from the authenticated session; client cannot choose the actor. There is no endpoint that directly sets Terminal FINALIZED or releases Benefits.
- **Payments ownership:** independent `SandboxTerminalManualRecoveryService` reads the existing PaymentTransaction and Terminal fence. Only the exact original `POS_TERMINAL` Sale older than five minutes, originally `CLOVER_TERMINAL_SALE_HTTP_504`, `RECONCILING`, no providerPaymentId, canonical latest `CLOVER_PLATFORM_PAYMENT_NOT_FOUND`, matching Store/Terminal/Attempt/frozen external identity, no prior Cancel or replay, and explicit AVAILABLE/IDLE/READY device may be operator-attested. The Payments Prisma adapter uses a Serializable transaction and compare-and-swap to atomically create an immutable `PaymentTerminalSandboxRecovery` decision, convert the **local operational payment status** to `FAILED` with distinctive `POS_TERMINAL_SANDBOX_OPERATOR_UNPAID` marker (never `CLOVER_CANCELLED`), and set Terminal fence to `NEEDS_REVIEW`. Original 504, NOT_FOUND and the human evidence remain in a separate immutable recovery record. An older/inflight Clover success, uncertain live query, unauthorized env, another Store, mismatched terminal, or replay claim fails closed.
- **Owner release/restart:** Checkout/Benefits orchestration owns existing idempotent `FAILED` / RELEASE workflow, and only after `benefitsReleasedAt` is persisted does Payments checkpoint release. To finalize the terminal fence, Payments checks Platform again after human attestation, requires explicit device idle + Welcome and an existing release checkpoint, then atomically sets `FINALIZED` and records the terminal finalization timestamp. Partial Benefits failure, canonical late SUCCEEDED, busy/unavailable device, failed Welcome or process restart keeps `NEEDS_REVIEW`; repeating the same manual command can resume the previous decision/checkpoints without another Sale. A late payment discovered after a human decision is an explicit financial conflict requiring manual Clover refund/reconciliation, not silent override. R2 retains `lateCanonicalAt` and `lateProviderPaymentId` in the recovery audit and exposes a visible warning in POS; explicit post-closure recheck can detect it. A conflict discovered after terminal finalization is an incident requiring merchant reconciliation and cannot retroactively eliminate operator-accepted residual risk.
- **UI/review:** the R1 long-wait review panel gains an explicit Sandbox-only form and direct Attempt lookup for resuming interrupted recovery after the normal long-wait item disappears. UI never holds provider secrets and cannot bypass the server flag. This exception is strictly isolated from production Web Ecommerce, other merchant identities, automatic Sale/Cancel and production cutover. Source tests include environment gates, missing/late canonical proof, Store identity, owner-release partial failure and guard validation. The implementation-era real-device gate and local tests were pending under AGENTS; the separately recorded 2026-10-16 MacBook R2 acceptance below has now passed (not a full Terminal acceptance).
- **Migration gate — SATISFIED FOR MACBOOK SANDBOX:** the additive, Payments-owned `PaymentTerminalSandboxRecovery` table and nullable checkpoints required a user-generated migration (historical command: `pnpm --filter api exec prisma migrate dev --create-only --name add_terminal_sandbox_manual_recovery`). The reviewed `20261015202242_add_terminal_sandbox_manual_recovery` migration was committed to `dev@5c561946`, CI #7249 passed, and the user confirmed it applied to local `restaurant@127.0.0.1:5432` with Prisma 207 migrations up to date. No existing table/enum/column was dropped or rewritten; no new migration was required by Hotfix #2820 or this documentation update. **Production runtime/migration deployment is not authorized or verified**; isolated Sandbox acceptance does not itself authorize `main` promotion. Protected production Web Clover remains untouched.

##### C-2C7 R2 MacBook Sandbox recovery acceptance — 2026-10-15/16 (VERIFIED / S1–S3 follow-up recorded below)

- **Verified isolated runtime and device proof (operator-provided):** user verified `NODE_ENV=development/test`, loopback PostgreSQL `restaurant@127.0.0.1:5432`, `https://apisandbox.dev.clover.com`, distinct configured Unified Test Merchant versus Web merchant and Compact Terminal configuration; all six R2 environment predicates true while R2 initially off. Guarded POS `GET /pos/payments/card/availability` returned HTTP 200, `available=true`, `state=AVAILABLE`, actual `providerState=IDLE`, `providerStateExplicit=true`, exact device `C081UG43510334` matching the original payment. The inferred `AVAILABLE` fallback was **not** used as R2 proof.
- **Original 504 and independent operator evidence:** original `attemptId=ccb9ccb4-91c6-49bd-9f39-b55b83dcaafa`, `externalPaymentId=sq_755afdf233c22e32fc1880695943a`, CAD 565 cents, `PaymentTransaction/Checkout=RECONCILING`, `resultCode=CLOVER_TERMINAL_SALE_HTTP_504`, `failureCode=CLOVER_PLATFORM_PAYMENT_NOT_FOUND`, null provider payment, `PaymentTerminalOperation=SALE_IN_FLIGHT`, Benefits not released. User explicitly rechecked with Clover; Test Merchant order `J69R16PIHFKYG` remained `Open / No Payments` with no matching successful CAD $5.65 transaction. **Neither Open nor Platform NOT_FOUND is Clover-confirmed financial failure**; this was the documented Sandbox-only human attestation basis.
- **Controlled R2 result (operator/browser and read-only local SQL verified):** after temporarily enabling the isolated recovery flag, exactly the original Attempt transitioned to `PaymentTransaction.status=FAILED` and `PaymentCheckoutAttempt.status=FAILED`; distinctive `resultCode=POS_TERMINAL_SANDBOX_OPERATOR_UNPAID` and `failureCode=SANDBOX_OPERATOR_ATTESTED_NO_PAYMENT`. Original result/failure were retained in `PaymentTerminalSandboxRecovery`, with Clover order ID, operator evidence and timestamps (`canonicalCheckedAt=2026-10-15 21:10:46.740`, `acceptedAt=2026-10-15 21:10:46.763` as printed by the local SQL session; timezone not inferred). The original tender snapshot contained 0 cents of points/balance/coupon, so these are verified **release checkpoints**, not proof of a nonzero Benefits balance adjustment. Both checkout Benefits release and recovery Benefits checkpoint were present; `PaymentTerminalOperation=FINALIZED` and `terminalFinalizedAt` present; `lateCanonicalAt` absent and provider payment ID still null. The Payment ID, Terminal ID and external-payment identity joins all matched. No financial action or production deployment was performed by the assistant.
- **Post-closeout guard:** the user disabled `POS_CLOVER_SANDBOX_MANUAL_RECOVERY_ENABLED`; read-only API returned `sandboxManualRecoveryEnabled=false` and original fence remained `FINALIZED`. Normal POS Terminal flag remained `enabled=true`. A subsequent availability check returned `state=UNKNOWN`, `CLOVER_TERMINAL_STATUS_UNCERTAIN`, `available=false`; user then reported **Compact power was disconnected**. This is consistent with loss of device connectivity, not evidence that R2 reverted or the next Sale works. At this R2 closeout checkpoint the device had **not yet been retested after power restoration**; subsequent S1–S3 operator evidence is recorded below.
- **Historical R2 → S1 handoff (subsequently executed 2026-10-16) — new normal Compact Sandbox Sale:** (1) power on Compact, confirm REST Pay Display/Wi-Fi/Terminal IP and that `GET /pos/payments/card/availability` again reports actual `IDLE/READY/AVAILABLE`, `providerStateExplicit=true`, matching terminal ID, `available=true`; also confirm original R2 fence stays `FINALIZED`, manual recovery flag remains **off**, normal Terminal flag on, local isolated API/DB + Test Merchant/OAuth still correct. (2) Only then create **one fresh small Sandbox card checkout** with **new** Attempt/idempotency/external payment identity; do not reuse or resume the old 504 and do not introduce concurrent Sale traffic. (3) Validate one outgoing original Sale, Compact interaction/result, canonical Platform v3 `SUCCEEDED`, checkout `COMPLETED`, Payment `SUCCEEDED`, exactly one paid Order, correct amount/surcharge, owner Benefits COMMIT (if any were held), expected Terminal operation/fence finalization and Welcome display. Recheck the same Attempt to prove no second Sale or duplicate Order. (4) If HTTP timeout, offline/UNKNOWN/RECONCILING, missing canonical truth, unexpected terminal fence or payment conflict occurs, **stop without another new Sale**, preserve idempotency/payment evidence and perform R1 explicit original-payment review instead. Capture only redacted Amount/Attempt/Payment/Order/Terminal/Status/checkpoint evidence; never access production Web Clover.
- **Scope/status:** `R2 SANDBOX MANUAL RECOVERY VERIFIED` applies only to this isolated operator-assisted exception and the old 504. **At the R2 closeout timestamp**, S1–S3 had not yet been verified; subsequent isolated MacBook S1–S3 acceptance is recorded below. S4/S5, cancellation/refund matrix and production cutover remain pending. No architecture/owner/public contract change, no Prisma/schema/migration change and no license for automatic `NOT_FOUND → FAILED` inference.

##### C-2C7 S1–S3 MacBook Compact Sandbox acceptance — 2026-10-16 (LOCAL PAYMENT/ORDER PASS; MERCHANT DUPLICATE CHECK PENDING)

- **Scope and evidence level:** operator-supplied MacBook Nest logs and loopback `restaurant` read-only SQL, following the independently verified R2 closeout. Test Merchant `CS9XWTR0QST51`, Store `4750_Yonge_Street`, Compact `C081UG43510334`. These are **isolated Sandbox device/local persistence** observations, not production cutover, and are not evidence of POS multi-process exclusivity. The logs expose HTTP status and response keys but not every provider response value; do not silently convert HTTP 200 into financial success, explicit IDLE, actual Welcome screen observation, or merchant-side charge uniqueness.
- **S1 normal Sale — LOCAL PASS:** at MacBook-local 09:22:21–09:22:37, one observed `POST /connect/v1/payments` returned HTTP 200; Platform v3 read `WKQYSCVH8TSJW` returned HTTP 200 and SanQ created Order `ca7b752120375ddd92af0cb55` from the immutable snapshot. Read-only SQL: new Attempt `aa0c095a-d178-4438-b2e6-65f06a3ce145`, Payment `SUCCEEDED`, Checkout `COMPLETED`, CAD 565 base/charged cents, surcharge 0, Order paid, Order count 1, and matching terminal fence `FINALIZED`. Local R2 audit row independently remained release-checkpointed/finalized with `lateCanonicalAt IS NULL`. The sample had no linked loyalty user; nonzero Benefits COMMIT was not exercised. Terminal Welcome HTTP 200 is observed, not a separately attested physical screen state. Customer/kitchen print jobs were emitted but experienced Socket reconnect, `ACK_TIMEOUT`, then `CLIENT_OFFLINE`; printing is a separate unresolved delivery/ACK issue and not a payment failure.
- **S2 original Sale HTTP 504 — LOCAL PASS (unresolved, not failed):** at 09:35:59 the **new** original Compact Sale returned HTTP 504; Platform external-ID queries returned HTTP 200 collection envelopes (not a logged `elements` count). The device external lookup returned HTTP 200 empty keys; device-status and Welcome requests returned HTTP 200 at 09:36:02. Correctly keyed SQL for Attempt `184ccb5a-16da-490a-a1af-938027eebec3` and external ID `sq_f0988829197622126be4de3580df1` confirmed Payment/Checkout `RECONCILING`, `resultCode=CLOVER_TERMINAL_SALE_HTTP_504`, `failureCode=CLOVER_PLATFORM_PAYMENT_NOT_FOUND`, no `providerPaymentId`, CAD 1130 cents, matching persisted idempotency identities, no Benefits RELEASE, zero Orders. The terminal fence `C081UG43510334` remained `SALE_IN_FLIGHT`, with direct Attempt lookup proving both Payment ID and external ID bindings. The original null Payment `terminalId` made a prior join-by-Payment-terminalId read incorrectly show a missing fence; it was **not** a missing fence. `NOT_FOUND` remains uncertainty, never cancellation.
- **S3 same-identity one-time recovery — LOCAL PASS:** at 10:13:39 authenticated `POST /pos/payments/card/resume-original` returned HTTP 201. Existing Platform external-ID query, strict device-status/Welcome sequence, and **one observed recovered** `POST /connect/v1/payments` HTTP 200 preceded canonical v3 read of `HY8KKDPK82HQT` and Order `c2c34d11c67982d59b1c0201f` at 10:14:05; Welcome/status/Welcome HTTP 200 followed. Read-only SQL proved the **same** Attempt `184ccb5a-16da-490a-a1af-938027eebec3`, Payment UUID `cd0629d3-7cd1-4d30-ac18-ae2678544c06`, `externalPaymentId=sq_f0988829197622126be4de3580df1` and checkout/payment idempotency binding; final `Payment=SUCCEEDED`, `Checkout=COMPLETED`, `resultCode=SUCCESS`, provider payment `HY8KKDPK82HQT`, CAD 1130 base/charged cents, surcharge 0, finalized/paid Order, Benefits release checkpoint absent, `PaymentTerminalOperation=FINALIZED` with both identity bindings true. Follow-up independent `COUNT(*)` confirmed exactly **one local Order** and **one local PaymentTransaction** for the external identity. The intermediate one-time `RESUME_CLAIMED` transition was not captured separately in operator logs/SQL; the source CAS and successful same-record outcome support the expected path, not a separate observed intermediate checkpoint.
- **Remaining external gates:** Clover Canada Test Merchant must independently confirm `HY8KKDPK82HQT` is the **only successful CAD 11.30 charge** for the recovered external identity; local counts cannot prove provider charge uniqueness. S1 merchant-side uniqueness was not independently evidenced either. No nonzero points/balance/coupon HOLD/COMMIT matrix, actual printed receipt ACK, controlled multi-worker contention, S4, S5, refund, production merchant/device acceptance or rollout has been performed by these tests. R2 human-attested closure remains distinct from S3 provider-confirmed success.

##### C-2C7 S4 — read-only safety readiness audit / controlled verification plan — 2026-10-16 (SOURCE AUDITED; NOT DEVICE VERIFIED)

- **Readiness:** `READY FOR CONTROLLED S4 VERIFICATION / NOT YET S4 VERIFIED`. Audited existing `AGENTS.md`, payment charter/phase plan, `create-payment-attempt.use-case.ts` and focused specs, `prisma-payment-transaction.repository.ts` and specs, `pos-card-payment-orchestration.service.ts` and specs, terminal transport, POS payment page, `PaymentTerminalOperation` schema/repository and CI workflow. This is a source/test **inspection**, not a fresh test execution or real-device S4 proof. Keep normal POS Terminal feature guarded and R2 manual-recovery exception off.
- **Duplicate click / two POS clients / concurrent original recovery:** `resumeOriginalSale` keeps the original checkout identity, rejects missing payment/non-eligible states, provides same-process active-attempt coalescing, then Payments performs canonical recheck, checks matching `SALE_IN_FLIGHT` terminal ownership, and atomically CAS-claims only original 504 + canonical NOT_FOUND + null provider payment ID. Repository CAS permits one claimant; `create-payment-attempt.use-case.spec.ts` contains simultaneous-resume and second-504 no-rearm tests; `PaymentTerminalOperation.reserve` only replaces a `FINALIZED` slot. **No live multi-process/external-client concurrency verification.** Avoid using a paid S3 Attempt to stimulate another Sale; safe completed-attempt review/recheck must not charge.
- **BUSY/offline / Welcome failure / second 504:** server checks terminal availability before replay, and `prepareOriginalSaleResume()` requires explicit IDLE/AVAILABLE/READY and Welcome before any recovered Sale. BUSY and unconfirmed Welcome are tested; post-claim Welcome failure consumes the one-time CAS permit and leaves `RECONCILING`, requiring operator review, **not** a second retry. A second 504 is persisted with `CLOVER_TERMINAL_SALE_HTTP_504_RESUME_CLAIMED` and cannot re-arm automatic/manual replay. Note availability may have an HTTP-200 inferred AVAILABLE fallback, so only the stricter pre-replay explicit-idle/Welcome check is device-idle proof; claim can already be consumed if this later check fails. Use mocked fault cases first, not risky device disturbance during a live Sale.
- **Browser reload / API process loss:** POS saves pending Attempt/idempotency/frozen order to `sanq.pos.cardPayment.pending.v1`, reloads that identity, calls `recover` rather than generating a fresh Sale; server `RECOVER` uses existing checkout and does not dispatch another original Sale. If process exits **after one-time resume claim and before provider dispatch**, the claim and terminal fence stay durable/non-final; there is intentionally no automatic re-arm, force unlock, failure/RELEASE inference or new identity. No verified automatic operator escape hatch for this state; preserve R1 evidence and require a separately reviewed incident/recovery decision. Existing mocked API restart tests concern recovery but are not a real interruption-after-claim device test.
- **Late canonical success/decline and Benefits:** existing payment specs exercise monotonic canonical success, definitive decline and conflicting late finals. Only canonical `SUCCEEDED` creates/finishes the paid Order and COMMIT; 504, timeout, device Cancel ACK and Platform NOT_FOUND do not release Benefits or finalize a paid Order. Definitive cancellation/decline/failed RELEASE belongs to S5; R2 operator-attested unpaid remains exceptional and must not be generalized. A delayed payment on an already human-closed R2 record is an explicit manual finance conflict, not silent status rewriting.
- **Suggested bounded verification order:** (A) read-only recheck of completed S3 Attempt and local Order/Payment counts, plus separate Test Merchant single-charge confirmation; (B) source/CI-mocked duplicate resume, BUSY/offline, Welcome failure, post-claim process interruption, second 504, late canonical success/decline and cross-process claim/contention using existing boundaries; (C) only separately authorized, isolated, risk-reviewed Compact Sandbox exercises where mocks do not establish provider behavior. Fail closed on uncertainty: no additional Sale, no manual fence mutation, no Benefits RELEASE, no new Order and no production traffic. Do not disrupt another POS instance or direct Clover client. S4 PASS requires documented per-scenario observed state + call-count/identity evidence, terminal fence and Orders/Benefits checks, and explicit listing of any unverified external-client lease assumptions.
- **Boundary:** this audit proposes **no** architecture/module responsibility change, API/schema/migration/dependency change, live payment traffic, or protected production Web Ecommerce modification. If an S4 finding requires a new cross-process lease or financial recovery contract, report reason, impact and alternatives for **new user approval before code modification**; no production cutover authorization follows from local S1–S3.

##### C-2C7 S4-A local review evidence and S4-B concurrency characterization — 2026-10-16 (S4-A LOCAL READ VERIFIED; S4-B TESTS AUTHORED / NOT RUN)

- **S4-A operator evidence:** the user independently repeated a read-only SQL of completed S3 Attempt `184ccb5a-16da-490a-a1af-938027eebec3`: Payment `SUCCEEDED`, Checkout `COMPLETED`, canonical provider ID `HY8KKDPK82HQT`, original Order Stable ID, terminal fence `FINALIZED` and matching owner identity. Independent counts remained **one local PaymentTransaction** by original external ID and **one local Order**. After browser refresh, the POS payment-page original-Attempt lookup again rendered `SUCCEEDED/SUCCEEDED/FINALIZED` with the same identities. Two visible HTTP 404s were explained by an incorrectly entered Attempt ID, not a confirmed failure of the correctly keyed Review. The screenshots alone do not provide a Network trace proving zero outbound Terminal Sale calls during refresh or Clover Test Merchant evidence of one actual charge. Therefore S4-A is **local read/refresh verified**, with call-count and merchant uniqueness evidence outstanding; do not claim full external idempotency.
- **S4-B source inspection:** original 504 replay is gated by persisted PaymentTransaction `status/resultCode/failureCode/providerPaymentId` CAS and matching `SALE_IN_FLIGHT` fence identity; recovered outbound Sale retains original payment UUID, Attempt, idempotency key, external payment ID, amount and currency. Separate POS instances rely on the same durable Payment/Checkout/Terminal CAS rather than the process-local active-attempt guard. Normal Start uses Checkout provider-start CAS plus Terminal `RESERVED -> SALE_IN_FLIGHT` dispatch claim. Terminal reassignment from `FINALIZED` is conditional on the old terminal+attempt+state. Stale reads, a consumed 504 claim, another HTTP 504 or a non-final device slot must never trigger an extra Sale. Existing focused specs cover duplicate start, simultaneous clicks within one service, 504 re-arm refusal, and a `SALE_IN_FLIGHT` fence blocking a new Attempt.
- **S4-B added characterization coverage (local only):** `create-payment-attempt.use-case.spec.ts` adds two **independent TerminalPaymentService instances** sharing one in-memory Payment repository, mocked Terminal fence and provider spy. They race the original same-identity replay; assert only one additional provider Sale, original amount/identity, a single transaction, consumed `RESUME_CLAIMED` state, and refusal to re-arm. `prisma-payment-terminal-operation.repository.spec.ts` adds a competing `FINALIZED -> RESERVED` slot CAS mock with one successful `updateMany` and one losing `count=0`, verifying only one new Attempt can acquire a previously finalized slot under the simulated race. The two fixtures are **application/Prisma-mock characterization only**, not PostgreSQL transaction-level contention proof, independently running API processes or an external Clover device lease.
- **S4-B accompanying POS review UI correction:** the operator observed an unconditional “no final payment conclusion / do not start another card Sale” notice even while the original reviewed Payment was `SUCCEEDED` and Checkout completed. `PosCardPaymentBenefitsReview.tsx` now shows this warning **only** when the reviewed Payment has `CREATED`, `PROCESSING`, `UNKNOWN`, or `RECONCILING` status (falling back to the Checkout status if no Payment row exists). Final `SUCCEEDED/DECLINED/CANCELLED/FAILED` outcomes no longer show the misleading generic uncertainty notice. Existing late-canonical conflict warning, manual-unpaid review, device fence checks and all payment commands are unchanged. A focused Web Jest status-matrix regression is added at `PosCardPaymentBenefitsReview.test.ts`. Only UI copy visibility changes; no new financial authorization or retry permission is inferred.
- **Gate/status:** **S4-B LOCAL TESTS AUTHORED / UI CORRECTION IMPLEMENTED / NOT EXECUTED / CI PENDING USER REVIEW.** Per `AGENTS.md`, no local lint/build/Jest is run by default; GitHub CI becomes authoritative after user approves remote PR into `dev`. No behavior/code path changed in the payment runtime; no migration, public DTO/API, architecture dependency or production Web Ecommerce change. Keep the isolated manual-unpaid exception disabled, and do not execute duplicate live Sale to test idempotency. For S4-B closeout require green CI, explicit distinction between mocked conditional-write behavior and actual PostgreSQL multi-process concurrency, plus outstanding merchant-side double-charge check and controlled S4-C/D fault-injection gates.

##### C-2C7 R1 — POS original payment review / explicit canonical recheck (2026-10-15, PR #2818 MERGED / CI #7242 GREEN / MACBOOK SANDBOX VERIFIED)

- **Observed blocker:** MacBook-isolated Compact Attempt `ccb9ccb4-91c6-49bd-9f39-b55b83dcaafa` is still `RECONCILING` after original Sale HTTP 504 and canonical `CLOVER_PLATFORM_PAYMENT_NOT_FOUND`. The per-device `PaymentTerminalOperation` remains `SALE_IN_FLIGHT`; four subsequent attempted payments were cancelled locally before a new provider Sale and released their own Benefits. Clover Test Merchant shows a same-time/matching-amount Open $5.65 order with No Payments, but this observation is not provider-confirmed financial cancellation.
- **R1 read:** authenticated POS Store-scoped `GET /pos/payments/card/review/:attemptId` returns the persisted original Checkout/Payment state, 504 result marker and sanitized provider identity with no new Platform query, data mutation or credential disclosure. The existing 25-row long-wait review UI gains a per-Attempt detail action.
- **R1 recheck:** authenticated POS Store-scoped `POST /pos/payments/card/review/:attemptId/recheck` reuses the *original persisted payment* and the existing Payments-owned Platform v3 `reconcile()` for UNKNOWN/RECONCILING or stale PROCESSING; final outcome uses established Checkout/Benefits/Order orchestration. No original checkout payload/idempotency key from the browser is required; this route never calls `startSale()`, `resumeOriginal504Sale()`, `cancel()` or issues another terminal Sale. A missing Payment, non-owned Attempt, or disabled Terminal fails closed; fresh PROCESSING and CREATED are only inspected, not dispatched. Repeated 504 + NOT_FOUND remains RECONCILING and Benefits HELD.
- **R1 UX:** when a new Attempt gets `POS_TERMINAL_ALREADY_RESERVED`, the cancelled local attempt still releases its own Benefits but the POS Checkout shows an explicit warning that no new card charge was issued and directs operators to review the older Attempt. This is not an unlock mechanism.
- **Boundaries / delivery gate:** no schema, migration, dependencies, Clover protocol/OAuth changes, production Web Ecommerce mutation, new architecture context edges or scanner baseline. Store guards, Payments canonical financial authority, Benefit owner gates and the persistent Terminal Fence remain unchanged. Additive POS review API/UI and focused controller/orchestration regression tests. Local lint/build/tests intentionally deferred per `AGENTS.md`; remote PR/CI and Compact T1 real-device verification remain separately gated. R2 — human-attested 504/NOT_FOUND unresolved payment closure — is *not* authorized or implemented.

##### C-2C7 T1 Sandbox HTTP validation hotfix (2026-10-15, LOCAL SOURCE / REVIEW PENDING)

- **Observed blocker:** MacBook-isolated Compact T1 reached `POST /api/v1/pos/payments/card/:attemptId/cancel` at 12:51:38 but returned HTTP 400 in 3 ms: `ZodValidationPipe` received the string route `attemptId` while method-wide `@UsePipes(PosCardPaymentStartSchema)` expected an object. The request failed before POS orchestration or Clover device Cancel was invoked. The prior Sale is not thereby proven cancelled, declined or settled.
- **Scoped adapter fix:** move the unchanged Zod schema to `@Body(new ZodValidationPipe(...))` on this Cancel endpoint, leaving authenticated POS Store/device guards, path/body Attempt identity comparison, Payments-owned operation fencing and canonical financial-finality rules intact. Mirror existing POS refund controller parameter-scoped validation. Do not change `start/recover/resume-original` or Web Ecommerce.
- **Regression and gate:** real Nest HTTP + mocked orchestration must accept the string path with a valid body, reject malformed JSON body and mismatched path/body attempts before any cancellation invocation. No Prisma, migration, flags, provider protocol, persistence or architecture import change. Local tests intentionally deferred to user-approved GitHub CI; T1 **FAIL / NOT RETESTED**, with Compact original Sale and terminal fence requiring read-only reconciliation before another test Sale. After PR review/CI and MacBook source refresh, repeat T1 using the same payment/cancellation evidence rules; never treat HTTP 400 or mere device idle as payment finality.

##### C-2C7 Slice B1+B2 — Operator Cancel / Financial Finality (2026-10-15, MERGED / MIGRATION REVIEWED / SANDBOX T1 BLOCKED)

- **Baseline:** latest `origin/dev@76934c8491786c352f7f16e95966098268411945` with Slice A PR #2815 merged; production Web Ecommerce `/v1/charges`, its OAuth config, Platform v3 canonical payment truth and Benefits owner responsibilities remain unchanged. No production or Compact device verification is claimed.
- **Approved schema-only expansion:** Payments owns a single `PaymentTerminalOperation` row per Terminal device. `RESERVED -> SALE_IN_FLIGHT` binds the original Attempt, internal payment ID and frozen external ID before the provider Sale; `CANCEL_REQUESTED/CANCEL_ACKED` records operator intent and device command receipt without declaring financial cancellation. Only a concluded sale with safe device recovery (or a verified never-dispatched pre-provider cancellation) can transition to `FINALIZED`. Any unresolved row (including API process loss) blocks a competing Attempt/store from taking over. Device Cancel is intentionally outside Slice A's long-running Sale/Welcome Promise queue; the queue stays for Sale/Welcome ordering. This is a DB CAS fence for SanQ POS operations, not a lease for arbitrary external Clover clients.
- **Financial finality:** original Sale HTTP 209 is attached through the original in-flight Sale call (attempt/idempotency/frozen external identity) and reconciled against Platform v3 before cancellation finalization: canonical success wins, Platform `NOT_FOUND` combined with original 209 permits cancellation, unavailable/conflicting canonical evidence remains `UNKNOWN/RECONCILING`. Cancel HTTP 200, device IDLE/Welcome, canonical NOT_FOUND alone, and timer expiration never authorize RELEASE. A pre-dispatch cancellation is the only exception because the durable device fence proves no provider command was claimed.
- **Checkout/Benefits/POS:** Reuse existing Checkout `CANCELLED`, owner RELEASE, `benefitsReleasedAt` and restart poller. Additive POS payment snapshots carry `benefitsReleaseComplete`, `terminalReadyForNextSale`, `cancellationPending`. POS unlocks the original basket only after definitive server cancellation plus Benefits RELEASE, retaining editable draft preferences/member stable ID in session storage, re-querying customer data and repricing. Device Welcome is separately attempted; failure leaves the persistent terminal fence blocking further card Sales but does not undo final cancellation or prohibit an independently safe cash checkout. No browser storage key is financial cancellation authority.
- **Schema/Migration gate:** **MIGRATION REQUIRED**; only `schema.prisma` is edited here. Do not generate or modify `apps/api/prisma/migrations/**` in MCP; the user will generate additive `add_pos_terminal_operation_fence` SQL in the disposable/local development DB, review it, and commit a separate matching migration to `dev`. Until then `dev -> main` / production deployment is BLOCKED. Check table/index/enum addition, uniqueness on terminal and attempt, and the absence of destructive SQL/backfill.
- **Manual abnormal recovery:** if the API restarts after Sale dispatch, Cancel returns ACK without original Sale 209, or canonical/device evidence disagrees, keep both checkout and terminal slot non-final. The operator must use the existing POS recheck/reconciliation entry, record the original attempt, terminal, externalPaymentId, canonical v3 Payment result and current device status, and escalate through store payment review/Clover reconciliation before authorizing a new card sale. A missing Platform payment or an IDLE/Welcome device does not authorize manual status rewriting, Benefit RELEASE or a replacement card charge; the terminal fence must remain until a separate evidenced recovery decision. There is deliberately no unsafe force-unlock endpoint in this Slice.
- **Failure/verification:** process loss after provider dispatch leaves the terminal slot non-final and requires human-assisted canonical + device inspection; no auto-release or second Sale. Focused mocked API/Web regressions are authored but not run locally per `AGENTS.md`; PR CI and MacBook-isolated Compact device 209/ACK ordering, tap/cancel race, repeated clicks, two-POS contention, Benefits owner failure/recovery, Welcome and cash re-quote remain mandatory. Feature flag off stops new POS Terminal operations but preserves historical unresolved payment/operation evidence. No runtime deployment.
- **Updated delivery/verification status (2026-10-15):** PR #2816 merged into `dev@c0c5c216`; user-generated additive `20261015163244_add_pos_terminal_operation_fence` committed as `dev@54d3c34a`, SQL reviewed against schema, and rerun CI #7237 passed all seven jobs including 206-migration fresh-DB replay and 13/13 Browser E2E. Original local-source/migration-required statements above describe historical readiness gates and are now satisfied in `dev`; MacBook Sandbox T1 failed on the Cancel HTTP adapter's method-scoped Zod validation and requires the scoped hotfix above followed by real-device replay. No production approval or payment finality is claimed. `docs/architecture/modularization-worklog2.md` owns the chronological entries.

### 0.3 2026-09-09 Web Clover cutover readiness audit / freeze decision

只读审计确认当前 Web production 链路仍为 `CheckoutIntent -> Ecommerce POST /v1/charges -> Ecommerce v1 status/reconciliation -> Orders.createImmediatePaid()`；Unified `CloverPaymentProviderAdapter` 虽然已支持 `WEB_ECOMMERCE` execution，但其 Web status 路径仍调用 Ecommerce v1，Platform v3 canonical gateway 目前只在 Terminal status/reconciliation 中成为 authority。因此不能把 Web `getPaymentStatus()` 简单从 v1 换成 v3：若 `/v1/charges` 已成功而 Platform payment 暂未可见，正确语义必须是 `UNKNOWN/RECONCILING`，reservation 继续 HELD、不得再次 charge、不得先创建 paid Order，直到 v3 canonical success 恢复。

当前 Unified 数据模型已具备 Web 所需的大部分 channel-neutral facts，但应用边界仍未 Web-ready：`PaymentCheckoutAttempt` 支持 `WEB_ECOMMERCE`，而 Orders payment preparation/finalization implementation 仍明确只接受 `in_store`；`CheckoutIntent` 仍被下游用于 Web session、verified contact、locale、delivery/3DS 等 context，不能在第一批迁移中删除。生产只读证据在审计时为：`CheckoutIntent` 11 条（5 pending / 3 failed / 3 completed），其中 6 条已有 Clover payment/external identifiers、0 条记录正向 surcharge metadata；Web CARD Order 41 条，`creditCardSurchargeCents > 0` 为 0；存在 1 条历史 refunded Web CARD Order 且无 linked CheckoutIntent。这个证据支持把 Platform v3 `additionalCharges` / `CREDIT_SURCHARGE` 作为未来 canonical truth，但不支持现在直接改写历史或 live persisted facts。

当前 `ACTIVE` Unified authorization 仍绑定 Test Merchant。Production Web `/v1/charges` 使用独立 live Web merchant 配置，因此 production Web payment ID 不能拿 Test Merchant Platform v3 做 shadow parity；`NOT_FOUND` 在这种 merchant mismatch 下没有业务判定价值。故未来 Phase G 的第一步必须等 Test App/device acceptance 完成、sandbox binding 明确撤销/切换、App 安装并 OAuth 到运营 production merchant 后，再做 fresh production-merchant readiness audit。通过后才允许建立 read-only v3 shadow compare；在此之前不修改 Web `/v1/charges` execution、CARD/Apple Pay/Google Pay、3DS/session/pricing token/contact verification、Web order finalization、external-payment refund、production webhook merchant scope 或 Web payment/surcharge persistence。

## 1. Architecture Tests 总体策略

Architecture tests 必须提前进入仓库，并在 Phase A 的最前面建立，而不是等所有代码重构完成后才补。

其作用是把 charter 中的模块边界变成 CI 可执行门禁。

### 1.1 Phase A 首项工作

Phase A 开始时，第一批工作应是：

1. 复用仓库现有 UberEats architecture test 的扫描/解析工具和测试风格。
2. 建立 Payments architecture spec。
3. 把“当前已经可以成立”的支付边界先锁住。
4. 对仍存在的 legacy 依赖采用最小、显式、可删除的临时豁免。
5. 每完成后续一个 Phase，就删除对应豁免并收紧门禁。

### 1.2 不允许一次性启用最终规则

当前代码本身仍存在 `CloverModule -> OrdersModule`、legacy `CARD -> Order` 等历史依赖，因此不能在文档 PR 或 Phase A 开始时直接写出“最终状态全部强制成立”的测试，否则基线 CI 会立即失败，项目无法渐进迁移。

正确方法是“渐进式门禁”：

```text
当前旧边界仍存在
  -> 用明确 legacy exception 标记
  -> 完成对应 Phase
  -> 删除 exception
  -> CI 从此禁止回退
```

临时豁免必须：

- 精确到具体文件/依赖方向。
- 写明对应 Phase 和删除条件。
- 不允许使用 broad glob 把整个目录排除。
- 不允许为了过 CI 持续扩大豁免范围。

### 1.3 最终需要锁住的 architecture rules

至少包括：

- Payments domain 不得 import Orders、POS、Clover infrastructure。
- Payments application 不得直接依赖 Clover concrete gateway，只能经 Provider port。
- Orders 不得 import Clover transport、OAuth、wire schema。
- POS 不得 import Clover gateway、OAuth、provider raw schema。
- Clover infrastructure 不得直接创建 Order、打印或操作 loyalty/kitchen。
- Clover wire schema 不得越出 Payments infrastructure / adapter。
- 只有明确的 composition/orchestration 层可以同时依赖 Payments 与 Orders。
- Provider infrastructure 不得反向决定 Order lifecycle。
- legacy cleanup 后，CI 必须阻止重新出现 `CARD -> 直接创建 paid Order` 的生产入口。

### 1.4 Architecture test 放置要求

应沿用仓库现有测试组织风格，优先放在 API 源码对应 bounded context 附近，例如：

```text
apps/api/src/payments/payments-architecture.spec.ts
```

如需要通用扫描 helper，应优先复用现有安全工具；只有现有工具无法表达支付边界时才新增最小 helper。

不得为了支付项目改写 UberEats architecture test 的语义。

---

# Phase A — Payment Domain Foundation

## 目标

先建立正式 Payments bounded context，但不改变任何生产支付行为。

本阶段本质：**先修地基，不动现有收银入口。**

## 第一项工作：建立 Architecture Tests

在写 `PaymentsModule` 或搬任何 Clover 逻辑前，先建立本阶段可以成立的 architecture tests。

至少先锁住：

- 新 `payments/domain/**` 不能 import `orders/**`、`pos/**`、`clover/**`。
- 新 `payments/application/**` 不能 import Clover concrete infrastructure。
- Payment domain 不依赖 Nest / Prisma / HTTP provider wire types。
- Provider port 与 domain types 位于允许的公共边界。

对当前旧 Clover/Orders 耦合不立即判红；该依赖应登记为 Phase B 要移除的 legacy boundary，并在 Phase B 完成后补上强制规则。

## 主要工作

1. 新增 `PaymentsModule`。
2. 建立 `PaymentTransaction` 数据模型。
3. 建立 Payment domain types。
4. 建立 Payment status state machine。
5. 建立 `PaymentProvider` port/interface。
6. 建立 Payment repository boundary。
7. 建立 payment attempt / idempotency 内部语义。
8. 明确 Sale / Refund / Void operation 类型。
9. 明确 provider / source / paymentMethod 分类。
10. 建立并通过本阶段 architecture tests。

Phase A 只建立 provider-neutral payment core，不实现 Clover wire API，也不决定 Ecommerce `/v1/charges`、REST Pay Display `/connect/v1/payments` 或 Platform REST v3 的具体 transport/auth。Clover API family separation 从 Phase B 开始。

## 建议目录

```text
apps/api/src/payments/
  payments.module.ts
  payments-architecture.spec.ts
  domain/
  application/
  infrastructure/prisma/
```

## 数据库要求

允许：

- 新增 `PaymentTransaction` 表。
- 新增 nullable 关联字段。
- 新增必要索引/enum。

不允许：

- 删除 Order 旧支付字段。
- 把现有 CARD 强制绑定 PaymentTransaction。
- 伪造历史 Clover transaction。

Prisma migration 必须遵守 `AGENTS.md`；未经明确授权不得生成或执行 migration。

## 兼容要求

完成后：

- POS CARD 仍走旧链路。
- Web Clover 仍走旧链路。
- Refund 仍走旧人工流程。
- PaymentsModule 不能成为 legacy 生产路径的强制依赖。

## 测试要求

- Payment 状态转换。
- 非法状态转换拒绝。
- payment attempt 唯一性。
- idempotency key 规则。
- repository 行为。
- Phase A architecture tests。

## 完成标准

- Payment domain 独立编译。
- 不依赖 Clover wire schema。
- 不依赖 Orders internals。
- 不改变生产支付行为。
- 受影响 CI 全绿。

## VM 部署

允许。完全 additive。

## 进入 Phase B 条件

Payment domain / data model / architecture baseline 已稳定，legacy CARD 无行为变化。

---

# Phase B — Clover Provider Separation

## 目标

把 Clover 从“支付业务本身”降级为 Payments infrastructure/provider，并按 capability 明确分离 Ecommerce execution、REST Pay Display execution 与 Platform REST v3 canonical read/reconciliation。

## 主要工作

1. 定义 Clover provider adapter。
2. 拆分现有 `CloverService` 过重职责。
3. Ecommerce transport 单独封装，继续承载 legacy Web `/v1/charges` execution compatibility。
4. Terminal transport 建立 skeleton，承载 REST Pay Display `/connect/v1/payments` / device interaction。
5. 新建 Clover Platform Payments v3 gateway/read model，支持按 provider payment ID 获取 payment，并支持按 `externalPaymentId` 查询/恢复。
6. Platform v3 mapper 支持 canonical amount/result、`additionalCharges`、card transaction、refund 等所需字段，不把 raw v3 schema 暴露给 Payment application/domain。
7. Clover response mapper 按 API family 分开，不允许使用一个宽松 mapper 同时猜 `/v1/charges`、REST Pay 和 v3 shape。
8. OAuth / credential / device config 边界明确；Ecommerce、Terminal、Platform v3 配置槽必须显式区分，禁止隐式 token fallback。
9. provider wire schema 限制在 infrastructure 层。
10. 保持现有线上支付行为不变；Phase B 建立 v3 capability 不等于提前迁移 Web 流量。

## Architecture Test 收紧

Phase B 完成时应至少新增/收紧：

- Orders 不得新增 Clover wire/transport 依赖。
- 新 Payments application 不得 import Clover concrete gateway。
- Ecommerce / REST Pay Display / Platform v3 wire schema 不得越出 infrastructure。
- Platform v3 gateway 不得被 Orders/POS/orchestration 直接 import；只能通过 Payment provider/application boundary 暴露 canonical payment facts。
- 对完成迁移的旧 Clover -> Orders 直接依赖，删除对应 legacy exception。

若仍有旧 `CloverPayController` 为兼容 Web checkout 暂时需要 orchestration，应将 exception 精确限制在该文件和迁移期限，不得扩大到整个 Clover 目录。

## 兼容要求

- Web CARD / Apple Pay / Google Pay 行为不变。
- POS CARD 仍走 legacy。
- Clover Terminal 不启用。

## 禁止事项

- 不让 POS 调 Terminal。
- 不提前删除现有 Web 生产路径。
- 不引入 Orders -> Clover 依赖。
- Payment domain 不 import Clover wire types。

## 测试要求

- Ecommerce mapper。
- REST Pay Display / Platform v3 mapper 分离。
- Platform v3 payment-by-id 查询。
- Platform v3 `externalPaymentId` reconciliation 查询。
- `additionalCharges` / `CREDIT_SURCHARGE` canonical mapping。
- Platform v3 auth/config 不与 Ecommerce token 隐式混用。
- Provider result normalization。
- Clover failure mapping。
- amount/currency/paymentId mapping。
- existing Web Clover regression。
- Phase B architecture tests。

## 完成标准

Clover provider 边界清晰，Ecommerce/Terminal/Platform v3 三类 capability 已分离；Platform v3 canonical read/reconciliation capability 可被 Phase C 使用；Web/POS legacy 无回归，CI 全绿。

## VM 部署

允许。

---

# Phase C — Clover Terminal Backend Capability

## 目标

完成 Clover REST Pay Display 的 POS transaction execution，并把 Platform REST v3 接入为 Unified Payment Core 的 canonical payment truth / reconciliation source；不切 POS 主链路。

## 主要工作

1. Terminal device/config 读取。
2. Terminal health / availability。
3. REST Pay Display Sale request。
4. REST Pay Display immediate status / cancel 能力。
5. `externalPaymentId`。
6. idempotency key。
7. provider payment ID 保存。
8. Sale response 成功后使用 Platform REST v3 按 payment ID 读取 canonical payment。
9. response 丢失/provider payment ID 未知时，使用 v3 collection 按 `externalPaymentId` 做 reconciliation。
10. v3 canonical mapper 核验 amount / result / provider payment identity，并读取 `additionalCharges` / card transaction 等所需事实。
11. v3 暂时未看到刚完成交易或 Platform API 临时不可用时进入 UNKNOWN / RECONCILING，不得提前 finalize Order。
12. reconciliation。
13. Terminal payment persistence。
14. 必要 OAuth / RAID / device binding。
15. Platform v3 merchant-authorized token/config 与 Ecommerce/Terminal 配置显式隔离。

## 主状态链路

```text
PaymentTransaction CREATED
  -> PROCESSING
  -> REST Pay Display Sale
  -> execution observation
  -> Platform REST v3 canonical read
  -> SUCCEEDED / DECLINED / CANCELLED / UNKNOWN
```

REST Pay Display 返回 `SUCCESS` 只代表 execution observation 成功；对 Unified Payment Core 而言，在 Platform REST v3 尚未取得足够 canonical payment evidence 前，不得据此 finalize paid Order。

## UNKNOWN 要求

发生 timeout、response lost、provider 暂时不可查询、network interruption，或 REST Pay 已成功但 v3 payment 暂时不可见时，必须进入 UNKNOWN/RECONCILING，不得直接 FAILED 后允许重新刷卡。

## Reconciliation 要求

优先使用 provider payment ID 通过 Platform REST v3 查询；provider payment ID 未知时使用 v3 payment collection 按 `externalPaymentId` 查询，并结合本地 idempotency identity。不得用金额+时间或 last4+金额猜交易。REST Pay Display status 可以辅助设备交互恢复，但不能替代 Platform v3 的长期 canonical transaction read。

## Architecture Test 收紧

- Terminal gateway 只能位于 provider infrastructure。
- Platform v3 gateway / mapper 只能位于 provider infrastructure。
- API/application 层不得解析 raw Terminal 或 Platform v3 wire response。
- reconciliation 必须经 Payment application/repository boundary。
- POS/Orders/orchestration 不得直接引用 Terminal 或 Platform v3 gateway。

## 测试要求

除 Sale success、decline、cancel、timeout、unknown、duplicate request、idempotency、device unavailable、可模拟的 restart recovery 外，必须覆盖：

- REST Pay success + v3 canonical payment success -> `SUCCEEDED`。
- REST Pay success + v3 暂时 404/不可见 -> `UNKNOWN/RECONCILING`，不得创建 paid Order。
- REST Pay response lost + v3 `externalPaymentId` lookup 恢复成功。
- v3 amount/result/payment ID mismatch -> 不得 `SUCCEEDED`。
- v3 `additionalCharges` 中 `CREDIT_SURCHARGE` 正确进入 `surchargeCents`。
- charged total 基于 Clover canonical payment + actual additional charges 核验。
- Platform v3 timeout/auth temporary failure 保留 unresolved payment，不允许二次无保护扣款。

## 完成标准

不接 POS UI 的情况下，后端已能：`REST Pay execution -> Platform v3 canonical truth -> persist -> recover unknown`；只有取得足够 canonical provider evidence 才向 Unified Payment Core 暴露最终 `SUCCEEDED`，legacy CARD 不受影响。

## VM 部署

允许。Terminal path 不启用。

---

# Phase D — Unified Payment Core + POS First Consumer（flag=false）

## 目标

建立未来 Web / POS 共用的 Unified Payment Core，并让 POS Clover Terminal 成为第一位消费者；生产默认仍走旧 POS CARD，现有 Web Ecommerce 链路完全不迁移。

Phase D 不再建设 POS 专属支付状态机。所有新增 payment preparation、snapshot、reservation、tender allocation、recovery 和 finalization contract 必须保持 channel-neutral，以便后续 Web 直接迁入而不是复制第二套实现。

## 主要工作

1. 建立统一 checkout/payment preparation application contract。
2. external payment 前持久化 immutable order draft snapshot、pricing snapshot、tender allocation、store/source/attempt identity。
3. 建立内部权益 reservation：Points / Stored Balance / Coupon。
4. reservation 状态至少覆盖 HELD / COMMITTED / RELEASED。
5. HOLD 成功后才允许发起 Clover Terminal Sale。
6. 计算 external card due；100% internal tender 时不得发起无意义 Clover Sale。
7. 新银行卡支付弹窗。
8. Terminal 状态展示。
9. Waiting / Processing / Success / Declined / Cancelled / Unknown / Reconciling UX。
10. retry / change payment method。
11. POS reload 恢复相同 logical payment attempt。
12. WebSocket / realtime status push。
13. 只接受 Payment provider/application boundary 返回的 canonical `SUCCEEDED`；Phase D orchestration 不直接读取 REST Pay 或 Platform v3 raw response。
14. provider canonical success 后使用已固化 snapshot finalize Order，不重新按当前价格/促销计算已批准 external due。
15. finalize transaction 中 COMMIT reservation + consume payment attempt + create Order；明确失败时 RELEASE reservation。
16. Order creation / reservation commit / release / print 全部幂等。
17. 成功后打印并进入 board。
18. 新核心从命名和 contract 上不得绑定 POS；POS controller/UI 只是第一层 adapter。

## Reservation 硬规则

```text
Quote + Snapshot
      -> HOLD Points / Balance / Coupon
      -> persist logical attempt
      -> external payment

SUCCEEDED
      -> COMMIT reservations
      -> create Order

DECLINED / CANCELLED / definitive FAILED
      -> RELEASE reservations

UNKNOWN / RECONCILING
      -> KEEP HELD
      -> reconcile provider truth
```

- `expiresAt` 只能标记 stale reservation 并触发 reconciliation，不得直接自动 RELEASE unresolved attempt。
- 不得通过“先真实扣减，再失败补偿”模拟 HOLD。
- Coupon entitlement 必须与 Points / Balance 一样防止并发重复消费。
- snapshot 固化后，菜单价格、Promotion、税率、Coupon 当前状态变化不得改变该 attempt 已批准 external amount。

## Feature Flag

```text
POS_CLOVER_TERMINAL_PAYMENT_ENABLED=false -> legacy CARD
POS_CLOVER_TERMINAL_PAYMENT_ENABLED=true  -> Unified Payment Core + Clover Terminal
```

默认必须为 `false`。该 flag / `PosCardPaymentFeatureConfig` 只是注册兼容项
`payments.pos-card-legacy.v1` 的迁移期切流与 cutback 基础设施，不是长期 POS
业务 policy，也不应被搬进 Payments 或包装成永久 public feature-policy contract。
最终形态只有一条 CARD 主链路；Phase J 删除 legacy direct-paid CARD 时必须连同
flag/config 和所有 route-choice branch 一起删除。

Accounting 不得把该 runtime flag 当作动态财务计算开关。2026-09-25 的真实 June/July
Clover Closeout + Monthly Statement 交叉审计证明：legacy POS 与物理 Clover Terminal 分离期间，
`Order.paymentMethod=CARD` 不包含 provider tip / surcharge，也不保证与 Clover payment 一对一，因此
不能继续作为 Clover receivable / Provider Pending authority。

从 Accounting start 2026-06-01 到 production Unified POS-Clover payment cutover 前，Clover 资金侧权威
改为 provider evidence：Daily Closeout 提供 Batch/Sales/Refund/Net/Tax/Tips，Monthly Statement 作为
period principal / fee / explicit surcharge control，CIBC 继续作为实际 bank settlement authority。
Order 仍拥有 Sales/HST/discount/promotion 等 SanQ sale economics，但其 legacy CARD tender attribution
仅作 diagnostic/supporting evidence。历史已生成 Journal 不删除，后续通过独立的 Accounting authority
replacement / compensating Journal 流程修正。

因此此前“不再引入额外 cutover timestamp”的约束被真实生产证据**明确 supersede**。当前
`POS_CLOVER_TERMINAL_PAYMENT_ENABLED` 仍只是临时 route-choice/cutback flag，Phase J 仍会删除；
Accounting 不能读取其当前值来重新解释历史。正式 production go-live 应记录一个 durable
Accounting payment-fact cutover `providerPaymentFactCutoverAt`：cutover 前使用
Closeout/Statement authority，cutover 后要求 Payments-owned canonical Clover facts。若运营事故导致
flag 临时切回 false，durable cutover 不得自动后退；缺少 Payments fact 的 post-cutover CARD 财务事实
必须 fail closed / 显式 reconciliation。

现有 Orders-owned `posCardExecutionEvidence=LEGACY_DIRECT_PAID|UNIFIED_PAYMENT_CORE` 仍可保留为
payment execution provenance，但不能替代上述 provider-side financial authority。Production Web
Clover 的 `/v1/charges`、refund、merchant scope 与 guarded compatibility 不在该修改范围。详细
Accounting authority contract 见
`docs/architecture/accounting-clover-pre-sync-authority-plan.md`。该 Accounting Slice A 已于
2026-09-26 在 production `main@b7a01075` 完成验证并 CLOSED：June/July provider coverage 均唯一闭合，
authenticated shadow GET 返回 200，且验证未产生任何 Journal 写入。这一 closeout **不代表** POS-Clover
production payment cutover 已发生，也不设置 `providerPaymentFactCutoverAt`。Accounting Slice B
source 已通过 PR #2552 合入，user-generated migration
`20260926064114_accounting_clover_payment_fact_cutover_contract` 也已进入 `dev@459034c2`；SQL
审阅确认只是一个 nullable `TIMESTAMP(3)` column，无 default/backfill/drop/data rewrite，CI
#6431/#6432 全绿。writer 仍只有 Clover `null -> timestamp` 的 audited one-way 语义，并且没有
controller/flag listener/go-live caller，所以 production cutover timestamp 仍未设置。Accounting
Slice C 的 read-only historical authority replacement baseline 已合并：6/1 的 47,922c bank deposit
精确对应 5/29-5/31 pre-start Closeout，因此保持 excluded。Slice D 本地实现新增 Clover Dashboard
Sales Report supplemental evidence：June 报表的 157 笔、288,288c Amount Collected、8,343c Tips、
4,918c Surcharges、0 refunds 及逐日 Amount Collected 与 6/2-6/28 Closeout 完整闭合，因此 June
修正为 +12,863c Pending / +398c Store Cash debit / +8,343c Tips / +4,918c surcharge；July 继续使用
Statement 的 5,551c surcharge。Slice D 与 parser v11 hotfix 已合入（PR #2558 / #2562），production fresh preview 后已真实 posting；June/July 两个 authority adjustment Journal 均已写入并由 fresh preview 确认为 `ALREADY_POSTED`，historical authority replacement 已 PRODUCTION VERIFIED / CLOSED。
Slice E1 已完成 source + migration dev gate：PR #2556 / squash `ae6420fc`，user-generated migration `20260926132951_add_payment_transaction_tip_cents` 已进入 `dev@656265d0`；SQL 只有 nullable `PaymentTransaction.tipCents INTEGER`，无 default/backfill/NOT NULL/drop/data rewrite，CI #6448 全绿。E2 也已通过 PR #2557 / squash `8bb86e42` 合入 dev，CI #6449 全绿：POS full refund 将 tip 与 additional charges 分离，Platform v3 refund/void 必须返回与 original canonical sale 一致的 provider tip，managed reversal 复用 `tipCents` 持久化 refunded tip，`PaymentReversalFinancialFactV1` 暴露 nullable `tipRefundCents`；webhook 无法证明 tip 时继续 null/fail-closed。production Web Clover Ecommerce 未修改，`providerPaymentFactCutoverAt` 仍未设置。

Post-E2 cutover scope 已选择 **Option A**：保留现有 provider-wide `providerPaymentFactCutoverAt`，不新增 source-scoped persistence。E3 已通过 PR #2566 / squash `e7e80f75` 合入 dev，CI #6481 全绿。POS 可以先 operational go-live，但 Accounting durable cutover 继续保持 unset，直到 production Web Clover 也迁移并验收到 Unified Payments canonical facts 后，再一次性记录 provider-wide cutover。writer contract 要求未来记录 timestamp 必须同时提供 POS Terminal 与 Web Ecommerce 的 canonical-fact acceptance 时间，并且两者都不得晚于 cutover；audit log 会保留这两项证据，当前全 API 仍要求该 writer 的 production caller 为 0。下一 gate 保持为 Cloud Pay Display/device + controlled Terminal Sale/reconciliation/refund/recovery + full POS acceptance；在这些 external evidence 之前不新增 Accounting E4 source slice。

## 新主链路

```text
POS
 -> Unified Payment Preparation
 -> immutable snapshot + tender allocation
 -> HOLD internal entitlements
 -> PaymentTransaction / logical attempt
 -> Clover Terminal Sale (if external due > 0)
 -> wait final payment truth
 -> SUCCEEDED
 -> finalize snapshot
 -> COMMIT reservations + create Order
 -> bind Payment <-> Order
 -> print
 -> board
```

## UNKNOWN UX

不得允许直接再次刷卡；必须显示正在确认支付结果并等待 reconciliation。UNKNOWN / RECONCILING 期间 Points / Balance / Coupon 继续 HELD。

## Web 生产边界

Phase D 默认只建设 Web 未来可复用的通用 contract / model，不主动改变生产
Web Clover 行为。若 Web 生产路径本身成为模块化关键阻塞，则可按本计划
0.1 / charter 1.1 的 guarded-production 例外做最小必要修改，并必须附带部署
后的主动支付实测；这不改变以下 cutover 禁止项：

- 不得仅为了 POS Terminal 模块化而改变 Web checkout API 行为；
- 不得把 Web 流量切到新核心；
- 不得把删除 `CheckoutIntent`、`CloverPayController` 或旧 Web reconciliation
  当作普通内部重构；
- 不得为了统一而同时切换两条生产支付链路。

## Architecture Test 收紧

- POS 不得 import Clover gateway/OAuth/raw schema。
- POS 只能调用 Unified Payment application/public contract。
- 新 Unified Payment core contract 不得依赖 POS UI/types。
- 明确 orchestration/composition 层是同时依赖 Payments + Orders + Benefits payment-reservation public boundary 的允许位置；payment preparation 不得直接注入 concrete `LoyaltyService` / `MembershipService`。
- Points/Balance 与 Coupon 的 HOLD/RELEASE 通过 Benefits-owned 窄 contracts/composition wiring 提供；Payments infrastructure 不得直接操作 Loyalty / Membership reservation internals。
- 现有 COMMIT 继续在 Orders-owned `finalizeConfirmedPayment()` 的同一 Prisma transaction 内与 Order creation 原子执行；在找到不泄漏 `Prisma.TransactionClient` 且不拆散原子性的 transaction-bound Benefits contract 前，不得为了边界整洁而拆成独立 Benefits transaction。
- Confirmed-payment finalization 必须经由 Orders-owned `PAYMENT_ORDER_FINALIZATION` public capability；`Order.id` 由 Orders 在上述 transaction 内生成，Payment checkout/orchestration 不得再持有 `plannedOrderId` / checkout `orderId` 或 `internalOrderId`，public result 仅返回必要的 `orderStableId/orderNumber/pickupCode`。跨边界恢复只使用 `orderStableId`。
- `PaymentTransaction.orderId` 本轮保留 nullable，不由 POS Terminal refund/void 填写。等 Web Unified Payment migration readiness 时再统一决定 Payments 对 Order 的长期 stable reference，以及是否替换/删除这个 legacy scalar；不得在 POS Slice 中顺手扩大迁移范围。
- Phase D orchestration 不得直接 import REST Pay Display / Platform v3 gateway 或 mapper。
- 新流程禁止在 Payment provider/application 给出 canonical `SUCCEEDED` / internal-only finalize 前创建 paid Order。
- Web legacy exception 仍精确保留，Phase D 不得扩大。

legacy CARD 仍存在，所以“全仓库禁止 CARD direct order”此时尚不能启用最终规则；只能锁定**新路径**不得绕过 Unified Payment Core。

## 测试要求

除原有 flag=false regression、flag=true success、decline、cancel、unknown、double click、reload、WebSocket duplicate、Order once only、print once only 外，必须新增：

- Points HOLD -> COMMIT / RELEASE。
- Balance HOLD -> COMMIT / RELEASE。
- Coupon HOLD -> COMMIT / RELEASE。
- Points + Card。
- Balance + Card。
- Coupon + Card。
- Points + Balance + Coupon + Card。
- 100% internal tender（不调用 Clover）。
- UNKNOWN 保持全部 reservation HELD。
- API restart / POS reload 后从 persisted snapshot 恢复。
- snapshot 后价格/Promotion/税率变化不改变已批准 external amount。
- 并发尝试不能重复 HOLD 同一 Coupon 或超额 HOLD Points/Balance。

## 完成标准

新 Unified Payment Core 的 POS 路径完整，reservation/snapshot/recovery 可承受最坏故障场景；production default 仍是 legacy POS，Web 生产链路行为不变。

## VM 部署

允许，flag 必须默认关闭。

---

# Phase E — Refund / Void

## 目标

让新 Clover CARD Order 的退款由 SanQ 发起，并以 Clover 最终结果为资金事实。

## 主要工作

- 查找原 PaymentTransaction。
- 判断 Void / Refund。
- Clover Void / Refund execution。
- Platform REST v3 refund/payment read-back，取得 canonical refund amount / result / additional-charge refund facts。
- Refund transaction。
- refund idempotency。
- refund UNKNOWN / reconciliation。
- Order refund lifecycle / Amendment。
- loyalty / balance 现有副作用正确执行。
- POS refund UI 状态。

## 正确顺序

```text
POS request refund
 -> Payment refund/void
 -> Clover confirmed
 -> Payment updated
 -> Orders refunded
 -> Amendment / Loyalty rollback
```

禁止先把 Order refunded 再调用 Clover。

## Interac

加拿大 Interac refund 如要求 terminal/card/PIN interaction，必须实机验证，UI 不得提前显示成功。

## Architecture Test 收紧

- Orders refund 不能直接调用 Clover gateway。
- Clover refund adapter 不得直接修改 Order。
- Refund orchestration 必须位于允许同时协调 Payments + Orders 的层。

## 兼容要求

在 new CARD 尚未切流前，legacy CARD 人工 refund 保留。

## 测试要求

full refund、void、failure、timeout、reconciliation、duplicate refund、restart、Interac、loyalty once only、Order refunded once only。

## VM 部署

允许。

---

# Phase F — Clover Webhook / Reverse Sync

## 目标

让 Clover 外部 payment update 最终同步回 SanQ。

## 主要工作

1. Clover webhook endpoint。
2. authenticity verification。
3. event idempotency。
4. event -> PaymentTransaction mapping。
5. external refund/update detection。
6. duplicate/out-of-order event handling。
7. POS realtime refresh。
8. reconciliation integration。

Webhook 不作为 POS Sale 的唯一成功确认方式。

## Architecture Test 收紧

- Webhook raw schema 只能停留在 Clover infrastructure/API adapter。
- Webhook 不得直接创建 Order / refund Order。
- 必须先映射为 Payment application/domain event/result。

## 测试要求

valid/invalid webhook、duplicate event、unknown payment、external refund、out-of-order、already completed/refunded。

## VM 部署

允许。

---

# Phase G — Web Ecommerce Migration to Unified Payment Core

## 目标

在 POS 新核心完成实测并经过稳定观察后，把现有 Web CARD / Apple Pay / Google Pay 迁入 Phase D 建立的同一 Unified Payment Core。迁移前旧 Web 链路仍是唯一生产收费路径；迁移过程中不得并行发起第二笔 Clover charge。

## 主要工作

1. 复用同一 payment preparation / snapshot / reservation / tender allocation contract。
2. Web Ecommerce transaction execution 继续使用 Clover 当前正式支持的 Ecommerce API（当前 `/v1/charges`），但不再把 `/v1/charges` response/status 当作长期唯一 payment truth。
3. Web execution 成功或恢复时，经同一 Clover Platform Payments v3 gateway canonicalize payment：payment ID / result / amount / `additionalCharges` / refund/card facts 统一映射进 PaymentTransaction。
4. Web Ecommerce 只保留渠道必要的 provider interaction 差异，核心状态机、幂等、reconciliation、finalization 与 POS 共用。
5. Web Points / Balance / Coupon 统一先 HOLD，再 external payment，成功 COMMIT，明确失败 RELEASE。
6. Web CARD / Apple Pay / Google Pay 的 external/provider IDs、surcharge、UNKNOWN/reconciliation 统一进入 PaymentTransaction。
7. `/v1/charges` 成功但 Platform v3 暂时无法确认时必须进入 UNKNOWN/RECONCILING，不得先创建 paid Order；v3 canonical truth 恢复后再 finalize。
8. 保留 Web 专属 contact verification、3DS、wallet/browser/session context，但不再让其形成另一套 payment lifecycle。
9. 迁移前可做 shadow quote / tender allocation compare，但 shadow path 不得向 Clover 发起收费。
10. 收敛并最终替换 `CloverPayController` 内部 payment-state responsibilities。
11. Web 新链路实测稳定前不删除旧 `CheckoutIntent` 或旧支付实现。

## Architecture Test 收紧

到本阶段结束，应尽可能删除为旧 Web Clover orchestration 保留的临时 exception，并锁住：

- Clover infrastructure 不直接创建 Order。
- Web checkout orchestration 经 Payment application 获取资金结果。
- Provider wire schema 不进入 Orders。

## 兼容要求

Web CARD、Apple Pay、Google Pay、pricing token、session expiry、contact verification 和 checkout API 行为不应无必要改变。

## 测试要求

Web CARD、wallet、3DS/challenge、retry、CheckoutIntent expiry、Payment linkage、Order once only、surcharge reconciliation。

## VM 部署

允许。

---

# Phase H — Full Verification / Cutover

## 目标

完成真实 Clover Terminal 全链路实测，然后才允许新链路成为生产默认。

## 切流前状态

代码全部已部署，feature flag=false，legacy CARD 正常。POS ↔ Clover Terminal 的实时支付状态同步、断线/重连恢复和已有 attempt 恢复能力必须已经完成；在这套实时通信仍不完整时，不得因为后端支付主链路看起来可用就提前切流。

## 必测矩阵

- Credit Sale：Tap / Insert / surcharge。
- Debit / Interac。
- Decline。
- Cancel。
- Timeout -> UNKNOWN -> reconcile。
- Network interruption，不重复扣款。
- Duplicate click，只一笔 logical payment。
- POS reload 恢复 payment。
- API restart 恢复。
- Terminal offline。
- Full refund。
- Void。
- Interac refund（如适用 card/PIN）。
- Refund timeout / reconcile。
- External Clover refund -> reverse sync。
- Duplicate webhook。
- Printing once only。
- Loyalty issue/rollback once only。

## Architecture Test 要求

所有 Phase A-G 已完成边界必须处于无临时扩大豁免的状态；任何仍存在的 exception 必须逐项解释是否属于 legacy fallback，不能存在“为了切流先忽略”的新豁免。

## 切流门禁

POS ↔ Clover Terminal 实时同步/恢复能力完成，全部实测通过、CI 全绿、无未解释 payment mismatch 后，才允许 `feature flag=true`。

## VM 部署

允许；本阶段执行正式切流。

---

# Phase I — Production Stability Window

## 目标

验证真实生产长期行为，而不是刷成功一笔就删旧代码。

## 观察重点

payment success/decline、timeout、unknown recovery、duplicate prevention、restart/reload recovery、terminal availability、refund/void、Interac、webhook、surcharge、reports、receipts、amendments、loyalty、payment/order linkage。

## 旧链路状态

legacy CARD 保留，但仅作为 Phase J 前的 emergency fallback；它不代表长期支持两套 POS CARD 业务模式。

发生严重生产问题优先 `feature flag=false`，不依赖 Git revert 或数据库回滚。稳定窗口通过后，这个 fallback 与 flag/config 一起进入删除队列。

## Architecture Test 要求

不得因为保留 fallback 而扩大 legacy exception。仅保留实际 fallback 所需的最小规则豁免，并清楚标注 Phase J 删除条件。

## 进入 Phase J 条件

确认无重复扣款、长期 UNKNOWN、payment/order orphan、refund mismatch、surcharge mismatch、webhook double handling 等生产 blocker，且 legacy fallback 不再是必要安全措施。

---

# Phase J — Legacy Cleanup

## 目标

删除迁移期旧路径，让 Payment architecture 成为唯一正式 CARD 路径。

## 主要工作

1. 删除 legacy POS CARD direct-paid path。
2. 删除 legacy fallback / route-choice branch，让 POS CARD 无条件进入 Unified Payment Core。
3. 删除旧人工 Clover CARD refund compatibility。
4. 删除迁移期 `POS_CLOVER_TERMINAL_PAYMENT_ENABLED`、`PosCardPaymentFeatureConfig` 与 legacy Accounting refund fallback；不得留下等价的永久 public feature-policy。
5. 删除过渡门禁如 `CLOVER_SYNC_PENDING`（确认不再需要时）。
6. 删除确认无调用的 Clover stub endpoints。
7. 删除重复/废弃 payment code。
8. 收紧 Order / Payment contract。
9. 更新文档。

## Architecture Test 最终收紧

本阶段必须删除全部与 legacy CARD 有关的 architecture exceptions，并新增/启用最终硬门禁：

- 新 CARD Order 必须可追溯到 PaymentTransaction。
- 禁止重新出现 `paymentMethod=CARD -> 直接创建 paid Order` 的生产路径。
- Orders 不直接依赖 Clover。
- POS 不直接依赖 Clover wire/transport。
- Clover infrastructure 不直接创建或退款 Order。
- Payments domain/application/infrastructure 层级规则全部成立。

Cleanup PR 不允许通过新增豁免来绕过最终架构门禁。

## Cleanup PR 要求

必须独立 PR，不和首次切流、production enable 或 migration rollout 混在一起。

## 测试要求

POS CARD、Web CARD、Apple Pay、Google Pay、refund、void、webhook、reconciliation、reports、printing、loyalty、architecture tests 全部回归。

## 完成标准

legacy path 删除，Payment domain 成为唯一支付事实入口，CI 全绿，文档更新。

---

# 各阶段统一交付要求

每阶段结束后必须提供改动报告，至少包含：

1. 本阶段目标。
2. 实际完成内容。
3. 修改/新增文件。
4. schema / DB 变化。
5. API 变化。
6. feature flag 变化。
7. 对 legacy CARD 的影响。
8. 对 Web Clover 的影响。
9. 对 refund 的影响。
10. architecture tests 新增/收紧/剩余 exception。
11. 测试结果。
12. CI 结果。
13. 未验证项目。
14. 已知风险。
15. 是否允许安全部署 VM。
16. 是否满足进入下一阶段条件。

# Git / PR 原则

推荐一个 Phase 一个 PR。禁止把 Phase A + D + J 合在一个 PR，禁止切流和 cleanup 同 PR，禁止 payment schema 大改和无关业务重构同 PR，也禁止为赶进度跳过阶段门禁。

# 部署原则

| 阶段 | VM | 生产支付状态 |
| --- | --- | --- |
| Phase A | 可部署 | 行为不变 |
| Phase B | 可部署 | 行为不变 |
| Phase C | 可部署 | Terminal backend disabled |
| Phase D | 可部署 | flag=false |
| Phase E | 可部署 | legacy refund 保留 |
| Phase F | 可部署 | reverse sync 可上线 |
| Phase G | 可部署 | Web UX 保持 |
| Phase H | 可部署 | 验收后允许切流 |
| Phase I | 可部署 | 新链路生产观察 |
| Phase J | 可部署 | 最终清理 |

# 最终目标

```text
POS CARD
 -> Payment Orchestrator
 -> PaymentTransaction
 -> Clover Terminal
 -> provider-confirmed success
 -> Order
 -> Print / Board

Web CARD / Wallet
 -> CheckoutIntent
 -> PaymentTransaction
 -> Clover Ecommerce
 -> provider-confirmed success
 -> Order

Refund
 -> Payment refund/void
 -> Clover confirmed
 -> Payment updated
 -> Order refunded
 -> Loyalty rollback
```

最终系统必须保证：每一笔 Clover payment 有 internal Payment ID 和 provider transaction identity；每一张新 CARD Order 可追溯到 Payment；每一笔 refund 可追溯到原 Payment；timeout 不等于失败；retry 不等于重复扣款；Order 是订单事实，Payment 是资金事实，Clover 是 provider，POS 是交互入口。