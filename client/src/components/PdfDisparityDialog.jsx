// client/src/components/PdfDisparityDialog.jsx
//
// Optional PDF-driven disparity builder for the packaging invoice workflow.
//
// The user drops in the invoice PDF and the customer LPO PDF (either may be a
// scanned fax — those are OCR'd in the browser), the engine extracts the
// product lines from both and prepares the disparity list:
//   • on the LPO but never invoiced
//   • invoiced in a smaller/larger quantity than ordered
//   • invoiced but not on the LPO
// Nothing is saved until the user reviews the list and clicks Use.

import { useState } from 'react';
import { FileUp, Loader2, CheckCircle2, AlertTriangle, X, ScanLine } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { extractPdfLines } from '@/lib/pdfExtract';
import { parseLineItems, buildDisparities } from '@/lib/docLineItems';

const KIND_LABEL = {
  missing: 'Not invoiced',
  short:   'Short invoiced',
  over:    'Over invoiced',
  extra:   'Not on LPO',
};

const KIND_CLASS = {
  missing: 'bg-destructive/10 text-destructive',
  short:   'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  over:    'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  extra:   'bg-violet-500/15 text-violet-600 dark:text-violet-400',
};

function DropSlot({ label, hint, file, busy, onPick, onClear }) {
  return (
    <div className={cn(
      'rounded-lg border border-dashed p-3 transition-colors',
      file ? 'border-primary/50 bg-primary/5' : 'border-border'
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-sm truncate">{file ? file.name : hint}</p>
        </div>
        {file ? (
          <Button type="button" size="icon" variant="ghost" disabled={busy} onClick={onClear}>
            <X className="w-4 h-4" />
          </Button>
        ) : (
          <FileUp className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </div>
      <Input
        type="file"
        accept="application/pdf,.pdf"
        disabled={busy}
        className="mt-2 h-8 text-xs file:text-xs file:mr-2"
        onChange={(e) => onPick(e.target.files?.[0] || null)}
      />
    </div>
  );
}

export default function PdfDisparityDialog({ open, onOpenChange, onApply }) {
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [lpoFile, setLpoFile]         = useState(null);
  const [busy, setBusy]               = useState(false);
  const [status, setStatus]           = useState('');
  const [error, setError]             = useState('');
  const [result, setResult]           = useState(null); // { invoiceItems, lpoItems, disparities, ocrUsed }
  const [selected, setSelected]       = useState({});

  const reset = () => {
    setInvoiceFile(null); setLpoFile(null); setResult(null);
    setSelected({}); setError(''); setStatus('');
  };

  const close = () => { if (!busy) { reset(); onOpenChange(false); } };

  const run = async () => {
    if (!invoiceFile || !lpoFile) return;
    setBusy(true); setError(''); setResult(null);
    try {
      setStatus('Reading invoice…');
      const inv = await extractPdfLines(invoiceFile, { onProgress: (m) => setStatus(`Invoice — ${m}`) });
      setStatus('Reading LPO…');
      const lpo = await extractPdfLines(lpoFile, { onProgress: (m) => setStatus(`LPO — ${m}`) });

      const invoiceItems = parseLineItems(inv.lines);
      const lpoItems     = parseLineItems(lpo.lines);

      if (!invoiceItems.length && !lpoItems.length) {
        setError('No product lines could be read from either document. You can still enter the products manually.');
        setBusy(false); setStatus('');
        return;
      }

      const { disparities } = buildDisparities(lpoItems, invoiceItems);
      setResult({ invoiceItems, lpoItems, disparities, ocrUsed: inv.ocrUsed || lpo.ocrUsed });
      setSelected(Object.fromEntries(disparities.map((_, i) => [i, true])));
      setStatus('');
    } catch (e) {
      setError(e?.message || 'Failed to read the PDFs.');
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    const rows = (result?.disparities || [])
      .filter((_, i) => selected[i])
      .map((d) => ({
        product: d.product,
        quantity: d.quantity,
        unit: d.unit || '',
        note: d.note || '',
      }));
    onApply(rows);
    reset();
    onOpenChange(false);
  };

  const chosenCount = Object.values(selected).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-primary" /> Build disparities from PDFs
          </DialogTitle>
          <DialogDescription>
            Upload the invoice and the customer LPO. Scanned or faxed documents are read with
            on-device text recognition, so they may take a few seconds.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <DropSlot
            label="Invoice PDF" hint="What we actually invoiced"
            file={invoiceFile} busy={busy}
            onPick={(f) => { setInvoiceFile(f); setResult(null); }}
            onClear={() => { setInvoiceFile(null); setResult(null); }}
          />
          <DropSlot
            label="LPO PDF" hint="What the customer ordered"
            file={lpoFile} busy={busy}
            onPick={(f) => { setLpoFile(f); setResult(null); }}
            onClear={() => { setLpoFile(null); setResult(null); }}
          />
        </div>

        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> {status || 'Working…'}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono">
                LPO lines read: {result.lpoItems.length}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono">
                Invoice lines read: {result.invoiceItems.length}
              </span>
              {result.ocrUsed && (
                <span className="rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 font-mono">
                  Scanned document — please double-check the values
                </span>
              )}
            </div>

            {result.disparities.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" /> Every LPO product was invoiced in full — no disparity products.
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-2 w-8" />
                      <th className="p-2 text-left">Product</th>
                      <th className="p-2 text-right">LPO</th>
                      <th className="p-2 text-right">Invoiced</th>
                      <th className="p-2 text-right">Disparity qty</th>
                      <th className="p-2 text-left">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.disparities.map((d, i) => (
                      <tr key={i} className="border-t border-border/60">
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={!!selected[i]}
                            onChange={(e) => setSelected((s) => ({ ...s, [i]: e.target.checked }))}
                          />
                        </td>
                        <td className="p-2">{d.product}</td>
                        <td className="p-2 text-right font-mono">{d.lpoQty ?? '—'}</td>
                        <td className="p-2 text-right font-mono">{d.invoiceQty ?? '—'}</td>
                        <td className="p-2 text-right font-mono font-semibold">{d.quantity}</td>
                        <td className="p-2">
                          <span className={cn('rounded px-1.5 py-0.5 text-[11px]', KIND_CLASS[d.kind])}>
                            {KIND_LABEL[d.kind] || d.kind}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
          {!result ? (
            <Button type="button" onClick={run} disabled={busy || !invoiceFile || !lpoFile}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
              Analyse documents
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => setResult(null)} disabled={busy}>
                Re-run
              </Button>
              <Button type="button" onClick={apply} disabled={chosenCount === 0}>
                Use {chosenCount} product{chosenCount === 1 ? '' : 's'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
