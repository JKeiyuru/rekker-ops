// server/routes/maps.js
// Proxy for Google Maps Places API — keeps the API key server-side.

const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');

// GET /api/maps/search?q=sarit+mall+nairobi
router.get('/search', protect, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ message: 'Query required' });

    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return res.status(503).json({ message: 'Maps API not configured — add GOOGLE_MAPS_API_KEY to env' });

    // NOTE: no &components=country:ke so results are not geo-restricted
    // (country restriction can silently cause ZERO_RESULTS if the
    //  data centre IP doesn't match the region bias)
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
                `?input=${encodeURIComponent(q)}` +
                `&key=${key}` +
                `&language=en` +
                `&location=-1.2921,36.8219` +  // Nairobi bias
                `&radius=50000`;               // 50 km bias radius

    const response = await fetch(url);
    const data     = await response.json();

    // Always log the Google status so we can see what's happening in Render logs
    console.log(`[Maps] query="${q}" status=${data.status} predictions=${data.predictions?.length ?? 0}`);

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      // Surface the real error (REQUEST_DENIED, INVALID_REQUEST, etc.)
      console.error('[Maps] Google error:', data.status, data.error_message || '');
      return res.status(502).json({
        message: `Google Maps error: ${data.status}`,
        detail:  data.error_message || '',
      });
    }

    const suggestions = (data.predictions || []).map((p) => ({
      placeId:     p.place_id,
      description: p.description,
    }));

    res.json(suggestions);
  } catch (err) {
    console.error('[Maps] fetch error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/maps/place/:placeId
router.get('/place/:placeId', protect, async (req, res) => {
  try {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return res.status(503).json({ message: 'Maps API not configured' });

    const url = `https://maps.googleapis.com/maps/api/place/details/json` +
                `?place_id=${req.params.placeId}` +
                `&fields=geometry,name,formatted_address` +
                `&key=${key}`;

    const response = await fetch(url);
    const data     = await response.json();

    console.log(`[Maps] place lookup status=${data.status}`);

    if (data.status !== 'OK') {
      console.error('[Maps] Place details error:', data.status, data.error_message || '');
      return res.status(400).json({
        message: `Google Maps error: ${data.status}`,
        detail:  data.error_message || '',
      });
    }

    const { lat, lng } = data.result.geometry.location;
    res.json({
      lat,
      lng,
      name:    data.result.name,
      address: data.result.formatted_address,
    });
  } catch (err) {
    console.error('[Maps] place fetch error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;