// client/src/pages/fresh/FreshInsightsPage.jsx
// Live progress dashboard + insights & trends for the Fresh module.

import { useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { Download, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

const fmtKES = (n) => `KES ${Math.round(Number(n || 0)).toLocaleString()}`;
const fmtPct = (n) => `${Math.round(Number(n || 0) * 100)}%`;

function ChannelCard({ channel, totals }) {
  const negative = Number(totals?.margin || 0) < 0;
  const items = [
    ['Ordered',      fmtKES(totals?.orderedValue)],
    ['Bought',       fmtKES(totals?.boughtValue)],
    ['Delivered',    fmtKES(totals?.deliveredValue)],
    ['Rejected',     fmtKES(totals?.rejectedValue)],
    ['Proc. Success', fmtPct(totals?.procurementSuccess)],
    ['Del. Success',  fmtPct(totals?.deliverySuccess)],
    ['Margin', fmtKES(totals?.margin), negative ? 'text-destructive' : 'text-primary'],
    ['Needs Reason', totals?.linesNeedingReason || 0, 'text-amber-500'],
  ];
  return (
    <div className="rounded-xl border border-rekker-border bg-rekker-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="font-display tracking-widest text-lg">{channel}</p>
        <Badge variant={channel === 'DC' ? 'default' : 'secondary'}>{totals?.days || 0} day(s)</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map(([l, v, cls]) => (
          <div key={l}>
            <p className="text-[10px] uppercase font-mono text-muted-foreground tracking-widest">{l}</p>
            <p className={cn('font-mono text-lg mt-0.5', cls)}>{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FreshInsightsPage() {
  const [from, setFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
  const [to, setTo]     = useState(format(new Date(), 'yyyy-MM-dd'));
  const [channel, setChannel] = useState('');
  const [summary, setSummary] = useState(null);
  const [trends, setTrends]   = useState([]);
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [s, t, p, b] = await Promise.all([
        api.get('/fresh/insights/summary', { params: { from, to } }),
        api.get('/fresh/insights/trends',  { params: { from, to, channel: channel || undefined } }),
        api.get('/fresh/reports/products', { params: { from, to, channel: channel || undefined } }),
        api.get('/fresh/reports/branches', { params: { from, to, channel: channel || undefined } }),
      ]);
      setSummary(s.data); setTrends(t.data); setProducts(p.data); setBranches(b.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [from, to, channel]);

  const trendData = useMemo(() => {
    // If no channel filter, aggregate per date
    if (channel) return trends;
    const byDate = new Map();
    for (const t of trends) {
      const cur = byDate.get(t.date) || { date: t.date, orderedValue: 0, boughtValue: 0, deliveredValue: 0, margin: 0, rejectedValue: 0 };
      cur.orderedValue += t.orderedValue; cur.boughtValue += t.boughtValue;
      cur.deliveredValue += t.deliveredValue; cur.margin += t.margin;
      cur.rejectedValue += t.rejectedValue;
      byDate.set(t.date, cur);
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [trends, channel]);

  const exportProducts = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(products), 'Products');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(branches), 'Branches');
    XLSX.writeFile(wb, `fresh-report-${from}-to-${to}.xlsx`);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display tracking-widest">FRESH INSIGHTS</h1>
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest">
            Everything the Excel workbook can't show you
          </p>
        </div>
        <div className="flex gap-2 items-end">
          <div><label className="text-[10px] uppercase text-muted-foreground">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border border-rekker-border bg-background px-2 text-sm" /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border border-rekker-border bg-background px-2 text-sm" /></div>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="h-9 rounded-md border border-rekker-border bg-background px-2 text-sm">
            <option value="">Both channels</option><option value="DC">DC</option><option value="STORES">STORES</option>
          </select>
          <Button variant="outline" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
          <Button onClick={exportProducts}><Download className="w-4 h-4 mr-1" /> Excel</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChannelCard channel="DC"     totals={summary?.DC} />
        <ChannelCard channel="STORES" totals={summary?.STORES} />
      </div>

      <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4">
        <p className="font-medium text-sm mb-3">Trend — Ordered vs Bought vs Delivered vs Margin</p>
        <div className="w-full h-72">
          <ResponsiveContainer>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => fmtKES(v)} />
              <Legend />
              <Line type="monotone" dataKey="orderedValue"   stroke="#8884d8" dot={false} name="Ordered" />
              <Line type="monotone" dataKey="boughtValue"    stroke="#82ca9d" dot={false} name="Bought" />
              <Line type="monotone" dataKey="deliveredValue" stroke="#ffc658" dot={false} name="Delivered" />
              <Line type="monotone" dataKey="margin"         stroke="#ff6b6b" dot={false} name="Margin" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4">
          <p className="font-medium text-sm mb-3">Top Products by Margin</p>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-accent/20 sticky top-0"><tr>
                {['Product','Chan','Delivered','Margin','Rej %'].map((h) => <th key={h} className="text-left px-2 py-1 text-[10px] font-mono uppercase">{h}</th>)}
              </tr></thead>
              <tbody>
                {products.slice(0, 30).map((p, i) => (
                  <tr key={i} className={cn('border-t border-rekker-border/50', p.margin < 0 && 'bg-destructive/5')}>
                    <td className="px-2 py-1">{p.productName}</td>
                    <td className="px-2 py-1 font-mono">{p.channel}</td>
                    <td className="px-2 py-1 font-mono">{fmtKES(p.deliveredValue)}</td>
                    <td className={cn('px-2 py-1 font-mono', p.margin < 0 ? 'text-destructive' : 'text-primary')}>{fmtKES(p.margin)}</td>
                    <td className="px-2 py-1 font-mono">{fmtPct(p.rejectionRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4">
          <p className="font-medium text-sm mb-3">By Branch</p>
          <div className="w-full h-72">
            <ResponsiveContainer>
              <BarChart data={branches.slice(0, 12)}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="branch" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => fmtKES(v)} />
                <Legend />
                <Bar dataKey="deliveredValue" fill="#82ca9d" name="Delivered" />
                <Bar dataKey="margin"         fill="#8884d8" name="Margin" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
