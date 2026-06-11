// server/routes/notifications.js

const express = require('express');
const router  = express.Router();
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');

router.get('/', protect, async (req, res) => {
  try {
    const { unread } = req.query;
    const filter = { user: req.user._id };
    if (unread === 'true') filter.readAt = null;
    const list = await Notification.find(filter).sort({ createdAt: -1 }).limit(100);
    const unreadCount = await Notification.countDocuments({ user: req.user._id, readAt: null });
    res.json({ items: list, unreadCount });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch('/:id/read', protect, async (req, res) => {
  try {
    const n = await Notification.findOne({ _id: req.params.id, user: req.user._id });
    if (!n) return res.status(404).json({ message: 'Not found' });
    n.readAt = new Date();
    await n.save();
    res.json(n);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/read-all', protect, async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
