import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Radio, KeyRound, Users, MapPin } from 'lucide-react';
import { useRooms, useMyRooms } from '@/hooks/useSharedData';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardBody, Badge, LiveBadge, Avatar, EmptyState, Skeleton, ButtonLink } from '@/components/ui/card';
import { toast } from '@/stores/ui';
import type { RoomSummary } from '@naijaplay/shared';

const STATUSES = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'scheduled', label: 'Scheduled' },
];

export default function RoomsPage() {
  const [status, setStatus] = useState('all');
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const navigate = useNavigate();
  const rooms = useRooms(status);
  const mine = useMyRooms();

  async function joinByCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setJoining(true);
    try {
      const data = await api.post<{ roomId: string; slug: string }>('/api/rooms/join-by-code', { code: code.trim() });
      toast.success('Joined!', 'Taking you to the room.');
      navigate(`/rooms/${data.slug}`);
    } catch (err) {
      toast.error('Could not join', (err as Error).message);
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="page-shell space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-white">Rooms</h1>
          <p className="text-sm text-ink-400">Live sessions around games, football, campus and vibes.</p>
        </div>
        <ButtonLink to="/create"><Plus className="h-4 w-4" /> Create</ButtonLink>
      </div>

      {/* Join by code */}
      <Card className="p-4">
        <form onSubmit={joinByCode} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-500" aria-hidden />
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Have a code? e.g. LAG-8X2K"
              className="pl-9"
              aria-label="Room code"
            />
          </div>
          <Button type="submit" loading={joining} disabled={!code.trim()}>Join room</Button>
        </form>
      </Card>

      {/* My rooms */}
      {(mine.data?.items?.length ?? 0) > 0 && (
        <section>
          <h2 className="section-title mb-3">Your rooms</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mine.data!.items.slice(0, 6).map((room) => <RoomCard key={room.id} room={room} />)}
          </div>
        </section>
      )}

      {/* Filters */}
      <div className="flex gap-2" role="tablist" aria-label="Room status">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={status === s.id}
            onClick={() => setStatus(s.id)}
            className={`chip ${status === s.id ? 'chip-active' : ''}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {rooms.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : (rooms.data?.items?.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            icon={<Radio className="h-10 w-10" />}
            title="Nobody's outside yet."
            description="Start the first room and pull your people in."
            action={<ButtonLink to="/create"><Plus className="h-4 w-4" /> Start the first room</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.data!.items.map((room) => <RoomCard key={room.id} room={room} />)}
        </div>
      )}
    </div>
  );
}

export function RoomCard({ room }: { room: RoomSummary }) {
  const host = room.host as { displayName?: string; avatar?: string | null } | null;
  return (
    <Link to={`/rooms/${room.slug}`} className="group">
      <Card className="h-full transition group-hover:border-ink-500 tap">
        <CardBody>
          <div className="flex items-center justify-between gap-2 mb-2.5">
            {room.status === 'live' ? <LiveBadge /> : room.status === 'scheduled' ? <Badge tone="gold">Scheduled</Badge> : <Badge>Ended</Badge>}
            <Badge tone="outline">{room.category}</Badge>
          </div>
          <h3 className="font-display font-bold text-white group-hover:text-naija-300 transition line-clamp-2">{room.name}</h3>
          {room.description && <p className="mt-1 text-xs text-ink-400 line-clamp-2">{room.description}</p>}
          <div className="mt-3 flex items-center gap-2">
            <Avatar src={host?.avatar ?? null} name={host?.displayName || '?'} size={24} />
            <span className="text-xs text-ink-300 truncate">{host?.displayName}</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-ink-400">
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {room.memberCount}/{room.capacity}</span>
            {room.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {room.location}</span>}
            {room.isPrivate && <Badge tone="danger">Private</Badge>}
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}
