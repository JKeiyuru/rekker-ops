// client/src/store/invoiceModalStore.js
// Keeps the "New Invoice" dialog alive across page navigation. The open flag
// is persisted so the dialog reappears (with the draft intact) even after a
// route change or a full page reload — it only closes when the user
// explicitly clicks Cancel or the X.

import { create } from 'zustand';
import { clearPersisted } from '@/hooks/usePersistedState';

const OPEN_KEY    = 'invoiceModal:open';
const PREFILL_KEY = 'invoiceModal:prefill';
export const INVOICE_DRAFT_PREFIX = 'invoiceDraft:';

function readOpen() {
  try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; }
}
function readPrefill() {
  try { return JSON.parse(localStorage.getItem(PREFILL_KEY) || 'null'); } catch { return null; }
}

export const useInvoiceModalStore = create((set) => ({
  open: readOpen(),
  prefillLpo: readPrefill(),
  createdTick: 0,
  lastCreated: null,

  openInvoiceModal: (prefillLpo = null) => {
    try {
      localStorage.setItem(OPEN_KEY, '1');
      localStorage.setItem(PREFILL_KEY, JSON.stringify(prefillLpo));
    } catch { /* ignore */ }
    set({ open: true, prefillLpo });
  },

  // Explicit close (Cancel / X / successful create) — discards the draft.
  closeInvoiceModal: () => {
    try {
      localStorage.removeItem(OPEN_KEY);
      localStorage.removeItem(PREFILL_KEY);
    } catch { /* ignore */ }
    clearPersisted(INVOICE_DRAFT_PREFIX);
    set({ open: false, prefillLpo: null });
  },

  markInvoiceCreated: (invoice) =>
    set((s) => ({ createdTick: s.createdTick + 1, lastCreated: invoice })),
}));
