# 已完结工作归档索引

归档日期：2026-10-17；固定基线：`dev@b3179ff472b9133305610cf76359d49252e2e8b9`。

本目录收纳 17 份已完成工作包的**原始全文**，退出日常计划目录。它们保留归档前的全部字节和 Git blob 身份；旧开头的 LOCAL/PENDING、过程命令与后来 CLOSED 是不同时间的记录，不能按今天重写，也不构成新操作授权。归档不删除证据、不重开工作包、不声称重新验证生产。

日常查阅 [已完结工作的长期约束](../architecture/已完结工作长期约束.md)、[项目文档索引](../文档索引.md)、根 Backlog/Accounting Roadmap 和现行 owner 文档。下面关闭范围以原记录为限；递延证据仍留在当前入口，尤其 Phase 7 仅源码/架构关闭，Phase 9 有真实业务/provider 递延。

## 路径与关闭范围

旧路径从原 `docs/architecture/` 或 `docs/orders/` 移到本目录对应子目录，同名保留。历史 `modularization-worklog*.md` 中的旧路径是当时定位，按本表映射；不为改路径而重写工作日志。归档全文内的裸路径同样按历史基线理解，需要现行文件时先查任务入口。

| 工作包 / 原文件名 | 归档全文 | 关闭范围 | 长期约束 / 未完成证据 |
| --- | --- | --- | --- |
| B3 Trial Balance · `accounting-b3-trial-balance-readiness.md` | [原文](./architecture/accounting-b3-trial-balance-readiness.md) | PRODUCTION VERIFIED / CLOSED | Journal-only、WHOLE_LEDGER、零期初的受限口径；B3-D 对账 |
| Expense Funding Attribution · `accounting-expense-funding-attribution.md` | [原文](./architecture/accounting-expense-funding-attribution.md) | PRODUCTION VERIFIED / CLOSED | v1 历史不重释；v2 split 出资、分组 Journal、管理排除不影响 canonical |
| B5 Business Reports · `admin-business-reports-b5.md` | [原文](./architecture/admin-business-reports-b5.md) | PRODUCTION VERIFIED / CLOSED | 运营监控与财务权威分开；Print UNAVAILABLE/历史覆盖限制 |
| Admin Data / Sales · `admin-data-sales-management-analytics.md` | [原文](./architecture/admin-data-sales-management-analytics.md) | PRODUCTION VERIFIED / CLOSED | DATA-A–F 关闭，无 DATA-G；经营历史转后继 owner 队列 |
| Admin Marketing · `admin-marketing-overview.md` | [原文](./architecture/admin-marketing-overview.md) | PRODUCTION VERIFIED / CLOSED | MKT-A–F 关闭；活动/窗口/金额/关联指标和 Daily Special 口径 |
| Loyalty policy · `benefits-loyalty-policy-contraction-plan.md` | [原文](./architecture/benefits-loyalty-policy-contraction-plan.md) | Phase D PRODUCTION VERIFIED / CLOSED | 策略唯一 Benefits owner；旧列/传播收缩，历史迁移保留 |
| Phase 1 · `phase-1-closeout.md` | [原文](./architecture/phase-1-closeout.md) | CLOSED；Phase 2 后继亦已关闭 | 历史基线；支付/供应商现行门禁按当前文件 |
| Phase 3 · `phase-3-catalog-pricing-offers.md` | [原文](./architecture/phase-3-catalog-pricing-offers.md) | 阶段收口及后续尾项关闭 | Pricing/Offers/Benefits owner；Test Store 尾项已由 Phase 8 承接 |
| Phase 4 · `phase-4-identity-customer-benefits-messaging.md` | [原文](./architecture/phase-4-identity-customer-benefits-messaging.md) | PRODUCTION VERIFIED / CLOSED | Identity/Customer/Benefits/Messaging 边界与显式复合读模型限制 |
| Phase 5 · `phase-5-commerce-orders-fulfillment.md` | [原文](./architecture/phase-5-commerce-orders-fulfillment.md) | PRODUCTION VERIFIED / CLOSED | 持久取消、生命周期/打印幂等、历史身份修复；保留事务接缝 |
| Phase 7 · `phase-7-store-operations-pos-print.md` | [原文](./architecture/phase-7-store-operations-pos-print.md) | SOURCE / ARCHITECTURE CLOSED | 不扩大为全部设备/供应商生产验收；合法组合接缝保留 |
| Phase 9 · `phase-9-accounting-reporting-analytics.md` | [原文](./architecture/phase-9-accounting-reporting-analytics.md) | PRODUCTION VERIFIED / CLOSED；带明确递延 | 财务权威、fixture 清理与范围对账；Payroll/period-close/provider 历史/2258c 例外未伪称完成 |
| A4 Windows workstation · `postmod-a4-windows-pos-workstation.md` | [原文](./architecture/postmod-a4-windows-pos-workstation.md) | SOURCE/CUTOVER COMPLETE；STORE INSTALLATION VERIFIED | 未来真实故障/冷启动等观察留在现行工作站手册 |
| A5 Browser E2E · `postmod-a5-browser-e2e.md` | [原文](./architecture/postmod-a5-browser-e2e.md) | CLOSED | 可丢弃 DB/fixture、真实浏览器+BFF+API；物理/供应商不覆盖；无 service worker |
| API TypeScript strictness · `postmod-api-typescript-strictness.md` | [原文](./architecture/postmod-api-typescript-strictness.md) | Slice 1–10 CLOSED | 当前 tsconfig/CI 为准；升级新增诊断单列升级工作 |
| Catalog Store Menu · `postmod-catalog-store-menu.md` | [原文](./architecture/postmod-catalog-store-menu.md) | PRODUCTION VERIFIED / CLOSED | Store 根 NOT NULL，stableId 不变；旧 combined-menu 已收缩 |
| Order components backfill · `order-item-components-backfill.md` | [原文](./orders/order-item-components-backfill.md) | completed / contracted，2026-08-30 | 不删除 optionsJson/componentsJson/历史订单和软删除目录事实 |

