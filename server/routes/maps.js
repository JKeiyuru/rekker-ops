// server/routes/maps.js
// Proxy for Google Maps Places API — keeps the API key server-side.

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

// GET /api/maps/search?q=sarit+mall+nairobi
// Returns place suggestions from the Google Places Autocomplete API
router.get('/search', protect, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ message: 'Query required' });

    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return res.status(503).json({ message: 'Maps API not configured' });

    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&key=${key}&components=country:ke`;
    const response = await fetch(url);
    const data = await response.json();

    const suggestions = (data.predictions || []).map((p) => ({
      placeId: p.place_id,
      description: p.description,
    }));

    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/maps/place/:placeId
// Returns lat/lng for a specific place ID
router.get('/place/:placeId', protect, async (req, res) => {
  try {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return res.status(503).json({ message: 'Maps API not configured' });

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${req.params.placeId}&fields=geometry,name,formatted_address&key=${key}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      return res.status(400).json({ message: data.status });
    }

    const { lat, lng } = data.result.geometry.location;
    res.json({
      lat,
      lng,
      name: data.result.name,
      address: data.result.formatted_address,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
