import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send,
  Users,
  Gift,
  BarChart3,
  Brain,
  Lock,
  Unlock,
  Share2,
  Shield,
  MoreHorizontal,
  X,
  Pin,
  LogOut,
  Flag,
  Crown,
  Timer,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Trophy,
} from 'lucide-react';
import { api } from '@/lib/api';
import { getSocket, emitAck, isConnected } from '@/lib/socket';
import { useRoom } from '@/hooks/useSharedData';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/ui';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Label } from '@/components/ui/input';
import { Card, Badge, Avatar, LiveBadge, Skeleton, EmptyState, ButtonLink } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { cn, timeAgo, countdown, copyToClipboard, shareTargets } from '@/lib/utils';
import type { MessageView, RoomSummary } from '@naijaplay/shared';

interface ChatMessage extends MessageView {
  pending?: boolean;
  clientNonce?: string;
}

export default function RoomPage() {
  const { id = '', code } = useParams();
  const [params] = useSearchParams();
  const inviteCode = code || params.get('code') || undefined;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const roomQuery = useRoom(id, inviteCode);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [typingUsers, setTypingUsers] = useState<Record<string, { displayName: string; until: number }>>({});
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [membersOpen, setMembersOpen] = useState(false);
  const [hostOpen, setHostOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [pollsOpen, setPollsOpen] = useState(false);
  const [giveawayOpen, setGiveawayOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<Record<string, number>>({});
  const lastTypingSent = useRef(0);

  const room = roomQuery.data?.room as RoomSummary | undefined;
  const roomId = room?.id;
  const membership = roomQuery.data?.membership;
  const isModerator = membership && ['host', 'cohost', 'moderator'].includes(membership.role);
  const canModerate = membership && ['host', 'cohost'].includes(membership.role);

  // Load chat history
  const history = useQuery({
    queryKey: ['chat', roomId],
    queryFn: () => api.get<{ items: ChatMessage[]; nextCursor: string | null }>(`/api/rooms/${roomId}/chat`),
    enabled: Boolean(roomId),
    retry: false,
  });

  useEffect(() => {
    if (history.data?.items) setMessages(history.data.items.filter((m) => m.isAnnouncement || true));
  }, [history.data]);

  // Scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // ---- Socket wiring ----
  const handleEnter = useCallback(() => {
    if (!roomId) return;
    const socket = getSocket();

    socket.emit('room:join', { roomId }, (response: { ok: boolean; memberCount?: number; code?: string; message?: string }) => {
      if (response?.ok) {
        if (typeof response.memberCount === 'number') setMemberCount(response.memberCount);
        setError(null);
      } else {
        setError(response?.message || 'Could not join this room.');
      }
    });

    const onMessage = (payload: ChatMessage) => {
      if (payload.roomId !== roomId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === payload.id)) return prev;
        // Drop optimistic duplicate by clientNonce
        const withoutPending = payload.clientNonce
          ? prev.filter((m) => m.clientNonce !== payload.clientNonce)
          : prev;
        return [...withoutPending, payload];
      });
    };
    const onCount = (payload: { roomId: string; memberCount: number }) => {
      if (payload.roomId === roomId) setMemberCount(payload.memberCount);
    };
    const onPresence = (payload: { roomId: string; onlineUsers: string[] }) => {
      if (payload.roomId === roomId) setOnlineIds(payload.onlineUsers);
    };
    const onTyping = (payload: { roomId: string; userId: string; displayName: string; typing: boolean }) => {
      if (payload.roomId === roomId || true) {
        setTypingUsers((prev) => {
          const next = { ...prev };
          if (payload.typing) {
            next[payload.userId] = { displayName: payload.displayName, until: Date.now() + 3500 };
          } else {
            delete next[payload.userId];
          }
          return next;
        });
      }
    };
    const onReaction = (payload: { messageId: string; reactions: MessageView['reactions'] }) => {
      setMessages((prev) => prev.map((m) => (m.id === payload.messageId ? { ...m, reactions: payload.reactions } : m)));
    };
    const onDelete = (payload: { messageId: string }) => {
      setMessages((prev) => prev.map((m) => (m.id === payload.messageId ? { ...m, isDeleted: true, content: '' } : m)));
    };
    const onEnded = (payload: { recapId?: string }) => {
      toast.info('The room has ended', payload.recapId ? 'Check out the recap!' : undefined);
      void qc.invalidateQueries({ queryKey: ['room', id] });
      if (payload.recapId) navigate(`/recaps/${payload.recapId}`);
    };
    const onModeration = () => {
      void qc.invalidateQueries({ queryKey: ['room', id] });
    };
    const onLock = (payload: { isLocked: boolean }) => {
      toast.info(payload.isLocked ? 'Room locked' : 'Room unlocked');
      void qc.invalidateQueries({ queryKey: ['room', id] });
    };
    const onGiveawayStarted = (payload: { prize: string; seconds: number }) => {
      toast.success('Giveaway started! 🎁', `${payload.prize} — ${payload.seconds}s to enter.`);
      setGiveawayOpen(true);
      void qc.invalidateQueries({ queryKey: ['room', id, 'giveaways'] });
    };
    const onGiveawayWinners = (payload: { prize: string; winners: { displayName: string }[] }) => {
      toast.success('Giveaway results 🎉', `${payload.winners.map((w) => w.displayName).join(', ')} won ${payload.prize}`);
      setGiveawayOpen(true);
    };

    socket.on('room:message', onMessage);
    socket.on('room:member-count', onCount);
    socket.on('room:presence', onPresence);
    socket.on('room:typing', onTyping);
    socket.on('room:reaction', onReaction);
    socket.on('room:message-deleted', onDelete);
    socket.on('room:ended', onEnded);
    socket.on('room:moderation', onModeration);
    socket.on('room:lock', onLock);
    socket.on('giveaway:started', onGiveawayStarted);
    socket.on('giveaway:winners', onGiveawayWinners);

    return () => {
      socket.emit('room:leave', { roomId });
      socket.off('room:message', onMessage);
      socket.off('room:member-count', onCount);
      socket.off('room:presence', onPresence);
      socket.off('room:typing', onTyping);
      socket.off('room:reaction', onReaction);
      socket.off('room:message-deleted', onDelete);
      socket.off('room:ended', onEnded);
      socket.off('room:moderation', onModeration);
      socket.off('room:lock', onLock);
      socket.off('giveaway:started', onGiveawayStarted);
      socket.off('giveaway:winners', onGiveawayWinners);
    };
  }, [roomId, id, qc, navigate]);

  useEffect(() => {
    if (!roomId) return undefined;
    const cleanup = handleEnter();
    return cleanup;
  }, [handleEnter, roomId, retryCount]);

  // Typing indicator expiry
  useEffect(() => {
    const interval = setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now();
        const next: typeof prev = {};
        let changed = false;
        for (const [k, v] of Object.entries(prev)) {
          if (v.until > now) next[k] = v;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  function sendTyping() {
    if (Date.now() - lastTypingSent.current > 1500) {
      lastTypingSent.current = Date.now();
      getSocket().emit('room:typing', { roomId, typing: true });
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !roomId) return;
    const clientNonce = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setDraft('');

    // Optimistic render; server confirms with persisted message.
    const optimistic: ChatMessage = {
      id: `pending_${clientNonce}`,
      roomId,
      sender: user
        ? { id: user.id, username: user.username, displayName: user.displayName, avatar: user.avatar, role: user.role, isVerified: user.isVerified, level: user.level, xp: user.xp, followersCount: user.followersCount, followingCount: user.followingCount, roomsHostedCount: user.roomsHostedCount, eventsJoinedCount: user.eventsJoinedCount, winsCount: user.winsCount, giveawaysWonCount: user.giveawaysWonCount, createdAt: user.createdAt }
        : null,
      content,
      attachments: [],
      replyTo: null,
      reactions: [],
      isPinned: false,
      isAnnouncement: false,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      pending: true,
      clientNonce,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const response = await emitAck<{ ok: boolean; message?: string; code?: string }>('room:message', { roomId, content, clientNonce });
      if (response && response.ok === false) {
        setMessages((prev) => prev.filter((m) => m.clientNonce !== clientNonce));
        toast.error(response.message || 'Could not send');
        if (response.code === 'MUTED' || response.code === 'NOT_A_MEMBER') {
          void qc.invalidateQueries({ queryKey: ['room', id] });
        }
      } else {
        setMessages((prev) => prev.filter((m) => m.clientNonce !== clientNonce));
      }
    } catch {
      // Socket down — keep message marked pending, do NOT destroy it (unreliable connections).
      toast.error('Not sent', 'Check your connection — tap send again.');
      setMessages((prev) => prev.filter((m) => m.clientNonce !== clientNonce));
      setDraft(content);
    }
    getSocket().emit('room:typing', { roomId, typing: false });
  }

  const sendMessageMutation = useMutation({
    mutationFn: async (body: { action: string; targetUserId?: string }) => {
      if (body.action === 'lock' || body.action === 'unlock') {
        return api.post(`/api/rooms/${roomId}/${body.action}`);
      }
      if (body.action === 'end') return api.post(`/api/rooms/${roomId}/end`);
      return api.post(`/api/rooms/${roomId}/moderation`, body);
    },
    onSuccess: (data) => {
      toast.success('Done');
      void qc.invalidateQueries({ queryKey: ['room', id] });
      const d = data as { recapId?: string };
      if (d?.recapId) navigate(`/recaps/${d.recapId}`);
    },
    onError: (err) => toast.error('Action failed', (err as Error).message),
  });

  if (roomQuery.isLoading) {
    return (
      <div className="page-shell space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (roomQuery.isError || !room) {
    const err = roomQuery.error as { code?: string; message?: string };
    const needsCode = err?.code === 'PRIVATE_ROOM';
    return (
      <div className="page-shell">
        <Card>
          <EmptyState
            icon={needsCode ? <Lock className="h-10 w-10" /> : <X className="h-10 w-10" />}
            title={needsCode ? 'This room is private' : 'Room not found'}
            description={err?.message || (needsCode ? 'You need an invite code to enter.' : "That room doesn't exist anymore.")}
            action={<ButtonLink to="/rooms">Back to rooms</ButtonLink>}
          />
        </Card>
      </div>
    );
  }

  const activeTyping = Object.values(typingUsers).map((t) => t.displayName);
  const host = room.host as { displayName?: string; avatar?: string | null; username?: string } | null;

  return (
    <div className="mx-auto w-full max-w-5xl px-3 sm:px-6 py-3 sm:py-5 pb-28">
      {/* Header */}
      <header className="rounded-2xl border border-ink-700 bg-ink-850 p-4 mb-3">
        <div className="flex items-start gap-3">
          <Link to="/rooms" className="mt-1 text-ink-400 hover:text-white" aria-label="Back to rooms">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {room.status === 'live' ? <LiveBadge /> : <Badge tone="gold">{room.status}</Badge>}
              <Badge tone="outline">{room.category}</Badge>
              {room.isPrivate && <Badge tone="danger">Private</Badge>}
              {room.isLocked && <Badge tone="danger"><Lock className="h-3 w-3" /> Locked</Badge>}
            </div>
            <h1 className="font-display text-lg sm:text-xl font-extrabold text-white mt-1.5 truncate">{room.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-400">
              <span className="inline-flex items-center gap-1.5">
                <Avatar src={host?.avatar ?? null} name={host?.displayName || '?'} size={18} />
                {host?.displayName}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> <strong className="text-white">{memberCount ?? room.memberCount}</strong> inside
              </span>
              <span>Peak {room.peakMemberCount}</span>
              {room.externalGameCode && <span>Game code: <code className="text-naija-400">{room.externalGameCode}</code></span>}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShareOpen(true)}
              className="rounded-lg p-2 text-ink-300 hover:text-white hover:bg-ink-700"
              aria-label="Share room"
            >
              <Share2 className="h-5 w-5" />
            </button>
            {canModerate && (
              <button
                onClick={() => setHostOpen(true)}
                className="rounded-lg p-2 text-gold-400 hover:bg-ink-700"
                aria-label="Host controls"
              >
                <Shield className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Action row */}
        <div className="mt-3 flex gap-2 overflow-x-auto hide-scrollbar">
          <button onClick={() => setMembersOpen(true)} className="chip tap inline-flex items-center gap-1.5">
            <Users className="h-4 w-4" /> Members
          </button>
          <button onClick={() => setGiveawayOpen(true)} className="chip tap inline-flex items-center gap-1.5 text-gold-400 border-gold-400/40">
            <Gift className="h-4 w-4" /> Giveaways
          </button>
          <button onClick={() => setPollsOpen(true)} className="chip tap inline-flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4" /> Polls
          </button>
          <button onClick={() => setQuizOpen(true)} className="chip tap inline-flex items-center gap-1.5">
            <Brain className="h-4 w-4" /> Quiz
          </button>
          {room.externalGameUrl && (
            <a href={room.externalGameUrl} target="_blank" rel="noreferrer noopener" className="chip tap inline-flex items-center gap-1.5">
              Open game ↗
            </a>
          )}
        </div>
      </header>

      {error && (
        <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300 flex items-center justify-between gap-3">
          <span>{error}</span>
          <Button size="sm" variant="danger" onClick={() => setRetryCount((c) => c + 1)}>Retry</Button>
        </div>
      )}

      {/* Chat */}
      <Card className="flex flex-col" style={{ height: 'min(70vh, 640px)' }}>
        <div className="flex-1 overflow-y-auto p-4 space-y-3" aria-live="polite" aria-label="Chat messages">
          {history.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : messages.length === 0 ? (
            <EmptyState
              title="No messages yet."
              description="Say hello — break the ice. 👋"
            />
          ) : (
            messages.map((message) => <MessageBubble key={message.id} message={message} isMe={message.sender?.id === user?.id} />)
          )}
          <div ref={bottomRef} />
        </div>

        {/* Typing indicator */}
        <div className="px-4 h-5 text-xs text-ink-400">
          {activeTyping.length > 0 && (
            <span>{activeTyping.slice(0, 2).join(', ')}{activeTyping.length > 2 ? ' and others' : ''} {activeTyping.length === 1 ? 'is' : 'are'} typing…</span>
          )}
        </div>

        {/* Composer */}
        <form onSubmit={sendMessage} className="border-t border-ink-700 p-3 flex gap-2">
          <Input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              sendTyping();
            }}
            placeholder={membership?.isMuted ? 'You are muted in this room' : 'Say something…'}
            maxLength={2000}
            disabled={Boolean(membership?.isMuted) || room.status === 'ended'}
            aria-label="Message"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!draft.trim() || Boolean(membership?.isMuted) || room.status === 'ended'}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </Card>

      <p className="mt-2 text-center text-xs text-ink-500">
        {isConnected() ? 'Realtime connected' : 'Reconnecting…'} · messages persist on the server
      </p>

      {/* Members sheet */}
      <MembersSheet open={membersOpen} onClose={() => setMembersOpen(false)} roomId={room.id} onlineIds={onlineIds} memberCount={memberCount ?? room.memberCount} peak={room.peakMemberCount} canModerate={Boolean(canModerate)} />

      {/* Share sheet */}
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} url={roomQuery.data?.shareUrl || window.location.href} title={room.name} />

      {/* Host controls */}
      <HostControls
        open={hostOpen}
        onClose={() => setHostOpen(false)}
        roomId={room.id}
        isHostRole={membership?.role === 'host'}
        isLocked={room.isLocked}
        status={room.status}
        mutate={sendMessageMutation.mutate}
        pending={sendMessageMutation.isPending}
      />

      {/* Giveaways */}
      <GiveawayPanel open={giveawayOpen} onClose={() => setGiveawayOpen(false)} roomId={room.id} isModerator={Boolean(isModerator)} canModerate={Boolean(canModerate)} />

      {/* Polls */}
      <PollPanel open={pollsOpen} onClose={() => setPollsOpen(false)} roomId={room.id} canCreate={Boolean(isModerator)} />

      {/* Quiz */}
      <QuizPanel open={quizOpen} onClose={() => setQuizOpen(false)} roomId={room.id} canStart={Boolean(isModerator)} />
    </div>
  );
}

