// client/src/lib/offlineQueue.js
// Generic offline write queue (localStorage) for the installed PWA.
// Supports check-ins/outs and trip stage actions. Flushed when navigator.onLine.

import toast from 'react-hot-toast';

const STORAGE_KEY = 'rekker_offline_queue_v2';

// ── Internal helpers ──────────────────────────────────────────────────────────
function readQueue() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}
function writeQueue(entries) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }
  catch { /* quota */ }
}
function genId() { return `off_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

// ── Generic enqueue ───────────────────────────────────────────────────────────
// kind: 'CHECKIN' | 'CHECKOUT' | 'TRIP_START' | 'TRIP_ARRIVE' | 'TRIP_DEPART' | 'TRIP_END' | 'TRIP_DELAY'
// req:  { method: 'POST'|'PATCH', url: '/checkins/checkin', body: {...} }
export function enqueue(kind, req, meta = {}) {
  const entry = {
    id: genId(),
    kind,
    method: req.method || 'POST',
    url: req.url,
    body: { ...req.body, isOffline: true, clientId: meta.clientId || genId() },
    occurredAt: meta.occurredAt || new Date().toISOString(),
    meta,
    createdAt: new Date().toISOString(),
    synced: false,
    tries: 0,
  };
  const q = readQueue();
  q.push(entry);
  writeQueue(q);
  return entry;
}

// ── Back-compat helpers (used by older check-in UI) ──────────────────────────
export function enqueueCheckIn({ branchId, branchName, lat, lng, deviceInfo }) {
  return enqueue('CHECKIN', {
    method: 'POST', url: '/checkins/checkin',
    body: { branchId, branchName, lat: lat ?? null, lng: lng ?? null,
      gpsAvailable: lat != null && lng != null, deviceInfo: deviceInfo || '',
      checkInTime: new Date().toISOString() },
  });
}
export function enqueueCheckOut(sessionId, { lat, lng } = {}) {
  return enqueue('CHECKOUT', {
    method: 'PATCH', url: `/checkins/${sessionId}/checkout`,
    body: { lat: lat ?? null, lng: lng ?? null, checkOutTime: new Date().toISOString() },
  }, { sessionId });
}

export function getUnsyncedCount() {
  return readQueue().filter(e => !e.synced).length;
}
export function inspectQueue() { return readQueue(); }
export function clearQueue() { writeQueue([]); }
export function pruneQueue() {
  const q = readQueue();
  const pruned = q.filter(e => !e.synced);
  writeQueue(pruned);
  return q.length - pruned.length;
}

function markSynced(id) {
  const q = readQueue();
  const e = q.find(x => x.id === id);
  if (e) { e.synced = true; e.syncedAt = new Date().toISOString(); writeQueue(q); }
}

// ── Flush ─────────────────────────────────────────────────────────────────────
let syncing = false;
export async function syncQueue(api) {
  if (syncing) return { synced: 0, failed: 0, errors: [] };
  syncing = true;
  try {
    const q = readQueue();
    const pending = q.filter(e => !e.synced).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (pending.length === 0) return { synced: 0, failed: 0, errors: [] };

    let synced = 0, failed = 0;
    const errors = [];

    for (const e of pending) {
      try {
        const method = (e.method || 'POST').toLowerCase();
        const fn = api[method];
        if (!fn) { errors.push(`${e.kind}: unsupported method ${e.method}`); failed++; continue; }
        await fn(e.url, e.body);
        markSynced(e.id);
        synced++;
      } catch (err) {
        const msg = err?.response?.data?.message || err.message || 'unknown';
        // 4xx that means "already exists" — treat as success (idempotency)
        if (err?.response?.status === 400 && /already|duplicate|exists/i.test(msg)) {
          markSynced(e.id); synced++;
        } else {
          // bump tries, keep for next round
          const all = readQueue();
          const ref = all.find(x => x.id === e.id);
          if (ref) { ref.tries = (ref.tries || 0) + 1; writeQueue(all); }
          errors.push(`${e.kind}: ${msg}`);
          failed++;
        }
      }
    }
    pruneQueue();
    if (synced > 0) toast.success(`Synced ${synced} offline action${synced > 1 ? 's' : ''}`);
    if (failed > 0) toast.error(`${failed} offline action${failed > 1 ? 's' : ''} failed to sync`);
    return { synced, failed, errors };
  } finally {
    syncing = false;
  }
}

// ── Auto-flush hook ───────────────────────────────────────────────────────────
let installed = false;
export function installAutoSync(api) {
  if (installed) return;
  installed = true;
  const flush = () => { if (navigator.onLine) syncQueue(api).catch(() => {}); };
  window.addEventListener('online', flush);
  window.addEventListener('focus', flush);
  // Initial attempt
  flush();
}
