import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Globe2, Pencil, LogIn } from 'lucide-react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth';
import { useGuestStore } from '@/stores/guest';
import { toast } from '@/stores/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, Avatar, Badge, Skeleton } from '@/components/ui/card';
import { timeAgo, cn } from '@/lib/utils';
import type { GlobalMessageView } from '@naijaplay/shared';

interface Presence {
  onlineCount: number;
  users: { id: string; displayName: string; guest: boolean }[];
}

interface UserHit {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
}

/** Render @mentions as profile links (registered) or highlights (unknown). */
export function GlobalMessageBody({ message }: { message: GlobalMessageView }) {
  const known = useMemo(() => new Set(message.mentions.map((m) => m.username.toLowerCase())), [message]);
  const parts = message.content.split(/(@[A-Za-z0-9_]{3,24})/g);
  return (
    <span className="break-words">
      {parts.map((part, i) => {
        if (!part.startsWith('@')) return <span key={i}>{part}</span>;
        const name = part.slice(1);
        if (known.has(name.toLowerCase())) {
          return (
            <Link key={i} to={`/u/${name}`} className="font-semibold text-naija-300 hover:text-naija-200 hover:underline">
              {part}
            </Link>
          );
        }
        return (
          <span key={i} className="font-semibold text-naija-300/80">
            {part}
          </span>
        );
      })}
    </span>
  );
}

function appendMessage(qc: ReturnType<typeof useQueryClient>, msg: GlobalMessageView) {
  qc.setQueryData<{ items: GlobalMessageView[]; nextCursor: string | null }>(['global', 'messages'], (old) => {
    if (!old) return { items: [msg], nextCursor: null };
    if (old.items.some((m) => m.id === msg.id)) return old;
    return { ...old, items: [...old.items.slice(-99), msg] };
  });
}

function removeMessage(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.setQueryData<{ items: GlobalMessageView[]; nextCursor: string | null }>(['global', 'messages'], (old) => {
    if (!old) return old;
    return { ...old, items: old.items.filter((m) => m.id !== id) };
  });
}

