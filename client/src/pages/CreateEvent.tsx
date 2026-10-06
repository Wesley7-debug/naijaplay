import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { CalendarPlus } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useGames } from '@/hooks/useSharedData';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Label, FieldError, Select } from '@/components/ui/input';
import { Card, Badge } from '@/components/ui/card';
import { toast } from '@/stores/ui';
import { ROOM_CATEGORIES, NIGERIAN_AREAS, CITIES, type GameSummary } from '@naijaplay/shared';
import { ShareModal } from './Create';

export default function CreateEventPage() {
  const navigate = useNavigate();
  const games = useGames();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'online' | 'irl' | 'both'>('both');
  const [category, setCategory] = useState<(typeof ROOM_CATEGORIES)[number]>('hangout');
  const [gameId, setGameId] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [venue, setVenue] = useState('');
  const [safetyNotes, setSafetyNotes] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [capacity, setCapacity] = useState(100);
  const [rules, setRules] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const startsAt = new Date(`${date}T${time}`).toISOString();
      return api.post<{ event: { slug: string }; shareUrl: string }>('/api/events', {
        title,
        description,
        mode,
        category,
        gameId: gameId || null,
        city: city || null,
        area: area || null,
        venue: venue || null,
        safetyNotes: safetyNotes || null,
        startsAt,
        capacity,
        rules: rules.split('\n').map((r) => r.trim()).filter(Boolean),
      });
    },
    onSuccess: (data) => {
      toast.success('Event scheduled!', 'Share it and watch the RSVPs roll in.');
      setShareUrl(data.shareUrl);
    },
    onError: (err) => setError((err as ApiRequestError).message),
  });

  return (
    <div className="page-shell max-w-2xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-white">Schedule an event</h1>
        <p className="text-sm text-ink-400 mt-1">Online, IRL or both. RSVPs, waitlists and reminders are handled for you.</p>
      </div>

      <Card className="p-5 space-y-4">
        <div>
          <Label htmlFor="ev-title">Title *</Label>
          <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Yaba Game Night" maxLength={100} />
          <FieldError message={error} />
        </div>
        <div>
          <Label htmlFor="ev-desc">Description</Label>
          <Textarea id="ev-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What should people expect?" maxLength={2000} />
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-ink-200 mb-1.5">Format</legend>
          <div className="flex gap-2">
            {(['online', 'irl', 'both'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={`chip flex-1 justify-center uppercase ${mode === m ? 'chip-active' : ''}`} aria-pressed={mode === m}>
                {m}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="ev-cat">Category</Label>
            <Select id="ev-cat" value={category} onChange={(e) => setCategory(e.target.value as never)}>
              {ROOM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="ev-game">Game</Label>
            <Select id="ev-game" value={gameId} onChange={(e) => setGameId(e.target.value)}>
              <option value="">No specific game</option>
              {(games.data?.items ?? []).map((g: GameSummary) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="ev-date">Date *</Label>
            <Input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} />
          </div>
          <div>
            <Label htmlFor="ev-time">Time *</Label>
            <Input id="ev-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ev-cap">Capacity</Label>
            <Input id="ev-cap" type="number" min={1} max={10000} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="ev-city">City</Label>
            <Select id="ev-city" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">Not specified</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
        </div>

        {mode !== 'online' && (
          <div className="grid sm:grid-cols-2 gap-4 animate-slide-up">
            <div>
              <Label htmlFor="ev-area">Area</Label>
              <Select id="ev-area" value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="">Select area</option>
                {NIGERIAN_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="ev-venue">Venue (approximate)</Label>
              <Input id="ev-venue" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Coworking space, Herbert Macaulay Way" />
              <p className="mt-1 text-xs text-ink-500">Share precise details only with RSVPs. Avoid home addresses.</p>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ev-safety">Safety notes (optional)</Label>
              <Textarea id="ev-safety" value={safetyNotes} onChange={(e) => setSafetyNotes(e.target.value)} placeholder="Bring ID, security at the gate…" maxLength={600} />
            </div>
          </div>
        )}

        <div>
          <Label htmlFor="ev-rules">Rules (one per line)</Label>
          <Textarea id="ev-rules" value={rules} onChange={(e) => setRules(e.target.value)} placeholder={'Be on time\nBring your charger'} />
        </div>

        <Button
          size="lg"
          className="w-full"
          loading={mutation.isPending}
          disabled={!title.trim() || !date || !time}
          onClick={() => {
            setError(undefined);
            mutation.mutate();
          }}
        >
          <CalendarPlus className="h-4 w-4" /> Schedule event
        </Button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => navigate('/events')}>Back to events</Button>
      </div>

      {shareUrl && <ShareModal open onClose={() => { setShareUrl(null); navigate('/events'); }} url={shareUrl} title={title} />}
    </div>
  );
}
