# Uber Eats requirement matrix（wire contract v1）

> **升级门禁：** `fixtures/uber-contract/v1/manifest.json` 的版本、本文档和
> `uber-contract-fixtures.spec.ts` 必须在 Uber API 版本升级的同一个变更中同步更新。
> fixture 只能包含合成数据，禁止生产 token、商户身份或顾客资料。

| Capability                    | Uber method / path                                                | Required scope                        | Webhook event         | Production code                                                                                             | Contract test / fixture                                                                       |
| ----------------------------- | ----------------------------------------------------------------- | ------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| OAuth app token               | `POST /oauth/v2/token`                                            | requested capability scopes           | —                     | `infrastructure/uber-api/uber-token.provider.ts`                                                            | `uber-token.provider.spec.ts`; `v1/oauth/*`                                                   |
| Merchant OAuth / provisioning | `GET /v1/eats/stores`; `POST /v1/eats/stores/{store_id}/pos_data` | `eats.pos_provisioning`, `eats.store` | —                     | `infrastructure/uber-api/uber-merchant-api.adapter.ts`                                                      | `uber-gateways.wire.contract.spec.ts`; `v1/stores/*`                                          |
| Store status                  | `POST /v1/eats/stores/{store_id}/status`                          | `eats.store.status.write`             | —                     | `infrastructure/uber-api/uber-merchant-api.adapter.ts`                                                      | `uber-gateways.wire.contract.spec.ts`                                                         |
| Order notification/detail     | `GET resource_href` (`/v2/eats/order/{order_id}`)                 | `eats.store.orders.read`              | `orders.notification` | `infrastructure/uber-api/uber-order-detail.gateway.ts`; `contracts/events/uber-order-notification.v1.ts`    | `uber-gateways.wire.contract.spec.ts`; `v1/orders/notification.json`; `v1/orders/detail.json` |
| Accept order                  | `POST /v1/eats/orders/{order_id}/accept_pos_order`                | `eats.order`                          | —                     | `infrastructure/uber-api/uber-resource.gateways.ts`                                                         | `uber-gateways.wire.contract.spec.ts`; `v1/orders/accept-request.json`                        |
| Deny order                    | `POST /v1/eats/orders/{order_id}/deny_pos_order`                  | `eats.order`                          | —                     | `infrastructure/uber-api/uber-resource.gateways.ts`                                                         | `uber-gateways.wire.contract.spec.ts`; `v1/orders/deny-request.json`                          |
| Ready for pickup              | `POST /v1/delivery/order/{order_id}/ready`                        | `eats.order`                          | —                     | `infrastructure/uber-api/uber-resource.gateways.ts`                                                         | `uber-gateways.wire.contract.spec.ts`; `v1/orders/ready-request.json`                         |
| Menu upload                   | `PUT /v2/eats/stores/{store_id}/menus`                            | `eats.store`                          | —                     | `infrastructure/uber-api/uber-menu-publication.adapter.ts`                                                  | `uber-gateways.wire.contract.spec.ts`; `v1/menu/upload-request.json`                          |
| Menu confirmation             | `GET /v2/eats/stores/{store_id}/menus`                            | `eats.store`                          | `menus.notification`  | `infrastructure/uber-api/uber-menu-publication.adapter.ts`; `contracts/events/uber-menu-notification.v1.ts` | `uber-gateways.wire.contract.spec.ts`; `v1/menu/confirmation.json`                            |
| Error response                | all gateways                                                      | capability-specific                   | —                     | `infrastructure/uber-api/uber-http.client.ts`                                                               | `uber-gateways.wire.contract.spec.ts`; `v1/errors/*`                                          |

## Webhook inventory

| Event                 | Parser / handler                                                                                      | Contract evidence                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `orders.notification` | `contracts/events/uber-order-notification.v1.ts`; `application/orders/uber-webhook.service.ts`        | `v1/orders/notification.json`; gateway wire test    |
| `menus.notification`  | `contracts/events/uber-menu-notification.v1.ts`; `application/menu/uber-menu-notification.handler.ts` | `v1/menu/confirmation.json`; events contract test   |
| Unknown event         | `contracts/events/uber-webhook-envelope.v1.ts`; replay workflow                                       | `replay-unsupported-uber-webhooks.use-case.spec.ts` |

## 凭据与 smoke test

Sandbox smoke test 默认跳过。CI 仅在专用 `UBER_SANDBOX_*` secrets 全部存在时设置
`UBER_SANDBOX_SMOKE=1`。测试不打印 request body、Authorization header、token response
或 Jest matcher 中的凭据；生产环境变量不被读取，也不得复制到 fixture 或报告。
