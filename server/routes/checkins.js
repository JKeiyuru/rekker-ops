// server/routes/checkins.js

const express = require('express');
const router = express.Router();
const CheckIn = require('../models/CheckIn');
const Branch = require('../models/Branch');
const Assignment = require('../models/Assignment');
const { protect, authorize } = require('../middleware/auth');

const POPULATE = [
  { path: 'merchandiser', select: 'fullName username' },
  { path: 'branch', select: 'name latitude longitude allowedRadius' },
];

// Roles that can manage merchandising
const MERCH_MANAGE = ['super_admin', 'admin', 'team_lead', 'merchandising_team_lead'];

// ── Haversine distance in meters ──────────────────────────────────────────────
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getLocationStatus(distanceMeters, allowedRadius, gpsAvailable) {
  if (!gpsAvailable || distanceMeters === null) return 'LOCATION_DISABLED';
  return distanceMeters <= allowedRadius ? 'VALID' : 'MISMATCH';
}

// Compute lateness in minutes from expectedCheckIn string ("HH:MM") vs actual Date
function computeLateMinutes(expectedCheckIn, actualTime) {
  if (!expectedCheckIn || !actualTime) return null;
  const [h, m] = expectedCheckIn.split(':').map(Number);
  const expected = new Date(actualTime);
  expected.setHours(h, m, 0, 0);
  return Math.round((new Date(actualTime) - expected) / 60000);
}

