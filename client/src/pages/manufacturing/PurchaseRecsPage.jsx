// client/src/pages/manufacturing/PurchaseRecsPage.jsx
// Auto-generated purchase recommendations based on min-stock.

import { useEffect, useState } from 'react';
import { ShoppingBag, Loader2, Phone, Mail } from 'lucide-react';
import api from '@/lib/api';

export default function PurchaseRecsPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/mfg/purchase-recommendations').then(r => setList(r.data || [])).finally(() => setLoading(false));
  }, []);

  const totalEstimate = list.reduce((s, r) => s + Number(r.estimatedCost || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2"><ShoppingBag className="w-6 h-6 text-primary" /> Purchase Recommendations</h1>
        <p className="text-sm text-muted-foreground mt-1">Materials at or below their reorder point — call the supplier and record the receipt.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : list.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl border-rekker-border">
          <p className="text-sm text-muted-foreground">All materials are above their minimum stock. Nothing to order right now.</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border-2 border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-sm">{list.length} material{list.length>1?'s':''} need reordering · estimated total <span className="font-mono font-bold text-primary">KES {totalEstimate.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {list.map(r => (
              <div key={r.material._id} className="rounded-xl border border-rekker-border bg-rekker-surface p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{r.material.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">Stock: <span className="text-amber-500">{Number(r.currentStock).toFixed(2)} {r.material.unit}</span> / min {Number(r.minimumStock).toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Recommended</p>
                    <p className="text-xl font-bold text-primary">{Number(r.recommendedQty).toFixed(2)} {r.material.unit}</p>
                  </div>
                </div>
                <div className="text-xs font-mono text-muted-foreground">@ KES {Number(r.unitPrice).toFixed(2)}/{r.material.unit} · Est. <span className="text-primary">KES {Number(r.estimatedCost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                {r.supplier ? (
                  <div className="rounded-lg border border-rekker-border p-2 text-xs">
                    <p className="font-medium">{r.supplier.name}</p>
                    <div className="flex items-center gap-3 text-muted-foreground mt-1">
                      {r.supplier.phone && <a href={`tel:${r.supplier.phone}`} className="inline-flex items-center gap-1 hover:text-primary"><Phone className="w-3 h-3" /> {r.supplier.phone}</a>}
                      {r.supplier.email && <a href={`mailto:${r.supplier.email}`} className="inline-flex items-center gap-1 hover:text-primary"><Mail className="w-3 h-3" /> {r.supplier.email}</a>}
                    </div>
                  </div>
                ) : <p className="text-xs text-amber-500">No preferred supplier set.</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
