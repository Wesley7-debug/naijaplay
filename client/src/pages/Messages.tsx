import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, MessageCircle, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, Avatar, EmptyState, Skeleton } from '@/components/ui/card';
import { timeAgo, cn } from '@/lib/utils';

interface Conversation {
  id: string;
  participant: { id: string; displayName: string; username: string; avatar: string | null } | null;
  lastMessage: { content: string; createdAt: string; senderId: string } | null;
  unreadCount: number;
  updatedAt: string;
}

interface Dm {
  id: string;
  senderId: string;
  content: string;
  isMine: boolean;
  createdAt: string;
}

export default function MessagesPage() {
  const [params, setParams] = useSearchParams();
  const activeId = params.get('c');
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const convosQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<{ items: Conversation[] }>('/api/conversations'),
    refetchInterval: 30_000,
  });

  const messagesQuery = useQuery({
    queryKey: ['dm', activeId],
    queryFn: () => api.get<{ items: Dm[] }>(`/api/conversations/${activeId}/messages`),
    enabled: Boolean(activeId),
  });

  // Realtime DMs
  useEffect(() => {
    const socket = getSocket();
    const onNew = (payload: { conversationId: string }) => {
      if (payload.conversationId === activeId) {
        void qc.invalidateQueries({ queryKey: ['dm', activeId] });
      } else {
        void qc.invalidateQueries({ queryKey: ['conversations'] });
      }
    };
    socket.on('dm:new', onNew);
    return () => {
      socket.off('dm:new', onNew);
    };
  }, [activeId, qc]);

  // Mark read when opening a thread
  useEffect(() => {
    if (!activeId) return;
    void api.post(`/api/conversations/${activeId}/read`).then(() => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    });
  }, [activeId, qc]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [messagesQuery.data]);

  const sendMutation = useMutation({
    mutationFn: () => api.post(`/api/conversations/${activeId}/messages`, { content: draft }),
    onSuccess: () => {
      setDraft('');
      void qc.invalidateQueries({ queryKey: ['dm', activeId] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err) => {
      toast.error('Message not sent', (err as Error).message);
      // Keep the draft so nothing is lost on flaky connections.
    },
  });

  const activeConvo = convosQuery.data?.items.find((c) => c.id === activeId);

  if (activeId) {
    return (
      <div className="mx-auto w-full max-w-2xl px-3 sm:px-6 py-4 flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>
        <div className="flex items-center gap-3 border-b border-ink-700 pb-3">
          <button onClick={() => setParams({})} className="text-ink-400 hover:text-white" aria-label="Back to conversations">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Avatar src={activeConvo?.participant?.avatar ?? null} name={activeConvo?.participant?.displayName || '?'} size={36} />
          <div>
            <p className="font-semibold text-white">{activeConvo?.participant?.displayName || 'Conversation'}</p>
            <p className="text-xs text-ink-500">@{activeConvo?.participant?.username}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-3" aria-live="polite">
          {messagesQuery.isLoading ? (
            <Skeleton className="h-14" />
          ) : (messagesQuery.data?.items?.length ?? 0) === 0 ? (
            <EmptyState title="No messages yet." description="Say hi 👋" />
          ) : (
            messagesQuery.data!.items.map((dm) => (
              <div key={dm.id} className={cn('flex', dm.isMine ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[78%] rounded-2xl px-3.5 py-2 text-sm break-words', dm.isMine ? 'bg-naija-600 text-white rounded-tr-sm' : 'bg-ink-700 text-ink-100 rounded-tl-sm')}>
                  {dm.content}
                  <p className="text-[10px] opacity-70 mt-1">{timeAgo(dm.createdAt)}</p>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="border-t border-ink-700 pt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) sendMutation.mutate();
          }}
        >
          <div className="flex gap-2">
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message…" maxLength={2000} aria-label="Direct message" />
            <Button type="submit" size="icon" disabled={!draft.trim()} loading={sendMutation.isPending} aria-label="Send">
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-ink-500">Settling money? Host drops aza here, sender transfers via bank app.</p>
            <button
              type="button"
              className="text-[11px] font-semibold text-naija-400 hover:text-naija-300 shrink-0"
              onClick={() => setDraft((d) => (d ? `${d}\n` : '') + 'My aza:\nBank: \nAcct no: \nName: \nAmount: ₦')}
            >
              Insert aza template
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="page-shell max-w-2xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-white">Messages</h1>
        <p className="text-sm text-ink-400">Direct conversations — real, persisted, private.</p>
      </div>

      {convosQuery.isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : (convosQuery.data?.items?.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            icon={<MessageCircle className="h-10 w-10" />}
            title="No conversations yet."
            description="Open someone's profile and tap Message to start one."
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-ink-700/70">
            {convosQuery.data!.items.map((convo) => (
              <li key={convo.id}>
                <button
                  onClick={() => setParams({ c: convo.id })}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-ink-800 transition"
                >
                  <Avatar src={convo.participant?.avatar ?? null} name={convo.participant?.displayName || '?'} size={42} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white truncate">{convo.participant?.displayName}</p>
                    <p className="text-xs text-ink-400 truncate">
                      {convo.lastMessage ? (convo.lastMessage.senderId === user?.id ? 'You: ' : '') + convo.lastMessage.content : 'No messages yet'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {convo.lastMessage && <span className="text-[10px] text-ink-500">{timeAgo(convo.lastMessage.createdAt)}</span>}
                    {convo.unreadCount > 0 && (
                      <span className="rounded-full bg-naija-500 px-1.5 text-[10px] font-bold text-ink-950 min-w-[18px] text-center">
                        {convo.unreadCount}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
