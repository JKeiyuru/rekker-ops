// client/src/pages/fresh/FreshLPOPage.jsx
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Plus, Loader2, FileText, AlertTriangle, CheckCircle2, Send, ThumbsUp, ThumbsDown, Edit2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const fmt = n => n == null ? '—' : `KES ${Number(n).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;
const DESTINATIONS = ['farm', 'market', 'dc', 'other'];
const STATUS_CFG = {
  pending:   { label: 'Pending',   variant: 'pending'     },
  invoiced:  { label: 'Invoiced',  variant: 'warning'     },
  approved:  { label: 'Approved',  variant: 'success'     },
  rejected:  { label: 'Rejected',  variant: 'destructive' },
  draft:     { label: 'Draft',     variant: 'pending'     },
  submitted: { label: 'Submitted', variant: 'warning'     },
};

function LPOModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ lpoNumber: '', amount: '', destination: 'market', supplier: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    if (!form.lpoNumber.trim()) return toast.error('LPO number required');
    if (!form.amount) return toast.error('Amount required');
    setLoading(true);
    try {
      const res = await api.post('/fresh-lpos', { ...form, amount: Number(form.amount) });
      onCreated(res.data); toast.success('LPO created'); onClose();
      setForm({ lpoNumber: '', amount: '', destination: 'market', supplier: '', notes: '' });
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>New Fresh Produce LPO</DialogTitle><DialogDescription>Create a purchase order for farm or market sourcing.</DialogDescription></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>LPO Number</Label><Input className="font-mono uppercase" placeholder="FP-001" value={form.lpoNumber} onChange={set('lpoNumber')} /></div>
            <div className="space-y-1.5"><Label>Amount (KES)</Label><Input type="number" min="0" placeholder="0" value={form.amount} onChange={set('amount')} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Destination</Label>
            <Select value={form.destination} onValueChange={v => setForm(f => ({ ...f, destination: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DESTINATIONS.map(d => <SelectItem key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Supplier <span className="text-muted-foreground font-normal">(optional)</span></Label><Input placeholder="Supplier name" value={form.supplier} onChange={set('supplier')} /></div>
          <div className="space-y-1.5"><Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label><Textarea rows={2} value={form.notes} onChange={set('notes')} /></div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Create LPO</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceModal({ open, onClose, lpos, onCreated }) {
  const [form, setForm] = useState({ invoiceNumber: '', lpoId: '', invoiceAmount: '', supplier: '', notes: '' });
  const [selectedLpo, setSelectedLpo] = useState(null);
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const diff = selectedLpo && form.invoiceAmount ? Number(form.invoiceAmount) - Number(selectedLpo.amount) : null;

  const handleLpoSelect = id => {
    const lpo = lpos.find(l => l._id === id);
    setSelectedLpo(lpo || null);
    setForm(f => ({ ...f, lpoId: id, invoiceAmount: lpo?.amount ? String(lpo.amount) : '' }));
  };

  const handleSave = async () => {
    if (!form.invoiceNumber.trim()) return toast.error('Invoice number required');
    if (!form.lpoId) return toast.error('Select an LPO');
    if (!form.invoiceAmount) return toast.error('Invoice amount required');
    setLoading(true);
    try {
      const res = await api.post('/fresh-lpos/invoices', { ...form, invoiceAmount: Number(form.invoiceAmount) });
      onCreated(res.data); toast.success('Invoice created'); onClose();
      setForm({ invoiceNumber: '', lpoId: '', invoiceAmount: '', supplier: '', notes: '' }); setSelectedLpo(null);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  const uninvoiced = lpos.filter(l => l.status === 'pending');

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>New Invoice</DialogTitle><DialogDescription>Link an invoice to a fresh produce LPO.</DialogDescription></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5"><Label>Invoice Number</Label><Input className="font-mono uppercase" placeholder="INV-001" value={form.invoiceNumber} onChange={set('invoiceNumber')} /></div>
          <div className="space-y-1.5">
            <Label>Linked LPO</Label>
            <Select value={form.lpoId} onValueChange={handleLpoSelect}>
              <SelectTrigger><SelectValue placeholder="Select LPO…" /></SelectTrigger>
              <SelectContent>{uninvoiced.length === 0 ? <SelectItem value="none" disabled>No pending LPOs</SelectItem> : uninvoiced.map(l => <SelectItem key={l._id} value={l._id}>{l.lpoNumber} — {fmt(l.amount)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {selectedLpo && <p className="text-xs text-muted-foreground font-mono">LPO Amount: <span className="text-foreground">{fmt(selectedLpo.amount)}</span></p>}
          <div className="space-y-1.5"><Label>Invoice Amount (KES)</Label><Input type="number" min="0" value={form.invoiceAmount} onChange={set('invoiceAmount')} /></div>
          {diff != null && Math.abs(diff) > 0.01 && (
            <div className={cn('rounded-lg border px-3 py-2.5 flex items-center gap-2', diff > 0 ? 'border-amber-500/40 bg-amber-500/5' : 'border-destructive/40 bg-destructive/5')}>
              <AlertTriangle className={cn('w-4 h-4 shrink-0', diff > 0 ? 'text-amber-400' : 'text-destructive')} />
              <p className={cn('text-sm font-medium', diff > 0 ? 'text-amber-300' : 'text-destructive')}>
                {diff > 0 ? `KES ${diff.toLocaleString()} over LPO` : `KES ${Math.abs(diff).toLocaleString()} under LPO`}
              </p>
            </div>
          )}
          {diff != null && Math.abs(diff) <= 0.01 && <div className="flex items-center gap-2 text-emerald-400 text-sm"><CheckCircle2 className="w-4 h-4" />Matches LPO amount</div>}
          <div className="space-y-1.5"><Label>Supplier <span className="text-muted-foreground font-normal">(optional)</span></Label><Input placeholder="Supplier name" value={form.supplier} onChange={set('supplier')} /></div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Create Invoice</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function FreshLPOPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'admin'].includes(user?.role);
  const [lpos, setLpos]       = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [lpoModalOpen, setLpoModalOpen]     = useState(false);
  const [invModalOpen, setInvModalOpen]     = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [lpoRes, invRes] = await Promise.all([api.get('/fresh-lpos'), api.get('/fresh-lpos/invoices')]);
      setLpos(lpoRes.data || []); setInvoices(invRes.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const doInvoiceAction = async (id, action) => {
    try {
      const res = await api.patch(`/fresh-lpos/invoices/${id}/status`, { action });
      setInvoices(p => p.map(i => i._id === res.data._id ? res.data : i));
      toast.success(`Invoice ${action}ed`);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const filteredLpos = lpos.filter(l => !search || l.lpoNumber.toLowerCase().includes(search.toLowerCase()) || (l.supplier || '').toLowerCase().includes(search.toLowerCase()));
  const filteredInvoices = invoices.filter(i => !search || i.invoiceNumber.toLowerCase().includes(search.toLowerCase()) || (i.lpoNumber || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div><h1 className="page-title">Fresh LPOs & Invoices</h1><p className="text-sm text-muted-foreground mt-1">Purchase orders and supplier invoices for fresh produce</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setInvModalOpen(true)}><Plus className="w-4 h-4" />Invoice</Button>
          <Button onClick={() => setLpoModalOpen(true)}><Plus className="w-4 h-4" />LPO</Button>
        </div>
      </div>

      <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><Input placeholder="Search LPO or invoice number…" className="pl-9 h-8 text-sm" value={search} onChange={e => setSearch(e.target.value)} /></div>

      {loading ? <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div> : (
        <Tabs defaultValue="lpos">
          <TabsList><TabsTrigger value="lpos">LPOs ({filteredLpos.length})</TabsTrigger><TabsTrigger value="invoices">Invoices ({filteredInvoices.length})</TabsTrigger></TabsList>

          <TabsContent value="lpos">
            {filteredLpos.length === 0 ? <div className="text-center py-16 border border-dashed border-border rounded-xl"><FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" /><p className="text-sm text-muted-foreground">No LPOs yet.</p></div> : (
              <div className="rounded-xl border border-rekker-border overflow-hidden mt-3">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-rekker-border bg-rekker-surface">{['LPO No.','Amount','Destination','Supplier','Status','Date'].map(h => <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>)}</tr></thead>
                  <tbody>
                    {filteredLpos.map((l, i) => (
                      <tr key={l._id} className={`border-b border-rekker-border/50 hover:bg-accent/20 transition-colors ${i%2!==0?'bg-rekker-surface/20':''}`}>
                        <td className="px-4 py-3 font-mono font-semibold text-primary text-xs">{l.lpoNumber}</td>
                        <td className="px-4 py-3 font-mono text-xs text-foreground">{fmt(l.amount)}</td>
                        <td className="px-4 py-3 text-xs text-foreground capitalize">{l.destination}</td>
                        <td className="px-4 py-3 text-xs text-foreground">{l.supplier || '—'}</td>
                        <td className="px-4 py-3"><Badge variant={STATUS_CFG[l.status]?.variant || 'pending'}>{STATUS_CFG[l.status]?.label || l.status}</Badge></td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{format(new Date(l.date), 'dd/MM/yy')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="invoices">
            {filteredInvoices.length === 0 ? <div className="text-center py-16 border border-dashed border-border rounded-xl"><FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" /><p className="text-sm text-muted-foreground">No invoices yet.</p></div> : (
              <div className="rounded-xl border border-rekker-border overflow-hidden mt-3">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-rekker-border bg-rekker-surface">{['Invoice No.','LPO No.','LPO Amt','Invoice Amt','Diff','Status','Actions'].map(h => <th key={h} className="text-left px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{h}</th>)}</tr></thead>
                  <tbody>
                    {filteredInvoices.map((inv, i) => {
                      const hasDisparity = Math.abs(inv.difference || 0) > 0.01;
                      return (
                        <tr key={inv._id} className={`border-b border-rekker-border/50 hover:bg-accent/20 transition-colors ${i%2!==0?'bg-rekker-surface/20':''}`}>
                          <td className="px-4 py-3 font-mono font-semibold text-primary text-xs">{inv.invoiceNumber}</td>
                          <td className="px-4 py-3 font-mono text-xs">{inv.lpoNumber || '—'}</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{fmt(inv.lpoAmount)}</td>
                          <td className="px-4 py-3 font-mono text-xs text-foreground">{fmt(inv.invoiceAmount)}</td>
                          <td className="px-4 py-3">
                            {hasDisparity ? <span className={cn('font-mono text-xs font-semibold', inv.difference > 0 ? 'text-amber-400' : 'text-destructive')}>{inv.difference > 0 ? '+' : ''}{fmt(inv.difference)}</span>
                              : <span className="text-emerald-400 text-xs font-mono">✓</span>}
                          </td>
                          <td className="px-4 py-3"><Badge variant={STATUS_CFG[inv.status]?.variant || 'pending'}>{STATUS_CFG[inv.status]?.label || inv.status}</Badge></td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              {inv.status === 'draft' && <Button size="sm" variant="default" className="h-7 px-2" onClick={() => doInvoiceAction(inv._id, 'submit')}><Send className="w-3.5 h-3.5" /></Button>}
                              {inv.status === 'submitted' && isAdmin && <>
                                <Button size="sm" variant="success" className="h-7 px-2" onClick={() => doInvoiceAction(inv._id, 'approve')}><ThumbsUp className="w-3.5 h-3.5" /></Button>
                                <Button size="sm" variant="destructive" className="h-7 px-2" onClick={() => doInvoiceAction(inv._id, 'reject')}><ThumbsDown className="w-3.5 h-3.5" /></Button>
                              </>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      <LPOModal open={lpoModalOpen} onClose={() => setLpoModalOpen(false)} onCreated={l => setLpos(p => [l, ...p])} />
      <InvoiceModal open={invModalOpen} onClose={() => setInvModalOpen(false)} lpos={lpos} onCreated={inv => { setInvoices(p => [inv, ...p]); setLpos(p => p.map(l => l._id === inv.lpo ? { ...l, status: 'invoiced' } : l)); }} />
    </div>
  );
}
