"use client";

import { useMemo, useState } from "react";

export type DaySchedule = {
  day: string;
  open: string;
  close: string;
  closed: boolean;
};

export type Holiday = {
  id: string;
  date: string;
  reason: string;
};

export type MenuOption = {
  id: string;
  name: string;
  choices: string[];
  active: boolean;
};

export type MenuItem = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  options: MenuOption[];
};

export type MenuCategory = {
  id: string;
  name: string;
  active: boolean;
  items: MenuItem[];
};

const DEFAULT_HOURS: DaySchedule[] = [
  { day: "Monday", open: "11:00", close: "21:00", closed: false },
  { day: "Tuesday", open: "11:00", close: "21:00", closed: false },
  { day: "Wednesday", open: "11:00", close: "21:00", closed: false },
  { day: "Thursday", open: "11:00", close: "21:00", closed: false },
  { day: "Friday", open: "11:00", close: "22:00", closed: false },
  { day: "Saturday", open: "11:30", close: "22:00", closed: false },
  { day: "Sunday", open: "11:30", close: "20:00", closed: false },
];

const DEFAULT_HOLIDAYS: Holiday[] = [
  { id: "h1", date: "2024-12-25", reason: "Christmas" },
  { id: "h2", date: "2025-01-01", reason: "New Year" },
];

const DEFAULT_MENU: MenuCategory[] = [
  {
    id: "c1",
    name: "Signature Dishes",
    active: true,
    items: [
      {
        id: "i1",
        name: "Biang Biang Noodles",
        price: 13.5,
        active: true,
        options: [
          {
            id: "o1",
            name: "Spiciness",
            choices: ["Mild", "Medium", "Hot"],
            active: true,
          },
          {
            id: "o2",
            name: "Add-ons",
            choices: ["Extra noodle", "Extra beef", "Cilantro"],
            active: true,
          },
        ],
      },
      {
        id: "i2",
        name: "Cumin Lamb Burger",
        price: 9.9,
        active: false,
        options: [
          {
            id: "o3",
            name: "Combo upgrade",
            choices: ["Fries", "Pickled veggie", "Milk tea"],
            active: false,
          },
        ],
      },
    ],
  },
  {
    id: "c2",
    name: "Beverages",
    active: true,
    items: [
      {
        id: "i3",
        name: "Chinese Tea",
        price: 4.5,
        active: true,
        options: [],
      },
      {
        id: "i4",
        name: "Soy Milk",
        price: 3.25,
        active: true,
        options: [],
      },
    ],
  },
];

