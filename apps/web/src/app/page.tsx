"use client";

import { useMemo, useState } from "react";

type MenuItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  tags?: string[];
  calories?: number;
};

type MenuCategory = {
  name: string;
  description: string;
  items: MenuItem[];
};

type CartItem = {
  item: MenuItem;
  quantity: number;
  notes: string;
};

const MENU: MenuCategory[] = [
  {
    name: "招牌面食",
    description: "每日手擀面搭配慢炖汤底，保证筋道口感与层次丰富的汤味。",
    items: [
      {
        id: "braised-beef-noodles",
        name: "老坛红烧牛肉面",
        description: "慢炖牛腱配陈年酸菜与番茄汤底，微辣开胃。",
        price: 38,
        tags: ["招牌", "微辣"],
        calories: 520,
      },
      {
        id: "pepper-chicken-noodles",
        name: "藤椒鸡汤面",
        description: "藤椒鸡汤鲜香带麻，搭配时蔬与手工面。",
        price: 34,
        tags: ["清爽"],
        calories: 468,
      },
      {
        id: "vegetable-mushroom-noodles",
        name: "香菇素笋面",
        description: "有机香菇与笋尖炖煮，汤底醇厚适合素食者。",
        price: 32,
        tags: ["素食"],
        calories: 410,
      },
    ],
  },
  {
    name: "小食精选",
    description: "佐餐小食，丰富味觉层次，适合分享。",
    items: [
      {
        id: "crispy-shallot-pancake",
        name: "金黄葱油饼",
        description: "表层酥脆内里柔软，淋上秘制葱油。",
        price: 16,
        tags: ["人气"],
        calories: 260,
      },
      {
        id: "chili-dumpling",
        name: "红油抄手",
        description: "手包鲜肉抄手浸入自制红油酱汁，辣香兼备。",
        price: 22,
        tags: ["重口"],
        calories: 320,
      },
      {
        id: "tea-eggs",
        name: "桂花茶叶蛋",
        description: "桂花入味，茶香四溢的慢煮溏心蛋。",
        price: 12,
        calories: 150,
      },
    ],
  },
  {
    name: "饮品甜品",
    description: "精选饮品与甜点，平衡味蕾。",
    items: [
      {
        id: "soy-milk",
        name: "现磨豆乳",
        description: "每日新鲜研磨黄豆，微甜顺滑。",
        price: 10,
        tags: ["热销"],
        calories: 180,
      },
      {
        id: "cold-brew-tea",
        name: "冷泡乌龙茶",
        description: "低温萃取保留茶香与回甘，冰爽解腻。",
        price: 14,
        calories: 80,
      },
      {
        id: "black-sesame-pudding",
        name: "黑芝麻奶冻",
        description: "芝麻研磨搭配生椰奶，口感绵密。",
        price: 18,
        tags: ["限量"],
        calories: 260,
      },
    ],
  },
];

const currencyFormatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 0,
});

const ORDER_STEPS = [
  { id: 1, label: "挑选菜品" },
  { id: 2, label: "确认方式" },
  { id: 3, label: "填写信息" },
  { id: 4, label: "提交订单" },
];

