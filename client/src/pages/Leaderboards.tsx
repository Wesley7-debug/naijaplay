import { useState } from 'react';
import { Trophy, Users, Shield, Calendar } from 'lucide-react';
import { useLeaderboard, useSeasons } from '@/hooks/useSharedData';
import { Card, Badge, Avatar, Skeleton, EmptyState, ButtonLink } from '@/components/ui/card';
import { formatCount, cn } from '@/lib/utils';
import type { LeaderboardEntry, SeasonSummary } from '@naijaplay/shared';

const SCOPES = [
  { id: 'global', label: 'Global', icon: Trophy },
  { id: 'crews', label: 'Crews', icon: Shield },
  { id: 'season', label: 'Season', icon: Calendar },
  { id: 'weekly', label: 'Weekly', icon: Users },
] as const;

export default function LeaderboardsPage() {
  const [scope, setScope] = useState('global');
  const board = useLeaderboard(scope);
  const seasons = useSeasons();
  const activeSeason = (seasons.data?.items ?? []).find((s) => s.status === 'active');

  const entries = (board.data?.items ?? []) as LeaderboardEntry[];

  return (
    <div className="page-shell max-w-2xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-white">Leaderboards</h1>
        <p className="text-sm text-ink-400">Every number here comes from real server data. No fabricated rankings.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto hide-scrollbar" role="tablist" aria-label="Leaderboard scopes">
        {SCOPES.map((s) => (
          <button key={s.id} role="tab" aria-selected={scope === s.id} onClick={() => setScope(s.id)} className={cn('chip inline-flex items-center gap-1.5', scope === s.id && 'chip-active')}>
            <s.icon className="h-4 w-4" /> {s.label}
          </button>
        ))}
      </div>

      {activeSeason && (
        <Card className="p-4 border-naija-500/30 bg-naija-500/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-naija-400 font-bold">{activeSeason.name}</p>
              <p className="text-sm text-ink-300">Ends {new Date(activeSeason.endDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</p>
            </div>
            <Badge tone="naija">{activeSeason.status}</Badge>
          </div>
        </Card>
      )}

      {board.isLoading ? (
        <Card><div className="p-4 space-y-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12" />)}</div></Card>
      ) : entries.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Trophy className="h-10 w-10" />}
            title="No rankings yet."
            description="Play, host and compete — the board fills up with real activity."
            action={<ButtonLink to="/home">Start playing</ButtonLink>}
          />
        </Card>
      ) : (
        <Card>
          <ol className="divide-y divide-ink-700/70">
            {entries.map((entry) => (
              <li key={entry.rank} className="flex items-center gap-3 px-4 py-3.5">
                <span className={cn('font-display font-black w-7 text-center text-lg', entry.rank === 1 ? 'text-gold-400' : entry.rank === 2 ? 'text-ink-300' : entry.rank === 3 ? 'text-pepper-400' : 'text-ink-500')}>
                  {entry.rank}
                </span>
                {entry.user ? (
                  <>
                    <Avatar src={entry.user.avatar} name={entry.user.displayName} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white truncate">{entry.user.displayName}</p>
                      <p className="text-xs text-ink-500">@{entry.user.username} · Lv {entry.user.level}</p>
                    </div>
                  </>
                ) : entry.crew ? (
                  <>
                    <Avatar src={entry.crew.avatar} name={entry.crew.name} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white truncate">{entry.crew.name}</p>
                      <p className="text-xs text-ink-500">{entry.crew.memberCount} members</p>
                    </div>
                  </>
                ) : null}
                <div className="text-right">
                  <p className="font-display font-bold text-naija-400">{formatCount(entry.score)}</p>
                  {entry.tier && <p className="text-[10px] uppercase text-ink-500">{entry.tier.replace('_', ' ')}</p>}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
