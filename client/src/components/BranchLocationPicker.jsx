// client/src/components/BranchLocationPicker.jsx
// No Google API key required.
// Admin pastes a Google Maps share link (or types raw coordinates)
// and the system extracts lat/lng from it.

import { useState } from 'react';
import { Link, CheckCircle2, AlertCircle, Loader2, Navigation, HelpCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

// Instructions for how to get a shareable link from Google Maps
const HOW_TO = [
  'Open Google Maps on your phone or computer',
  'Search for the branch location',
  'Tap the location pin or result card',
  'Tap "Share" → "Copy link"',
  'Paste the link below',
];

export default function BranchLocationPicker({ value, onChange }) {
  // value = { latitude, longitude, allowedRadius }
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [confirmed, setConfirmed] = useState(
    value?.latitude != null && value?.longitude != null
  );
  const [showHelp, setShowHelp] = useState(false);

  const handleParse = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/maps/parse', { url: input.trim() });
      setConfirmed(true);
      onChange({
        latitude:      res.data.lat,
        longitude:     res.data.lng,
        allowedRadius: value?.allowedRadius ?? 100,
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not read coordinates from that link');
      setConfirmed(false);
    } finally {
      setLoading(false);
    }
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError('GPS not available on this device');
      return;
    }
    setLoading(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setInput(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        setConfirmed(true);
        setLoading(false);
        onChange({ latitude, longitude, allowedRadius: value?.allowedRadius ?? 100 });
      },
      () => {
        setError('Could not get your location. Check browser permissions.');
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleClear = () => {
    setInput('');
    setConfirmed(false);
    setError('');
    onChange({ latitude: null, longitude: null, allowedRadius: value?.allowedRadius ?? 100 });
  };

  return (
    <div className="space-y-3">
      {/* Input row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Paste Google Maps link or type: -1.2921, 36.8219"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setConfirmed(false);
              setError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleParse()}
            className={cn(
              'pl-9 text-sm',
              confirmed && 'border-emerald-500/50',
              error && 'border-destructive/50'
            )}
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleParse}
          disabled={loading || !input.trim()}
          className="shrink-0"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Set'}
        </Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="shrink-0 px-2"
                onClick={() => setShowHelp((h) => !h)}
              >
                <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>How to get a Google Maps link</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* How-to instructions (collapsible) */}
      {showHelp && (
        <div className="rounded-lg border border-border bg-accent/20 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-foreground">How to get a Google Maps link:</p>
          {HOW_TO.map((step, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">
                {i + 1}
              </span>
              {step}
            </div>
          ))}
          <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
            <span className="text-foreground font-medium">Alternative:</span> If you're physically at the branch,
            click "Use my location" below to capture coordinates directly.
          </p>
        </div>
      )}

      {/* Confirmed display */}
      {confirmed && value?.latitude != null && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-xs text-emerald-400 font-mono">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">
            {value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}
          </span>
          <button
            type="button"
            onClick={handleClear}
            className="text-muted-foreground hover:text-foreground text-[10px] underline"
          >
            clear
          </button>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-destructive/30 bg-destructive/5 text-xs text-destructive">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Bottom row: use my location + radius */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleUseMyLocation}
          disabled={loading}
        >
          <Navigation className="w-3 h-3 mr-1.5" />
          Use my location
        </Button>

        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-muted-foreground font-mono whitespace-nowrap">
            Allowed radius
          </label>
          <Input
            type="number"
            min="10"
            max="5000"
            className="h-7 text-sm w-20 font-mono"
            value={value?.allowedRadius ?? 100}
            onChange={(e) =>
              onChange({ ...value, allowedRadius: Number(e.target.value) })
            }
          />
          <span className="text-xs text-muted-foreground">m</span>
        </div>
      </div>

      {/* What formats are accepted */}
      <p className="text-[11px] text-muted-foreground font-mono leading-relaxed">
        Accepts: Google Maps share links · maps.app.goo.gl links · raw coordinates (-1.2921, 36.8219)
      </p>
    </div>
  );
}