import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Share2, Trophy, Clock, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { useCrew } from '@/hooks/useSharedData';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/ui';
import { Button } from '@/components/ui/button';
import { Card, Badge, Avatar, Skeleton, EmptyState, ButtonLink } from '@/components/ui/card';
import { LoadingScreen, ErrorState } from '@/components/ui/feedback';
import { Modal } from '@/components/ui/modal';
import { Input, Label } from '@/components/ui/input';
import { formatCount, timeAgo, copyToClipboard, cn } from '@/lib/utils';

export default function CrewDetailPage() {
  const { slug } = useParams();
  const query = useCrew(slug);
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUser, setInviteUser] = useState('');

  const joinMutation = useMutation({
    mutationFn: (join: boolean) => api.post<{ memberCount: number }>(`/api/crews/${query.data?.crew.id}/${join ? 'join' : 'leave'}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crew', slug] });
      void qc.invalidateQueries({ queryKey: ['crews'] });
      toast.success('Updated');
    },
    onError: (err) => toast.error('Could not update', (err as Error).message),
  });

  const inviteMutation = useMutation({
    mutationFn: () => api.post(`/api/crews/${query.data?.crew.id}/invite`, { username: inviteUser }),
    onSuccess: () => {
      toast.success('Invitation sent', `${inviteUser} has been notified.`);
      setInviteOpen(false);
      setInviteUser('');
    },
    onError: (err) => toast.error('Could not invite', (err as Error).message),
  });

  if (query.isLoading) return <LoadingScreen label="Loading crew…" />;
  if (query.isError || !query.data) {
    return <div className="page-shell"><Card><ErrorState onRetry={() => query.refetch()} /></Card></div>;
  }

  const { crew, members, scoreHistory } = query.data;
  const isMember = crew.isMember;
  const isCreator = (crew.creator as { username?: string } | null)?.username === user?.username;

  return (
    <div className="page-shell max-w-3xl space-y-5">
      <Link to="/crews" className="inline-flex items-center gap-1 text-sm text-ink-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> All crews
      </Link>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <Avatar src={crew.avatar} name={crew.name} size={72} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-extrabold text-white">{crew.name}</h1>
              {isMember && <Badge tone="naija">Your crew</Badge>}
            </div>
            <p className="text-sm text-ink-400 mt-1">{crew.description || 'No description yet.'}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink-500">
              <span>{crew.kind}</span>
              <span>{crew.memberCount} members</span>
              <span>{crew.wins}W · {crew.losses}L</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="rounded-2xl border border-naija-500/40 bg-naija-500/10 px-5 py-3 text-center">
              <p className="font-display text-2xl font-extrabold text-naija-400">{formatCount(crew.points)}</p>
              <p className="text-[10px] uppercase text-ink-500">points</p>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                variant={isMember ? 'outline' : 'primary'}
                loading={joinMutation.isPending}
                onClick={() => joinMutation.mutate(!isMember)}
              >
                {isMember ? 'Leave' : 'Join crew'}
              </Button>
              <Button variant="outline" size="icon" aria-label="Share crew" onClick={async () => {
                if (await copyToClipboard(window.location.href)) toast.success('Link copied');
              }}>
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Members */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title flex items-center gap-2"><Users className="h-5 w-5 text-naija-400" /> Members</h2>
          {isMember && <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>Invite</Button>}
        </div>
        <Card>
          {members.length === 0 ? (
            <EmptyState title="No members yet." />
          ) : (
            <ul className="divide-y divide-ink-700/70">
              {members.map((m) => {
                const person = m.user as { id: string; username: string; displayName: string; avatar: string | null; level: number };
                return (
                  <li key={person.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar src={person.avatar} name={person.displayName} size={36} />
                    <div className="min-w-0 flex-1">
                      <Link to={`/u/${person.username}`} className="font-semibold text-white hover:text-naija-300 truncate block">
                        {person.displayName}
                      </Link>
                      <p className="text-xs text-ink-500">@{person.username} · Lv {person.level}</p>
                    </div>
                    <Badge tone={m.role === 'host' ? 'gold' : 'outline'}>{m.role}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      {/* Score history — audit trail */}
      <section>
        <h2 className="section-title mb-3 flex items-center gap-2"><Trophy className="h-5 w-5 text-gold-400" /> Score history</h2>
        <Card>
          {scoreHistory.length === 0 ? (
            <EmptyState title="No points yet." description="Wins in events, quizzes and competitions add points." />
          ) : (
            <ul className="divide-y divide-ink-700/70">
              {scoreHistory.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className={cn('font-display font-bold w-14 text-right', entry.delta >= 0 ? 'text-naija-400' : 'text-red-400')}>
                    {entry.delta >= 0 ? '+' : ''}{entry.delta}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-white truncate">{entry.reason}</p>
                    <p className="text-xs text-ink-500">{entry.sourceType} · {timeAgo(entry.createdAt)}</p>
                  </div>
                  <span className="text-xs text-ink-400">→ {formatCount(entry.balanceAfter)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite to crew" sheet>
        <div className="space-y-3">
          <div>
            <Label htmlFor="invite-user">Username</Label>
            <Input id="invite-user" value={inviteUser} onChange={(e) => setInviteUser(e.target.value)} placeholder="their_username" />
          </div>
          <Button
            className="w-full"
            loading={inviteMutation.isPending}
            disabled={!inviteUser.trim()}
            onClick={() => inviteMutation.mutate()}
          >
            Send invite
          </Button>
        </div>
      </Modal>
    </div>
  );
}
