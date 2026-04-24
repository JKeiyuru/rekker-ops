// client/src/pages/LPOsPage.jsx

import { useEffect, useState, useCallback } from 'react';
import { Plus, RefreshCw, Search, Loader2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import DaySection from '@/components/DaySection';
import CreateLPOModal from '@/components/CreateLPOModal';
import BuyerControls from '@/components/BuyerControls';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { format } from 'date-fns';

const TODAY = format(new Date(), 'yyyy-MM-dd');

export default function LPOsPage() {
  const { user } = useAuthStore();
  const [groupedLpos, setGroupedLpos]     = useState([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [modalOpen, setModalOpen]         = useState(false);
  const [search, setSearch]               = useState('');
  const [dateFilter, setDateFilter]       = useState({ start: '', end: '' });
  const [todayBuyer, setTodayBuyer]       = useState(null);
  const [buyerLoading, setBuyerLoading]   = useState(true);

  const canCreate = ['super_admin', 'admin', 'team_lead', 'packaging_team_lead'].includes(user?.role);
  const canEdit   = canCreate;

  // Fetch today's buyer status independently (so dispatch works even with no LPOs)
  useEffect(() => {
    api.get(`/buyer/${TODAY}`)
      .then((r) => setTodayBuyer(r.data))
      .catch(() => setTodayBuyer(null))
      .finally(() => setBuyerLoading(false));
  }, []);

  const fetchLpos = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const params = {};
      if (dateFilter.start) params.startDate = dateFilter.start;
      if (dateFilter.end)   params.endDate   = dateFilter.end;
      const res = await api.get('/lpos', { params });
      setGroupedLpos(res.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateFilter]);

  useEffect(() => { fetchLpos(); }, [fetchLpos]);

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(() => fetchLpos(true), 60000);
    return () => clearInterval(interval);
  }, [fetchLpos]);

  const handleCreated = (newLpos) => {
    // newLpos is always an array (single or batch)
    newLpos.forEach((newLpo) => {
      const dateKey = new Date(newLpo.date).toISOString().split('T')[0];
      setGroupedLpos((prev) => {
        const existing = prev.find((g) => g.date === dateKey);
        if (existing) {
          return prev.map((g) =>
            g.date === dateKey ? { ...g, lpos: [...g.lpos, newLpo] } : g
          );
        }
        return [{ date: dateKey, lpos: [newLpo] }, ...prev].sort(
          (a, b) => new Date(b.date) - new Date(a.date)
        );
      });
    });
  };

  // Check if today already exists in grouped LPOs (DaySection handles buyer for that day)
  const todayHasLpos = groupedLpos.some((g) => g.date === TODAY);

  const filtered = groupedLpos
    .map((group) => ({
      ...group,
      lpos: group.lpos.filter((lpo) =>
        search
          ? lpo.lpoNumber.toLowerCase().includes(search.toLowerCase()) ||
            lpo.responsiblePerson?.name?.toLowerCase().includes(search.toLowerCase()) ||
            (lpo.branch?.name || lpo.branchNameRaw || '').toLowerCase().includes(search.toLowerCase())
          : true
      ),
    }))
    .filter((group) => group.lpos.length > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">LPO Workflow</h1>
          <p className="text-sm text-muted-foreground mt-1">Packaging order lifecycle management</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchLpos(true)} disabled={refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canCreate && (
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4" />
              New LPO
            </Button>
          )}
        </div>
      </div>

      {/* ── Today's Buyer Controls (standalone — always visible) ── */}
      {!todayHasLpos && (
        <div className="rounded-xl border border-rekker-border bg-rekker-surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <Truck className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground uppercase tracking-wider font-mono">
              Today's Buyer — {format(new Date(), 'EEEE dd/MM/yyyy')}
            </span>
          </div>
          {buyerLoading ? (
            <div className="h-10 rounded-lg bg-accent/30 animate-pulse" />
          ) : (
            <BuyerControls
              date={TODAY}
              buyerStatus={todayBuyer}
              onUpdated={setTodayBuyer}
              canEdit={canEdit}
            />
          )}
          {!todayHasLpos && (
            <p className="text-xs text-muted-foreground font-mono mt-3">
              No LPOs yet for today. You can still dispatch the buyer above.
              {canCreate && (
                <button
                  onClick={() => setModalOpen(true)}
                  className="ml-2 text-primary hover:underline"
                >
                  Create first LPO →
                </button>
              )}
            </p>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center p-4 rounded-xl border border-rekker-border bg-rekker-surface">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search LPO, branch, or person…"
            className="pl-9 h-8 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">From</span>
          <Input type="date" className="h-8 text-sm w-36" value={dateFilter.start}
            onChange={(e) => setDateFilter((f) => ({ ...f, start: e.target.value }))} />
          <span className="text-xs text-muted-foreground font-mono">To</span>
          <Input type="date" className="h-8 text-sm w-36" value={dateFilter.end}
            onChange={(e) => setDateFilter((f) => ({ ...f, end: e.target.value }))} />
          {(dateFilter.start || dateFilter.end) && (
            <Button variant="ghost" size="sm" onClick={() => setDateFilter({ start: '', end: '' })}>Clear</Button>
          )}
        </div>
      </div>

      {/* LPO groups */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Loading LPOs…</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-border rounded-xl">
          <p className="text-muted-foreground text-sm">No LPOs found.</p>
          {canCreate && (
            <Button className="mt-4" onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4" />
              Create First LPO
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((group, i) => (
            <DaySection
              key={group.date}
              date={group.date}
              lpos={group.lpos}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      )}

      <CreateLPOModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
