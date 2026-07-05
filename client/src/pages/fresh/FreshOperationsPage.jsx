// client/src/pages/fresh/FreshOperationsPage.jsx
// Main Fresh module UI: list of operations (per date+channel), upload flow
// with import summary, detail view (status stepper, upload timeline with
// revert, lines table with inline reason entry, close/reopen).

import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  Upload, RefreshCw, CheckCircle2, Circle, AlertTriangle, RotateCcw,
  ChevronRight, X, Lock, Unlock, FileSpreadsheet, Loader2, TrendingUp, TrendingDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

const STATUS_STEPS = [
  { key: 'order_received',       label: 'Order Received' },
  { key: 'sourcing_in_progress', label: 'Sourcing In Progress' },
  { key: 'delivery_in_progress', label: 'Delivery In Progress' },
  { key: 'completed',            label: 'Completed' },
];
const STATUS_INDEX = Object.fromEntries(STATUS_STEPS.map((s, i) => [s.key, i]));

const fmtKES = (n) => `KES ${Math.round(Number(n || 0)).toLocaleString()}`;
const fmtPct = (n) => `${Math.round(Number(n || 0) * 100)}%`;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ── Upload modal ─────────────────────────────────────────────────────────────
function UploadModal({ open, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [previews, setPreviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [base64, setBase64] = useState('');
  const inputRef = useRef();

  useEffect(() => { if (!open) { setFile(null); setPreviews([]); setBase64(''); } }, [open]);

  const handlePick = async (f) => {
    if (!f) return;
    setFile(f); setLoading(true);
    try {
      const b64 = await fileToBase64(f);
      setBase64(b64);
      const { data } = await api.post('/fresh/upload/preview', { base64: b64, filename: f.name });
      setPreviews(data.previews || []);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to parse file');
    } finally { setLoading(false); }
  };

  const commit = async () => {
    setCommitting(true);
    try {
      const { data } = await api.post('/fresh/upload/commit', {
        base64, filename: file?.name, sheets: previews.map((p) => p.sheetName),
      });
      toast.success(`Committed ${data.committed} sheet(s)`);
      onDone?.(); onClose();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Commit failed');
    } finally { setCommitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Upload Fresh Workbook</DialogTitle></DialogHeader>
        {!file && (
          <div onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-rekker-border rounded-xl p-10 text-center cursor-pointer hover:bg-accent/20">
            <FileSpreadsheet className="w-10 h-10 text-primary mx-auto mb-2" />
            <p className="text-sm">Drop your .xlsx here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">Same workbook — upload as many times a day as you need.</p>
            <input ref={inputRef} type="file" accept=".xlsx" hidden onChange={(e) => handlePick(e.target.files?.[0])} />
          </div>
        )}
        {loading && <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>}
        {previews.map((p) => (
          <div key={p.sheetName} className="rounded-xl border border-rekker-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{p.sheetName}</p>
                <p className="text-xs text-muted-foreground">{p.channel} · {format(new Date(p.date), 'PPP')}</p>
              </div>
              <Badge variant="secondary">{p.summary.zonesTouched.join(' · ') || 'no data'}</Badge>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-lg bg-accent/30 p-2"><p className="text-xl font-mono">{p.summary.productsFound}</p><p className="text-[10px] uppercase text-muted-foreground">Rows</p></div>
              <div className="rounded-lg bg-accent/30 p-2"><p className="text-xl font-mono">{p.summary.productsUpdated}</p><p className="text-[10px] uppercase text-muted-foreground">Updated</p></div>
              <div className="rounded-lg bg-accent/30 p-2"><p className="text-xl font-mono">{p.summary.productsCreated}</p><p className="text-[10px] uppercase text-muted-foreground">New</p></div>
              <div className="rounded-lg bg-accent/30 p-2"><p className="text-xl font-mono">{p.summary.fieldsChanged}</p><p className="text-[10px] uppercase text-muted-foreground">Fields</p></div>
            </div>
            {p.warnings?.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 max-h-40 overflow-y-auto">
                <p className="text-xs font-medium text-amber-500 mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {p.warnings.length} warning(s)
                </p>
                <ul className="text-xs space-y-0.5">
                  {p.warnings.slice(0, 30).map((w, i) => <li key={i}>• {w.message}</li>)}
                </ul>
              </div>
            )}
          </div>
        ))}
        {previews.length > 0 && (
          <div className="flex gap-2 justify-end pt-2 border-t border-rekker-border">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={commit} disabled={committing}>
              {committing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Commit {previews.length} sheet{previews.length === 1 ? '' : 's'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Reason inline editor ─────────────────────────────────────────────────────
function ReasonInline({ line, reasonCodes, onSaved }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(line.reasonCode || '');
  const [note, setNote] = useState(line.reasonNote || '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/fresh/lines/${line._id}/reason`, { reasonCode: code, reasonNote: note });
      toast.success('Reason saved');
      setOpen(false); onSaved?.();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className={cn('text-xs px-2 py-1 rounded border',
          line.reasonNeeded ? 'border-amber-500/40 text-amber-500 bg-amber-500/5'
                            : 'border-rekker-border text-muted-foreground')}>
        {line.reasonCode ? (line.reasonCode === 'FROM_COMMENT' ? line.reasonNote?.slice(0, 40) : line.reasonCode)
          : line.reasonNeeded ? 'Set reason' : '—'}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Select value={code} onValueChange={setCode}>
        <SelectTrigger className="h-7 text-xs w-40"><SelectValue placeholder="Pick reason" /></SelectTrigger>
        <SelectContent>
          {reasonCodes.filter((r) => r.active).map((r) => (
            <SelectItem key={r._id} value={r.code}>{r.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input className="h-7 text-xs w-32" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button size="sm" onClick={save} disabled={saving}>Save</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}><X className="w-3 h-3" /></Button>
    </div>
  );
}

// ── Operation detail drawer ──────────────────────────────────────────────────
function OperationDetail({ opId, reasonCodes, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/fresh/operations/${opId}`);
      setData(data);
    } finally { setLoading(false); }
  };
  useEffect(() => { if (opId) load(); }, [opId]);

  const revert = async (uploadId) => {
    if (!confirm('Revert this upload? Fields modified by later uploads are preserved.')) return;
    try {
      const { data } = await api.post(`/fresh/uploads/${uploadId}/revert`);
      toast.success('Reverted' + (data.warning ? ` — ${data.warning}` : ''));
      load(); onChanged?.();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };
  const closeOp = async () => {
    try { await api.post(`/fresh/operations/${opId}/close`); toast.success('Operation closed'); load(); onChanged?.(); }
    catch (e) { toast.error(e.response?.data?.message); }
  };
  const reopen = async () => {
    try { await api.post(`/fresh/operations/${opId}/reopen`); toast.success('Reopened'); load(); onChanged?.(); }
    catch (e) { toast.error(e.response?.data?.message); }
  };

  if (!opId) return null;
  const op = data?.operation;
  const currentIdx = op ? STATUS_INDEX[op.status] : 0;

  return (
    <Dialog open={!!opId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {op ? `${op.channel} · ${format(new Date(op.date), 'PPPP')}` : 'Loading…'}
          </DialogTitle>
        </DialogHeader>
        {loading && <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>}
        {op && (
          <>
            {/* Status stepper */}
            <div className="rounded-xl border border-rekker-border p-4">
              <div className="flex items-center justify-between gap-2">
                {STATUS_STEPS.map((s, i) => (
                  <div key={s.key} className="flex-1 flex items-center gap-2">
                    {i <= currentIdx ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
                    <div>
                      <p className={cn('text-xs font-medium', i <= currentIdx ? 'text-foreground' : 'text-muted-foreground')}>{s.label}</p>
                    </div>
                    {i < STATUS_STEPS.length - 1 && <div className={cn('flex-1 h-px', i < currentIdx ? 'bg-primary' : 'bg-rekker-border')} />}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 justify-end mt-3">
                {op.manuallyClosed
                  ? <Button size="sm" variant="outline" onClick={reopen}><Unlock className="w-3 h-3 mr-1" /> Reopen</Button>
                  : <Button size="sm" variant="outline" onClick={closeOp}><Lock className="w-3 h-3 mr-1" /> Close day</Button>}
              </div>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              {[
                ['Ordered', op.totals?.orderedValue],
                ['Bought', op.totals?.boughtValue],
                ['Delivered', op.totals?.deliveredValue],
                ['Rejected', op.totals?.rejectedValue],
                ['Margin', op.totals?.margin, op.totals?.margin < 0 ? 'text-destructive' : 'text-primary'],
                ['Proc. Success', fmtPct(op.totals?.procurementSuccess)],
              ].map(([label, v, cls], i) => (
                <div key={i} className="rounded-lg border border-rekker-border p-3">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</p>
                  <p className={cn('font-mono text-lg', cls)}>{typeof v === 'string' ? v : fmtKES(v)}</p>
                </div>
              ))}
            </div>

            {/* Upload timeline */}
            <div className="rounded-xl border border-rekker-border p-4">
              <p className="text-sm font-medium mb-3">Upload History</p>
              <div className="space-y-2">
                {data.uploads.map((u) => (
                  <div key={u._id} className={cn('flex items-center gap-3 p-2 rounded border',
                    u.reverted ? 'border-muted-foreground/20 bg-muted/20 opacity-60' : 'border-rekker-border')}>
                    <div className="text-xs font-mono w-16">{format(new Date(u.createdAt), 'HH:mm')}</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{u.label} {u.reverted && <span className="text-xs">(reverted)</span>}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {u.uploadedBy?.fullName || u.uploadedByName || '—'} · {u.linesCreated} new · {u.linesUpdated} updated · {u.fieldsChanged} fields
                        {u.warnings?.length > 0 && ` · ${u.warnings.length} warnings`}
                      </p>
                    </div>
                    {!u.reverted && (
                      <Button size="sm" variant="ghost" onClick={() => revert(u._id)}>
                        <RotateCcw className="w-3 h-3 mr-1" /> Revert
                      </Button>
                    )}
                  </div>
                ))}
                {!data.uploads.length && <p className="text-xs text-muted-foreground">No uploads yet.</p>}
              </div>
            </div>

            {/* Lines table */}
            <div className="rounded-xl border border-rekker-border overflow-hidden">
              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-rekker-surface border-b border-rekker-border">
                    <tr>
                      {['Branch','Product','Ord Qty','Bght Qty','Del Qty','Bought','Delivered','Margin','Status','Reason'].map((h) =>
                        <th key={h} className="text-left px-2 py-2 font-mono uppercase text-[10px] text-muted-foreground">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((l) => (
                      <tr key={l._id} className={cn('border-b border-rekker-border/50 hover:bg-accent/10',
                        l.margin < 0 && 'bg-destructive/5')}>
                        <td className="px-2 py-1.5 font-mono">{l.branch}</td>
                        <td className="px-2 py-1.5">{l.productName}</td>
                        <td className="px-2 py-1.5 font-mono">{l.ordered?.qty ?? '—'}</td>
                        <td className="px-2 py-1.5 font-mono">{l.bought?.qty ?? '—'}</td>
                        <td className="px-2 py-1.5 font-mono">{l.delivered?.qty ?? '—'}</td>
                        <td className="px-2 py-1.5 font-mono">{l.bought?.totalValue != null ? fmtKES(l.bought.totalValue) : '—'}</td>
                        <td className="px-2 py-1.5 font-mono">{l.delivered?.totalValue != null ? fmtKES(l.delivered.totalValue) : '—'}</td>
                        <td className={cn('px-2 py-1.5 font-mono', l.margin < 0 ? 'text-destructive' : 'text-primary')}>
                          {l.margin != null ? fmtKES(l.margin) : '—'}
                        </td>
                        <td className="px-2 py-1.5">
                          <Badge variant={l.status === 'reconciled' ? 'success' : 'secondary'}>{l.status.replace('_', ' ')}</Badge>
                        </td>
                        <td className="px-2 py-1.5">
                          <ReasonInline line={l} reasonCodes={reasonCodes} onSaved={load} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function FreshOperationsPage() {
  const [ops, setOps] = useState([]);
  const [reasonCodes, setReasonCodes] = useState([]);
  const [openUpload, setOpenUpload] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [o, r] = await Promise.all([
        api.get('/fresh/operations', { params: { channel: channel || undefined } }),
        api.get('/fresh/reason-codes'),
      ]);
      setOps(o.data); setReasonCodes(r.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [channel]);

  const grouped = useMemo(() => {
    const g = new Map();
    for (const op of ops) {
      const k = op.dateKey;
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(op);
    }
    return Array.from(g.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [ops]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display tracking-widest">FRESH OPERATIONS</h1>
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest mt-1">
            Live state of every day's operation — per channel
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={channel} onValueChange={(v) => setChannel(v === 'ALL' ? '' : v)}>
            <SelectTrigger className="w-32"><SelectValue placeholder="All channels" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All channels</SelectItem>
              <SelectItem value="DC">DC</SelectItem>
              <SelectItem value="STORES">STORES</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
          <Button onClick={() => setOpenUpload(true)}><Upload className="w-4 h-4 mr-1" /> Upload workbook</Button>
        </div>
      </div>

      {loading && <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>}

      {!loading && grouped.length === 0 && (
        <div className="text-center py-16 border border-dashed border-rekker-border rounded-xl">
          <FileSpreadsheet className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm">No operations yet — upload your first Fresh workbook to get started.</p>
        </div>
      )}

      {grouped.map(([dateKey, list]) => (
        <div key={dateKey} className="space-y-2">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            {format(new Date(dateKey), 'EEEE, PPP')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {list.map((op) => {
              const idx = STATUS_INDEX[op.status];
              const margin = Number(op.totals?.margin || 0);
              return (
                <button key={op._id} onClick={() => setDetailId(op._id)}
                  className="text-left rounded-xl border border-rekker-border bg-rekker-surface p-4 hover:border-primary/40 transition">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={op.channel === 'DC' ? 'default' : 'secondary'}>{op.channel}</Badge>
                      {op.manuallyClosed && <Badge variant="outline"><Lock className="w-3 h-3 mr-1" /> Closed</Badge>}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex items-center gap-1 mb-3">
                    {STATUS_STEPS.map((s, i) => (
                      <div key={s.key} className={cn('h-1.5 flex-1 rounded-full', i <= idx ? 'bg-primary' : 'bg-rekker-border')} />
                    ))}
                  </div>
                  <p className="text-[10px] uppercase text-muted-foreground font-mono tracking-widest mb-1">
                    {STATUS_STEPS[idx]?.label}
                  </p>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <div><p className="text-[10px] text-muted-foreground">Ordered</p><p className="font-mono text-sm">{fmtKES(op.totals?.orderedValue)}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">Delivered</p><p className="font-mono text-sm">{fmtKES(op.totals?.deliveredValue)}</p></div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Margin</p>
                      <p className={cn('font-mono text-sm flex items-center gap-1', margin < 0 ? 'text-destructive' : 'text-primary')}>
                        {margin < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                        {fmtKES(margin)}
                      </p>
                    </div>
                  </div>
                  {op.totals?.linesNeedingReason > 0 && (
                    <p className="text-[11px] text-amber-500 mt-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {op.totals.linesNeedingReason} line(s) need a reason
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <UploadModal open={openUpload} onClose={() => setOpenUpload(false)} onDone={load} />
      <OperationDetail opId={detailId} reasonCodes={reasonCodes} onClose={() => setDetailId(null)} onChanged={load} />
    </div>
  );
}
