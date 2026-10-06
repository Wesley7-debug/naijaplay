import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Swords, Trophy, Users, Calendar } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/stores/ui';
import { Button } from '@/components/ui/button';
import { Card, Badge, Avatar, Skeleton, EmptyState, ButtonLink } from '@/components/ui/card';
import { LoadingScreen, ErrorState } from '@/components/ui/feedback';
import { formatDateTime, cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';

export default function CompetitionDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const query = useQuery({
    queryKey: ['competition', id],
    queryFn: () =>
      api.get<{
        competition: {
          id: string;
          title: string;
          description: string;
          format: string;
          status: string;
          rules: string[];
          prizes: string[];
          startsAt: string;
          endsAt: string;
          participantCount: number;
          viewerJoined: boolean;
          host: { displayName: string; username: string; avatar: string | null } | null;
          game: { name: string; slug: string } | null;
          shareUrl: string;
        };
        leaderboard: { rank: number; score: number; user: { id: string; displayName: string; username: string; avatar: string | null } | null }[];
      }>(`/api/competitions/${id}`),
    enabled: Boolean(id),
  });

  const joinMutation = useMutation({
    mutationFn: () => api.post(`/api/competitions/${id}/join`),
    onSuccess: () => {
      toast.success("You're in! 🏆");
      void qc.invalidateQueries({ queryKey: ['competition', id] });
      void qc.invalidateQueries({ queryKey: ['competitions'] });
    },
    onError: (err) => toast.error('Could not join', (err as Error).message),
  });

  if (query.isLoading) return <LoadingScreen label="Loading competition…" />;
  if (query.isError || !query.data) {
    return <div className="page-shell"><Card><ErrorState onRetry={() => query.refetch()} /></Card></div>;
  }

  const { competition, leaderboard } = query.data;

  return (
    <div className="page-shell max-w-2xl space-y-5">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Badge tone={competition.status === 'active' ? 'live' : competition.status === 'registration' ? 'naija' : 'outline'}>{competition.status}</Badge>
          <Badge tone="outline">{competition.format.replace('_', ' ')}</Badge>
          {competition.game && <Badge tone="outline">{competition.game.name}</Badge>}
        </div>
        <h1 className="font-display text-2xl font-extrabold text-white">{competition.title}</h1>
        {competition.description && <p className="mt-2 text-sm text-ink-300 whitespace-pre-wrap">{competition.description}</p>}

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-ink-300">
          <p className="flex items-center gap-2"><Calendar className="h-4 w-4 text-naija-400" /> {formatDateTime(competition.startsAt)}</p>
          <p className="flex items-center gap-2"><Trophy className="h-4 w-4 text-gold-400" /> Ends {formatDateTime(competition.endsAt)}</p>
          <p className="flex items-center gap-2"><Users className="h-4 w-4 text-naija-400" /> {competition.participantCount} participants</p>
          {competition.host && <p className="flex items-center gap-2"><Swords className="h-4 w-4 text-pepper-400" /> Host: {competition.host.displayName}</p>}
        </div>

        {!competition.viewerJoined && competition.status !== 'completed' && (
          <Button className="w-full mt-5" loading={joinMutation.isPending} onClick={() => joinMutation.mutate()}>
            Join competition
          </Button>
        )}
        {competition.viewerJoined && <Badge tone="naija" className="mt-5">You're participating</Badge>}
      </Card>

      {competition.prizes.length > 0 && (
        <Card className="p-5">
          <h2 className="section-title mb-3 flex items-center gap-2"><Trophy className="h-5 w-5 text-gold-400" /> Prizes</h2>
          <ul className="space-y-2">
            {competition.prizes.map((p, i) => (
              <li key={i} className="flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-white">
                <span className="font-display font-black text-gold-400">{i + 1}</span> {p}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {competition.rules.length > 0 && (
        <Card className="p-5">
          <h2 className="section-title mb-3">Rules</h2>
          <ul className="space-y-1.5 text-sm text-ink-300">
            {competition.rules.map((r, i) => (
              <li key={i} className="flex gap-2"><span className="text-naija-400">•</span> {r}</li>
            ))}
          </ul>
        </Card>
      )}

      <section>
        <h2 className="section-title mb-3">Standings</h2>
        <Card>
          {leaderboard.length === 0 ? (
            <EmptyState title="No standings yet." description="Join and the board will fill up." />
          ) : (
            <ol className="divide-y divide-ink-700/70">
              {leaderboard.map((row) => (
                <li key={row.rank} className="flex items-center gap-3 px-4 py-3">
                  <span className={cn('font-display font-black w-7 text-center', row.rank === 1 ? 'text-gold-400' : 'text-ink-500')}>{row.rank}</span>
                  <Avatar src={row.user?.avatar ?? null} name={row.user?.displayName || '?'} size={32} />
                  <p className="flex-1 truncate text-sm font-semibold text-white">{row.user?.displayName}</p>
                  <span className="font-display font-bold text-naija-400">{row.score}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </section>

      <ButtonLink to="/competitions" variant="outline">← All competitions</ButtonLink>
    </div>
  );
}
