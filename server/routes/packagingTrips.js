// server/routes/packagingTrips.js
// Mirror of fresh trips for ordinary-goods deliveries.

const express = require('express');
const router  = express.Router();
const Session = require('../models/PackagingTripSession');
const Stage   = require('../models/PackagingTripStage');
const { protect, authorize } = require('../middleware/auth');

const FIELD_ROLES  = ['goods_driver', 'goods_turnboy', 'merchandiser'];
const MANAGE_ROLES = ['super_admin', 'admin', 'team_lead', 'packaging_team_lead'];

const POPULATE = [
  { path: 'vehicle', select: 'regNumber description' },
  { path: 'driver',  select: 'fullName username role' },
  { path: 'helpers', select: 'fullName username role' },
  { path: 'currentStage' },
  { path: 'linkedLPOs', select: 'lpoNumber branchNameRaw amount' },
];

async function withStages(sessions) {
  if (!sessions.length) return [];
  const ids = sessions.map(s => s._id);
  const stages = await Stage.find({ session: { $in: ids } }).sort({ createdAt: 1 });
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
    if (FIELD_ROLES.includes(req.user.role)) {
      filter.$or = [{ driver: req.user._id }, { helpers: req.user._id }];
    }
    const sessions = await Session.find(filter).populate(POPULATE).sort({ date: -1, createdAt: -1 }).limit(200);
    res.json(await withStages(sessions));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/live', protect, async (req, res) => {
  try {
    const sessions = await Session.find({ status: 'active' }).populate(POPULATE).sort({ dayStartTime: 1 });
    const result = await Promise.all(sessions.map(async s => {
      const stages = await Stage.find({ session: s._id }).sort({ createdAt: 1 });
      const activeStage = stages.find(st => st.status === 'in_transit' || st.status === 'arrived');
      const minutesAtCurrentLocation = activeStage?.checkInTime
        ? Math.round((Date.now() - new Date(activeStage.checkInTime)) / 60000) : null;
      return { ...s.toObject(), stages, activeStage, minutesAtCurrentLocation };
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/my-active', protect, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const session = await Session.findOne({
      $or: [{ driver: req.user._id }, { helpers: req.user._id }],
      status: 'active', date: today,
    }).populate(POPULATE);
    if (!session) return res.json(null);
    const stages = await Stage.find({ session: session._id }).sort({ createdAt: 1 });
    res.json({ ...session.toObject(), stages });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const session = await Session.findById(req.params.id).populate(POPULATE);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    const stages = await Stage.find({ session: session._id }).sort({ createdAt: 1 });
    res.json({ ...session.toObject(), stages });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/start', protect, async (req, res) => {
  try {
    const { vehicleId, helperIds, startLocation, firstDestination, lat, lng, notes, linkedLPOs } = req.body;
    if (!vehicleId) return res.status(400).json({ message: 'Vehicle required' });

    const today = new Date().toISOString().split('T')[0];
    const vehicleActive = await Session.findOne({ vehicle: vehicleId, status: 'active', date: today });
    if (vehicleActive) return res.status(400).json({ message: 'Vehicle already has an active delivery today' });

    const userActive = await Session.findOne({
      $or: [{ driver: req.user._id }, { helpers: req.user._id }],
      status: 'active', date: today,
    });
    if (userActive) return res.status(400).json({ message: 'You already have an active delivery today' });

    const now     = new Date();
    const fromLoc = startLocation || 'Go-Down';
    const toLoc   = firstDestination || 'en_route';

    const session = await Session.create({
      date: today,
      vehicle: vehicleId,
      driver: req.user._id,
      helpers: helperIds || [],
      startLocation: fromLoc,
      status: 'active',
      dayStartTime: now,
      currentLocation: fromLoc,
      linkedLPOs: linkedLPOs || [],
      createdBy: req.user._id,
      notes: notes || '',
    });

    const initialStage = await Stage.create({
      session: session._id,
      fromLocation: fromLoc,
      toLocation: toLoc,
      stageType: 'checkout',
      checkOutTime: now,
      checkOutLocation: { lat: lat || null, lng: lng || null },
      checkOutGpsStatus: lat ? 'valid' : 'unavailable',
      status: 'in_transit',
      loggedBy: req.user._id,
    });

    session.currentStage = initialStage._id;
    session.totalStages = 1;
    await session.save();
    await session.populate(POPULATE);
    res.status(201).json({ ...session.toObject(), stages: [initialStage] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/:id/arrive', protect, async (req, res) => {
  try {
    const { location, lat, lng, notes, isOffline } = req.body;
    if (!location) return res.status(400).json({ message: 'Location required' });
    const session = await Session.findById(req.params.id);
    if (!session || session.status !== 'active') return res.status(400).json({ message: 'No active session' });

    const now = new Date();
    const activeStage = await Stage.findById(session.currentStage);
    if (activeStage && activeStage.status === 'in_transit') {
      activeStage.toLocation = location;
      activeStage.checkInTime = now;
      activeStage.checkInLocation = { lat: lat || null, lng: lng || null };
      activeStage.checkInGpsStatus = lat ? 'valid' : 'unavailable';
      activeStage.status = 'arrived';
      activeStage.isOfflineEntry = !!isOffline;
      if (notes) activeStage.notes = notes;
      if (activeStage.checkOutTime) {
        activeStage.durationMinutes = Math.round((now - new Date(activeStage.checkOutTime)) / 60000);
      }
      await activeStage.save();
    }
    session.currentLocation = location;
    await session.save();
    const stages = await Stage.find({ session: session._id }).sort({ createdAt: 1 });
    await session.populate(POPULATE);
    res.json({ ...session.toObject(), stages });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/:id/depart', protect, async (req, res) => {
  try {
    const { nextLocation, lat, lng, notes, isOffline } = req.body;
    if (!nextLocation) return res.status(400).json({ message: 'Next location required' });
    const session = await Session.findById(req.params.id);
    if (!session || session.status !== 'active') return res.status(400).json({ message: 'No active session' });

    const currentStage = await Stage.findById(session.currentStage);
    if (currentStage && currentStage.status === 'arrived') {
      currentStage.status = 'completed';
      await currentStage.save();
    }
    const now = new Date();
    const newStage = await Stage.create({
      session: session._id,
      fromLocation: session.currentLocation,
      toLocation: nextLocation,
      stageType: 'transit',
      checkOutTime: now,
      checkOutLocation: { lat: lat || null, lng: lng || null },
      checkOutGpsStatus: lat ? 'valid' : 'unavailable',
      status: 'in_transit',
      loggedBy: req.user._id,
      notes: notes || '',
      isOfflineEntry: !!isOffline,
    });
    session.currentStage = newStage._id;
    session.totalStages = (session.totalStages || 0) + 1;
    await session.save();
    const stages = await Stage.find({ session: session._id }).sort({ createdAt: 1 });
    await session.populate(POPULATE);
    res.json({ ...session.toObject(), stages });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/:id/delay', protect, async (req, res) => {
  try {
    const { category, notes, durationMin } = req.body;
    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    const stage = await Stage.findById(session.currentStage);
    if (!stage) return res.status(404).json({ message: 'No active stage' });
    stage.delays.push({ category, notes, durationMin: durationMin || 0, loggedBy: req.user._id, loggedAt: new Date() });
    stage.totalDelayMinutes = (stage.totalDelayMinutes || 0) + (durationMin || 0);
    await stage.save();
    session.totalDelayMinutes = (session.totalDelayMinutes || 0) + (durationMin || 0);
    await session.save();
    res.json(stage);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/:id/end', protect, async (req, res) => {
  try {
    const { lat, lng, notes } = req.body;
    const session = await Session.findById(req.params.id);
    if (!session || session.status !== 'active') return res.status(400).json({ message: 'No active session' });
    const now = new Date();
    const currentStage = await Stage.findById(session.currentStage);
    if (currentStage && currentStage.status !== 'completed') {
      currentStage.checkInTime = currentStage.checkInTime || now;
      currentStage.checkInLocation = { lat: lat || null, lng: lng || null };
      currentStage.status = 'completed';
      if (currentStage.checkOutTime) {
        currentStage.durationMinutes = Math.round((now - new Date(currentStage.checkOutTime)) / 60000);
      }
      await currentStage.save();
    }
    const totalDuration = session.dayStartTime
      ? Math.round((now - new Date(session.dayStartTime)) / 60000) : null;
    session.status = 'completed';
    session.dayEndTime = now;
    session.totalDurationMinutes = totalDuration;
    if (notes) session.notes = notes;
    await session.save();
    const stages = await Stage.find({ session: session._id }).sort({ createdAt: 1 });
    await session.populate(POPULATE);
    res.json({ ...session.toObject(), stages });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    await Stage.deleteMany({ session: req.params.id });
    await Session.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