function MessageBubble({ message, isMe }: { message: ChatMessage; isMe: boolean }) {
  if (message.isDeleted) {
    return (
      <div className="text-xs text-ink-500 italic pl-10">Message removed by a moderator.</div>
    );
  }
  const sender = message.sender;
  return (
    <div className={cn('flex gap-2.5', isMe && 'flex-row-reverse')}>
      <Avatar src={sender?.avatar ?? null} name={sender?.displayName || '?'} size={32} />
      <div className={cn('max-w-[78%] min-w-0', isMe && 'text-right')}>
        <div className="flex items-center gap-2 text-xs text-ink-500 mb-0.5" style={isMe ? { justifyContent: 'flex-end' } : undefined}>
          <span className="font-semibold text-ink-300">{sender?.displayName || 'Someone'}</span>
          <span>{timeAgo(message.createdAt)}</span>
          {message.pending && <span className="text-gold-400">sending…</span>}
        </div>
        {message.replyTo && (
          <div className="mb-1 rounded-lg border-l-2 border-naija-500 bg-ink-800 px-2 py-1 text-xs text-ink-400 text-left truncate">
            {message.replyTo.senderName}: {message.replyTo.excerpt}
          </div>
        )}
        <div
          className={cn(
            'inline-block rounded-2xl px-3.5 py-2 text-sm break-words text-left',
            message.isAnnouncement
              ? 'bg-gold-400/15 border border-gold-400/40 text-gold-200'
              : isMe
                ? 'bg-naija-600 text-white rounded-tr-sm'
                : 'bg-ink-700 text-ink-100 rounded-tl-sm',
          )}
        >
          {message.content}
          {message.attachments?.map((a) => (
            <img key={a.url} src={a.url} alt="" className="mt-2 rounded-lg max-h-60" loading="lazy" />
          ))}
        </div>
        {message.reactions?.length > 0 && (
          <div className={cn('mt-1 flex gap-1 flex-wrap', isMe && 'justify-end')}>
            {message.reactions.map((r) => (
              <span key={r.emoji} className="rounded-full bg-ink-800 border border-ink-600 px-2 py-0.5 text-xs">
                {r.emoji} {r.count}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MembersSheet({
  open,
  onClose,
  roomId,
  onlineIds,
  memberCount,
  peak,
  canModerate,
}: {
  open: boolean;
  onClose: () => void;
  roomId: string;
  onlineIds: string[];
  memberCount: number;
  peak: number;
  canModerate: boolean;
}) {
  const query = useQuery({
    queryKey: ['room-members', roomId],
    queryFn: () => api.get<{ items: { user: { id: string; username: string; displayName: string; avatar: string | null; level: number } | null; role: string; isMuted: boolean; joinedAt: string }[]; peakMemberCount: number; memberCount: number }>(`/api/rooms/${roomId}/members`),
    enabled: open && Boolean(roomId),
  });

  return (
    <Modal open={open} onClose={onClose} title={`Members · ${memberCount} inside`} sheet>
      <p className="text-xs text-ink-500 mb-3">Peak {peak} · green dot = online now</p>
      {query.isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <ul className="space-y-1">
          {(query.data?.items ?? []).map((m) => (
            <li key={m.user?.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-ink-800">
              <div className="relative">
                <Avatar src={m.user?.avatar ?? null} name={m.user?.displayName || '?'} size={36} />
                {m.user && onlineIds.includes(m.user.id) && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-naija-400 ring-2 ring-ink-850" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white flex items-center gap-1">
                  {m.user?.displayName}
                  {m.role === 'host' && <Crown className="h-3.5 w-3.5 text-gold-400" />}
                  {m.isMuted && <Badge tone="danger">muted</Badge>}
                </p>
                <p className="text-xs text-ink-500">@{m.user?.username} · {m.role}</p>
              </div>
              <Link to={`/u/${m.user?.username}`} className="text-xs text-naija-400" onClick={onClose}>View</Link>
            </li>
          ))}
        </ul>
      )}
      {canModerate && <p className="mt-4 text-xs text-ink-500">As a host/moderator you can mute, kick and ban from Host controls.</p>}
    </Modal>
  );
}

function ShareModal({ open, onClose, url, title }: { open: boolean; onClose: () => void; url: string; title: string }) {
  const message = `Pull up to “${title}” on NaijaPlay`;
  return (
    <Modal open={open} onClose={onClose} title="Share room" sheet>
      <div className="space-y-3">
        <p className="rounded-xl bg-ink-800 border border-ink-700 p-3 text-sm break-all">{url}</p>
        <div className="grid grid-cols-3 gap-3">
          <a href={shareTargets.whatsapp(url, message)} target="_blank" rel="noreferrer noopener" className="flex flex-col items-center gap-1 rounded-2xl border border-ink-700 p-4 text-sm hover:bg-ink-800">
            💬 WhatsApp
          </a>
          <a href={shareTargets.x(url, message)} target="_blank" rel="noreferrer noopener" className="flex flex-col items-center gap-1 rounded-2xl border border-ink-700 p-4 text-sm hover:bg-ink-800">
            𝕏 X
          </a>
          <a href={shareTargets.telegram(url, message)} target="_blank" rel="noreferrer noopener" className="flex flex-col items-center gap-1 rounded-2xl border border-ink-700 p-4 text-sm hover:bg-ink-800">
            ✈️ Telegram
          </a>
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
            if (await copyToClipboard(url)) toast.success('Link copied');
            else toast.error('Copy failed');
          }}
        >
          Copy link
        </Button>
      </div>
    </Modal>
  );
}

function HostControls({
  open,
  onClose,
  roomId,
  isHostRole,
  isLocked,
  status,
  mutate,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  roomId: string;
  isHostRole: boolean;
  isLocked: boolean;
  status: string;
  mutate: (vars: { action: string; targetUserId?: string }) => void;
  pending: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Host controls" sheet>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => mutate({ action: isLocked ? 'unlock' : 'lock' })} loading={pending}>
            {isLocked ? <><Unlock className="h-4 w-4" /> Unlock</> : <><Lock className="h-4 w-4" /> Lock room</>}
          </Button>
          <Button
            variant="danger"
            disabled={status === 'ended' || !isHostRole}
            onClick={() => {
              if (window.confirm('End this room for everyone? A recap will be generated.')) {
                mutate({ action: 'end' });
                onClose();
              }
            }}
          >
            End room
          </Button>
        </div>
        <p className="text-xs text-ink-500">
          Mute/kick/ban: open the Members sheet, tap a member's role. All actions are enforced server-side.
        </p>
        <div className="rounded-xl border border-ink-700 bg-ink-800 p-3 text-xs text-ink-400">
          <p className="font-semibold text-ink-200 mb-1">Tips</p>
          <p>• Type <code className="text-naija-400">!announce your message</code> in chat to post an announcement.</p>
          <p>• Polls and quizzes are server-authoritative — results update live.</p>
          <p>• Prizes are paid by bank transfer: host drops aza in chat, winner gets the alert.</p>
        </div>
      </div>
    </Modal>
  );
}

function GiveawayPanel({
  open,
  onClose,
  roomId,
  isModerator,
}: {
  open: boolean;
  onClose: () => void;
  roomId: string;
  isModerator: boolean;
  canModerate: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [remaining, setRemaining] = useState('');
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [prize, setPrize] = useState('');
  const [winners, setWinners] = useState(1);
  const [duration, setDuration] = useState(300);

  const query = useQuery({
    queryKey: ['room', roomId, 'giveaways'],
    queryFn: () =>
      api.get<{
        active: { id: string; title: string; prize: string; type: string; winnerCount: number; entryCondition: string; endsAt: string } | null;
        past: { id: string; title: string; prize: string; winnerIds: string[]; endsAt: string }[];
        enteredIds: string[];
      }>(`/api/rooms/${roomId}/giveaways`),
    enabled: open && Boolean(roomId),
    refetchInterval: 10_000,
  });

  const active = query.data?.active;
  const hasEntered = active ? query.data?.enteredIds.includes(active.id) : false;

  useEffect(() => {
    if (!active) return undefined;
    const tick = () => setRemaining(countdown(active.endsAt));
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [active]);

  const enterMutation = useMutation({
    mutationFn: (giveawayId: string) => api.post(`/api/rooms/${roomId}/giveaways/${giveawayId}/enter`),
    onSuccess: () => {
      toast.success('You are in! 🎉', 'Winners are picked by the server when time runs out.');
      void qc.invalidateQueries({ queryKey: ['room', roomId, 'giveaways'] });
    },
    onError: (err) => toast.error('Could not enter', (err as Error).message),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/rooms/${roomId}/giveaways`, {
        title,
        prize,
        type: 'custom',
        winnerCount: winners,
        entryCondition: 'in_room',
        durationSeconds: duration,
      }),
    onSuccess: () => {
      toast.success('Giveaway live! 🎁');
      setCreating(false);
      setTitle('');
      setPrize('');
      void qc.invalidateQueries({ queryKey: ['room', roomId, 'giveaways'] });
    },
    onError: (err) => toast.error('Could not start', (err as Error).message),
  });

  return (
    <Modal open={open} onClose={onClose} title="Giveaways" sheet>
      <div className="space-y-4">
        {active ? (
          <div className="rounded-2xl border border-gold-400/40 bg-gold-400/10 p-4">
            <div className="flex items-center justify-between">
              <Badge tone="gold">Live</Badge>
              <span className="inline-flex items-center gap-1 text-sm font-bold text-gold-400">
                <Timer className="h-4 w-4" /> {remaining}
              </span>
            </div>
            <h3 className="font-display font-bold text-white mt-2">{active.title}</h3>
            <p className="text-sm text-ink-300">Prize: {active.prize} · {active.winnerCount} winner(s)</p>
            <p className="text-xs text-ink-500 mt-1">Condition: {active.entryCondition.replace('_', ' ')}</p>
            <Button
              className="w-full mt-3"
              variant="gold"
              disabled={hasEntered}
              loading={enterMutation.isPending}
              onClick={() => enterMutation.mutate(active.id)}
            >
              {hasEntered ? <><CheckCircle2 className="h-4 w-4" /> You're entered</> : 'Enter giveaway'}
            </Button>
            <p className="text-[11px] text-ink-500 mt-2 text-center">One entry per account. Winners picked server-side.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-ink-700 bg-ink-800 p-4 text-center">
            <Gift className="mx-auto h-8 w-8 text-ink-500 mb-2" />
            <p className="text-sm text-ink-400">No giveaway running.</p>
          </div>
        )}

        {(query.data?.past?.length ?? 0) > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-ink-300 mb-2">Past giveaways</h4>
            <ul className="space-y-1.5">
              {query.data!.past.map((g) => (
                <li key={g.id} className="rounded-xl border border-ink-700 bg-ink-800 px-3 py-2 text-sm flex items-center justify-between">
                  <span className="truncate">{g.title} · {g.prize}</span>
                  <Badge tone="naija">{g.winnerIds.length} won</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isModerator && (
          creating ? (
            <div className="space-y-3 rounded-2xl border border-ink-700 p-4">
              <div>
                <Label htmlFor="g-title">Title</Label>
                <Input id="g-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Jollof Friday drop" />
              </div>
              <div>
                <Label htmlFor="g-prize">Prize</Label>
                <Input id="g-prize" value={prize} onChange={(e) => setPrize(e.target.value)} placeholder="₦5,000 airtime" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="g-winners">Winners</Label>
                  <Input id="g-winners" type="number" min={1} max={50} value={winners} onChange={(e) => setWinners(Number(e.target.value))} />
                </div>
                <div>
                  <Label htmlFor="g-duration">Duration (s)</Label>
                  <Input id="g-duration" type="number" min={30} max={7200} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setCreating(false)}>Cancel</Button>
                <Button
                  className="flex-1"
                  loading={createMutation.isPending}
                  disabled={!title.trim() || !prize.trim()}
                  onClick={() => createMutation.mutate()}
                >
                  Start giveaway
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="gold" className="w-full" onClick={() => setCreating(true)}>
              <Gift className="h-4 w-4" /> Start a giveaway
            </Button>
          )
        )}
      </div>
    </Modal>
  );
}

function PollPanel({ open, onClose, roomId, canCreate }: { open: boolean; onClose: () => void; roomId: string; canCreate: boolean }) {
  const qc = useQueryClient();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [creating, setCreating] = useState(false);

  const query = useQuery({
    queryKey: ['polls', roomId],
    queryFn: () => api.get<{ polls: { id: string; question: string; options: { id: string; text: string; votes: number }[]; totalVotes: number; endsAt: string; closed: boolean }[] }>(`/api/rooms/${roomId}/polls`),
    enabled: open && Boolean(roomId),
    refetchInterval: 8000,
  });

  const voteMutation = useMutation({
    mutationFn: ({ pollId, optionId }: { pollId: string; optionId: string }) =>
      api.post(`/api/rooms/${roomId}/polls/${pollId}/vote`, { optionId }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['polls', roomId] }),
    onError: (err) => toast.error('Vote failed', (err as Error).message),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post(`/api/rooms/${roomId}/polls`, { question, options: options.filter(Boolean), durationSeconds: 300 }),
    onSuccess: () => {
      toast.success('Poll live');
      setCreating(false);
      setQuestion('');
      setOptions(['', '']);
      void qc.invalidateQueries({ queryKey: ['polls', roomId] });
    },
    onError: (err) => toast.error('Could not create poll', (err as Error).message),
  });

  return (
    <Modal open={open} onClose={onClose} title="Polls" sheet>
      <div className="space-y-4">
        {(query.data?.polls?.length ?? 0) === 0 && !creating && (
          <EmptyState title="No polls yet." description={canCreate ? 'Ask the room something.' : 'Hosts can start polls.'} />
        )}
        {(query.data?.polls ?? []).map((poll) => (
          <div key={poll.id} className="rounded-2xl border border-ink-700 bg-ink-800 p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-white">{poll.question}</h4>
              <Badge tone={poll.closed ? 'default' : 'naija'}>{poll.closed ? 'Closed' : 'Live'}</Badge>
            </div>
            <div className="space-y-2">
              {poll.options.map((opt) => {
                const pct = poll.totalVotes ? Math.round((opt.votes / poll.totalVotes) * 100) : 0;
                return (
                  <button
                    key={opt.id}
                    disabled={poll.closed}
                    onClick={() => voteMutation.mutate({ pollId: poll.id, optionId: opt.id })}
                    className="relative w-full rounded-xl border border-ink-600 px-3 py-2 text-left overflow-hidden disabled:cursor-not-allowed"
                  >
                    <span className="absolute inset-y-0 left-0 bg-naija-500/20 transition-all" style={{ width: `${pct}%` }} aria-hidden />
                    <span className="relative flex justify-between text-sm">
                      <span className="text-white">{opt.text}</span>
                      <span className="text-ink-300 font-semibold">{pct}%</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-ink-500">{poll.totalVotes} votes · one vote per account</p>
          </div>
        ))}

        {canCreate && (
          creating ? (
            <div className="space-y-3 rounded-2xl border border-ink-700 p-4">
              <div>
                <Label htmlFor="p-q">Question</Label>
                <Input id="p-q" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Who's winning Lagos Run tonight?" />
              </div>
              {options.map((opt, i) => (
                <div key={i}>
                  <Label htmlFor={`p-o${i}`}>Option {i + 1}</Label>
                  <Input id={`p-o${i}`} value={opt} onChange={(e) => setOptions((prev) => prev.map((p, idx) => (idx === i ? e.target.value : p)))} />
                </div>
              ))}
              {options.length < 6 && (
                <Button variant="ghost" size="sm" onClick={() => setOptions((prev) => [...prev, ''])}>+ Add option</Button>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setCreating(false)}>Cancel</Button>
                <Button className="flex-1" loading={createMutation.isPending} disabled={!question.trim() || options.filter(Boolean).length < 2} onClick={() => createMutation.mutate()}>
                  Start poll
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
              <BarChart3 className="h-4 w-4" /> Create poll
            </Button>
          )
        )}
      </div>
    </Modal>
  );
}

function QuizPanel({ open, onClose, roomId, canStart }: { open: boolean; onClose: () => void; roomId: string; canStart: boolean }) {
  const qc = useQueryClient();
  const [current, setCurrent] = useState<{ round: number; question: string; options: string[]; endsAt: string } | null>(null);
  const [answered, setAnswered] = useState<number | null>(null);
  const [result, setResult] = useState<{ correct: boolean; eliminated: boolean } | null>(null);
  const [players, setPlayers] = useState<{ userId: string; displayName: string; eliminated: boolean; correctCount: number }[]>([]);
  const [status, setStatus] = useState('none');
  const [winner, setWinner] = useState<string | null>(null);
  const [quizId, setQuizId] = useState<string | null>(null);
  const [timer, setTimer] = useState('');
  const [eliminated, setEliminated] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['quiz', roomId],
    queryFn: () => api.get<{ quiz: { id: string; status: string; currentRound: number; totalRounds: number; players: { userId: string; displayName: string; eliminated: boolean; correctCount: number }[]; winner: string | null } | null }>(`/api/rooms/${roomId}/quiz`),
    enabled: open && Boolean(roomId),
    refetchInterval: 5000,
  });

  useEffect(() => {
    const quiz = query.data?.quiz;
    if (!quiz) return;
    setStatus(quiz.status);
    setQuizId(quiz.id);
    if (quiz.players) setPlayers(quiz.players);
    if (quiz.winner) setWinner(quiz.winner);
  }, [query.data]);

  useEffect(() => {
    if (!current) return undefined;
    const tick = () => {
      const ms = new Date(current.endsAt).getTime() - Date.now();
      setTimer(ms > 0 ? `${Math.floor(ms / 1000)}s` : '0s');
    };
    tick();
    const interval = setInterval(tick, 300);
    return () => clearInterval(interval);
  }, [current]);

  // Socket listeners for quiz events
  useEffect(() => {
    if (!open) return undefined;
    const socket = getSocket();
    const onQuestion = (payload: { round: number; question: string; options: string[]; endsAt: string }) => {
      setCurrent(payload);
      setAnswered(null);
      setResult(null);
      setStatus('active');
    };
    const onAnswerResult = (payload: { correct: boolean; eliminated: boolean }) => {
      setResult(payload);
    };
    const onEliminated = (payload: { userId: string; displayName: string }) => {
      setEliminated(payload.userId);
      setPlayers((prev) => prev.map((p) => (p.userId === payload.userId ? { ...p, eliminated: true } : p)));
    };
    const onRoundEnded = (payload: { correctIndex: number }) => {
      void payload;
      setCurrent(null);
    };
    const onFinished = (payload: { winnerId: string | null; winnerName: string | null }) => {
      setWinner(payload.winnerName);
      setStatus('finished');
      setCurrent(null);
      toast.success('Quiz finished! 🏆', payload.winnerName ? `${payload.winnerName} takes it.` : undefined);
    };
    const onState = (payload: { players?: { userId: string; displayName: string; eliminated: boolean; correctCount: number }[]; status?: string }) => {
      if (payload.players) setPlayers(payload.players);
      if (payload.status) setStatus(payload.status);
    };
    socket.on('quiz:question', onQuestion);
    socket.on('quiz:answer-result', onAnswerResult);
    socket.on('quiz:player-eliminated', onEliminated);
    socket.on('quiz:round-ended', onRoundEnded);
    socket.on('quiz:finished', onFinished);
    socket.on('quiz:state', onState);
    return () => {
      socket.off('quiz:question', onQuestion);
      socket.off('quiz:answer-result', onAnswerResult);
      socket.off('quiz:player-eliminated', onEliminated);
      socket.off('quiz:round-ended', onRoundEnded);
      socket.off('quiz:finished', onFinished);
      socket.off('quiz:state', onState);
    };
  }, [open]);

  const createMutation = useMutation({
    mutationFn: () => api.post<{ quiz: { id: string } }>(`/api/rooms/${roomId}/quiz`, {}),
    onSuccess: (data) => {
      setQuizId(data.quiz.id);
      setStatus('lobby');
      toast.success('Quiz ready', 'Press start when everyone is in.');
      void qc.invalidateQueries({ queryKey: ['quiz', roomId] });
    },
    onError: (err) => toast.error('Could not create quiz', (err as Error).message),
  });

  const startMutation = useMutation({
    mutationFn: () => api.post(`/api/rooms/${roomId}/quiz/${quizId}/start`),
    onSuccess: () => {
      setStatus('active');
      toast.success('Quiz started! 🧠');
    },
    onError: (err) => toast.error('Could not start', (err as Error).message),
  });

  async function answer(index: number) {
    if (!current || answered !== null) return;
    setAnswered(index);
    try {
      const response = await emitAck<{ ok: boolean; correct?: boolean; eliminated?: boolean; message?: string }>('quiz:answer', {
        roomId,
        round: current.round,
        answerIndex: index,
      });
      if (response.ok === false) {
        toast.error(response.message || 'Answer rejected');
        setAnswered(null);
      } else {
        setResult({ correct: Boolean(response.correct), eliminated: Boolean(response.eliminated) });
      }
    } catch {
      toast.error('Could not submit answer');
      setAnswered(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Naija Quiz" sheet className="max-h-[95vh]">
      <div className="space-y-4">
        {/* Full-screen style quiz when active */}
        {current && (
          <div className="rounded-2xl border border-naija-500/50 bg-ink-800 p-5 animate-slide-up">
            <div className="flex items-center justify-between mb-3">
              <Badge tone="naija">Round {current.round}</Badge>
              <span className="inline-flex items-center gap-1 text-sm font-bold text-gold-400">
                <Timer className="h-4 w-4" /> {timer}
              </span>
            </div>
            <h3 className="font-display text-lg font-bold text-white">{current.question}</h3>
            <div className="mt-4 grid gap-2">
              {current.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => answer(i)}
                  disabled={answered !== null}
                  className={cn(
                    'rounded-xl border px-4 py-3 text-left text-sm transition tap',
                    answered === i
                      ? 'border-naija-500 bg-naija-500/15 text-white'
                      : 'border-ink-600 bg-ink-850 text-ink-100 hover:border-ink-500',
                    result && i === answered && !result.correct && 'border-red-500 bg-red-500/10',
                  )}
                >
                  <span className="font-semibold mr-2">{String.fromCharCode(65 + i)}.</span> {opt}
                </button>
              ))}
            </div>
            {result && (
              <p className={cn('mt-3 text-sm font-semibold', result.correct ? 'text-naija-400' : 'text-red-400')}>
                {result.correct ? '✅ Correct!' : result.eliminated ? '❌ Eliminated. Better luck next round.' : '❌ Wrong answer.'}
              </p>
            )}
          </div>
        )}

        {/* Lobby / state */}
        {!current && (
          <div className="rounded-2xl border border-ink-700 bg-ink-800 p-4">
            {status === 'none' && (
              <div className="text-center">
                <Brain className="mx-auto h-8 w-8 text-ink-500 mb-2" />
                <p className="text-sm text-ink-400">No quiz set up for this room.</p>
                {canStart && (
                  <Button className="mt-3" loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
                    Set up quiz
                  </Button>
                )}
              </div>
            )}
            {status === 'lobby' && (
              <div className="text-center">
                <p className="font-display font-bold text-white">Quiz ready — {players.length || 'no'} players</p>
                <p className="text-xs text-ink-400 mt-1">Squid-game style: wrong answers eliminate you. Last one standing wins.</p>
                {canStart && quizId && (
                  <Button className="mt-3" loading={startMutation.isPending} onClick={() => startMutation.mutate()}>
                    Start quiz
                  </Button>
                )}
              </div>
            )}
            {status === 'finished' && (
              <div className="text-center">
                <Trophy className="mx-auto h-8 w-8 text-gold-400 mb-2" />
                <p className="font-display font-bold text-white">{winner ? `${winner} wins! 🏆` : 'Quiz finished'}</p>
              </div>
            )}
          </div>
        )}

        {/* Players */}
        {players.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-ink-300 mb-2">Players</h4>
            <ul className="grid grid-cols-2 gap-2">
              {players.map((p) => (
                <li
                  key={p.userId}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-sm flex items-center justify-between',
                    p.eliminated ? 'border-ink-700 bg-ink-850 opacity-50 line-through' : 'border-naija-500/40 bg-naija-500/5',
                  )}
                >
                  <span className="truncate text-white">{p.displayName}</span>
                  <span className="text-xs text-ink-400">{p.correctCount}✓</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {eliminated && <p className="text-center text-sm text-red-400">You were eliminated this round.</p>}
      </div>
    </Modal>
  );
}