export default function Home() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [schedule, setSchedule] = useState("尽快送达");
  const [customer, setCustomer] = useState({
    name: "",
    phone: "",
    address: "",
    notes: "",
  });
  const [confirmation, setConfirmation] = useState<
    | null
    | {
        orderNumber: string;
        total: number;
        fulfillment: "pickup" | "delivery";
      }
  >(null);

  const subtotal = useMemo(
    () =>
      cartItems.reduce(
        (total, cartItem) => total + cartItem.item.price * cartItem.quantity,
        0,
      ),
    [cartItems],
  );

  const serviceFee = subtotal > 0 ? 3.5 : 0;
  const deliveryFee = fulfillment === "delivery" && subtotal > 0 ? 6 : 0;
  const total = subtotal + serviceFee + deliveryFee;

  const canPlaceOrder =
    cartItems.length > 0 &&
    customer.name.trim().length > 0 &&
    customer.phone.trim().length >= 6 &&
    (fulfillment === "pickup" || customer.address.trim().length > 5);

  const handleAddToCart = (item: MenuItem) => {
    setConfirmation(null);
    setCartItems((prev) => {
      const existing = prev.find((cartItem) => cartItem.item.id === item.id);
      if (existing) {
        return prev.map((cartItem) =>
          cartItem.item.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem,
        );
      }
      return [...prev, { item, quantity: 1, notes: "" }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setConfirmation(null);
    setCartItems((prev) =>
      prev
        .map((cartItem) =>
          cartItem.item.id === id
            ? { ...cartItem, quantity: cartItem.quantity + delta }
            : cartItem,
        )
        .filter((cartItem) => cartItem.quantity > 0),
    );
  };

  const updateNotes = (id: string, notes: string) => {
    setCartItems((prev) =>
      prev.map((cartItem) =>
        cartItem.item.id === id ? { ...cartItem, notes } : cartItem,
      ),
    );
  };

  const handleCustomerChange = (
    field: "name" | "phone" | "address" | "notes",
    value: string,
  ) => {
    setCustomer((prev) => ({ ...prev, [field]: value }));
  };

  const handlePlaceOrder = () => {
    if (!canPlaceOrder) return;

    const orderNumber = `SQ${Date.now().toString().slice(-6)}`;
    setConfirmation({
      orderNumber,
      total,
      fulfillment,
    });
    setCartItems([]);
    setCustomer({ name: "", phone: "", address: "", notes: "" });
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-16 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-10">
        <header className="rounded-3xl bg-white/90 p-8 shadow-sm backdrop-blur">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-slate-500">
            三秦面馆 · 晚市菜单
          </p>
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                智能点餐，安心堂食与外送
              </h1>
              <p className="mt-3 max-w-2xl text-base text-slate-600">
                结合顾客习惯设计的点餐流。先挑选喜爱的菜品，再确认取餐方式并填写联系信息，最后一键提交订单。
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm font-medium text-slate-600">
              {ORDER_STEPS.map((step) => (
                <div
                  key={step.id}
                  className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-4 py-2"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-900 text-white">
                    {step.id}
                  </span>
                  <span>{step.label}</span>
                </div>
              ))}
            </div>
          </div>
        </header>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          <section className="space-y-10">
            {MENU.map((category) => (
              <div key={category.name} className="space-y-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-900">
                      {category.name}
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm text-slate-600">
                      {category.description}
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {category.items.map((item) => (
                    <article
                      key={item.id}
                      className="group flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900">
                              {item.name}
                            </h3>
                            <p className="mt-1 text-sm text-slate-600">
                              {item.description}
                            </p>
                          </div>
                          <span className="rounded-full bg-slate-900/90 px-3 py-1 text-sm font-semibold text-white">
                            {currencyFormatter.format(item.price)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          {item.tags?.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600"
                            >
                              #{tag}
                            </span>
                          ))}
                          {item.calories ? (
                            <span className="rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-600">
                              {item.calories} kcal
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-5 flex items-center justify-between gap-4">
                        <p className="text-xs text-slate-500">
                          精选食材每日限量供应，建议尽快下单。
                        </p>
                        <button
                          type="button"
                          onClick={() => handleAddToCart(item)}
                          className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                        >
                          加入购物车
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <aside className="lg:sticky lg:top-10">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
              <h2 className="text-lg font-semibold text-slate-900">购物车与下单</h2>
              {cartItems.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  购物车为空。挑选喜欢的菜品后，系统会为你计算配送与服务费用。
                </p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {cartItems.map((cartItem) => (
                    <li key={cartItem.item.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {cartItem.item.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {currencyFormatter.format(cartItem.item.price)} × {cartItem.quantity}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateQuantity(cartItem.item.id, -1)}
                            className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-lg font-semibold text-slate-600 transition hover:bg-slate-100"
                            aria-label="减少份数"
                          >
                            −
                          </button>
                          <span className="min-w-[1.5rem] text-center text-sm font-medium">
                            {cartItem.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(cartItem.item.id, 1)}
                            className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-lg font-semibold text-slate-600 transition hover:bg-slate-100"
                            aria-label="增加份数"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <label className="mt-3 block text-xs font-medium text-slate-500">
                        口味备注
                        <textarea
                          value={cartItem.notes}
                          onChange={(event) => updateNotes(cartItem.item.id, event.target.value)}
                          placeholder="例如：少辣 / 加香菜"
                          className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                          rows={2}
                        />
                      </label>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-6 space-y-4">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    取餐方式
                  </h3>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm font-medium">
                    <button
                      type="button"
                      onClick={() => setFulfillment("pickup")}
                      className={`rounded-2xl border px-3 py-2 ${
                        fulfillment === "pickup"
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-slate-50 text-slate-600"
                      }`}
                    >
                      到店自取
                    </button>
                    <button
                      type="button"
                      onClick={() => setFulfillment("delivery")}
                      className={`rounded-2xl border px-3 py-2 ${
                        fulfillment === "delivery"
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-slate-50 text-slate-600"
                      }`}
                    >
                      骑手外送
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="flex items-center justify-between text-xs">
                    <span>菜品小计</span>
                    <span>{currencyFormatter.format(subtotal)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span>打包服务费</span>
                    <span>{currencyFormatter.format(serviceFee)}</span>
                  </div>
                  {fulfillment === "delivery" ? (
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span>骑手配送费</span>
                      <span>{currencyFormatter.format(deliveryFee)}</span>
                    </div>
                  ) : null}
                  <div className="mt-3 border-t border-slate-200 pt-3 text-sm font-semibold text-slate-900">
                    <div className="flex items-center justify-between">
                      <span>预计支付</span>
                      <span>{currencyFormatter.format(total)}</span>
                    </div>
                  </div>
                </div>

                {fulfillment === "delivery" ? (
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                      送达时间
                      <select
                        value={schedule}
                        onChange={(event) => setSchedule(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                      >
                        <option value="尽快送达">尽快送达（约 30 分钟）</option>
                        <option value="18:00-18:30">18:00-18:30</option>
                        <option value="18:30-19:00">18:30-19:00</option>
                        <option value="19:00-19:30">19:00-19:30</option>
                      </select>
                    </label>
                  </div>
                ) : (
                  <p className="rounded-2xl bg-slate-100 p-3 text-xs text-slate-600">
                    到店自取预计 15 分钟后即可取餐，我们会短信通知取餐号。
                  </p>
                )}

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    联系信息
                  </h3>
                  <label className="block text-xs font-medium text-slate-600">
                    联系人姓名
                    <input
                      value={customer.name}
                      onChange={(event) => handleCustomerChange("name", event.target.value)}
                      placeholder="请输入姓名"
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    手机号
                    <input
                      value={customer.phone}
                      onChange={(event) => handleCustomerChange("phone", event.target.value)}
                      placeholder="用于接收取餐通知"
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                    />
                  </label>
                  {fulfillment === "delivery" ? (
                    <label className="block text-xs font-medium text-slate-600">
                      配送地址
                      <textarea
                        value={customer.address}
                        onChange={(event) => handleCustomerChange("address", event.target.value)}
                        placeholder="请填写楼宇 / 门牌号 / 楼层"
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                        rows={2}
                      />
                    </label>
                  ) : null}
                  <label className="block text-xs font-medium text-slate-600">
                    订单备注
                    <textarea
                      value={customer.notes}
                      onChange={(event) => handleCustomerChange("notes", event.target.value)}
                      placeholder="例如：抵达请电话联系、过敏原提醒等"
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                      rows={2}
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handlePlaceOrder}
                  disabled={!canPlaceOrder}
                  className="w-full rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition enabled:hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-200"
                >
                  提交订单并支付 {currencyFormatter.format(total)}
                </button>
              </div>

              {confirmation ? (
                <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                  <p className="font-semibold">订单已提交成功！</p>
                  <p className="mt-1">
                    订单号 <span className="font-mono">{confirmation.orderNumber}</span> 已创建，{fulfillment === "delivery" ? "骑手即将上门" : "可于前台报号取餐"}。
                  </p>
                  <p className="mt-1 text-xs text-emerald-600">
                    预计支付金额：{currencyFormatter.format(confirmation.total)} · {fulfillment === "delivery" ? `送达时间：${schedule}` : "到店凭短信取餐"}
                  </p>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