function SectionCard({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border bg-white/80 p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export default function AdminDashboard() {
  const [hours, setHours] = useState<DaySchedule[]>(DEFAULT_HOURS);
  const [holidays, setHolidays] = useState<Holiday[]>(DEFAULT_HOLIDAYS);
  const [menu, setMenu] = useState<MenuCategory[]>(DEFAULT_MENU);
  const [newHoliday, setNewHoliday] = useState<Holiday>({ id: "", date: "", reason: "" });

  const totalActiveItems = useMemo(
    () =>
      menu.reduce(
        (count, category) =>
          count +
          category.items.reduce((acc, item) => acc + (item.active ? 1 : 0), 0),
        0,
      ),
    [menu],
  );

  const totalInactiveItems = useMemo(
    () =>
      menu.reduce(
        (count, category) =>
          count +
          category.items.reduce((acc, item) => acc + (!item.active ? 1 : 0), 0),
        0,
      ),
    [menu],
  );

  function updateHour(day: string, patch: Partial<DaySchedule>) {
    setHours((prev) => prev.map((h) => (h.day === day ? { ...h, ...patch } : h)));
  }

  function toggleHoliday(id: string) {
    setHolidays((prev) => prev.filter((h) => h.id !== id));
  }

  function addHoliday() {
    if (!newHoliday.date || !newHoliday.reason) return;
    const id = `h${Date.now()}`;
    setHolidays((prev) => [...prev, { ...newHoliday, id }]);
    setNewHoliday({ id: "", date: "", reason: "" });
  }

  function toggleCategory(categoryId: string) {
    setMenu((prev) =>
      prev.map((category) =>
        category.id === categoryId ? { ...category, active: !category.active } : category,
      ),
    );
  }

  function toggleMenuItem(categoryId: string, itemId: string) {
    setMenu((prev) =>
      prev.map((category) => {
        if (category.id !== categoryId) return category;
        return {
          ...category,
          items: category.items.map((item) =>
            item.id === itemId ? { ...item, active: !item.active } : item,
          ),
        };
      }),
    );
  }

  function toggleOption(categoryId: string, itemId: string, optionId: string) {
    setMenu((prev) =>
      prev.map((category) => {
        if (category.id !== categoryId) return category;
        return {
          ...category,
          items: category.items.map((item) => {
            if (item.id !== itemId) return item;
            return {
              ...item,
              options: item.options.map((opt) =>
                opt.id === optionId ? { ...opt, active: !opt.active } : opt,
              ),
            };
          }),
        };
      }),
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Admin</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">运营管理控制台</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          管理营业时间、节假日休假、菜单、餐品选项、上下架状态和其他日常运营事项。界面中的操作会实时更新当前视图，后续可以接入 API 与后端同步。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white/80 p-5 shadow-sm">
          <p className="text-sm text-slate-500">活跃餐品</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-600">{totalActiveItems}</p>
        </div>
        <div className="rounded-2xl border bg-white/80 p-5 shadow-sm">
          <p className="text-sm text-slate-500">下架餐品</p>
          <p className="mt-2 text-3xl font-semibold text-amber-600">{totalInactiveItems}</p>
        </div>
        <div className="rounded-2xl border bg-white/80 p-5 shadow-sm">
          <p className="text-sm text-slate-500">计划休假</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{holidays.length}</p>
        </div>
      </div>

      <SectionCard title="营业时间设置">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {hours.map((h) => (
            <div key={h.day} className="rounded-xl border p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{h.day}</p>
                  <p className="text-xs text-slate-500">营业时间 / 休息</p>
                </div>
                <button
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    h.closed
                      ? "bg-slate-100 text-slate-600"
                      : "bg-emerald-50 text-emerald-700"
                  }`}
                  onClick={() => updateHour(h.day, { closed: !h.closed })}
                  type="button"
                >
                  {h.closed ? "已休息" : "营业"}
                </button>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <label className="text-xs text-slate-500">开始</label>
                <input
                  type="time"
                  value={h.open}
                  disabled={h.closed}
                  className="flex-1 rounded-md border px-3 py-2 text-sm"
                  onChange={(e) => updateHour(h.day, { open: e.target.value })}
                />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <label className="text-xs text-slate-500">结束</label>
                <input
                  type="time"
                  value={h.close}
                  disabled={h.closed}
                  className="flex-1 rounded-md border px-3 py-2 text-sm"
                  onChange={(e) => updateHour(h.day, { close: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="节假日与临时休假"
        actions={
          <div className="flex items-end gap-2">
            <div className="flex flex-col text-sm">
              <label className="text-xs text-slate-500">日期</label>
              <input
                type="date"
                className="rounded-md border px-3 py-2 text-sm"
                value={newHoliday.date}
                onChange={(e) => setNewHoliday((prev) => ({ ...prev, date: e.target.value }))}
              />
            </div>
            <div className="flex flex-col text-sm">
              <label className="text-xs text-slate-500">原因</label>
              <input
                type="text"
                className="w-56 rounded-md border px-3 py-2 text-sm"
                placeholder="节日 / 维修 / 员工培训"
                value={newHoliday.reason}
                onChange={(e) => setNewHoliday((prev) => ({ ...prev, reason: e.target.value }))}
              />
            </div>
            <button
              onClick={addHoliday}
              className="rounded-md border bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
              type="button"
            >
              添加
            </button>
          </div>
        }
      >
        {holidays.length === 0 ? (
          <p className="text-sm text-slate-500">暂无休假计划。</p>
        ) : (
          <div className="divide-y rounded-xl border">
            {holidays.map((holiday) => (
              <div
                key={holiday.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-slate-900">{holiday.date}</p>
                  <p className="text-sm text-slate-500">{holiday.reason}</p>
                </div>
                <button
                  onClick={() => toggleHoliday(holiday.id)}
                  className="text-sm font-medium text-red-600 hover:text-red-500"
                  type="button"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="菜单与上下架管理">
        <div className="space-y-4">
          {menu.map((category) => (
            <div key={category.id} className="rounded-xl border p-4 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-base font-semibold text-slate-900">{category.name}</p>
                  <p className="text-xs text-slate-500">
                    状态：{category.active ? "在售" : "下架"} · {category.items.length} 款餐品
                  </p>
                </div>
                <button
                  onClick={() => toggleCategory(category.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    category.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                  }`}
                  type="button"
                >
                  {category.active ? "在售" : "下架"}
                </button>
              </div>

              <div className="mt-3 space-y-3">
                {category.items.map((item) => (
                  <div key={item.id} className="rounded-lg border p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{item.name}</p>
                        <p className="text-sm text-slate-500">${item.price.toFixed(2)}</p>
                      </div>
                      <button
                        onClick={() => toggleMenuItem(category.id, item.id)}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          item.active ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        }`}
                        type="button"
                      >
                        {item.active ? "在售" : "下架"}
                      </button>
                    </div>

                    {item.options.length > 0 ? (
                      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                        {item.options.map((option) => (
                          <div
                            key={option.id}
                            className="flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2"
                          >
                            <div>
                              <p className="text-sm font-medium text-slate-900">{option.name}</p>
                              <p className="text-xs text-slate-500">{option.choices.join(" / ")}</p>
                            </div>
                            <button
                              onClick={() => toggleOption(category.id, item.id, option.id)}
                              className={`rounded-full px-3 py-1 text-xs font-medium ${
                                option.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                              }`}
                              type="button"
                            >
                              {option.active ? "可选" : "停用"}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">此餐品暂无选项。</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="门店服务与其他功能">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border p-4">
            <p className="text-sm font-semibold text-slate-900">配送 / 自取</p>
            <p className="mt-2 text-sm text-slate-500">
              控制是否接收线上配送与到店自取订单，适用于恶劣天气、门店维护等场景。
            </p>
            <div className="mt-3 flex gap-2">
              <button className="flex-1 rounded-md border bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700" type="button">
                开启
              </button>
              <button className="flex-1 rounded-md border px-3 py-2 text-sm font-medium text-slate-600" type="button">
                暂停
              </button>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <p className="text-sm font-semibold text-slate-900">库存预警</p>
            <p className="mt-2 text-sm text-slate-500">
              预估库存不足时自动提醒或下架指定餐品，防止超卖。
            </p>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <div className="flex items-center justify-between rounded-md border bg-slate-50 px-3 py-2">
                <span>单品阈值</span>
                <span className="font-semibold text-slate-900">5 份</span>
              </div>
              <div className="flex items-center justify-between rounded-md border bg-slate-50 px-3 py-2">
                <span>通知渠道</span>
                <span className="font-semibold text-slate-900">邮箱 / 短信</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <p className="text-sm font-semibold text-slate-900">运营公告</p>
            <p className="mt-2 text-sm text-slate-500">
              设置首页公告栏，用于提示节假日营业安排、价格调整或新品上线。
            </p>
            <div className="mt-3">
              <textarea
                className="w-full rounded-md border px-3 py-2 text-sm"
                rows={3}
                defaultValue="本周末 18:00 提前打烊，线上订单截止 17:30。"
              />
              <div className="mt-2 flex justify-end">
                <button className="rounded-md border bg-slate-900 px-4 py-2 text-sm font-semibold text-white" type="button">
                  保存公告
                </button>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
