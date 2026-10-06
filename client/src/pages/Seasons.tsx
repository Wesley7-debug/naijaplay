import { Calendar, Trophy, Award } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSeasons } from '@/hooks/useSharedData';
import { Card, Badge, Skeleton, EmptyState, ButtonLink } from '@/components/ui/card';
import { SEASON_RANK_LABELS, type SeasonRankTier } from '@naijaplay/shared';
import { cn } from '@/lib/utils';

const TIER_STYLE: Record<SeasonRankTier, string> = {
  okada: 'border-ink-600 text-ink-300',
  danfo: 'border-naija-500/50 text-naija-300',
  molue: 'border-gold-400/50 text-gold-300',
  bullion_van: 'border-pepper-500/60 text-pepper-400',
};

export default function SeasonsPage() {
  const seasons = useSeasons();
  const items = seasons.data?.items ?? [];

  return (
    <div className="page-shell max-w-3xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-white">Seasons</h1>
        <p className="text-sm text-ink-400">Monthly ladders. Rank progression is server-calculated. History stays viewable.</p>
      </div>

      {seasons.isLoading ? (
        <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Calendar className="h-10 w-10" />}
            title="No seasons yet."
            description="The first season starts soon — play to be ready."
            action={<ButtonLink to="/home">Go play</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((season) => (
            <Card key={season.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg font-bold text-white">{season.name}</h2>
                  <p className="text-xs text-ink-500">
                    {new Date(season.startDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })} →{' '}
                    {new Date(season.endDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <Badge tone={season.status === 'active' ? 'naija' : season.status === 'archived' ? 'outline' : 'gold'}>
                  {season.status}
                </Badge>
              </div>

              {/* Rank tiers */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[...(season.tiers || [])].sort((a, b) => a.threshold - b.threshold).map((tier) => (
                  <div key={tier.tier} className={cn('rounded-xl border p-2.5 text-center', TIER_STYLE[tier.tier as SeasonRankTier] || 'border-ink-600')}>
                    <p className="text-xs font-bold uppercase tracking-wide">{SEASON_RANK_LABELS[tier.tier as SeasonRankTier] || tier.tier}</p>
                    <p className="text-[11px] text-ink-500 mt-0.5">{tier.threshold}+ pts</p>
                  </div>
                ))}
              </div>

              {season.rewards && season.rewards.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {season.rewards.map((r) => (
                    <span key={r} className="inline-flex items-center gap-1 rounded-lg bg-ink-800 border border-ink-700 px-2.5 py-1 text-xs text-ink-300">
                      <Award className="h-3.5 w-3.5 text-gold-400" /> {r}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-ink-400">{season.participantCount} participants</p>
                <Link to={`/leaderboards`} className="text-sm font-semibold text-naija-400 inline-flex items-center gap-1">
                  <Trophy className="h-4 w-4" /> View leaderboard
                </Link>
              </div>

              {season.status === 'archived' && (
                <div className="mt-4 rounded-xl border border-ink-700 bg-ink-800 p-3">
                  <p className="text-xs font-semibold uppercase text-ink-500 mb-2">Archived results</p>
                  <p className="text-sm text-ink-300">Historical standings preserved for this season.</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
