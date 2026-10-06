import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Users, CalendarPlus, PartyPopper, Gamepad2, Zap } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useGames } from '@/hooks/useSharedData';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Label, FieldError, Select } from '@/components/ui/input';
import { Card, Badge } from '@/components/ui/card';
import { toast } from '@/stores/ui';
import { cn } from '@/lib/utils';
import { ROOM_CATEGORIES, NIGERIAN_AREAS, type GameSummary } from '@naijaplay/shared';
import { useAuthStore } from '@/stores/auth';
import { shareTargets, copyToClipboard } from '@/lib/utils';
import { Modal } from '@/components/ui/modal';

type Mode = 'room' | 'event' | 'quick';

/** Central Create action: room now / schedule room / event / quick play. */
export default function CreatePage() {
  const [mode, setMode] = useState<Mode>('room');
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  return (
    <div className="page-shell max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-white">Create</h1>
        <p className="text-sm text-ink-400 mt-1">Bring your people together.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" role="tablist" aria-label="Create type">
        {(
          [
            { id: 'room', label: 'Room now', desc: 'Go live immediately', icon: Users },
            { id: 'event', label: 'Event', desc: 'Schedule with RSVP', icon: CalendarPlus },
            { id: 'quick', label: 'Quick squad', desc: 'Match me with players', icon: Zap },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => (m.id === 'event' ? navigate('/events/new') : m.id === 'quick' ? quickPlay() : setMode(m.id))}
            className={cn(
              'rounded-2xl border p-4 text-left transition tap',
              mode === m.id ? 'border-naija-500 bg-naija-500/10' : 'border-ink-700 bg-ink-850 hover:border-ink-600',
            )}
          >
            <m.icon className={cn('h-5 w-5 mb-2', mode === m.id ? 'text-naija-400' : 'text-ink-400')} />
            <p className="font-semibold text-white text-sm">{m.label}</p>
            <p className="text-xs text-ink-500 mt-0.5">{m.desc}</p>
          </button>
        ))}
      </div>

      {mode === 'room' && <RoomForm onCreated={(code) => navigate(`/r/${code}`)} />}
      {mode === 'quick' && <QuickPlayCard />}
    </div>
  );

  function quickPlay() {
    void (async () => {
      try {
        const data = await api.post<{ roomCode: string }>('/api/home/play-now', {});
        toast.success('Matched!', 'Taking you in.');
        navigate(`/r/${data.roomCode}`);
      } catch (err) {
        toast.error('Could not match', (err as ApiRequestError).message);
      }
    })();
  }
}

