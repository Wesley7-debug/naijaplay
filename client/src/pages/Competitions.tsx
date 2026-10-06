import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Swords, Plus, Trophy, Users } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useCompetitions, useGames } from '@/hooks/useSharedData';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Label, FieldError, Select } from '@/components/ui/input';
import { Card, Badge, EmptyState, Skeleton, ButtonLink } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { toast } from '@/stores/ui';
import { formatDateTime, cn } from '@/lib/utils';
import type { GameSummary } from '@naijaplay/shared';

const FORMATS = ['elimination', 'leaderboard', 'quiz', 'crew_vs_crew'] as const;

export default function CompetitionsPage() {
  const query = useCompetitions();
  const [createOpen, setCreateOpen] = useState(false);
  const items = (query.data?.items ?? []) as Record<string, unknown>[];

  return (
    <div className="page-shell space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-white">Competitions</h1>
          <p className="text-sm text-ink-400">Structured brackets, quizzes and crew battles. Results are server-recorded.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New</Button>
      </div>

      {query.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">{[1, 2].map((i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Swords className="h-10 w-10" />}
            title="No competitions running."
            description="Start one and give your community something to fight for."
            action={<Button onClick={() => setCreateOpen(true)}>Create competition</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((c) => (
            <Link key={String(c.id)} to={`/competitions/${c.id}`}>
              <Card className="p-4 h-full hover:border-ink-500 transition tap">
                <div className="flex items-center gap-2 mb-2">
                  <Badge tone={c.status === 'active' ? 'live' : c.status === 'registration' ? 'naija' : 'outline'}>{String(c.status)}</Badge>
                  <Badge tone="outline">{String(c.format).replace('_', ' ')}</Badge>
                </div>
                <h2 className="font-display font-bold text-white line-clamp-1">{String(c.title)}</h2>
                {Boolean(c.game) && <p className="text-xs text-ink-500 mt-1">{(c.game as { name: string }).name}</p>}
                <p className="text-xs text-ink-400 mt-2">{formatDateTime(String(c.startsAt))}</p>
                <div className="mt-3 flex items-center gap-3 text-xs text-ink-400">
                  <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {String(c.participantCount)}</span>
                  <span className="inline-flex items-center gap-1"><Trophy className="h-3.5 w-3.5" /> {Array.isArray(c.prizes) ? c.prizes.length : 0} prizes</span>
                </div>
                {Boolean(c.viewerJoined) && <Badge tone="naija" className="mt-2">You're in</Badge>}
              </Card>
            </Link>
          ))}
        </div>
      )}

      <CreateCompetitionModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function CreateCompetitionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const games = useGames();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState<(typeof FORMATS)[number]>('elimination');
  const [gameId, setGameId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [prizes, setPrizes] = useState('');
  const [error, setError] = useState<string | undefined>();

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/api/competitions', {
        title,
        description,
        format,
        gameId: gameId || null,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        rules: [],
        prizes: prizes.split('\n').map((p) => p.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      toast.success('Competition created 🏆');
      void qc.invalidateQueries({ queryKey: ['competitions'] });
      onClose();
      setTitle('');
      setDescription('');
    },
    onError: (err) => setError((err as ApiRequestError).message),
  });

  return (
    <Modal open={open} onClose={onClose} title="New competition" sheet>
      <div className="space-y-3">
        <div>
          <Label htmlFor="comp-title">Title *</Label>
          <Input id="comp-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="NaijaPlay Lagos Run Cup" />
          <FieldError message={error} />
        </div>
        <div>
          <Label htmlFor="comp-desc">Description</Label>
          <Textarea id="comp-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="comp-format">Format</Label>
            <Select id="comp-format" value={format} onChange={(e) => setFormat(e.target.value as never)}>
              {FORMATS.map((f) => <option key={f} value={f}>{f.replace('_', ' ')}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="comp-game">Game</Label>
            <Select id="comp-game" value={gameId} onChange={(e) => setGameId(e.target.value)}>
              <option value="">General</option>
              {(games.data?.items ?? []).map((g: GameSummary) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="comp-start">Starts *</Label>
            <Input id="comp-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="comp-end">Ends *</Label>
            <Input id="comp-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="comp-prizes">Prizes (one per line)</Label>
          <Textarea id="comp-prizes" value={prizes} onChange={(e) => setPrizes(e.target.value)} placeholder={'₦20,000 airtime\nBragging rights'} />
        </div>
        <Button className="w-full" loading={mutation.isPending} disabled={!title.trim() || !startsAt || !endsAt} onClick={() => mutation.mutate()}>
          Create competition
        </Button>
      </div>
    </Modal>
  );
}
