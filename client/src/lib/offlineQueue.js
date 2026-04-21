// client/src/lib/offlineQueue.js
// Manages local storage of check-in/out events when the device is offline.
// Entries are synced to the server when the connection is restored.

const QUEUE_KEY = 'rekker_offline_checkin_queue';

// ── Read / Write ──────────────────────────────────────────────────────────────

export function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

// ── Add an offline check-in entry ─────────────────────────────────────────────

export function enqueueCheckIn({ branchId, branchName, lat, lng, deviceInfo }) {
  const queue = getQueue();
  const entry = {
    tempId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    branchId,
    branchName,
    checkInTime: new Date().toISOString(),
    checkInLocation: { lat, lng },
    checkOutTime: null,
    checkOutLocation: {},
    deviceInfo: deviceInfo || '',
    synced: false,
  };
  queue.push(entry);
  saveQueue(queue);
  return entry;
}

// ── Add check-out to an existing offline entry ────────────────────────────────

export function enqueueCheckOut(tempId, { lat, lng }) {
  const queue = getQueue();
  const idx = queue.findIndex((e) => e.tempId === tempId);
  if (idx === -1) return false;
  queue[idx].checkOutTime     = new Date().toISOString();
  queue[idx].checkOutLocation = { lat, lng };
  saveQueue(queue);
  return true;
}

// ── Sync all unsynced entries to the server ───────────────────────────────────

export async function syncQueue(apiInstance) {
  const queue = getQueue();
  const unsynced = queue.filter((e) => !e.synced);
  if (!unsynced.length) return { synced: 0 };

  try {
    const res = await apiInstance.post('/checkins/sync', { entries: unsynced });
    const { synced } = res.data;

    // Mark successfully synced entries
    const updatedQueue = queue.map((e) => {
      const wasUnsynced = unsynced.find((u) => u.tempId === e.tempId);
      return wasUnsynced ? { ...e, synced: true } : e;
    });
    // Keep only un-synced (failed) entries plus last 7 days of synced ones
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const pruned = updatedQueue.filter(
      (e) => !e.synced || new Date(e.checkInTime).getTime() > cutoff
    );
    saveQueue(pruned);
    return { synced };
  } catch {
    return { synced: 0, error: true };
  }
}

// ── Get queue size (for badge display) ───────────────────────────────────────

export function getUnsyncedCount() {
  return getQueue().filter((e) => !e.synced).length;
}

// ── Clear synced entries ──────────────────────────────────────────────────────

export function clearSynced() {
  const queue = getQueue().filter((e) => !e.synced);
  saveQueue(queue);
}