export default function GlobalChatPanel({ compact = false, className }: { compact?: boolean; className?: string }) {
  const user = useAuthStore((s) => s.user);
  const fetched = useAuthStore((s) => s.fetched);
  const { guestId, guestName, ready, ensureGuest, setGuestName } = useGuestStore();
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [presence, setPresence] = useState<Presence>({ onlineCount: 0, users: [] });
  const [typing, setTyping] = useState<{ id: string; displayName: string } | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [tagQuery, setTagQuery] = useState<string | null>(null);
  const [tagIndex, setTagIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const location = useLocation();
  // On the dedicated page the panel IS the page: full height, no self-link.
  const isFullPage = location.pathname === '/global';

  // Public surface: resolve the session so members don't chat as guests.
  useEffect(() => {
    if (!fetched) void useAuthStore.getState().fetchUser();
  }, [fetched]);

  // Guest identity for signed-out visitors (after the session resolves).
  useEffect(() => {
    if (fetched && !user) void ensureGuest();
  }, [fetched, user, ensureGuest]);

  const history = useQuery({
    queryKey: ['global', 'messages'],
    queryFn: () => api.get<{ items: GlobalMessageView[]; nextCursor: string | null }>('/api/global/messages?limit=50'),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  const messages = history.data?.items ?? [];

  // Autoscroll when new messages arrive (only if already near the bottom).
  const stickToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight }));
  }, []);

  useEffect(() => {
    stickToBottom();
  }, [messages.length, stickToBottom]);

  // Realtime: join lobby, stream messages + presence + typing.
  useEffect(() => {
    if (!fetched) return;
    if (!user && !ready) return;
    const socket = getSocket();
    socket.auth = user ? {} : { guestId: guestId || undefined, guestName: guestName || undefined };
    if (!socket.connected) socket.connect();
    socket.emit('global:join', { guestId: guestId || undefined, guestName: guestName || undefined });

    const onMessage = (msg: GlobalMessageView) => {
      appendMessage(qc, msg);
    };
    const onPresence = (p: Presence) => setPresence(p);
    const onTyping = (t: { id: string; displayName: string; typing: boolean }) => {
      if (!t.typing) {
        setTyping((cur) => (cur?.id === t.id ? null : cur));
        return;
      }
      setTyping({ id: t.id, displayName: t.displayName });
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping((cur) => (cur?.id === t.id ? null : cur)), 2500);
    };
    socket.on('global:message', onMessage);
    socket.on('global:presence', onPresence);
    socket.on('global:typing', onTyping);
    return () => {
      socket.off('global:message', onMessage);
      socket.off('global:presence', onPresence);
      socket.off('global:typing', onTyping);
    };
  }, [fetched, user, ready, guestId, guestName, qc]);

  // @tag autocomplete (registered users only).
  const tagSearch = useQuery({
    queryKey: ['global', 'tag', tagQuery],
    queryFn: () =>
      api.get<{ users: UserHit[] }>(`/api/search?q=${encodeURIComponent(tagQuery || '')}&type=users`),
    enabled: tagQuery !== null && tagQuery.length >= 1,
    staleTime: 30_000,
  });
  const tagHits = (tagSearch.data?.users ?? []).slice(0, 5);

  const updateDraft = (value: string) => {
    setDraft(value);
    // Detect an @token at the end of the text.
    const m = value.slice(0, textareaRef.current?.selectionStart || value.length).match(/@([A-Za-z0-9_]{1,24})$/);
    setTagQuery(m ? m[1] : null);
    setTagIndex(0);
    // Ephemeral typing signal.
    try {
      getSocket().emit('global:typing', { typing: true });
    } catch {
      /* socket not ready yet */
    }
  };

  const applyTag = (username: string) => {
    const el = textareaRef.current;
    const pos = el?.selectionStart ?? draft.length;
    const before = draft.slice(0, pos).replace(/@[A-Za-z0-9_]{1,24}$/, `@${username} `);
    const after = draft.slice(pos);
    setDraft(before + after);
    setTagQuery(null);
    el?.focus();
  };

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    if (!user && (!guestId || !guestName)) {
      toast.info('Getting your guest pass…', 'Try again in a second.');
      void ensureGuest();
      return;
    }
    // Optimistic: paint the message instantly, reconcile with the server after.
    const tempId = `temp-${Date.now()}`;
    const optimistic: GlobalMessageView = {
      id: tempId,
      sender: user
        ? {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatar: user.avatar ?? null,
            guest: false,
            isVerified: user.isVerified,
            level: user.level,
          }
        : {
            id: guestId || tempId,
            username: (guestName || 'Anon').replace(/\s+/g, ''),
            displayName: guestName || 'Anon',
            avatar: null,
            guest: true,
          },
      content: content.slice(0, 500),
      mentions: [],
      createdAt: new Date().toISOString(),
    };
    appendMessage(qc, optimistic);
    setDraft('');
    setTagQuery(null);
    setSending(true);
    try {
      const data = await api.post<{ message: GlobalMessageView }>('/api/global/messages', {
        content: content.slice(0, 500),
        ...(user ? {} : { guestId, guestName }),
      });
      // Swap the optimistic row for the real one (socket echo dedupes by id).
      removeMessage(qc, tempId);
      appendMessage(qc, data.message);
    } catch (err) {
      removeMessage(qc, tempId);
      setDraft(content);
      toast.error('Message not sent', (err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const saveName = async () => {
    const name = nameDraft.trim();
    if (name.length < 3 || name.length > 20) {
      toast.error('Name must be 3–20 characters', 'Letters, numbers, spaces and underscores only.');
      return;
    }
    try {
      const data = await api.post<{ guestName: string }>('/api/global/guest-name', { guestName: name });
      setGuestName(data.guestName);
      setEditingName(false);
      toast.success(`You're now chatting as ${data.guestName}`);
    } catch (err) {
      toast.error('Could not update name', (err as Error).message);
    }
  };

  return (
    <Card className={cn('flex flex-col overflow-hidden', isFullPage && 'h-[calc(100dvh-13rem)] min-h-[480px]', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b-2 border-ink-700 bg-ink-950 px-4 py-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-naija-400 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-naija-400" />
        </span>
        <p className="font-display uppercase text-paper text-sm">Global chat</p>
        <span className="sticker sticker-green !text-[10px] !py-0.5">
          {presence.onlineCount > 0 ? `${presence.onlineCount} inside` : '…'}
        </span>
        {!isFullPage && (
          <Link to="/global" className="ml-auto text-[11px] font-black uppercase tracking-wider text-gold-400 hover:text-gold-300">
            Full chat →
          </Link>
        )}
      </div>

      {/* Guest banner */}
      {!user && (
        <div className="border-b-2 border-ink-700 bg-gold-400 px-4 py-2.5 text-xs text-ink-950 font-semibold">
          {editingName ? (
            <span className="flex items-center gap-2">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={20}
                className="h-8 text-xs"
                placeholder="Anon1234"
                aria-label="Guest display name"
              />
              <Button size="sm" onClick={saveName}>
                Save
              </Button>
              <button onClick={() => setEditingName(false)} className="text-ink-400 hover:text-white">
                Cancel
              </button>
            </span>
          ) : (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                Chatting as <strong className="text-white">{guestName || '…'}</strong>{' '}
                <Badge tone="outline">guest</Badge>
              </span>
              <button
                onClick={() => {
                  setNameDraft(guestName || '');
                  setEditingName(true);
                }}
                className="inline-flex items-center gap-1 font-semibold text-naija-400 hover:text-naija-300"
              >
                <Pencil className="h-3 w-3" /> Edit name
              </button>
              <Link to="/signin" className="inline-flex items-center gap-1 font-semibold text-gold-400 hover:text-gold-300">
                <LogIn className="h-3 w-3" /> Sign in to keep your name
              </Link>
            </span>
          )}
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className={cn(
          'flex-1 space-y-3 overflow-y-auto px-4 py-3',
          isFullPage ? 'max-h-none min-h-0' : compact ? 'max-h-80' : 'max-h-[55vh] min-h-[320px]',
        )}
        aria-live="polite"
        aria-label="Global chat messages"
      >
        {history.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="py-8 text-center">
            <p className="font-display font-bold text-white">Nobody has said anything yet.</p>
            <p className="mt-1 text-sm text-ink-400">Break the ice — say hello. 👋</p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="flex items-start gap-2.5">
              <Avatar src={m.sender.avatar} name={m.sender.displayName} size={30} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
                  {m.sender.guest ? (
                    <span className="font-semibold text-ink-200">{m.sender.displayName}</span>
                  ) : (
                    <Link to={`/u/${m.sender.username}`} className="font-semibold text-white hover:text-naija-300">
                      {m.sender.displayName}
                    </Link>
                  )}
                  {m.sender.guest ? (
                    <Badge tone="outline">guest</Badge>
                  ) : (
                    <span className="text-ink-500">@{m.sender.username}</span>
                  )}
                  <span className="text-ink-600">{timeAgo(m.createdAt)}</span>
                </p>
                <p className="mt-0.5 text-sm text-ink-100">
                  <GlobalMessageBody message={m} />
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Typing */}
      <div className="h-5 px-4 text-xs text-ink-400">
        {typing && <span>{typing.displayName} is typing…</span>}
      </div>

      {/* Composer */}
      <div className="relative border-t border-ink-700/70 p-3">
        {tagQuery !== null && (
          <div className="absolute inset-x-3 bottom-full mb-1 overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-xl">
            {tagSearch.isLoading ? (
              <p className="px-3 py-2 text-xs text-ink-400">Searching people…</p>
            ) : tagHits.length === 0 ? (
              <p className="px-3 py-2 text-xs text-ink-400">
                No match for “@{tagQuery}” — keep typing or pick someone below.
              </p>
            ) : (
              <ul>
                {tagHits.map((hit, i) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onClick={() => applyTag(hit.username)}
                      onMouseEnter={() => setTagIndex(i)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                        i === tagIndex ? 'bg-ink-700 text-white' : 'text-ink-200',
                      )}
                    >
                      <Avatar src={hit.avatar} name={hit.displayName} size={24} />
                      <span className="font-semibold">{hit.displayName}</span>
                      <span className="text-xs text-ink-500">@{hit.username}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (tagQuery !== null && tagHits[tagIndex]) {
              applyTag(tagHits[tagIndex].username);
              return;
            }
            void send();
          }}
        >
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => updateDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (tagQuery !== null && tagHits[tagIndex]) applyTag(tagHits[tagIndex].username);
                else void send();
              } else if (e.key === 'ArrowDown' && tagQuery !== null && tagHits.length > 0) {
                e.preventDefault();
                setTagIndex((i) => (i + 1) % tagHits.length);
              } else if (e.key === 'ArrowUp' && tagQuery !== null && tagHits.length > 0) {
                e.preventDefault();
                setTagIndex((i) => (i - 1 + tagHits.length) % tagHits.length);
              } else if (e.key === 'Escape') {
                setTagQuery(null);
              }
            }}
            placeholder={user ? `Chat as @${user.username}… (type @ to tag)` : 'Chat as a guest… (type @ to tag)'}
            maxLength={500}
            rows={2}
            aria-label="Global chat message"
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-white placeholder:text-ink-500 focus:border-naija-500 focus:outline-none"
          />
          <Button type="submit" size="icon" disabled={!draft.trim() || sending} aria-label="Send message">
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <p className="mt-1.5 text-[11px] text-ink-500">
          {user ? (
            <>Posting as <span className="text-ink-300">@{user.username}</span> · be kind, no spam.</>
          ) : (
            <>Posting as <span className="text-ink-300">{guestName || 'guest'}</span> · be kind, no spam.</>
          )}
        </p>
      </div>
    </Card>
  );
}
