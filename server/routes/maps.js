// server/routes/maps.js
// No Google API key required.
// Parses coordinates from a pasted Google Maps URL or raw lat,lng input.

const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');

// ── Extract lat/lng from various Google Maps URL formats ──────────────────────
function parseGoogleMapsUrl(input) {
  if (!input) return null;
  input = input.trim();

  // 1. Raw coordinates: "-1.2921, 36.8219" or "-1.2921,36.8219"
  const rawCoords = input.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (rawCoords) {
    return { lat: parseFloat(rawCoords[1]), lng: parseFloat(rawCoords[2]) };
  }

  // 2. URL with ?q=-1.2921,36.8219 or ?q=place+name@-1.2921,36.8219
  const qParam = input.match(/[?&]q=([^&]*)/);
  if (qParam) {
    const qVal = decodeURIComponent(qParam[1]);
    const coordsInQ = qVal.match(/(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (coordsInQ) {
      return { lat: parseFloat(coordsInQ[1]), lng: parseFloat(coordsInQ[2]) };
    }
  }

  // 3. URL with @lat,lng  e.g. maps/@-1.2921,36.8219,17z
  const atCoords = input.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (atCoords) {
    return { lat: parseFloat(atCoords[1]), lng: parseFloat(atCoords[2]) };
  }

  // 4. URL with /place/.../@lat,lng  (Google Maps place links)
  const placeAt = input.match(/\/place\/[^/]+\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (placeAt) {
    return { lat: parseFloat(placeAt[1]), lng: parseFloat(placeAt[2]) };
  }

  // 5. Embed src with pb=...!3d{lat}!4d{lng}
  const pbCoords = input.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
  if (pbCoords) {
    return { lat: parseFloat(pbCoords[1]), lng: parseFloat(pbCoords[2]) };
  }

  // 6. ll= parameter  e.g. ?ll=-1.2921,36.8219
  const llParam = input.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (llParam) {
    return { lat: parseFloat(llParam[1]), lng: parseFloat(llParam[2]) };
  }

  return null;
}

// POST /api/maps/parse — parse coordinates from a Google Maps link or raw coords
router.post('/parse', protect, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ message: 'URL or coordinates required' });

    const coords = parseGoogleMapsUrl(url);

    if (!coords) {
      return res.status(422).json({
        message: 'Could not extract coordinates. Please paste the full Google Maps link or type coordinates as: -1.2921, 36.8219',
      });
    }

    // Basic sanity check — valid lat/lng ranges
    if (coords.lat < -90 || coords.lat > 90 || coords.lng < -180 || coords.lng > 180) {
      return res.status(422).json({ message: 'Coordinates out of range' });
    }

    console.log(`[Maps] parsed lat=${coords.lat} lng=${coords.lng} from input`);
    res.json({ lat: coords.lat, lng: coords.lng });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;