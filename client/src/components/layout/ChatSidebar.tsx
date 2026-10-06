import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth';
import { Avatar } from '@/components/ui/card';
import { timeAgo } from '@/lib/utils';

export interface SidebarConversation {
  id: string;
  participant: { id: string; displayName: string; username: string; avatar: string | null } | null;
  lastMessage: { content: string; createdAt: string; senderId: string } | null;
  unreadCount: number;
  updatedAt: string;
}

/** Shared DM thread cache (same key as the Messages page). */
export function useConversations(enabled: boolean) {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<{ items: SidebarConversation[] }>('/api/conversations'),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useUnreadDMs(): number {
  const user = useAuthStore((s) => s.user);
  const { data } = useConversations(Boolean(user));
  return (data?.items ?? []).reduce((sum, c) => sum + (c.unreadCount || 0), 0);
}

/** Sidebar "Chats" section: who you've chatted with, latest first. */
export function ChatSidebarList() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { data } = useConversations(Boolean(user));

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    };
    socket.on('dm:new', refresh);
    return () => {
      socket.off('dm:new', refresh);
    };
  }, [user, qc]);

  if (!user) return null;
  const items = (data?.items ?? []).slice(0, 5);
  const totalUnread = (data?.items ?? []).reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  return (
    <div className="px-3 pb-2">
      <div className="flex items-center justify-between px-1 mb-1.5">
        <p className="section-kicker">Chats{totalUnread > 0 ? ` · ${totalUnread} new` : ''}</p>
        <Link to="/messages" className="text-[11px] font-black uppercase tracking-wider text-naija-400 hover:text-naija-300">
          All →
        </Link>
      </div>
      {items.length === 0 ? (
        <Link
          to="/people"
          className="flex items-center gap-2.5 rounded-xl border-2 border-dashed border-ink-600 px-3 py-2.5 text-xs font-semibold text-ink-400 hover:text-paper hover:border-ink-400 transition"
        >
          <MessageCircle className="h-4 w-4 shrink-0" />
          Find people to chat with
        </Link>
      ) : (
        <ul className="space-y-1">
          {items.map((convo) => (
            <li key={convo.id}>
              <Link
                to={`/messages?c=${convo.id}`}
                className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-ink-800 transition group"
              >
                <span className="relative shrink-0">
                  <Avatar src={convo.participant?.avatar ?? null} name={convo.participant?.displayName || '?'} size={32} />
                  {convo.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 rounded-md bg-live px-1 text-[9px] font-black text-paper border border-ink-950 min-w-[16px] text-center">
                      {convo.unreadCount > 9 ? '9+' : convo.unreadCount}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-paper">
                    {convo.participant?.displayName || 'Conversation'}
                  </span>
                  <span className="block truncate text-[11px] text-ink-400 font-medium">
                    {convo.lastMessage
                      ? `${convo.lastMessage.senderId === user.id ? 'You: ' : ''}${convo.lastMessage.content}`
                      : 'No messages yet'}
                  </span>
                </span>
                {convo.lastMessage && (
                  <span className="text-[10px] text-ink-500 font-semibold shrink-0">{timeAgo(convo.lastMessage.createdAt)}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
