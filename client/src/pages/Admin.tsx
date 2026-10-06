import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Users, Radio, Calendar, Flag, Camera, Building2, Search, CheckCircle2, Ban, BadgeCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/stores/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, Badge, Avatar, Skeleton, EmptyState } from '@/components/ui/card';
import { timeAgo, cn } from '@/lib/utils';

interface Metrics {
  totalUsers: number;
  activeUsers: number;
  totalRooms: number;
  liveRooms: number;
  totalEvents: number;
  openReports: number;
  totalGiveaways: number;
  totalCrews: number;
  totalMoments: number;
  sponsoredEvents: number;
}

interface AdminReport {
  id: string;
  reporter: { displayName: string; username: string } | null;
  targetType: string;
  targetId: string;
  reason: string;
  description: string;
  status: string;
  createdAt: string;
}

export default function AdminPage() {
  const [tab, setTab] = useState<'overview' | 'reports' | 'users'>('overview');
  const qc = useQueryClient();

  const metrics = useQuery({
    queryKey: ['admin', 'metrics'],
    queryFn: () => api.get<{ metrics: Metrics }>('/api/admin/metrics'),
    refetchInterval: 30_000,
  });

  const reports = useQuery({
    queryKey: ['admin', 'reports'],
    queryFn: () => api.get<{ items: AdminReport[] }>('/api/admin/reports'),
    enabled: tab === 'reports',
  });

  const [userQuery, setUserQuery] = useState('');
  const users = useQuery({
    queryKey: ['admin', 'users', userQuery],
    queryFn: () => api.get<{ items: { id: string; username: string; displayName: string; avatar: string | null; email: string; role: string; isSuspended: boolean; isVerified: boolean; createdAt: string }[] }>(`/api/admin/users?query=${encodeURIComponent(userQuery)}`),
    enabled: tab === 'users',
  });

  const resolveReport = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.post(`/api/admin/reports/${id}/resolve`, { status, resolution: `Marked ${status} by moderator` }),
    onSuccess: () => {
      toast.success('Report updated');
      void qc.invalidateQueries({ queryKey: ['admin', 'reports'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'metrics'] });
    },
    onError: (err) => toast.error('Action failed', (err as Error).message),
  });

  const userAction = useMutation({
    mutationFn: ({ id, action, role, reason }: { id: string; action: string; role?: string; reason?: string }) =>
      api.post(`/api/admin/users/${id}/action`, { action, role, reason }),
    onSuccess: () => {
      toast.success('User updated');
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => toast.error('Action failed', (err as Error).message),
  });

  const m = metrics.data?.metrics;

  return (
    <div className="page-shell space-y-5">
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-naija-400" />
        <div>
          <h1 className="font-display text-2xl font-extrabold text-white">Admin</h1>
          <p className="text-sm text-ink-400">Real database metrics and moderation tools.</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto hide-scrollbar" role="tablist" aria-label="Admin sections">
        {([['overview', 'Overview'], ['reports', 'Reports'], ['users', 'Users']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn('chip', tab === id && 'chip-active')}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {metrics.isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <MetricCard icon={<Users className="h-4 w-4" />} label="Total users" value={m?.totalUsers} />
              <MetricCard icon={<Users className="h-4 w-4" />} label="Active (7d)" value={m?.activeUsers} />
              <MetricCard icon={<Radio className="h-4 w-4" />} label="Live rooms" value={m?.liveRooms} accent />
              <MetricCard icon={<Shield className="h-4 w-4" />} label="Total rooms" value={m?.totalRooms} />
              <MetricCard icon={<Calendar className="h-4 w-4" />} label="Events" value={m?.totalEvents} />
              <MetricCard icon={<Flag className="h-4 w-4" />} label="Open reports" value={m?.openReports} danger={Boolean(m?.openReports)} />
              <MetricCard icon={<Shield className="h-4 w-4" />} label="Crews" value={m?.totalCrews} />
              <MetricCard icon={<Camera className="h-4 w-4" />} label="Moments" value={m?.totalMoments} />
              <MetricCard icon={<Flag className="h-4 w-4" />} label="Giveaways" value={m?.totalGiveaways} />
              <MetricCard icon={<Building2 className="h-4 w-4" />} label="Sponsored events" value={m?.sponsoredEvents} />
            </div>
          )}
        </>
      )}

      {tab === 'reports' && (
        <Card>
          {reports.isLoading ? (
            <div className="p-4 space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
          ) : (reports.data?.items?.length ?? 0) === 0 ? (
            <EmptyState icon={<Flag className="h-10 w-10" />} title="No open reports." description="The community is behaving itself." />
          ) : (
            <ul className="divide-y divide-ink-700/70">
              {reports.data!.items.map((r) => (
                <li key={r.id} className="p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {r.targetType} · <span className="text-pepper-400">{r.reason}</span>
                      </p>
                      <p className="text-xs text-ink-500">
                        by @{r.reporter?.username || 'unknown'} · {timeAgo(r.createdAt)} · {r.status}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => resolveReport.mutate({ id: r.id, status: 'reviewing' })}>
                        Review
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => resolveReport.mutate({ id: r.id, status: 'resolved' })}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => resolveReport.mutate({ id: r.id, status: 'dismissed' })}>
                        Dismiss
                      </Button>
                    </div>
                  </div>
                  {r.description && <p className="mt-2 text-xs text-ink-400">{r.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'users' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-500" aria-hidden />
            <Input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="Search users by username, email or name…" className="pl-9" aria-label="Search users" />
          </div>
          <Card>
            {users.isLoading ? (
              <div className="p-4 space-y-3"><Skeleton className="h-12" /></div>
            ) : (
              <ul className="divide-y divide-ink-700/70">
                {(users.data?.items ?? []).map((u) => (
                  <li key={u.id} className="flex items-center gap-3 p-3.5 flex-wrap">
                    <Avatar src={u.avatar} name={u.displayName} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                        {u.displayName} {u.isVerified && <BadgeCheck className="h-3.5 w-3.5 text-naija-400" />}
                      </p>
                      <p className="text-xs text-ink-500 truncate">@{u.username} · {u.email}</p>
                    </div>
                    <Badge tone={u.role === 'admin' ? 'gold' : u.role === 'moderator' ? 'naija' : 'outline'}>{u.role}</Badge>
                    {u.isSuspended && <Badge tone="danger">suspended</Badge>}
                    <div className="flex gap-1.5">
                      {u.isSuspended ? (
                        <Button size="sm" variant="outline" loading={userAction.isPending} onClick={() => userAction.mutate({ id: u.id, action: 'unsuspend' })}>
                          Unsuspend
                        </Button>
                      ) : (
                        <Button size="sm" variant="danger" loading={userAction.isPending} onClick={() => window.confirm(`Suspend @${u.username}?`) && userAction.mutate({ id: u.id, action: 'suspend', reason: 'Moderation action' })}>
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="sm" variant="outline" loading={userAction.isPending} onClick={() => userAction.mutate({ id: u.id, action: u.isVerified ? 'unverify' : 'verify' })}>
                        {u.isVerified ? 'Unverify' : 'Verify'}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

    </div>
  );
}

function MetricCard({ icon, label, value, accent, danger }: { icon: React.ReactNode; label: string; value?: number | string; accent?: boolean; danger?: boolean }) {
  return (
    <Card className={cn('p-4', accent && 'border-naija-500/40 bg-naija-500/5', danger && 'border-red-500/40 bg-red-500/5')}>
      <p className="inline-flex items-center gap-1.5 text-ink-400 text-xs">{icon} {label}</p>
      <p className={cn('font-display text-2xl font-extrabold mt-1', accent ? 'text-naija-400' : danger ? 'text-red-400' : 'text-white')}>
        {value ?? '—'}
      </p>
    </Card>
  );
}