// GET /api/checkins
router.get('/', protect, async (req, res) => {
  try {
    const { date, merchandiserId, branchId } = req.query;
    const filter = {};
    if (date)           filter.date = date;
    if (merchandiserId) filter.merchandiser = merchandiserId;
    if (branchId)       filter.branch = branchId;

    // Merchandisers only see their own
    if (req.user.role === 'merchandiser') filter.merchandiser = req.user._id;

    const sessions = await CheckIn.find(filter).populate(POPULATE).sort({ checkInTime: -1 });
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/checkins/my — logged-in user's sessions, optionally by date
router.get('/my', protect, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const sessions = await CheckIn.find({ merchandiser: req.user._id, date })
      .populate(POPULATE)
      .sort({ checkInTime: 1 });
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/checkins/my/history — past sessions for merchandiser dashboard
router.get('/my/history', protect, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(days));
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const sessions = await CheckIn.find({
      merchandiser: req.user._id,
      date: { $gte: cutoffStr },
    }).populate(POPULATE).sort({ date: -1, checkInTime: -1 });

    res.json(sessions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/checkins/summary
router.get('/summary', protect, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const [sessions, assignments] = await Promise.all([
      CheckIn.find({ date }).populate(POPULATE),
      Assignment.find({ date }).populate([
        { path: 'merchandiser', select: 'fullName username' },
        { path: 'branch', select: 'name' },
      ]),
    ]);

    const assignedIds  = new Set(assignments.map((a) => a.merchandiser?._id?.toString()));
    const checkedInIds = new Set(sessions.map((s) => s.merchandiser?._id?.toString()));

    res.json({
      date,
      totalAssigned:    assignments.length,
      totalCheckedIn:   checkedInIds.size,
      totalAbsent:      [...assignedIds].filter((id) => !checkedInIds.has(id)).length,
      totalSessions:    sessions.length,
      completeSessions: sessions.filter((s) => s.sessionStatus === 'COMPLETE').length,
      incompleteSessions: sessions.filter((s) => ['INCOMPLETE', 'ACTIVE'].includes(s.sessionStatus)).length,
      flaggedSessions:  sessions.filter((s) => ['MISMATCH'].includes(s.checkInStatus)).length,
      offlineSessions:  sessions.filter((s) => s.isOfflineEntry).length,
      sessions,
      assignments,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/checkins/reports/merchandiser/:id
router.get('/reports/merchandiser/:id', protect, async (req, res) => {
  try {
    const { start, end } = req.query;
    const filter = { merchandiser: req.params.id };
    if (start || end) {
      filter.date = {};
      if (start) filter.date.$gte = start;
      if (end)   filter.date.$lte = end;
    }

    const sessions     = await CheckIn.find(filter).populate(POPULATE).sort({ checkInTime: -1 });
    const assignments  = await Assignment.find({ merchandiser: req.params.id, ...(filter.date ? { date: filter.date } : {}) });

    const totalMinutes  = sessions.reduce((s, c) => s + (c.durationMinutes || 0), 0);
    const uniqueDates   = new Set(sessions.map((s) => s.date));
    const assignedDates = new Set(assignments.map((a) => a.date));
    const lateSessions  = sessions.filter((s) => s.lateByMinutes != null && s.lateByMinutes > 0);

    res.json({
      totalSessions:      sessions.length,
      completeSessions:   sessions.filter((s) => s.sessionStatus === 'COMPLETE').length,
      incompleteSessions: sessions.filter((s) => ['INCOMPLETE', 'ACTIVE'].includes(s.sessionStatus)).length,
      locationMismatches: sessions.filter((s) => s.checkInStatus === 'MISMATCH').length,
      totalHoursWorked:   (totalMinutes / 60).toFixed(1),
      daysPresent:        uniqueDates.size,
      daysAssigned:       assignedDates.size,
      daysAbsent:         [...assignedDates].filter((d) => !uniqueDates.has(d)).length,
      lateArrivals:       lateSessions.length,
      avgLateMinutes:     lateSessions.length
        ? Math.round(lateSessions.reduce((s, c) => s + c.lateByMinutes, 0) / lateSessions.length)
        : 0,
      sessions,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/checkins/checkin
router.post('/checkin', protect, async (req, res) => {
  try {
    const { branchId, lat, lng, gpsAvailable, deviceInfo, isOfflineEntry, checkInTime } = req.body;
    if (!branchId) return res.status(400).json({ message: 'Branch required' });

    const branch = await Branch.findById(branchId);
    if (!branch) return res.status(404).json({ message: 'Branch not found' });

    const date = (checkInTime ? new Date(checkInTime) : new Date()).toISOString().split('T')[0];

    // Look up assignment for expected time
    const assignment = await Assignment.findOne({
      merchandiser: req.user._id,
      branch: branchId,
      date,
    });

    // Distance calculation
    let distanceMeters = null;
    if (gpsAvailable && lat != null && lng != null && branch.latitude != null && branch.longitude != null) {
      distanceMeters = Math.round(haversineDistance(lat, lng, branch.latitude, branch.longitude));
    }

    const checkInStatus = isOfflineEntry
      ? 'OFFLINE'
      : getLocationStatus(distanceMeters, branch.allowedRadius || 100, gpsAvailable);

    const actualTime = checkInTime ? new Date(checkInTime) : new Date();
    const lateByMinutes = computeLateMinutes(assignment?.expectedCheckIn, actualTime);

    const session = await CheckIn.create({
      merchandiser:          req.user._id,
      branch:                branchId,
      date,
      expectedCheckIn:       assignment?.expectedCheckIn || null,
      lateByMinutes,
      checkInTime:           actualTime,
      checkInLocation:       { lat: lat || null, lng: lng || null },
      checkInDistanceMeters: distanceMeters,
      checkInStatus,
      sessionStatus:         'ACTIVE',
      isOfflineEntry:        !!isOfflineEntry,
      deviceInfo:            deviceInfo || '',
    });

    await session.populate(POPULATE);
    res.status(201).json(session);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/checkins/:id/checkout
router.patch('/:id/checkout', protect, async (req, res) => {
  try {
    const { lat, lng, gpsAvailable, isOfflineEntry, checkOutTime } = req.body;

    const session = await CheckIn.findById(req.params.id).populate('branch');
    if (!session) return res.status(404).json({ message: 'Session not found' });

    if (
      session.merchandiser.toString() !== req.user._id.toString() &&
      !['super_admin', 'admin', 'team_lead', 'merchandising_team_lead'].includes(req.user.role)
    ) {
      return res.status(403).json({ message: 'Not your session' });
    }

    if (session.checkOutTime) return res.status(400).json({ message: 'Already checked out' });

    const outTime = checkOutTime ? new Date(checkOutTime) : new Date();

    let distanceMeters = null;
    if (gpsAvailable && lat != null && lng != null &&
        session.branch?.latitude != null && session.branch?.longitude != null) {
      distanceMeters = Math.round(
        haversineDistance(lat, lng, session.branch.latitude, session.branch.longitude)
      );
    }

    const checkOutStatus = isOfflineEntry
      ? 'OFFLINE'
      : getLocationStatus(distanceMeters, session.branch?.allowedRadius || 100, gpsAvailable);

    const durationMinutes = Math.round((outTime - session.checkInTime) / 60000);
    const isFlagged = session.checkInStatus === 'MISMATCH' || checkOutStatus === 'MISMATCH';

    session.checkOutTime           = outTime;
    session.checkOutLocation       = { lat: lat || null, lng: lng || null };
    session.checkOutDistanceMeters = distanceMeters;
    session.checkOutStatus         = checkOutStatus;
    session.durationMinutes        = durationMinutes;
    session.sessionStatus          = isFlagged ? 'FLAGGED' : 'COMPLETE';
    session.isOfflineEntry         = session.isOfflineEntry || !!isOfflineEntry;

    await session.save();
    await session.populate(POPULATE);
    res.json(session);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/checkins/sync — offline bulk sync
router.post('/sync', protect, async (req, res) => {
  try {
    const { entries } = req.body;
    const results = [];

    for (const entry of entries) {
      try {
        const branch = await Branch.findById(entry.branchId);
        if (!branch) continue;

        const date = entry.checkInTime
          ? new Date(entry.checkInTime).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];

        const existing = await CheckIn.findOne({
          merchandiser: req.user._id,
          branch: entry.branchId,
          date,
          isOfflineEntry: true,
          checkInTime: new Date(entry.checkInTime),
        });
        if (existing) { results.push({ status: 'duplicate' }); continue; }

        const session = await CheckIn.create({
          merchandiser:    req.user._id,
          branch:          entry.branchId,
          date,
          checkInTime:     new Date(entry.checkInTime),
          checkInLocation: entry.checkInLocation || {},
          checkInStatus:   'OFFLINE',
          checkOutTime:    entry.checkOutTime ? new Date(entry.checkOutTime) : null,
          checkOutLocation: entry.checkOutLocation || {},
          checkOutStatus:  entry.checkOutTime ? 'OFFLINE' : null,
          durationMinutes: entry.checkOutTime
            ? Math.round((new Date(entry.checkOutTime) - new Date(entry.checkInTime)) / 60000)
            : null,
          sessionStatus:   entry.checkOutTime ? 'COMPLETE' : 'INCOMPLETE',
          isOfflineEntry:  true,
          deviceInfo:      entry.deviceInfo || '',
        });
        results.push({ status: 'synced', id: session._id });
      } catch (e) {
        results.push({ status: 'error', error: e.message });
      }
    }

    res.json({ synced: results.filter((r) => r.status === 'synced').length, results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/checkins/mark-incomplete
router.patch('/mark-incomplete', protect, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await CheckIn.updateMany(
      { sessionStatus: 'ACTIVE', date: { $lt: today } },
      { $set: { sessionStatus: 'INCOMPLETE' } }
    );
    res.json({ updated: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
