// server/routes/trips.js

const express     = require('express');
const router      = express.Router();
const TripSession = require('../models/TripSession');
const TripStage   = require('../models/TripStage');
const { protect, authorize } = require('../middleware/auth');

const MANAGE_ROLES = ['super_admin', 'admin', 'fresh_team_lead', 'team_lead'];

const SESSION_POPULATE = [
  { path: 'vehicle', select: 'regNumber description' },
  { path: 'driver',  select: 'fullName username role' },
  { path: 'helpers', select: 'fullName username role' },
  { path: 'currentStage' },
];

// Bulk-fetch stages for an array of session objects and attach them
async function withStages(sessions) {
  if (!sessions.length) return [];
  const ids = sessions.map(s => s._id);
  const stages = await TripStage.find({ session: { $in: ids } }).sort({ createdAt: 1 });
  const map = {};
  stages.forEach(st => {
    const k = st.session.toString();
    (map[k] = map[k] || []).push(st);
  });
  return sessions.map(s => {
    const obj = s.toObject ? s.toObject() : s;
    return { ...obj, stages: map[obj._id.toString()] || [] };
  });
}

// ── GET /api/trips ────────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const { date, startDate, endDate, status, driverId } = req.query;
    const filter = {};
    if (date)   filter.date   = date;
    if (status) filter.status = status;
    if (driverId) filter.driver = driverId;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate)   filter.date.$lte = endDate;
    }

    const fieldRoles = ['driver', 'turnboy', 'farm_sourcing', 'market_sourcing'];
    if (fieldRoles.includes(req.user.role)) {
      filter.$or = [{ driver: req.user._id }, { helpers: req.user._id }];
    }

    const sessions = await TripSession.find(filter)
      .populate(SESSION_POPULATE)
      .sort({ date: -1, createdAt: -1 })
      .limit(200);

    res.json(await withStages(sessions));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/trips/live ───────────────────────────────────────────────────────
