import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Inbox } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useNotifications } from '@/hooks/useSharedData';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, Skeleton } from '@/components/ui/card';
import { timeAgo, cn } from '@/lib/utils';
import type { NotificationView } from '@naijaplay/shared';

export default function NotificationsPage() {
  const query = useNotifications();
  const qc = useQueryClient();

  const markAll = useMutation({
    mutationFn: () => api.post('/api/notifications/read-all'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markOne = useMutation({
    mutationFn: (id: string) => api.post('/api/notifications/read', { ids: [id] }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const items = query.data?.items ?? [];
  const unread = query.data?.unread ?? 0;

  return (
    <div className="page-shell max-w-2xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-white">Notifications</h1>
          <p className="text-sm text-ink-400">{unread > 0 ? `${unread} unread` : 'You are all caught up.'}</p>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" loading={markAll.isPending} onClick={() => markAll.mutate()}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        )}
      </div>

      {query.isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Inbox className="h-10 w-10" />}
            title="Nothing here yet."
            description="When someone follows you, invites you or you win something, it lands here."
            action={<Link to="/home" className="inline-flex h-11 items-center rounded-xl bg-naija-500 px-5 text-sm font-semibold text-ink-950">Explore NaijaPlay</Link>}
          />
        </Card>
      ) : (
        <ul className="space-y-2">
          {items.map((n: NotificationView) => (
            <li key={n.id}>
              <button
                onClick={() => {
                  if (!n.readAt) markOne.mutate(n.id);
                  if (n.link) window.location.href = n.link;
                }}
                className={cn(
                  'w-full text-left rounded-2xl border p-4 transition tap',
                  n.readAt ? 'border-ink-700 bg-ink-850 opacity-70' : 'border-naija-500/40 bg-naija-500/5',
                )}
              >
                <div className="flex items-start gap-3">
                  <span className={cn('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl', n.readAt ? 'bg-ink-700 text-ink-400' : 'bg-naija-500/15 text-naija-400')}>
                    <Bell className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{n.title}</p>
                    <p className="text-xs text-ink-400 mt-0.5">{n.body}</p>
                    <p className="text-[11px] text-ink-500 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.readAt && <span className="h-2 w-2 rounded-full bg-naija-500 mt-2 shrink-0" />}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
