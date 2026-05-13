// server/routes/vehicles.js

const express = require('express');
const router  = express.Router();
const Vehicle = require('../models/Vehicle');
const { protect, authorize } = require('../middleware/auth');

const FRESH_MANAGE = ['super_admin', 'admin', 'fresh_team_lead', 'team_lead'];

// GET /api/vehicles
router.get('/', protect, async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ isActive: true }).sort({ regNumber: 1 });
    res.json(vehicles);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/vehicles/all (admin)
router.get('/all', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const vehicles = await Vehicle.find().sort({ regNumber: 1 });
    res.json(vehicles);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/vehicles
router.post('/', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const { regNumber, description } = req.body;
    if (!regNumber) return res.status(400).json({ message: 'Registration number required' });
    const exists = await Vehicle.findOne({ regNumber: regNumber.toUpperCase() });
    if (exists) return res.status(400).json({ message: 'Vehicle already exists' });
    const vehicle = await Vehicle.create({ regNumber, description, createdBy: req.user._id });
    res.status(201).json(vehicle);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/vehicles/:id
router.put('/:id', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!vehicle) return res.status(404).json({ message: 'Not found' });
    res.json(vehicle);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/vehicles/:id
router.delete('/:id', protect, authorize('super_admin'), async (req, res) => {
  try {
    await Vehicle.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
