import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

/**
 * Split out from App.tsx (Speed Task 2 — code splitting).
 * recharts is a fairly heavy dependency that is only ever needed inside the
 * Seller/Admin dashboard (doanh thu / phân tích bán hàng). Keeping it in its
 * own file lets App.tsx lazy-load this module instead of bundling recharts
 * into the initial page load for every buyer.
 *
 * Props are intentionally plain data (no closures over App state), so this
 * component has no dependency on anything else in App.tsx.
 */

const formatVND = (n: number) => '₫' + Math.round(n).toLocaleString('vi-VN');

export function RevenueTrendBarChart({
  data,
  color = '#EE4D2D',
  height = 220,
}: {
  data: any[];
  color?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" fontSize={11} />
        <YAxis fontSize={11} tickFormatter={(v) => (v / 1000) + 'k'} />
        <Tooltip formatter={(v: number) => formatVND(v)} />
        <Bar dataKey="revenue" fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ProductRevenueBarChart({
  data,
  color = '#EE4D2D',
  height = 280,
}: {
  data: any[];
  color?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 40 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" fontSize={11} tickFormatter={(v) => (v / 1000000).toFixed(1) + 'tr'} />
        <YAxis type="category" dataKey="name" fontSize={10} width={110} />
        <Tooltip formatter={(v: number) => formatVND(v)} />
        <Bar dataKey="revenue" fill={color} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