## 固定原文与 Git 身份

原文链接固定到归档前提交，可独立核对；不依赖浮动 `dev`。归档副本必须与对应 blob 一致。

| 原路径 | 固定原文 | Git blob SHA |
| --- | --- | --- |
| `docs/architecture/accounting-b3-trial-balance-readiness.md` | [查看](https://github.com/sanqin888/sanqinMVP/blob/b3179ff472b9133305610cf76359d49252e2e8b9/docs/architecture/accounting-b3-trial-balance-readiness.md) | `e1cd70d51949cc41ca8d1e0683972c884d2dcb92` |
| `docs/architecture/accounting-expense-funding-attribution.md` | [查看](https://github.com/sanqin888/sanqinMVP/blob/b3179ff472b9133305610cf76359d49252e2e8b9/docs/architecture/accounting-expense-funding-attribution.md) | `933ebaaa3b3e0b878e5218ebfe3e6f648628c5a5` |
| `docs/architecture/admin-business-reports-b5.md` | [查看](https://github.com/sanqin888/sanqinMVP/blob/b3179ff472b9133305610cf76359d49252e2e8b9/docs/architecture/admin-business-reports-b5.md) | `db18c9522cc2c8fb241037cc7b27dd0754b71a9c` |
| `docs/architecture/admin-data-sales-management-analytics.md` | [查看](https://github.com/sanqin888/sanqinMVP/blob/b3179ff472b9133305610cf76359d49252e2e8b9/docs/architecture/admin-data-sales-management-analytics.md) | `f9c74c2750c3b696c4d94300f6259e44cee675d5` |
| `docs/architecture/admin-marketing-overview.md` | [查看](https://github.com/sanqin888/sanqinMVP/blob/b3179ff472b9133305610cf76359d49252e2e8b9/docs/architecture/admin-marketing-overview.md) | `3bd004dea9c2682f8988e0c3c54026e082c6bb95` |
| `docs/architecture/benefits-loyalty-policy-contraction-plan.md` | [查看](https://github.com/sanqin888/sanqinMVP/blob/b3179ff472b9133305610cf76359d49252e2e8b9/docs/architecture/benefits-loyalty-policy-contraction-plan.md) | `bfe67457cbbea9c2b3c986cd457ab07f0f9aed11` |
| `docs/architecture/phase-1-closeout.md` | [查看](https://github.com/sanqin888/sanqinMVP/blob/b3179ff472b9133305610cf76359d49252e2e8b9/docs/architecture/phase-1-closeout.md) | `7100bbbd566eadcb435e0ce84f0dc301e63fa5e8` |
| `docs/architecture/phase-3-catalog-pricing-offers.md` | [查看](https://github.com/sanqin888/sanqinMVP/blob/b3179ff472b9133305610cf76359d49252e2e8b9/docs/architecture/phase-3-catalog-pricing-offers.md) | `c2c7b0a2786819c0ad12bcdd37be729e17df8988` |
| `docs/architecture/phase-4-identity-customer-benefits-messaging.md` | [查看](https://github.com/sanqin888/sanqinMVP/blob/b3179ff472b9133305610cf76359d49252e2e8b9/docs/architecture/phase-4-identity-customer-benefits-messaging.md) | `9da53a62c5c53c975364aaedb9433e3d29e25850` |
| `docs/architecture/phase-5-commerce-orders-fulfillment.md` | [查看](https://github.com/sanqin888/sanqinMVP/blob/b3179ff472b9133305610cf76359d49252e2e8b9/docs/architecture/phase-5-commerce-orders-fulfillment.md) | `4f953069766622922f2b3fec05976c6575ec44eb` |
| `docs/architecture/phase-7-store-operations-pos-print.md` | [查看](https://github.com/sanqin888/sanqinMVP/blob/b3179ff472b9133305610cf76359d49252e2e8b9/docs/architecture/phase-7-store-operations-pos-print.md) | `2d7b2f96f9efd26ebcc9a3160309a542b60e276a` |
| `docs/architecture/phase-9-accounting-reporting-analytics.md` | [查看](https://github.com/sanqin888/sanqinMVP/blob/b3179ff472b9133305610cf76359d49252e2e8b9/docs/architecture/phase-9-accounting-reporting-analytics.md) | `e5ab994fe3690bc7adbcc7fca3b1f9016bb27abf` |
| `docs/architecture/postmod-a4-windows-pos-workstation.md` | [查看](https://github.com/sanqin888/sanqinMVP/blob/b3179ff472b9133305610cf76359d49252e2e8b9/docs/architecture/postmod-a4-windows-pos-workstation.md) | `2bfd5111e5a7ebe244cae155c05e134c34aa67d6` |
| `docs/architecture/postmod-a5-browser-e2e.md` | [查看](https://github.com/sanqin888/sanqinMVP/blob/b3179ff472b9133305610cf76359d49252e2e8b9/docs/architecture/postmod-a5-browser-e2e.md) | `a2eb0a514dfa5309c4c48e48378cffa0336dc80d` |
| `docs/architecture/postmod-api-typescript-strictness.md` | [查看](https://github.com/sanqin888/sanqinMVP/blob/b3179ff472b9133305610cf76359d49252e2e8b9/docs/architecture/postmod-api-typescript-strictness.md) | `5acd16b2819df3647bb2b74715bc9ece455a8d2e` |
| `docs/architecture/postmod-catalog-store-menu.md` | [查看](https://github.com/sanqin888/sanqinMVP/blob/b3179ff472b9133305610cf76359d49252e2e8b9/docs/architecture/postmod-catalog-store-menu.md) | `0f3042c5117ba794f39160ac7cd9e6637d8b8107` |
| `docs/orders/order-item-components-backfill.md` | [查看](https://github.com/sanqin888/sanqinMVP/blob/b3179ff472b9133305610cf76359d49252e2e8b9/docs/orders/order-item-components-backfill.md) | `d0142a77109441c41295947a24bfd6424a4478ed` |

本批不归档 Phase 6/8、Payroll、Provider Correction、现役 Runtime 合同、历史工作日志和 JSON 实验收据。现行队列/兼容登记只更新证据路径，不改变状态、owner、退出条件或架构基线；无代码、schema/migration、依赖、CI 或生产操作。
