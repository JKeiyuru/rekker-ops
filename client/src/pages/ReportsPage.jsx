// client/src/pages/ReportsPage.jsx

import { useEffect, useState } from 'react';
import { Download, Loader2, BarChart3, Clock, Users, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line
} from 'recharts';
import api from '@/lib/api';

const ORANGE = '#FF6B2C';
const CHART_STYLE = {
  background: 'transparent',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11,
};

function SectionTitle({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider font-mono">{title}</h2>
    </div>
  );
}

function LoadingCard() {
  return <div className="rounded-xl border border-rekker-border bg-rekker-surface h-64 animate-pulse" />;
}

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [errorRate, setErrorRate] = useState([]);
  const [dailyPerf, setDailyPerf] = useState([]);
  const [timeAnalysis, setTimeAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchReports = async () => {
    setLoading(true);
    const params = {};
    if (dateRange.start) params.startDate = dateRange.start;
    if (dateRange.end) params.endDate = dateRange.end;
    try {
      const [errRes, dailyRes, timeRes] = await Promise.all([
        api.get('/reports/error-rate', { params }),
        api.get('/reports/daily-performance', { params }),
        api.get('/reports/time-analysis', { params }),
      ]);
      setErrorRate(errRes.data);
      setDailyPerf(dailyRes.data.slice(0, 14).reverse());
      setTimeAnalysis(timeRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, []);

  const handleExportCSV = () => {
    if (!dailyPerf.length) return;
    const headers = ['Date', 'Total LPOs', 'Issued', 'Completed', 'Checked', 'With Errors'];
    const rows = dailyPerf.map((r) => [r._id, r.totalLPOs, r.issued, r.completed, r.checked, r.withErrors]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rekker-ops-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Performance analytics and operational insights</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV}>
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Date filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-rekker-border bg-rekker-surface">
        <span className="text-xs font-mono text-muted-foreground">Date Range:</span>
        <Input type="date" className="h-8 w-36 text-sm" value={dateRange.start} onChange={(e) => setDateRange((d) => ({ ...d, start: e.target.value }))} />
        <span className="text-xs text-muted-foreground font-mono">→</span>
        <Input type="date" className="h-8 w-36 text-sm" value={dateRange.end} onChange={(e) => setDateRange((d) => ({ ...d, end: e.target.value }))} />
        <Button size="sm" onClick={fetchReports} disabled={loading}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Apply'}
        </Button>
        {(dateRange.start || dateRange.end) && (
          <Button variant="ghost" size="sm" onClick={() => { setDateRange({ start: '', end: '' }); }}>Clear</Button>
        )}
      </div>

      <Tabs defaultValue="daily">
        <TabsList className="mb-2">
          <TabsTrigger value="daily">Daily Performance</TabsTrigger>
          <TabsTrigger value="errors">Error Rates</TabsTrigger>
          <TabsTrigger value="time">Time Analysis</TabsTrigger>
        </TabsList>

        {/* Daily Performance */}
        <TabsContent value="daily">
          <div className="rounded-xl border border-rekker-border bg-rekker-surface p-5">
            <SectionTitle icon={BarChart3} title="Daily LPO Performance (Last 14 Days)" />
            {loading ? <LoadingCard /> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dailyPerf} style={CHART_STYLE}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 17% 18%)" />
                  <XAxis dataKey="_id" tick={{ fill: 'hsl(215 15% 50%)', fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fill: 'hsl(215 15% 50%)', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(220 17% 10%)', border: '1px solid hsl(220 17% 18%)', borderRadius: 8, fontFamily: 'Sora' }}
                    labelStyle={{ color: 'hsl(210 20% 92%)', fontSize: 12 }}
                  />
                  <Bar dataKey="totalLPOs" name="Total" fill={ORANGE} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="checked" name="Checked" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="withErrors" name="Errors" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}

            {/* Table */}
            {!loading && dailyPerf.length > 0 && (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border">
                      {['Date', 'Total', 'Issued', 'Completed', 'Checked', 'Errors'].map((h) => (
                        <th key={h} className="text-left py-2 px-3 text-muted-foreground uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...dailyPerf].reverse().map((row) => (
                      <tr key={row._id} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                        <td className="py-2 px-3 text-foreground">{row._id}</td>
                        <td className="py-2 px-3 text-foreground font-semibold">{row.totalLPOs}</td>
                        <td className="py-2 px-3 text-amber-400">{row.issued}</td>
                        <td className="py-2 px-3 text-blue-400">{row.completed}</td>
                        <td className="py-2 px-3 text-emerald-400">{row.checked}</td>
                        <td className="py-2 px-3 text-destructive">{row.withErrors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Error Rates */}
        <TabsContent value="errors">
          <div className="rounded-xl border border-rekker-border bg-rekker-surface p-5">
            <SectionTitle icon={Users} title="Error Rate Per Responsible Person" />
            {loading ? <LoadingCard /> : errorRate.length === 0 ? (
              <p className="text-muted-foreground text-sm py-10 text-center">No data yet.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={errorRate} style={CHART_STYLE} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 17% 18%)" horizontal={false} />
                    <XAxis type="number" unit="%" tick={{ fill: 'hsl(215 15% 50%)', fontSize: 10 }} domain={[0, 100]} />
                    <YAxis dataKey="name" type="category" width={110} tick={{ fill: 'hsl(210 20% 92%)', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(220 17% 10%)', border: '1px solid hsl(220 17% 18%)', borderRadius: 8, fontFamily: 'Sora' }}
                      formatter={(v) => [`${v.toFixed(1)}%`, 'Error Rate']}
                    />
                    <Bar dataKey="errorRate" name="Error Rate" radius={[0, 4, 4, 0]}>
                      {errorRate.map((entry, i) => (
                        <Cell key={i} fill={entry.errorRate > 20 ? '#ef4444' : entry.errorRate > 10 ? '#f59e0b' : '#10b981'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                <div className="mt-5 overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-border">
                        {['Person', 'Total LPOs', 'Errors', 'Error Rate'].map((h) => (
                          <th key={h} className="text-left py-2 px-3 text-muted-foreground uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {errorRate.map((row) => (
                        <tr key={row._id} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                          <td className="py-2 px-3 text-foreground font-medium">{row.name}</td>
                          <td className="py-2 px-3 text-foreground">{row.totalLPOs}</td>
                          <td className="py-2 px-3 text-destructive">{row.errorsCount}</td>
                          <td className="py-2 px-3">
                            <span className={`font-semibold ${row.errorRate > 20 ? 'text-destructive' : row.errorRate > 10 ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {row.errorRate.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </TabsContent>

        {/* Time Analysis */}
        <TabsContent value="time">
          <div className="rounded-xl border border-rekker-border bg-rekker-surface p-5">
            <SectionTitle icon={Clock} title="Average Processing Times" />
            {loading ? <LoadingCard /> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
                {[
                  { label: 'Avg. Issue → Complete', value: timeAnalysis?.avgIssuedToCompleted, unit: 'min', color: 'text-primary' },
                  { label: 'Avg. Complete → Check', value: timeAnalysis?.avgCompletedToChecked, unit: 'min', color: 'text-emerald-400' },
                  { label: 'Fastest Processing', value: timeAnalysis?.minIssuedToCompleted, unit: 'min', color: 'text-blue-400' },
                  { label: 'Slowest Processing', value: timeAnalysis?.maxIssuedToCompleted, unit: 'min', color: 'text-amber-400' },
                ].map(({ label, value, unit, color }) => (
                  <div key={label} className="rounded-lg border border-border bg-accent/30 p-4">
                    <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">{label}</p>
                    <p className={`text-3xl font-display tracking-wider mt-2 ${color}`}>
                      {value != null ? Math.round(value) : '—'}
                    </p>
                    {value != null && <p className="text-xs text-muted-foreground mt-0.5">{unit}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
