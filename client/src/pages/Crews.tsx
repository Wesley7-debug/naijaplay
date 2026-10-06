import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Plus, Swords } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useCrews, useCrewLeaderboard } from '@/hooks/useSharedData';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Label, FieldError, Select } from '@/components/ui/input';
import { Card, Badge, Avatar, EmptyState, Skeleton, ButtonLink } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { toast } from '@/stores/ui';
import { formatCount, cn } from '@/lib/utils';
import { CREW_KINDS, type CrewSummary } from '@naijaplay/shared';

export default function CrewsPage() {
  const crews = useCrews();
  const board = useCrewLeaderboard();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="page-shell space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-white">Crew Wars</h1>
          <p className="text-sm text-ink-400">Back your area, school or squad. Points come from wins.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Start a crew</Button>
      </div>

      {/* Rivalries */}
      {(board.data?.rivalries?.length ?? 0) > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {board.data!.rivalries.map((r, i) => (
            <Card key={i} className="p-4 text-center border-naija-500/30 bg-naija-500/5">
              <p className="font-display text-lg font-extrabold text-white">
                {r.home} <span className="text-naija-400">VS</span> {r.away}
              </p>
              <p className="mt-1 text-sm text-ink-400">{formatCount(r.homeScore)} — {formatCount(r.awayScore)}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Leaderboard */}
      <section>
        <h2 className="section-title mb-3 flex items-center gap-2"><Swords className="h-5 w-5 text-naija-400" /> Standings</h2>
        <Card>
          {board.isLoading ? (
            <div className="p-4 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <ol className="divide-y divide-ink-700/70">
              {board.data?.items.map((row) => (
                <li key={row.crew.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={cn('font-display font-black w-7 text-center', row.rank === 1 ? 'text-gold-400' : row.rank === 2 ? 'text-ink-300' : row.rank === 3 ? 'text-pepper-400' : 'text-ink-500')}>
                    {row.rank}
                  </span>
                  <Avatar src={row.crew.avatar} name={row.crew.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <Link to={`/crews/${row.crew.slug}`} className="font-semibold text-white hover:text-naija-300 truncate block">
                      {row.crew.name}
                    </Link>
                    <p className="text-xs text-ink-500">{row.crew.memberCount} members · {row.crew.wins}W {row.crew.losses}L</p>
                  </div>
                  <span className="font-display font-bold text-naija-400">{formatCount(row.score)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </section>

      {/* All crews */}
      <section>
        <h2 className="section-title mb-3">All crews</h2>
        {crews.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
        ) : (crews.data?.items?.length ?? 0) === 0 ? (
          <Card>
            <EmptyState
              icon={<Shield className="h-10 w-10" />}
              title="No crews yet."
              description="Start yours and put your area on the map."
              action={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Start yours</Button>}
            />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {crews.data!.items.map((crew) => <CrewCard key={crew.id} crew={crew} />)}
          </div>
        )}
      </section>

      <CreateCrewModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function CrewCard({ crew }: { crew: CrewSummary }) {
  return (
    <Link to={`/crews/${crew.slug}`} className="group">
      <Card className="p-4 h-full transition group-hover:border-ink-500 tap">
        <div className="flex items-center gap-3">
          <Avatar src={crew.avatar} name={crew.name} size={44} />
          <div className="min-w-0">
            <h3 className="font-display font-bold text-white truncate group-hover:text-naija-300 transition">{crew.name}</h3>
            <p className="text-xs text-ink-500">{crew.kind} · {crew.memberCount} members</p>
          </div>
          <div className="ml-auto text-right">
            <p className="font-display font-bold text-naija-400">{formatCount(crew.points)}</p>
            <p className="text-[10px] text-ink-500 uppercase">points</p>
          </div>
        </div>
        {crew.description && <p className="mt-2 text-xs text-ink-400 line-clamp-2">{crew.description}</p>}
        {crew.isMember && <Badge tone="naija" className="mt-2">Your crew</Badge>}
      </Card>
    </Link>
  );
}

export function CreateCrewModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<(typeof CREW_KINDS)[number]>('area');
  const [error, setError] = useState<string | undefined>();

  const mutation = useMutation({
    mutationFn: () => api.post<{ crew: CrewSummary }>('/api/crews', { name, description, kind }),
    onSuccess: (data) => {
      toast.success('Crew formed! 🛡️', 'Put your area on the map.');
      void qc.invalidateQueries({ queryKey: ['crews'] });
      onClose();
      navigate(`/crews/${data.crew.slug}`);
    },
    onError: (err) => setError((err as ApiRequestError).message),
  });

  return (
    <Modal open={open} onClose={onClose} title="Start a crew" sheet>
      <div className="space-y-4">
        <div>
          <Label htmlFor="crew-name">Crew name *</Label>
          <Input id="crew-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Yaba Crew" maxLength={50} />
          <FieldError message={error} />
        </div>
        <div>
          <Label htmlFor="crew-desc">Description</Label>
          <Textarea id="crew-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's your crew about?" maxLength={500} />
        </div>
        <div>
          <Label htmlFor="crew-kind">Type</Label>
          <Select id="crew-kind" value={kind} onChange={(e) => setKind(e.target.value as never)}>
            {CREW_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </Select>
        </div>
        <Button className="w-full" loading={mutation.isPending} disabled={!name.trim()} onClick={() => mutation.mutate()}>
          Form crew
        </Button>
      </div>
    </Modal>
  );
}
