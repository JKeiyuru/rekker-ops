// server/routes/trips.js — updated
// Key change: POST /trips/start now accepts `firstDestination` so the initial
// stage already has a real toLocation instead of 'en_route'.

const express     = require('express');
const router      = express.Router();
const TripSession = require('../models/TripSession');
const TripStage   = require('../models/TripStage');
const { protect, authorize } = require('../middleware/auth');

const FRESH_ROLES  = ['super_admin', 'admin', 'fresh_team_lead', 'team_lead', 'driver', 'turnboy', 'farm_sourcing', 'market_sourcing'];
const MANAGE_ROLES = ['super_admin', 'admin', 'fresh_team_lead', 'team_lead'];

const SESSION_POPULATE = [
  { path: 'vehicle', select: 'regNumber description' },
  { path: 'driver',  select: 'fullName username' },
  { path: 'helpers', select: 'fullName username' },
  { path: 'currentStage' },
];

// ── GET /api/trips ────────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const { date, status, driverId } = req.query;
    const filter = {};
    if (date)     filter.date   = date;
    if (status)   filter.status = status;
    if (driverId) filter.driver = driverId;

    const fieldRoles = ['driver', 'turnboy', 'farm_sourcing', 'market_sourcing'];
    if (fieldRoles.includes(req.user.role)) {
      filter.$or = [{ driver: req.user._id }, { helpers: req.user._id }];
    }

    const sessions = await TripSession.find(filter)
      .populate(SESSION_POPULATE)
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(sessions);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/trips/live ───────────────────────────────────────────────────────
router.get('/live', protect, async (req, res) => {
  try {
    const sessions = await TripSession.find({ status: 'active' })
      .populate(SESSION_POPULATE)
      .sort({ dayStartTime: 1 });

    const withStages = await Promise.all(sessions.map(async (s) => {
      const stages = await TripStage.find({ session: s._id }).sort({ createdAt: 1 });
      const activeStage = stages.find((st) => st.status === 'in_transit' || st.status === 'arrived');
      const minutesAtCurrentLocation = activeStage?.checkInTime
        ? Math.round((Date.now() - new Date(activeStage.checkInTime)) / 60000)
        : null;
      return { ...s.toObject(), stages, activeStage, minutesAtCurrentLocation };
    }));

    res.json(withStages);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/trips/my-active ──────────────────────────────────────────────────
router.get('/my-active', protect, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
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
// NEW: accepts `firstDestination` so the initial stage has a real toLocation
router.post('/start', protect, async (req, res) => {
  try {
    const { vehicleId, helperIds, startLocation, firstDestination, lat, lng, notes } = req.body;
    if (!vehicleId) return res.status(400).json({ message: 'Vehicle required' });

    const today = new Date().toISOString().split('T')[0];

    // Prevent duplicate active sessions
    const vehicleActive = await TripSession.findOne({ vehicle: vehicleId, status: 'active', date: today });
    if (vehicleActive) return res.status(400).json({ message: 'This vehicle already has an active session today' });

    const userActive = await TripSession.findOne({
      $or: [{ driver: req.user._id }, { helpers: req.user._id }],
      status: 'active', date: today,
    });
    if (userActive) return res.status(400).json({ message: 'You already have an active session today' });

    const now         = new Date();
    const fromLoc     = startLocation || 'Go-Down';
    const toLoc       = firstDestination || 'en_route';

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

    // Create the first transit stage with the real destination
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

    const now = new Date();
    const activeStage = await TripStage.findById(session.currentStage);

    if (activeStage && activeStage.status === 'in_transit') {
      activeStage.toLocation       = location;
      activeStage.checkInTime      = now;
      activeStage.checkInLocation  = { lat: lat || null, lng: lng || null };
      activeStage.checkInGpsStatus = lat ? 'valid' : 'unavailable';
      activeStage.status           = 'arrived';
      activeStage.isOfflineEntry   = !!isOffline;
      if (notes) activeStage.notes = notes;
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

    const now = new Date();
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

    const now = new Date();
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

    const stages       = await TripStage.find({ session: session._id });
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

    const sessions = await TripSession.find(filter).populate('vehicle driver');
    const completed = sessions.filter(s => s.status === 'completed');
    const avgDuration = completed.length
      ? Math.round(completed.reduce((a, s) => a + (s.totalDurationMinutes || 0), 0) / completed.length)
      : 0;

    res.json({
      totalSessions:      sessions.length,
      activeSessions:     sessions.filter(s => s.status === 'active').length,
      completedSessions:  completed.length,
      avgDurationMinutes: avgDuration,
      totalDelayMinutes:  sessions.reduce((a, s) => a + (s.totalDelayMinutes || 0), 0),
      sessions,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;