router.get('/live', protect, async (req, res) => {
  try {
    const sessions = await TripSession.find({ status: 'active' })
      .populate(SESSION_POPULATE)
      .sort({ dayStartTime: 1 });

    const result = await Promise.all(sessions.map(async s => {
      const stages      = await TripStage.find({ session: s._id }).sort({ createdAt: 1 });
      const activeStage = stages.find(st => st.status === 'in_transit' || st.status === 'arrived');
      const minutesAtCurrentLocation = activeStage?.checkInTime
        ? Math.round((Date.now() - new Date(activeStage.checkInTime)) / 60000)
        : null;
      return { ...s.toObject(), stages, activeStage, minutesAtCurrentLocation };
    }));

    res.json(result);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/trips/my-active ──────────────────────────────────────────────────
router.get('/my-active', protect, async (req, res) => {
  try {
    const today   = new Date().toISOString().split('T')[0];
    const session = await TripSession.findOne({
      $or: [{ driver: req.user._id }, { helpers: req.user._id }],
      status: 'active',
      date: today,
    }).populate(SESSION_POPULATE);

    if (!session) return res.json(null);
    const stages = await TripStage.find({ session: session._id }).sort({ createdAt: 1 });
    res.json({ ...session.toObject(), stages });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/trips/reports/summary ───────────────────────────────────────────
router.get('/reports/summary', protect, authorize(...MANAGE_ROLES), async (req, res) => {
  try {
    const { start, end } = req.query;
    const filter = {};
    if (start || end) {
      filter.date = {};
      if (start) filter.date.$gte = start;
      if (end)   filter.date.$lte = end;
    }

    const sessions    = await TripSession.find(filter).populate('vehicle driver helpers');
    const sessionIds  = sessions.map(s => s._id);
    const allStages   = await TripStage.find({ session: { $in: sessionIds } });

    const completed = sessions.filter(s => s.status === 'completed');
    const active    = sessions.filter(s => s.status === 'active');

    // Duration stats
    const avgDuration = completed.length
      ? Math.round(completed.reduce((a, s) => a + (s.totalDurationMinutes || 0), 0) / completed.length)
      : 0;

    const totalDelayMinutes = sessions.reduce((a, s) => a + (s.totalDelayMinutes || 0), 0);

    // Stage duration stats
    const doneStages      = allStages.filter(st => st.status === 'completed' && st.durationMinutes != null);
    const avgStageDuration = doneStages.length
      ? Math.round(doneStages.reduce((a, st) => a + st.durationMinutes, 0) / doneStages.length)
      : null;

    // Most visited locations
    const locCounts = {};
    allStages.forEach(st => {
      if (st.toLocation && st.toLocation !== 'en_route') {
        locCounts[st.toLocation] = (locCounts[st.toLocation] || 0) + 1;
      }
    });
    const topLocations = Object.entries(locCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([location, count]) => ({ location, count }));

    // Delay breakdown by category
    const delayBreakdown = {};
    allStages.forEach(st => {
      (st.delays || []).forEach(d => {
        if (!delayBreakdown[d.category]) delayBreakdown[d.category] = { count: 0, totalMin: 0 };
        delayBreakdown[d.category].count++;
        delayBreakdown[d.category].totalMin += d.durationMin || 0;
      });
    });

    // Vehicle utilization
    const vehicleMap = {};
    sessions.forEach(s => {
      const key = s.vehicle?.regNumber || 'Unknown';
      if (!vehicleMap[key]) vehicleMap[key] = { trips: 0, totalMin: 0, delays: 0 };
      vehicleMap[key].trips++;
      vehicleMap[key].totalMin += s.totalDurationMinutes || 0;
      vehicleMap[key].delays   += s.totalDelayMinutes    || 0;
    });
    const vehicleStats = Object.entries(vehicleMap)
      .map(([reg, v]) => ({ reg, ...v }))
      .sort((a, b) => b.trips - a.trips);

    // Driver performance
    const driverMap = {};
    sessions.forEach(s => {
      const name = s.driver?.fullName || 'Unknown';
      if (!driverMap[name]) driverMap[name] = { trips: 0, totalMin: 0, delays: 0, completed: 0 };
      driverMap[name].trips++;
      driverMap[name].totalMin += s.totalDurationMinutes || 0;
      driverMap[name].delays   += s.totalDelayMinutes    || 0;
      if (s.status === 'completed') driverMap[name].completed++;
    });
    const driverStats = Object.entries(driverMap)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.trips - a.trips);

    res.json({
      totalSessions:     sessions.length,
      activeSessions:    active.length,
      completedSessions: completed.length,
      avgDurationMinutes:avgDuration,
      avgStageDuration,
      totalDelayMinutes,
      totalStages:       allStages.length,
      completedStages:   doneStages.length,
      topLocations,
      delayBreakdown,
      vehicleStats,
      driverStats,
      sessions,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/trips/reports/daily — daily aggregation for charts ───────────────
router.get('/reports/daily', protect, authorize(...MANAGE_ROLES), async (req, res) => {
  try {
    const { start, end } = req.query;
    const match = {};
    if (start || end) {
      match.date = {};
      if (start) match.date.$gte = start;
      if (end)   match.date.$lte = end;
    }

    const daily = await TripSession.aggregate([
      { $match: match },
      {
        $group: {
          _id:            '$date',
          totalSessions:  { $sum: 1 },
          completed:      { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          active:         { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          avgDuration:    { $avg: '$totalDurationMinutes' },
          totalDelayMin:  { $sum: '$totalDelayMinutes' },
          uniqueVehicles: { $addToSet: '$vehicle' },
          totalStages:    { $sum: '$totalStages' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json(daily.map(d => ({
      date:          d._id,
      totalSessions: d.totalSessions,
      completed:     d.completed,
      active:        d.active,
      avgDuration:   d.avgDuration ? Math.round(d.avgDuration) : null,
      totalDelayMin: d.totalDelayMin,
      vehicleCount:  d.uniqueVehicles.length,
      totalStages:   d.totalStages,
    })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/trips/:id ────────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const session = await TripSession.findById(req.params.id).populate(SESSION_POPULATE);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    const stages = await TripStage.find({ session: session._id }).sort({ createdAt: 1 });
    res.json({ ...session.toObject(), stages });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST /api/trips/start ─────────────────────────────────────────────────────
router.post('/start', protect, async (req, res) => {
  try {
    const { vehicleId, helperIds, startLocation, firstDestination, lat, lng, notes } = req.body;
    if (!vehicleId) return res.status(400).json({ message: 'Vehicle required' });

    const today = new Date().toISOString().split('T')[0];

    const vehicleActive = await TripSession.findOne({ vehicle: vehicleId, status: 'active', date: today });
    if (vehicleActive) return res.status(400).json({ message: 'This vehicle already has an active session today' });

    const userActive = await TripSession.findOne({
      $or: [{ driver: req.user._id }, { helpers: req.user._id }],
      status: 'active', date: today,
    });
    if (userActive) return res.status(400).json({ message: 'You already have an active session today' });

    const now     = new Date();
    const fromLoc = startLocation  || 'Go-Down';
    const toLoc   = firstDestination || 'en_route';

    const session = await TripSession.create({
      date:            today,
      vehicle:         vehicleId,
      driver:          req.user._id,
      helpers:         helperIds || [],
      startLocation:   fromLoc,
      status:          'active',
      dayStartTime:    now,
      currentLocation: fromLoc,
      createdBy:       req.user._id,
      notes:           notes || '',
    });

    const initialStage = await TripStage.create({
      session:           session._id,
      fromLocation:      fromLoc,
      toLocation:        toLoc,
      stageType:         'checkout',
      checkOutTime:      now,
      checkOutLocation:  { lat: lat || null, lng: lng || null },
      checkOutGpsStatus: lat ? 'valid' : 'unavailable',
      status:            'in_transit',
      loggedBy:          req.user._id,
    });

    session.currentStage = initialStage._id;
    session.totalStages  = 1;
    await session.save();

    await session.populate(SESSION_POPULATE);
    res.status(201).json({ ...session.toObject(), stages: [initialStage] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST /api/trips/:id/arrive ────────────────────────────────────────────────
router.post('/:id/arrive', protect, async (req, res) => {
  try {
    const { location, lat, lng, notes, isOffline } = req.body;
    if (!location) return res.status(400).json({ message: 'Location required' });

    const session = await TripSession.findById(req.params.id);
    if (!session || session.status !== 'active')
      return res.status(400).json({ message: 'No active session found' });

    const now         = new Date();
    const activeStage = await TripStage.findById(session.currentStage);

    if (activeStage && activeStage.status === 'in_transit') {
      activeStage.toLocation        = location;
      activeStage.checkInTime       = now;
      activeStage.checkInLocation   = { lat: lat || null, lng: lng || null };
      activeStage.checkInGpsStatus  = lat ? 'valid' : 'unavailable';
      activeStage.status            = 'arrived';
      activeStage.isOfflineEntry    = !!isOffline;
      if (notes) activeStage.notes  = notes;
      if (activeStage.checkOutTime) {
        activeStage.durationMinutes = Math.round((now - new Date(activeStage.checkOutTime)) / 60000);
      }
      await activeStage.save();
    }

    session.currentLocation = location;
    await session.save();

    const stages = await TripStage.find({ session: session._id }).sort({ createdAt: 1 });
    await session.populate(SESSION_POPULATE);
    res.json({ ...session.toObject(), stages });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST /api/trips/:id/depart ────────────────────────────────────────────────
router.post('/:id/depart', protect, async (req, res) => {
  try {
    const { nextLocation, lat, lng, notes, isOffline } = req.body;
    if (!nextLocation) return res.status(400).json({ message: 'Next location required' });

    const session = await TripSession.findById(req.params.id);
    if (!session || session.status !== 'active')
      return res.status(400).json({ message: 'No active session' });

    const currentStage = await TripStage.findById(session.currentStage);
    if (currentStage && currentStage.status === 'arrived') {
      currentStage.status = 'completed';
      await currentStage.save();
    }

    const now      = new Date();
    const newStage = await TripStage.create({
      session:           session._id,
      fromLocation:      session.currentLocation,
      toLocation:        nextLocation,
      stageType:         'transit',
      checkOutTime:      now,
      checkOutLocation:  { lat: lat || null, lng: lng || null },
      checkOutGpsStatus: lat ? 'valid' : 'unavailable',
      status:            'in_transit',
      loggedBy:          req.user._id,
      notes:             notes || '',
      isOfflineEntry:    !!isOffline,
    });

    session.currentStage = newStage._id;
    session.totalStages  = (session.totalStages || 0) + 1;
    await session.save();

    const stages = await TripStage.find({ session: session._id }).sort({ createdAt: 1 });
    await session.populate(SESSION_POPULATE);
    res.json({ ...session.toObject(), stages });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST /api/trips/:id/delay ─────────────────────────────────────────────────
router.post('/:id/delay', protect, async (req, res) => {
  try {
    const { category, notes, durationMin } = req.body;
    const session = await TripSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'Session not found' });

    const stage = await TripStage.findById(session.currentStage);
    if (!stage) return res.status(404).json({ message: 'No active stage' });

    stage.delays.push({ category, notes, durationMin: durationMin || 0, loggedBy: req.user._id, loggedAt: new Date() });
    stage.totalDelayMinutes = (stage.totalDelayMinutes || 0) + (durationMin || 0);
    await stage.save();

    session.totalDelayMinutes = (session.totalDelayMinutes || 0) + (durationMin || 0);
    await session.save();
    res.json(stage);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST /api/trips/:id/end ───────────────────────────────────────────────────
router.post('/:id/end', protect, async (req, res) => {
  try {
    const { lat, lng, notes } = req.body;
    const session = await TripSession.findById(req.params.id);
    if (!session || session.status !== 'active')
      return res.status(400).json({ message: 'No active session' });

    const now          = new Date();
    const currentStage = await TripStage.findById(session.currentStage);
    if (currentStage && currentStage.status !== 'completed') {
      currentStage.checkInTime     = currentStage.checkInTime || now;
      currentStage.checkInLocation = { lat: lat || null, lng: lng || null };
      currentStage.status          = 'completed';
      if (currentStage.checkOutTime) {
        currentStage.durationMinutes = Math.round((now - new Date(currentStage.checkOutTime)) / 60000);
      }
      await currentStage.save();
    }

    const stages        = await TripStage.find({ session: session._id });
    const totalDuration = session.dayStartTime
      ? Math.round((now - new Date(session.dayStartTime)) / 60000)
      : null;

    session.status               = 'completed';
    session.dayEndTime           = now;
    session.totalDurationMinutes = totalDuration;
    session.totalStages          = stages.length;
    if (notes) session.notes     = notes;
    await session.save();

    await session.populate(SESSION_POPULATE);
    res.json({ ...session.toObject(), stages });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;