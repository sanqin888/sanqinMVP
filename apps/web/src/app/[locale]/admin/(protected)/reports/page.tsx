// apps/web/src/app/[locale]/admin/(protected)/reports/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { format, subDays } from 'date-fns';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, PieChart, Pie, Cell, Legend 
} from 'recharts';
import { Loader2, DollarSign, ShoppingBag, CreditCard, TrendingUp } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

// --- 类型定义 ---
interface ReportData {
  summary: {
    totalSales: number;
    subtotal: number;
    tax: number;
    deliveryFees: number;
    orderCount: number;
    averageOrderValue: number;
  };
  chartData: Array<{ date: string; total: number }>;
  breakdown: {
    payment: Array<{ name: string; value: number }>;
    fulfillment: Array<{ name: string; value: number }>;
  };
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | 'week' | 'month'>('today');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const now = new Date();
        let range = { from: '', to: '' };
        
        if (dateRange === 'today') {
          range = { from: format(now, 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
        } else if (dateRange === 'yesterday') {
          const yest = subDays(now, 1);
          range = { from: format(yest, 'yyyy-MM-dd'), to: format(yest, 'yyyy-MM-dd') };
        } else if (dateRange === 'week') {
          range = { from: format(subDays(now, 6), 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
        } else { // month
          range = { from: format(subDays(now, 29), 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
        }

        const params = new URLSearchParams(range);
        const res = await fetch(`/api/v1/reports?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch reports');
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateRange]);

  const formatMoney = (val: number) => `$${val.toFixed(2)}`;

  if (loading && !data) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-emerald-600" />
          销售报表
        </h1>
        
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(['today', 'yesterday', 'week', 'month'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={twMerge(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                dateRange === range
                  ? "bg-white text-emerald-700 shadow-sm"
                  : "text-slate-600 hover:bg-slate-200/50"
              )}
            >
              {range === 'today' && '今天'}
              {range === 'yesterday' && '昨天'}
              {range === 'week' && '近7天'}
              {range === 'month' && '近30天'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="总销售额 (Sales)"
          value={formatMoney(data?.summary.totalSales || 0)}
          icon={<DollarSign className="h-5 w-5 text-emerald-600" />}
          subtext={`含税: ${formatMoney(data?.summary.tax || 0)}`}
        />
        <KpiCard
          title="有效订单 (Orders)"
          value={data?.summary.orderCount.toString() || '0'}
          icon={<ShoppingBag className="h-5 w-5 text-blue-600" />}
          subtext="笔已完成交易"
        />
        <KpiCard
          title="客单价 (AOV)"
          value={formatMoney(data?.summary.averageOrderValue || 0)}
          icon={<TrendingUp className="h-5 w-5 text-amber-600" />}
          subtext="平均每单收入"
        />
        <KpiCard
          title="配送费收入"
          value={formatMoney(data?.summary.deliveryFees || 0)}
          icon={<CreditCard className="h-5 w-5 text-purple-600" />}
          subtext="来自顾客支付"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h3 className="mb-4 text-lg font-semibold text-slate-800">销售趋势 (Sales Trend)</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="date" 
                  stroke="#64748b" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false}
                  minTickGap={30}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(val) => `$${val}`} 
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  // ✅ 修复 1: 使用 any 类型并处理数值转换
                  formatter={(val: any) => [`$${Number(val).toFixed(2)}`, '销售额']}
                />
                <Line 
                  type="monotone" 
                  dataKey="total" 
                  stroke="#10b981" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} 
                  activeDot={{ r: 6 }} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-slate-800">支付方式 (Payment)</h3>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data?.breakdown.payment}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {data?.breakdown.payment.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  {/* ✅ 修复 2: 使用 any 类型 */}
                  <Tooltip formatter={(val: any) => `$${Number(val).toFixed(2)}`} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

           <div className="flex-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-slate-800">用餐方式 (Fulfillment)</h3>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.breakdown.fulfillment} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={70} tick={{fontSize: 11}} interval={0} />
                  {/* ✅ 修复 3: 使用 any 类型 */}
                  <Tooltip cursor={{fill: 'transparent'}} formatter={(val: any) => `$${Number(val).toFixed(2)}`} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value, icon, subtext }: { title: string; value: string; icon: React.ReactNode; subtext: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <div className="rounded-full bg-slate-50 p-2">{icon}</div>
      </div>
      <div className="mt-2">
        <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
        <p className="mt-1 text-xs text-slate-400">{subtext}</p>
      </div>
    </div>
  );
}