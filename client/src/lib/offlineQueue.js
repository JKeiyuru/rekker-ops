// client/src/lib/offlineQueue.js
// Lightweight localStorage-backed queue for offline check-ins and check-outs.
// When the device comes back online, call syncQueue(api) to flush pending entries.
//
// Storage key: "merch_offline_queue"
// Each entry: { type, tempId, payload, createdAt }

const STORAGE_KEY = 'merch_offline_queue';

// ── Internal helpers ──────────────────────────────────────────────────────────
function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeQueue(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    console.warn('[offlineQueue] Could not persist queue to localStorage');
  }
}

function generateTempId() {
  return `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Queue a check-in for later sync.
 * Returns the queued entry (including tempId for optimistic UI updates).
 */
export function enqueueCheckIn({ branchId, branchName, lat, lng, deviceInfo }) {
  const entry = {
    type:        'CHECKIN',
    tempId:      generateTempId(),
    checkInTime: new Date().toISOString(),
    payload: {
      branchId,
      branchName,
      lat:          lat    ?? null,
      lng:          lng    ?? null,
      gpsAvailable: lat != null && lng != null,
      deviceInfo:   deviceInfo || '',
      isOfflineEntry: true,
    },
    createdAt: new Date().toISOString(),
    synced:    false,
  };

  const queue = readQueue();
  queue.push(entry);
  writeQueue(queue);
  return entry;
}

/**
 * Queue a check-out for a given session.
 * sessionId may be a real Mongo _id or a tempId (for sessions queued offline).
 */
export function enqueueCheckOut(sessionId, { lat, lng } = {}) {
  const queue = readQueue();

  // If the check-in for this session is still in the queue (same tempId),
  // just patch it directly with checkOutTime rather than adding a second entry.
  const existingCheckIn = queue.find(
    (e) => e.type === 'CHECKIN' && e.tempId === sessionId && !e.synced
  );

  if (existingCheckIn) {
    existingCheckIn.payload.checkOutTime     = new Date().toISOString();
    existingCheckIn.payload.checkOutLocation = { lat: lat ?? null, lng: lng ?? null };
    writeQueue(queue);
    return existingCheckIn;
  }

  // Otherwise add a separate checkout entry.
  const entry = {
    type:         'CHECKOUT',
    tempId:       generateTempId(),
    sessionId,
    checkOutTime: new Date().toISOString(),
    payload: {
      lat:            lat ?? null,
      lng:            lng ?? null,
      gpsAvailable:   lat != null && lng != null,
      isOfflineEntry: true,
    },
    createdAt: new Date().toISOString(),
    synced:    false,
  };

  queue.push(entry);
  writeQueue(queue);
  return entry;
}

/**
 * Returns the number of unsynced entries.
 */
export function getUnsyncedCount() {
  return readQueue().filter((e) => !e.synced).length;
}

/**
 * Sync all pending queue entries to the server.
 * @param {AxiosInstance} api — your configured Axios instance
 * @returns {{ synced: number, failed: number, errors: string[] }}
 */
export async function syncQueue(api) {
  const queue   = readQueue();
  const pending = queue.filter((e) => !e.synced);
  if (pending.length === 0) return { synced: 0, failed: 0, errors: [] };

  let synced = 0;
  let failed = 0;
  const errors = [];

  // Process entries in chronological order
  const sorted = [...pending].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // tempId → real serverId map (for resolving CHECKOUT entries that follow a CHECKIN)
  const idMap = {};

  for (const entry of sorted) {
    try {
      if (entry.type === 'CHECKIN') {
        const res = await api.post('/checkins/checkin', {
          ...entry.payload,
          checkInTime: entry.checkInTime,
        });
        idMap[entry.tempId] = res.data._id;

        // If checkout was baked into the same entry, do it now
        if (entry.payload.checkOutTime) {
          await api.patch(`/checkins/${res.data._id}/checkout`, {
            lat:            entry.payload.checkOutLocation?.lat ?? null,
            lng:            entry.payload.checkOutLocation?.lng ?? null,
            gpsAvailable:   false,
            isOfflineEntry: true,
            checkOutTime:   entry.payload.checkOutTime,
          });
        }

        markSynced(entry.tempId);
        synced++;
      } else if (entry.type === 'CHECKOUT') {
        // Resolve real server ID (might have been queued before we had it)
        const realId = idMap[entry.sessionId] || entry.sessionId;
        if (!realId || realId.startsWith('offline_')) {
          // Can't resolve yet — leave for next sync
          errors.push(`Could not resolve session ID for checkout ${entry.tempId}`);
          failed++;
          continue;
        }

        await api.patch(`/checkins/${realId}/checkout`, {
          ...entry.payload,
          checkOutTime: entry.checkOutTime,
        });

        markSynced(entry.tempId);
        synced++;
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Unknown error';
      errors.push(`${entry.type} ${entry.tempId}: ${msg}`);

      // If already exists on server (duplicate), mark as synced anyway
      if (err?.response?.status === 400 && msg.toLowerCase().includes('already')) {
        markSynced(entry.tempId);
        synced++;
      } else {
        failed++;
      }
    }
  }

  return { synced, failed, errors };
}

/**
 * Mark a specific entry as synced by tempId.
 */
function markSynced(tempId) {
  const queue = readQueue();
  const entry = queue.find((e) => e.tempId === tempId);
  if (entry) {
    entry.synced   = true;
    entry.syncedAt = new Date().toISOString();
    writeQueue(queue);
  }
}

/**
 * Remove all synced entries from the queue (housekeeping).
 * Call this periodically or after a successful full sync.
 */
export function pruneQueue() {
  const queue   = readQueue();
  const pruned  = queue.filter((e) => !e.synced);
  writeQueue(pruned);
  return queue.length - pruned.length; // number removed
}

/**
 * Return a read-only copy of the full queue (for debugging).
 */
export function inspectQueue() {
  return readQueue();
}

/**
 * Clear the entire queue (use with caution — for dev/testing only).
 */
export function clearQueue() {
  writeQueue([]);
}