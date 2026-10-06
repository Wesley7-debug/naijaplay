import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Radio,
  Sparkles,
  Zap,
  Users,
  CalendarDays,
  Shield,
  Trophy,
  MapPin,
  Plus,
  ChevronRight,
  Search,
  UsersRound,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useHomeFeed, useHappeningNow, useLfgGroups, useGames } from '@/hooks/useSharedData';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/ui';
import { Button } from '@/components/ui/button';
import { Card, CardBody, Avatar, EmptyState, Skeleton, ButtonLink } from '@/components/ui/card';
import { formatCount, timeAgo } from '@/lib/utils';
import GlobalChatPanel from '@/components/global/GlobalChatPanel';
import type { RoomSummary, EventSummary } from '@naijaplay/shared';

export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const feed = useHomeFeed();
  const happening = useHappeningNow();
  const lfg = useLfgGroups();
  const games = useGames();

  const playNowMutation = useMutation({
    mutationFn: (body: { gameId?: string | null; category?: string }) => api.post<{ roomCode: string; seekerCount: number; created: boolean }>('/api/home/play-now', body),
    onSuccess: (data) => {
      toast.success(data.created ? 'Room opened!' : 'Joined a room!', data.seekerCount ? `${data.seekerCount} people are ready to play.` : 'Inviting people looking to play…');
      void qc.invalidateQueries({ queryKey: ['home'] });
      navigate(`/r/${data.roomCode}`);
    },
    onError: (err) => toast.error('Could not start', (err as Error).message),
  });

  const surpriseMutation = useMutation({
    mutationFn: () => api.post<{ room: RoomSummary | null; reason: string; message?: string }>('/api/home/surprise-me'),
    onSuccess: (data) => {
      if (!data.room) {
        toast.info("Nobody's outside yet", 'Start the first room and pull your people in.');
        navigate('/create');
        return;
      }
      toast.success('Found one for you', `“${data.room.name}” — ${data.room.memberCount} inside.`);
      navigate(`/rooms/${data.room.slug}`);
    },
    onError: (err) => toast.error('Could not pick a room', (err as Error).message),
  });

  const liveRooms = happening.data?.rooms ?? [];
  const upcomingEvents = feed.data?.upcomingEvents ?? [];
  const crews = feed.data?.crews ?? [];
  const leaderboard = feed.data?.leaderboard ?? [];
  const season = feed.data?.season;
  const lfgGroups = lfg.data?.groups ?? [];

  return (
    <div className="page-shell space-y-8">
      {/* Greeting */}
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="section-kicker">{new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="font-display uppercase text-2xl sm:text-4xl text-paper leading-none mt-1">
            {greeting()}, {user?.displayName?.split(' ')[0]}
          </h1>
          <p className="text-sm text-ink-300 mt-2 font-medium">Outside dey happen. Pick your poison.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="gold"
            onClick={() => surpriseMutation.mutate()}
            loading={surpriseMutation.isPending}
            className="flex-1 sm:flex-none"
          >
            <Sparkles className="h-4 w-4" strokeWidth={2.5} /> Surprise me
          </Button>
          <Button
            onClick={() => playNowMutation.mutate({})}
            loading={playNowMutation.isPending}
            className="flex-1 sm:flex-none"
          >
            <Zap className="h-4 w-4" strokeWidth={2.5} /> Play now
          </Button>
        </div>
      </section>

      {/* Global lobby */}
      <section aria-labelledby="global-title">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="section-kicker">One lobby for everybody</p>
            <h2 id="global-title" className="section-title mt-1">Global chat</h2>
          </div>
          <Link to="/global" className="text-xs font-black uppercase tracking-wider text-naija-400 inline-flex items-center">
            Full chat <ChevronRight className="h-4 w-4" strokeWidth={3} />
          </Link>
        </div>
        <GlobalChatPanel compact />
      </section>

      {/* Happening now */}
      <section aria-labelledby="happening-title">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="section-kicker">Who dey outside?</p>
            <h2 id="happening-title" className="section-title mt-1">Happening now</h2>
          </div>
          <Link to="/discover?tab=live" className="text-xs font-black uppercase tracking-wider text-naija-400 inline-flex items-center">
            See all <ChevronRight className="h-4 w-4" strokeWidth={3} />
          </Link>
        </div>

        {happening.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
          </div>
        ) : liveRooms.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Radio className="h-10 w-10" />}
              title="Street quiet."
              description="Nobody don open room yet. Start the first one."
              action={<ButtonLink to="/create"><Plus className="h-4 w-4" strokeWidth={3} /> Start the first room</ButtonLink>}
            />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {liveRooms.slice(0, 6).map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        )}
      </section>

      {/* Looking for group */}
      <section aria-labelledby="lfg-title">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="section-kicker">No play alone</p>
            <h2 id="lfg-title" className="section-title mt-1">Looking for group</h2>
          </div>
        </div>
        {lfg.isLoading ? (
          <Skeleton className="h-24" />
        ) : lfgGroups.length === 0 ? (
          <Card className="p-4 flex flex-col sm:flex-row items-center gap-3 text-sm text-ink-300 font-medium">
            <span className="inline-flex items-center gap-2"><UsersRound className="h-5 w-5 text-naija-400" /> Nobody dey find group right now. Be the first.</span>
            <Button size="sm" variant="outline" className="sm:ml-auto" onClick={() => playNowMutation.mutate({})} loading={playNowMutation.isPending}>
              <Zap className="h-4 w-4" strokeWidth={2.5} /> Play now
            </Button>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lfgGroups.map((group) => (
              <Card key={group.gameName} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-sm font-bold text-paper">
                    <span className="h-2 w-2 rounded-full bg-naija-400 animate-pulse-live" />
                    {group.count} people {group.gameName.includes('Lag') || group.gameName.includes('Danfo') ? 'playing' : 'looking for'} {group.gameName}
                  </span>
                </div>
                <div className="ticket-cut my-3" aria-hidden />
                <div className="flex items-center justify-between">
                  <div className="flex -space-x-2">
                    {(group.entries as { displayName: string; avatar: string | null }[]).slice(0, 4).map((e, i) => (
                      <Avatar key={i} src={e.avatar} name={e.displayName} size={26} className="!rounded-full" />
                    ))}
                  </div>
                  <Button size="sm" onClick={() => playNowMutation.mutate({ gameId: group.gameId })} loading={playNowMutation.isPending}>
                    Play now
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Scheduled rooms + events */}
      <section aria-labelledby="events-title">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="section-kicker">Make plans</p>
            <h2 id="events-title" className="section-title mt-1">Upcoming events</h2>
          </div>
          <Link to="/events" className="text-xs font-black uppercase tracking-wider text-naija-400 inline-flex items-center">
            All events <ChevronRight className="h-4 w-4" strokeWidth={3} />
          </Link>
        </div>
        {feed.isLoading ? (
          <Skeleton className="h-40" />
        ) : upcomingEvents.length === 0 ? (
          <Card>
            <EmptyState
              icon={<CalendarDays className="h-10 w-10" />}
              title="Nothing planned."
              description="Schedule something and give people reason to show."
              action={<ButtonLink to="/events/new"><Plus className="h-4 w-4" strokeWidth={3} /> Schedule an event</ButtonLink>}
            />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingEvents.slice(0, 6).map((event) => (
              <Link key={event.id} to={`/events/${event.slug}`}>
                <Card className="p-4 h-full hover:-translate-y-1 transition tap">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="sticker sticker-green !text-[10px]">{event.mode}</span>
                    {event.sponsor && <span className="sticker sticker-gold !text-[10px]">Sponsored</span>}
                  </div>
                  <h3 className="font-display uppercase text-paper line-clamp-1">{event.title}</h3>
                  <p className="mt-1 text-xs text-ink-300 font-semibold flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {event.venue || event.city || 'Online'} · {timeAgo(event.startsAt) === 'just now' ? 'now' : new Date(event.startsAt).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <div className="ticket-cut my-3" aria-hidden />
                  <div className="flex items-center gap-3 text-xs text-ink-300 font-bold">
                    <span className="text-naija-400">{event.goingCount} going</span>
                    <span>{event.maybeCount} maybe</span>
                    <span>{event.capacity} cap</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Leaderboard + crews */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="section-kicker">Top dogs</p>
              <h2 className="section-title mt-1">{season?.name || 'Leaderboard'}</h2>
            </div>
            <Link to="/leaderboards" className="text-xs font-black uppercase tracking-wider text-naija-400">Full board</Link>
          </div>
          <Card>
            {feed.isLoading ? (
              <div className="p-4 space-y-3"><Skeleton className="h-8" /><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
            ) : leaderboard.length === 0 ? (
              <EmptyState title="No rankings yet" description="Play, host and compete to climb." />
            ) : (
              <ol className="divide-y-2 divide-ink-700">
                {leaderboard.slice(0, 5).map((entry) => (
                  <li key={entry.rank} className="flex items-center gap-3 px-4 py-3">
                    <span className={`font-display w-6 ${entry.rank === 1 ? 'text-gold-400' : entry.rank === 2 ? 'text-ink-200' : entry.rank === 3 ? 'text-pepper-400' : 'text-ink-600'}`}>
                      {entry.rank}
                    </span>
                    <Avatar src={entry.user?.avatar ?? null} name={entry.user?.displayName || '?'} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-paper">{entry.user?.displayName}</p>
                      <p className="text-xs text-ink-400 font-semibold">@{entry.user?.username}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-naija-400">{formatCount(entry.score)}</p>
                      {entry.tier && <p className="text-[10px] uppercase font-black text-ink-500">{entry.tier.replace('_', ' ')}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="section-kicker">Area wars</p>
              <h2 className="section-title mt-1">Crew Wars</h2>
            </div>
            <Link to="/crews" className="text-xs font-black uppercase tracking-wider text-naija-400">All crews</Link>
          </div>
          <Card>
            {feed.isLoading ? (
              <div className="p-4 space-y-3"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
            ) : crews.length === 0 ? (
              <EmptyState
                title="No crews yet."
                description="Start yours and put your area on the map."
                action={<ButtonLink to="/crews">Start yours</ButtonLink>}
              />
            ) : (
              <ol className="divide-y-2 divide-ink-700">
                {crews.slice(0, 5).map((crew, i) => (
                  <li key={crew.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="font-display w-6 text-ink-600">{i + 1}</span>
                    <Avatar src={crew.avatar} name={crew.name} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-paper uppercase">{crew.name}</p>
                      <p className="text-xs text-ink-400 font-semibold">{crew.memberCount} members · {crew.wins}W {crew.losses}L</p>
                    </div>
                    <span className="font-display text-naija-400">{formatCount(crew.points)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </section>

      {/* Games */}
      <section aria-labelledby="games-title">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="section-kicker">Wetin dem dey play</p>
            <h2 id="games-title" className="section-title mt-1">Games your people play</h2>
          </div>
          <Link to="/games" className="text-xs font-black uppercase tracking-wider text-naija-400">All games</Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(games.data?.items ?? []).slice(0, 8).map((game) => (
            <Link key={game.id} to={`/games/${game.slug}`}>
              <Card className="p-4 text-center hover:border-naija-500 transition tap h-full">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-ink-700 border-2 border-ink-950 font-display text-lg text-naija-400">
                  {game.name.slice(0, 1).toUpperCase()}
                </span>
                <h3 className="mt-2 font-display uppercase text-paper text-xs">{game.name}</h3>
                <p className="mt-1 text-xs text-ink-400 font-semibold">
                  {game.roomsLive ? `${game.roomsLive} live` : game.followersCount ? `${formatCount(game.followersCount)} following` : 'New'}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function RoomCard({ room }: { room: RoomSummary }) {
  const host = room.host as { displayName?: string; avatar?: string | null; username?: string } | null;
  return (
    <Link to={`/rooms/${room.slug}`} className="group">
      <Card className="h-full transition group-hover:-translate-y-1 tap">
        <CardBody>
          <div className="flex items-center justify-between gap-2 mb-2.5">
            {room.status === 'live'
              ? <span className="sticker sticker-red !text-[10px]"><span className="h-1.5 w-1.5 rounded-full bg-paper animate-pulse-live" /> Live</span>
              : <span className="sticker sticker-gold !text-[10px]">Soon</span>}
            <span className="text-[11px] font-black uppercase tracking-wider text-ink-400">{room.category}</span>
          </div>
          <h3 className="font-display uppercase text-paper line-clamp-1 group-hover:text-naija-300 transition">{room.name}</h3>
          {room.description && <p className="mt-1 text-xs text-ink-300 line-clamp-1 font-medium">{room.description}</p>}
          <div className="ticket-cut my-3" aria-hidden />
          <div className="flex items-center justify-between text-xs text-ink-300 font-semibold">
            <span className="inline-flex items-center gap-1.5">
              <Avatar src={host?.avatar ?? null} name={host?.displayName || '?'} size={22} />
              <span className="truncate max-w-[110px]">{host?.displayName}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {room.memberCount}/{room.capacity}
            </span>
          </div>
          {room.location && <p className="mt-1.5 text-[11px] text-ink-400 font-semibold inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {room.location}</p>}
        </CardBody>
      </Card>
    </Link>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
