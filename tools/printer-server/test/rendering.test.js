const test = require("node:test");
const assert = require("node:assert/strict");
const iconv = require("iconv-lite");

const {
  buildCustomerReceiptEscPos,
  buildKitchenReceiptEscPos,
  buildLabelPrintPayload,
} = require("../printer-server");

function includesGbk(buffer, text) {
  return buffer.includes(iconv.encode(text, "gbk"));
}

function representativeOrderPayload() {
  return {
    orderNumber: "A100",
    pickupCode: "Q7",
    fulfillment: "pickup",
    paymentMethod: "card",
    customerName: "Test Customer",
    locale: "zh",
    snapshot: {
      items: [
        {
          nameZh: "腊汁肉夹馍",
          nameEn: "Pork Roujiamo",
          quantity: 2,
          lineTotalCents: 1998,
          specialInstructions: "不要香菜",
          options: [
            {
              choices: [
                {
                  nameZh: "加辣",
                  nameEn: "Spicy",
                  priceDeltaCents: 100,
                },
              ],
            },
          ],
          components: [
            {
              nameZh: "冰峰",
              nameEn: "Bingfeng",
              quantity: 1,
              priceDeltaCents: 0,
              options: [],
            },
          ],
        },
      ],
      displaySubtotalCents: 1998,
      appliedDiscounts: [
        {
          source: "COUPON",
          titleZh: "测试券",
          titleEn: "Test coupon",
          discountCents: 100,
        },
      ],
      loyaltyRedeemCents: 50,
      taxCents: 260,
      orderTotalCents: 2108,
      balancePaidCents: 300,
      externalPaidCents: 1862,
      creditCardSurchargeCents: 54,
      totalCents: 2162,
      loyalty: {
        pointsEarned: 2,
        pointsBalanceAfter: 10,
      },
    },
  };
}

test("customer receipt rendering is deterministic for fixed inputs", async () => {
  const payload = representativeOrderPayload();
  const now = new Date(2026, 8, 25, 10, 11, 12);

  const first = await buildCustomerReceiptEscPos(payload, {
    now,
    includeLogo: false,
  });
  const second = await buildCustomerReceiptEscPos(payload, {
    now,
    includeLogo: false,
  });

  assert.deepEqual(first, second);
  assert.equal(first.subarray(0, 2).toString("hex"), "1b40");
  assert.equal(first.subarray(-4).toString("hex"), "1d564200");

  assert.ok(includesGbk(first, "Order: A100"));
  assert.ok(includesGbk(first, "腊汁肉夹馍"));
  assert.ok(includesGbk(first, "Pork Roujiamo"));
  assert.ok(includesGbk(first, "测试券 / Test coupon"));
  assert.ok(includesGbk(first, "信用卡附加费 Card Surcharge: $0.54"));
  assert.ok(includesGbk(first, "打印时间 Print: 20260925 10：11：12"));
});

test("kitchen ticket rendering is deterministic for fixed inputs", () => {
  const payload = representativeOrderPayload();
  const now = new Date(2026, 8, 25, 10, 11, 12);

  const first = buildKitchenReceiptEscPos(payload, { now });
  const second = buildKitchenReceiptEscPos(payload, { now });

  assert.deepEqual(first, second);
  assert.equal(first.subarray(0, 2).toString("hex"), "1b40");
  assert.equal(first.subarray(-4).toString("hex"), "1d564200");

  assert.ok(includesGbk(first, "外带"));
  assert.ok(includesGbk(first, "2  腊汁肉夹馍"));
  assert.ok(includesGbk(first, "  - 加辣"));
  assert.ok(includesGbk(first, "  > 1  冰峰"));
  assert.ok(includesGbk(first, "  备注: 不要香菜"));
  assert.ok(includesGbk(first, "打印时间: 20260925 10：11：12"));
});

test("label payload preserves production dimensions and bilingual label content", () => {
  const labelPlan = {
    labelWidthMm: 70,
    labelHeightMm: 30,
    labels: [
      {
        pairCode: "A",
        nameEn: "Pork Roujiamo",
        nameZh: "腊汁肉夹馍",
        componentNameEn: "Soup",
        componentNameZh: "汤",
        specialInstructions: "No cilantro",
        copies: 2,
        options: [
          {
            nameEn: "Spicy",
            nameZh: "加辣",
          },
        ],
      },
    ],
  };

  assert.deepEqual(buildLabelPrintPayload("A100", "Q7", labelPlan), {
    orderNumber: "A100",
    pickupCode: "Q7",
    labelWidthMm: 70,
    labelHeightMm: 30,
    labels: labelPlan.labels,
  });
});

test("label payload defaults to deployed 70x30mm format", () => {
  assert.deepEqual(buildLabelPrintPayload(null, null, { labels: [] }), {
    orderNumber: "",
    pickupCode: "",
    labelWidthMm: 70,
    labelHeightMm: 30,
    labels: [],
  });
});
