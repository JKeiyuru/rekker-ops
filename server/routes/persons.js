// server/routes/persons.js

const express = require('express');
const router = express.Router();
const ResponsiblePerson = require('../models/ResponsiblePerson');
const { protect, authorize } = require('../middleware/auth');

// GET /api/persons
router.get('/', protect, async (req, res) => {
  try {
    const persons = await ResponsiblePerson.find({ isActive: true }).sort({ name: 1 });
    res.json(persons);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/persons/all (include inactive, for admin management)
router.get('/all', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const persons = await ResponsiblePerson.find().sort({ name: 1 });
    res.json(persons);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/persons
router.post('/', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Name required' });
    const person = await ResponsiblePerson.create({ name, createdBy: req.user._id });
    res.status(201).json(person);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/persons/:id
router.put('/:id', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const { name, isActive } = req.body;
    const person = await ResponsiblePerson.findByIdAndUpdate(
      req.params.id,
      { name, isActive },
      { new: true }
    );
    if (!person) return res.status(404).json({ message: 'Person not found' });
    res.json(person);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/persons/:id
router.delete('/:id', protect, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    await ResponsiblePerson.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
