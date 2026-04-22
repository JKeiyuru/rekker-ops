// client/src/components/LPOTable.jsx
// Displays LPOs grouped by batchId with action buttons.
// Fixes: added Amount column; fixed batch row alignment (removed phantom empty <td>).

import { useState } from 'react';
import { format } from 'date-fns';
import { CheckCheck, ClipboardCheck, Send, Loader2, Trash2, Layers, AlertCircle, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StatusBadge from './StatusBadge';
import ErrorLogger from './ErrorLogger';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import EditLPOModal from './EditLPOModal';

// ── Helpers ───────────────────────────────────────────────────────────────────

function TimeCell({ timestamp }) {
  if (!timestamp) return <span className="text-muted-foreground/40 font-mono text-xs">—</span>;
  return (
    <div className="flex flex-col">
      <span className="font-mono text-xs text-foreground">{format(new Date(timestamp), 'HH:mm')}</span>
      <span className="font-mono text-[10px] text-muted-foreground">{format(new Date(timestamp), 'dd/MM')}</span>
    </div>
  );
}

function AmountCell({ amount }) {
  if (amount == null) return <span className="text-muted-foreground/40 font-mono text-xs">—</span>;
  return (
    <span className="font-mono text-xs text-foreground">
      {Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
    </span>
  );
}

function BranchCell({ lpo }) {
  const name = lpo.branch?.name || lpo.branchNameRaw || null;
  const isUnverified = lpo.branch && !lpo.branch.isVerified;
  if (!name) return <span className="text-muted-foreground/40 font-mono text-xs">—</span>;
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-xs text-foreground truncate max-w-[100px]">{name}</span>
      {isUnverified && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger><AlertCircle className="w-3 h-3 text-amber-400 shrink-0" /></TooltipTrigger>
            <TooltipContent>Unverified branch — pending admin approval</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

function ActionBtn({ onClick, disabled, loading, icon: Icon, label, variant, title }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant={variant} onClick={onClick} disabled={disabled || loading} className="h-7 px-2.5">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
            <span className="hidden xl:inline ml-1 text-xs">{label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{title}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Group LPOs by batchId, preserving display order ──────────────────────────
function groupLpos(lpos) {
  const groups = [];
  const seen   = {};
  for (const lpo of lpos) {
    if (!lpo.batchId) {
      groups.push({ batchId: null, lpos: [lpo] });
    } else if (seen[lpo.batchId] !== undefined) {
      groups[seen[lpo.batchId]].lpos.push(lpo);
    } else {
      seen[lpo.batchId] = groups.length;
      groups.push({ batchId: lpo.batchId, lpos: [lpo] });
    }
  }
  return groups;
}

// ── Column definitions ────────────────────────────────────────────────────────
// Keeping this as an array makes it trivial to add/remove columns in one place.
const HEADERS = [
  'LPO Number',
  'Branch',
  'Amount (KES)',
  'Delivery',
  'Status',
  'Issued',
  'Completed',
  'Checked',
  'Person',
  'Errors',
  'Actions',
];

// ── Main component ────────────────────────────────────────────────────────────
export default function LPOTable({ lpos, onUpdated, onDeleted }) {
  const { user } = useAuthStore();
  const [loadingId, setLoadingId] = useState(null);
  const [editLpo, setEditLpo] = useState(null);

  const canEdit   = ['super_admin', 'admin', 'team_lead', 'packaging_team_lead'].includes(user?.role);
  const canAdmin  = ['super_admin', 'admin'].includes(user?.role);
  const canDelete = user?.role === 'super_admin';

  const updateStatus = async (lpo, action) => {
    setLoadingId(`${lpo._id}-${action}`);
    try {
      const res = await api.patch(`/lpos/${lpo._id}/status`, { action });
      onUpdated(res.data);
      const labels = { issue: 'Issued', complete: 'Completed', check: 'Checked ✓' };
      toast.success(`${lpo.lpoNumber} — ${labels[action]}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setLoadingId(null);
    }
  };

  const updateBatchStatus = async (batchId, action, batchLpos) => {
    setLoadingId(`batch-${batchId}-${action}`);
    try {
      const res = await api.patch(`/lpos/batch/${batchId}/status`, { action });
      res.data.forEach((updated) => onUpdated(updated));
      const labels = { issue: 'Issued', complete: 'Completed', check: 'Checked ✓' };
      toast.success(`Batch (${batchLpos.length} LPOs) — ${labels[action]}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Batch action failed');
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (lpo) => {
    if (!window.confirm(`Delete LPO ${lpo.lpoNumber}?`)) return;
    try {
      await api.delete(`/lpos/${lpo._id}`);
      onDeleted(lpo._id);
      toast.success('LPO deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  if (!lpos || lpos.length === 0) {
    return (
      <>
        <div className="text-center py-10 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
          No LPOs for this day yet.
        </div>
        <EditLPOModal
          open={!!editLpo}
          onClose={() => setEditLpo(null)}
          lpo={editLpo}
          onUpdated={(updated) => { onUpdated(updated); setEditLpo(null); }}
        />
      </>
    );
  }

  const groups = groupLpos(lpos);

  return (
    <div className="overflow-x-auto rounded-lg border border-rekker-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-rekker-border bg-rekker-surface/80">
            {HEADERS.map((h) => (
              <th key={h} className="text-left px-3 py-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group, gi) => {
            const isBatch = !!group.batchId;

            const batchCanIssue    = isBatch && group.lpos.some((l) => !l.issuedAt);
            const batchCanComplete = isBatch && group.lpos.some((l) => l.issuedAt && !l.completedAt);
            const batchCanCheck    = isBatch && group.lpos.some((l) => l.completedAt && !l.checkedAt);
            const batchLoading     = (a) => loadingId === `batch-${group.batchId}-${a}`;

            return group.lpos.map((lpo, li) => {
              const isLoading      = (a) => loadingId === `${lpo._id}-${a}`;
              const isFirstInBatch = li === 0;
              const isDelayed      = lpo.deliveryDate && new Date(lpo.deliveryDate) < new Date() && lpo.status !== 'checked';

              return (
                <tr
                  key={lpo._id}
                  className={cn(
                    'border-b border-rekker-border/50 transition-colors hover:bg-accent/20',
                    gi % 2 === 0 ? 'bg-transparent' : 'bg-rekker-surface/20'
                  )}
                >
                  {/* ── LPO Number (with batch accent + icon) ── */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {isBatch && (
                        <div className={cn(
                          'w-0.5 self-stretch rounded-full mr-0.5',
                          isFirstInBatch ? 'bg-primary/60' : 'bg-primary/30'
                        )} />
                      )}
                      {isBatch && isFirstInBatch && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Layers className="w-3 h-3 text-primary shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>Batch of {group.lpos.length} LPOs</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {isBatch && !isFirstInBatch && <div className="w-3" />}
                      <span className="font-mono text-xs font-semibold text-primary tracking-wider">
                        {lpo.lpoNumber}
                      </span>
                    </div>
                  </td>

                  {/* ── Branch ── */}
                  <td className="px-3 py-3"><BranchCell lpo={lpo} /></td>

                  {/* ── Amount ── */}
                  <td className="px-3 py-3"><AmountCell amount={lpo.amount} /></td>

                  {/* ── Delivery Date ── */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={cn('font-mono text-xs', isDelayed ? 'text-destructive font-semibold' : 'text-foreground')}>
                      {lpo.deliveryDate ? format(new Date(lpo.deliveryDate), 'dd/MM/yy') : '—'}
                      {isDelayed && <span className="ml-1 text-[10px]">LATE</span>}
                    </span>
                  </td>

                  {/* ── Status ── */}
                  <td className="px-3 py-3 whitespace-nowrap"><StatusBadge status={lpo.status} /></td>

                  {/* ── Timestamps ── */}
                  <td className="px-3 py-3"><TimeCell timestamp={lpo.issuedAt}    /></td>
                  <td className="px-3 py-3"><TimeCell timestamp={lpo.completedAt} /></td>
                  <td className="px-3 py-3"><TimeCell timestamp={lpo.checkedAt}   /></td>

                  {/* ── Person ── */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="text-xs text-foreground">{lpo.responsiblePerson?.name || '—'}</span>
                  </td>

                  {/* ── Errors ── */}
                  <td className="px-3 py-3">
                    <ErrorLogger lpo={lpo} onUpdated={onUpdated} canEdit={canEdit} />
                  </td>

                  {/* ── Actions ── */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1 flex-nowrap">
                      {/* Batch-level actions — shown only on first row */}
                      {isBatch && isFirstInBatch && canEdit && (
                        <>
                          {batchCanIssue && (
                            <ActionBtn icon={Send} label="Issue All" title="Issue all in batch" variant="warning"
                              onClick={() => updateBatchStatus(group.batchId, 'issue', group.lpos)}
                              loading={batchLoading('issue')} />
                          )}
                          {batchCanComplete && (
                            <ActionBtn icon={ClipboardCheck} label="Complete All" title="Complete all" variant="default"
                              onClick={() => updateBatchStatus(group.batchId, 'complete', group.lpos)}
                              loading={batchLoading('complete')} />
                          )}
                          {batchCanCheck && (
                            <ActionBtn icon={CheckCheck} label="Check All" title="Check all" variant="success"
                              onClick={() => updateBatchStatus(group.batchId, 'check', group.lpos)}
                              loading={batchLoading('check')} />
                          )}
                          <span className="text-muted-foreground/30 text-xs mx-0.5">|</span>
                        </>
                      )}

                      {/* Individual actions */}
                      {canEdit && !lpo.issuedAt && (
                        <ActionBtn icon={Send} label="" title="Issue this LPO" variant="warning"
                          onClick={() => updateStatus(lpo, 'issue')} loading={isLoading('issue')} />
                      )}
                      {canEdit && lpo.issuedAt && !lpo.completedAt && (
                        <ActionBtn icon={ClipboardCheck} label="" title="Mark completed" variant="default"
                          onClick={() => updateStatus(lpo, 'complete')} loading={isLoading('complete')} />
                      )}
                      {canEdit && lpo.completedAt && !lpo.checkedAt && (
                        <ActionBtn icon={CheckCheck} label="" title="Mark checked" variant="success"
                          onClick={() => updateStatus(lpo, 'check')} loading={isLoading('check')} />
                      )}
                      {canAdmin && (
                        <ActionBtn icon={Pencil} label="" title="Edit LPO" variant="ghost"
                          onClick={() => setEditLpo(lpo)} loading={false} />
                      )}
                      {canDelete && (
                        <ActionBtn icon={Trash2} label="" title="Delete LPO" variant="ghost"
                          onClick={() => handleDelete(lpo)} loading={false} />
                      )}
                    </div>
                  </td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    <EditLPOModal
      open={!!editLpo}
      onClose={() => setEditLpo(null)}
      lpo={editLpo}
      onUpdated={(updated) => { onUpdated(updated); setEditLpo(null); }}
    />
    </div>
  );
}