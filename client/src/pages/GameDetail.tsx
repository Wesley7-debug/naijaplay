import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Gamepad2, Users, CalendarDays, Trophy, Camera, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { useGame } from '@/hooks/useSharedData';
import { toast } from '@/stores/ui';
import { Button } from '@/components/ui/button';
import { Card, Badge, LiveBadge, Avatar, Skeleton, EmptyState, ButtonLink } from '@/components/ui/card';
import { LoadingScreen, ErrorState } from '@/components/ui/feedback';
import { formatCount, timeAgo, cn } from '@/lib/utils';

export default function GameDetailPage() {
  const { slug } = useParams();
  const query = useGame(slug);
  const qc = useQueryClient();
  const [scoreOpen, setScoreOpen] = useState(false);
  const [score, setScore] = useState('');
  const [gameUsername, setGameUsername] = useState('');
  const [screenshot, setScreenshot] = useState('');

  const followMutation = useMutation({
    mutationFn: (follow: boolean) => api.post(`/api/games/${query.data?.game.id}/${follow ? 'follow' : 'unfollow'}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['game', slug] });
      toast.success('Updated');
    },
    onError: (err) => toast.error('Could not update', (err as Error).message),
  });

  const scoreMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/games/${query.data?.game.id}/scores`, {
        score: Number(score),
        gameUsername: gameUsername || undefined,
        screenshotUrl: screenshot || undefined,
      }),
    onSuccess: () => {
      toast.success('Score submitted', 'Pending community verification.');
      setScoreOpen(false);
      setScore('');
      setScreenshot('');
      void qc.invalidateQueries({ queryKey: ['game', slug] });
    },
    onError: (err) => toast.error('Could not submit', (err as Error).message),
  });

  if (query.isLoading) return <LoadingScreen label="Loading game…" />;
  if (query.isError || !query.data) {
    return <div className="page-shell"><Card><ErrorState onRetry={() => query.refetch()} /></Card></div>;
  }

  const { game, isFollowing, liveRooms, upcomingEvents, seasons, moments, topScores } = query.data;

  return (
    <div className="page-shell space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-ink-700 shrink-0">
            <Gamepad2 className="h-8 w-8 text-naija-400" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-extrabold text-white">{game.name}</h1>
            <p className="text-sm text-ink-400 mt-1 line-clamp-2">{game.description || 'Community favourite.'}</p>
            <p className="mt-2 text-xs text-ink-500">
              {formatCount(game.followersCount ?? 0)} following · Informational directory — no game API integration
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={isFollowing ? 'secondary' : 'primary'}
              loading={followMutation.isPending}
              onClick={() => followMutation.mutate(!isFollowing)}
            >
              <Star className={cn('h-4 w-4', isFollowing && 'fill-gold-400 text-gold-400')} />
              {isFollowing ? 'Following' : 'Follow'}
            </Button>
            <Button variant="outline" onClick={() => setScoreOpen((s) => !s)}>
              Post score
            </Button>
          </div>
        </div>

        {scoreOpen && (
          <div className="mt-4 rounded-2xl border border-ink-700 bg-ink-800 p-4 grid sm:grid-cols-3 gap-3 animate-slide-up">
            <div>
              <label className="text-xs text-ink-400 block mb-1" htmlFor="score-input">Your score</label>
              <input id="score-input" value={score} onChange={(e) => setScore(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="800000" className="h-11 w-full rounded-xl border border-ink-600 bg-ink-850 px-3 text-sm" />
            </div>
            <div>
              <label className="text-xs text-ink-400 block mb-1" htmlFor="score-user">Game username (optional)</label>
              <input id="score-user" value={gameUsername} onChange={(e) => setGameUsername(e.target.value)} className="h-11 w-full rounded-xl border border-ink-600 bg-ink-850 px-3 text-sm" />
            </div>
            <div>
              <label className="text-xs text-ink-400 block mb-1" htmlFor="score-shot">Screenshot URL (optional)</label>
              <input id="score-shot" value={screenshot} onChange={(e) => setScreenshot(e.target.value)} placeholder="https://…" className="h-11 w-full rounded-xl border border-ink-600 bg-ink-850 px-3 text-sm" />
            </div>
            <div className="sm:col-span-3 flex items-center justify-between gap-3">
              <p className="text-xs text-ink-500">Self-reported. Hosts can mark it Verified/Unverified — never official.</p>
              <Button size="sm" loading={scoreMutation.isPending} disabled={!score} onClick={() => scoreMutation.mutate()}>
                Submit score
              </Button>
            </div>
          </div>
        )}
      </Card>

      <section>
        <h2 className="section-title mb-3 flex items-center gap-2"><Users className="h-5 w-5 text-naija-400" /> Live rooms</h2>
        {liveRooms.length === 0 ? (
          <Card className="p-4"><p className="text-sm text-ink-400">No live rooms for this game right now.</p></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {liveRooms.map((r) => {
              const room = r as unknown as { id: string; name: string; slug: string; memberCount: number; host: { displayName: string; avatar: string | null } | null };
              return (
                <Link key={room.id} to={`/rooms/${room.slug}`}>
                  <Card className="p-4 hover:border-ink-500 transition tap">
                    <LiveBadge />
                    <h3 className="font-display font-bold text-white mt-2">{room.name}</h3>
                    <p className="text-xs text-ink-400 mt-1">{room.memberCount} inside</p>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="section-title mb-3 flex items-center gap-2"><CalendarDays className="h-5 w-5 text-gold-400" /> Upcoming events</h2>
        {upcomingEvents.length === 0 ? (
          <Card className="p-4"><p className="text-sm text-ink-400">No upcoming events. <Link className="text-naija-400" to="/events/new">Schedule one</Link>.</p></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(upcomingEvents as unknown as { id: string; title: string; slug: string; startsAt: string; goingCount: number }[]).map((e) => (
              <Link key={e.id} to={`/events/${e.slug}`}>
                <Card className="p-4 hover:border-ink-500 transition tap">
                  <h3 className="font-semibold text-white">{e.title}</h3>
                  <p className="text-xs text-ink-400 mt-1">{timeAgo(e.startsAt)} · {e.goingCount} going</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <div>
          <h2 className="section-title mb-3 flex items-center gap-2"><Trophy className="h-5 w-5 text-gold-400" /> Top scores</h2>
          <Card>
            {topScores.length === 0 ? (
              <EmptyState title="No scores yet." description="Post yours — community verified." action={<Button onClick={() => setScoreOpen(true)}>Post score</Button>} />
            ) : (
              <ol className="divide-y divide-ink-700/70">
                {topScores.map((s) => (
                  <li key={s.rank} className="flex items-center gap-3 px-4 py-3">
                    <span className={cn('font-display font-black w-6', s.rank === 1 ? 'text-gold-400' : 'text-ink-500')}>{s.rank}</span>
                    <Avatar src={(s.user as { avatar?: string } | null)?.avatar ?? null} name={(s.user as { displayName?: string } | null)?.displayName || '?'} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{(s.user as { displayName?: string } | null)?.displayName}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-bold text-naija-400">{s.score.toLocaleString()}</p>
                      <p className={cn('text-[10px] uppercase', s.verification === 'verified' ? 'text-naija-400' : 'text-ink-500')}>
                        {s.verification === 'verified' ? '✓ verified' : 'unverified'}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div>
          <h2 className="section-title mb-3 flex items-center gap-2"><Camera className="h-5 w-5 text-ink-400" /> Moments</h2>
          {moments.length === 0 ? (
            <Card className="p-4"><p className="text-sm text-ink-400">No moments yet. <Link className="text-naija-400" to="/moments">Post one</Link>.</p></Card>
          ) : (
            <div className="space-y-2">
              {moments.slice(0, 5).map((m) => (
                <Link key={m.id} to={`/moments/${m.id}`}>
                  <Card className="p-3 hover:border-ink-500 transition tap">
                    <p className="text-sm text-ink-200 line-clamp-2">{m.caption}</p>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {seasons.length > 0 && (
        <section>
          <h2 className="section-title mb-3">Seasons</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(seasons as unknown as { id: string; name: string; status: string; endDate: string }[]).map((s) => (
              <Card key={s.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">{s.name}</p>
                  <p className="text-xs text-ink-500">Ends {timeAgo(s.endDate)}</p>
                </div>
                <Badge tone={s.status === 'active' ? 'naija' : 'outline'}>{s.status}</Badge>
              </Card>
            ))}
          </div>
        </section>
      )}

      <ButtonLink to="/games" variant="outline">← All games</ButtonLink>
    </div>
  );
}
