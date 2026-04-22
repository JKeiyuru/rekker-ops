// client/src/components/BranchLocationPicker.jsx
// Search for a location using Google Maps Places API (proxied through the server)
// and confirm lat/lng for a branch.

import { useState, useRef, useEffect } from 'react';
import { Search, MapPin, CheckCircle2, Loader2, Navigation } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

export default function BranchLocationPicker({ value, onChange }) {
  // value = { latitude, longitude, allowedRadius }
  const [query, setQuery]           = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching]   = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [confirmed, setConfirmed]   = useState(
    value?.latitude != null && value?.longitude != null
  );
  const [address, setAddress]       = useState('');
  const debounceRef = useRef(null);

  useEffect(() => {
    if (value?.latitude != null && value?.longitude != null) {
      setConfirmed(true);
    }
  }, [value]);

  const handleSearch = (val) => {
    setQuery(val);
    setConfirmed(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) { setSuggestions([]); setShowDropdown(false); return; }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get('/maps/search', { params: { q: val } });
        setSuggestions(Array.isArray(res.data) ? res.data : []);
        setShowDropdown(true);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const handleSelect = async (suggestion) => {
    setShowDropdown(false);
    setQuery(suggestion.description);
    setSearching(true);
    try {
      const res = await api.get(`/maps/place/${suggestion.placeId}`);
      const { lat, lng, address: addr } = res.data;
      setAddress(addr || suggestion.description);
      setConfirmed(true);
      onChange({
        latitude:      lat,
        longitude:     lng,
        allowedRadius: value?.allowedRadius || 100,
      });
    } catch {
      // fallback: no coords
    } finally {
      setSearching(false);
    }
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setConfirmed(true);
        setQuery(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        setAddress('Current location');
        onChange({ latitude, longitude, allowedRadius: value?.allowedRadius || 100 });
      },
      () => {}
    );
  };

  const isMapsConfigured = true; // optimistic; server returns 503 if not configured

  return (
    <div className="space-y-2">
      {/* Search box */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search for branch location…"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => suggestions.length && setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            className={cn('pl-9', confirmed && 'border-emerald-500/50')}
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Autocomplete dropdown */}
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 rounded-lg border border-border bg-popover shadow-xl overflow-hidden">
            {suggestions.slice(0, 6).map((s) => (
              <button
                key={s.placeId}
                type="button"
                onMouseDown={() => handleSelect(s)}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent transition-colors flex items-start gap-2"
              >
                <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <span className="text-foreground">{s.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Confirmed location display */}
      {confirmed && value?.latitude != null && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-xs text-emerald-400 font-mono">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 truncate">{address || `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}`}</span>
        </div>
      )}

      {/* Radius + use my location */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <label className="text-xs text-muted-foreground font-mono whitespace-nowrap">Radius (m)</label>
          <Input
            type="number"
            min="10"
            max="5000"
            className="h-7 text-sm w-20 font-mono"
            value={value?.allowedRadius ?? 100}
            onChange={(e) => onChange({ ...value, allowedRadius: Number(e.target.value) })}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={handleUseMyLocation}
        >
          <Navigation className="w-3 h-3 mr-1" />
          Use my location
        </Button>
      </div>

      {/* No API key hint */}
      {!process.env.VITE_MAPS_CONFIGURED && (
        <p className="text-[11px] text-muted-foreground font-mono">
          Requires <code>GOOGLE_MAPS_API_KEY</code> in server <code>.env</code>
        </p>
      )}
    </div>
  );
}