function RoomForm({ onCreated }: { onCreated: (code: string) => void }) {
  const games = useGames();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<(typeof ROOM_CATEGORIES)[number]>('gaming');
  const [gameId, setGameId] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [capacity, setCapacity] = useState(100);
  const [schedule, setSchedule] = useState<'now' | 'schedule'>('now');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [url, setUrl] = useState('');
  const [gameCode, setGameCode] = useState('');
  const [rules, setRules] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [shareLink, setShareLink] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const scheduledAt =
        schedule === 'schedule' && date && time ? new Date(`${date}T${time}`).toISOString() : undefined;
      return api.post<{ room: { code: string; slug: string }; inviteUrl: string }>('/api/rooms', {
        name,
        description,
        category,
        gameId: gameId || null,
        isPrivate,
        capacity,
        mode: schedule,
        scheduledAt,
        externalGameUrl: url || null,
        externalGameCode: gameCode || null,
        rules: rules.split('\n').map((r) => r.trim()).filter(Boolean),
        location: location || null,
      });
    },
    onSuccess: (data) => {
      toast.success(schedule === 'now' ? 'Room is live!' : 'Room scheduled!', `Code: ${data.room.code}`);
      setShareLink(data.inviteUrl);
      if (schedule === 'now') onCreated(data.room.code);
    },
    onError: (err) => setError((err as ApiRequestError).message),
  });

  return (
    <Card className="p-5 space-y-4">
      <div>
        <Label htmlFor="room-name">Room name *</Label>
        <Input
          id="room-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Yaba Game Night — Lagos Run ladder"
          maxLength={80}
          required
        />
        <FieldError message={error} />
      </div>

      <div>
        <Label htmlFor="room-desc">Description</Label>
        <Textarea id="room-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's the vibe? Who is it for?" maxLength={500} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="room-category">Category</Label>
          <Select id="room-category" value={category} onChange={(e) => setCategory(e.target.value as never)}>
            {ROOM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="room-game">Game (optional)</Label>
          <Select id="room-game" value={gameId} onChange={(e) => setGameId(e.target.value)}>
            <option value="">No specific game</option>
            {(games.data?.items ?? []).map((g: GameSummary) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="room-capacity">Capacity</Label>
          <Input id="room-capacity" type="number" min={2} max={5000} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
        </div>
        <div>
          <Label htmlFor="room-location">Area (optional)</Label>
          <Select id="room-location" value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="">Anywhere</option>
            {NIGERIAN_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-ink-200 mb-1.5">Visibility</legend>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setIsPrivate(false)}
            className={cn('chip flex-1 justify-center', !isPrivate && 'chip-active')}
            aria-pressed={!isPrivate}
          >
            Public — anyone can join
          </button>
          <button
            type="button"
            onClick={() => setIsPrivate(true)}
            className={cn('chip flex-1 justify-center', isPrivate && 'chip-active')}
            aria-pressed={isPrivate}
          >
            Private — code required
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-ink-200 mb-1.5">When</legend>
        <div className="flex gap-2">
          <button type="button" onClick={() => setSchedule('now')} className={cn('chip flex-1 justify-center', schedule === 'now' && 'chip-active')} aria-pressed={schedule === 'now'}>
            Start now
          </button>
          <button type="button" onClick={() => setSchedule('schedule')} className={cn('chip flex-1 justify-center', schedule === 'schedule' && 'chip-active')} aria-pressed={schedule === 'schedule'}>
            Schedule
          </button>
        </div>
        {schedule === 'schedule' && (
          <div className="mt-3 grid grid-cols-2 gap-3 animate-slide-up">
            <div>
              <Label htmlFor="room-date">Date</Label>
              <Input id="room-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} />
            </div>
            <div>
              <Label htmlFor="room-time">Time</Label>
              <Input id="room-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
        )}
      </fieldset>

      <details className="rounded-xl border border-ink-700 bg-ink-800/50 p-3">
        <summary className="text-sm font-medium text-ink-300 cursor-pointer select-none">Game link & rules (optional)</summary>
        <div className="mt-3 space-y-3">
          <div>
            <Label htmlFor="room-url">External game URL</Label>
            <Input id="room-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <Label htmlFor="room-code">Game room code</Label>
            <Input id="room-code" value={gameCode} onChange={(e) => setGameCode(e.target.value)} placeholder="e.g. ABC123" maxLength={40} />
          </div>
          <div>
            <Label htmlFor="room-rules">Rules (one per line)</Label>
            <Textarea id="room-rules" value={rules} onChange={(e) => setRules(e.target.value)} placeholder={"No spam\nRespect the hosts\nHave fun"} />
          </div>
        </div>
      </details>

      <Button
        size="lg"
        className="w-full"
        loading={mutation.isPending}
        disabled={!name.trim()}
        onClick={() => {
          setError(undefined);
          if (schedule === 'schedule' && (!date || !time)) {
            setError('Pick a date and time for the scheduled room.');
            return;
          }
          mutation.mutate();
        }}
      >
        {schedule === 'now' ? <><Zap className="h-4 w-4" /> Start room</> : <><CalendarPlus className="h-4 w-4" /> Schedule room</>}
      </Button>

      {shareLink && (
        <ShareModal url={shareLink} title={name} onClose={() => setShareLink(null)} open={Boolean(shareLink)} />
      )}
    </Card>
  );
}

function QuickPlayCard() {
  const navigate = useNavigate();
  const games = useGames();
  const [gameId, setGameId] = useState('');
  const mutation = useMutation({
    mutationFn: () => api.post<{ roomCode: string; seekerCount: number }>('/api/home/play-now', { gameId: gameId || null }),
    onSuccess: (data) => {
      toast.success('Found you a spot', data.seekerCount ? `${data.seekerCount} players invited.` : 'Room ready — inviting players now.');
      navigate(`/r/${data.roomCode}`);
    },
    onError: (err) => toast.error('Match failed', (err as ApiRequestError).message),
  });

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <PartyPopper className="h-5 w-5 text-gold-400" />
        <h2 className="font-display font-bold text-white">Quick squad</h2>
      </div>
      <p className="text-sm text-ink-400">We'll find people looking to play the same thing, join an open quick room or open one for you.</p>
      <div>
        <Label htmlFor="quick-game">Game</Label>
        <Select id="quick-game" value={gameId} onChange={(e) => setGameId(e.target.value)}>
          <option value="">Surprise me</option>
          {(games.data?.items ?? []).map((g: GameSummary) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
      </div>
      <Button size="lg" className="w-full" loading={mutation.isPending} onClick={() => mutation.mutate()}>
        <Zap className="h-4 w-4" /> Play Now
      </Button>
      <p className="text-xs text-ink-500 text-center">No game API needed — this is social matchmaking.</p>
    </Card>
  );
}

export function ShareModal({ url, title, text, open, onClose }: { url: string; title: string; text?: string; open: boolean; onClose: () => void }) {
  const message = text || `Join “${title}” on NaijaPlay`;
  return (
    <Modal open={open} onClose={onClose} title="Share" sheet>
      <div className="space-y-3">
        <p className="text-sm text-ink-400 break-all rounded-xl bg-ink-800 p-3 border border-ink-700">{url}</p>
        <div className="grid grid-cols-3 gap-3">
          <a
            href={shareTargets.whatsapp(url, message)}
            target="_blank"
            rel="noreferrer noopener"
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-ink-700 p-4 text-sm text-white hover:bg-ink-800 tap"
          >
            <span className="text-xl">💬</span> WhatsApp
          </a>
          <a
            href={shareTargets.x(url, message)}
            target="_blank"
            rel="noreferrer noopener"
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-ink-700 p-4 text-sm text-white hover:bg-ink-800 tap"
          >
            <span className="text-xl">𝕏</span> X
          </a>
          <a
            href={shareTargets.telegram(url, message)}
            target="_blank"
            rel="noreferrer noopener"
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-ink-700 p-4 text-sm text-white hover:bg-ink-800 tap"
          >
            <span className="text-xl">✈️</span> Telegram
          </a>
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
            const okCopied = await copyToClipboard(url);
            if (okCopied) toast.success('Link copied');
            else toast.error('Copy failed', 'Long-press the link to copy.');
          }}
        >
          Copy link
        </Button>
      </div>
    </Modal>
  );
}
