import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Send, Image as ImageIcon, X } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useMoments, useGames } from '@/hooks/useSharedData';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/ui';
import { Button } from '@/components/ui/button';
import { Textarea, Label, FieldError, Select } from '@/components/ui/input';
import { Card, Badge, Avatar, EmptyState, Skeleton, ButtonLink } from '@/components/ui/card';
import { timeAgo, cn, formatCount } from '@/lib/utils';
import type { MomentView, GameSummary } from '@naijaplay/shared';

export default function MomentsPage() {
  const [tab, setTab] = useState<'new' | 'top'>('new');
  const [composerOpen, setComposerOpen] = useState(false);
  const moments = useMoments(tab);

  return (
    <div className="page-shell max-w-2xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-white">Moment Wall</h1>
          <p className="text-sm text-ink-400">Screenshots, clips and the things that made you laugh.</p>
        </div>
        <Button onClick={() => setComposerOpen((s) => !s)}>
          <Camera className="h-4 w-4" /> Post
        </Button>
      </div>

      {composerOpen && <MomentComposer onClose={() => setComposerOpen(false)} />}

      <div className="flex gap-2" role="tablist" aria-label="Moment feeds">
        {(['new', 'top'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn('chip', tab === t && 'chip-active')}>
            {t === 'new' ? 'Latest' : 'Top this week'}
          </button>
        ))}
      </div>

      {moments.isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : (moments.data?.items?.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            icon={<Camera className="h-10 w-10" />}
            title="Nothing here yet."
            description="Be the first to post a moment."
            action={<Button onClick={() => setComposerOpen(true)}>Post a moment</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {moments.data!.items.map((moment) => (
            <MomentCard key={moment.id} moment={moment} />
          ))}
        </div>
      )}
    </div>
  );
}

function MomentCard({ moment }: { moment: MomentView }) {
  const author = moment.author;
  return (
    <Link to={`/moments/${moment.id}`}>
      <Card className="p-4 hover:border-ink-500 transition tap">
        <div className="flex items-center gap-2.5 mb-2.5">
          <Avatar src={author?.avatar ?? null} name={author?.displayName || '?'} size={36} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white truncate flex items-center gap-1.5">
              {author?.displayName}
              {author?.isVerified && <Badge tone="naija">✓</Badge>}
            </p>
            <p className="text-xs text-ink-500">@{author?.username} · {timeAgo(moment.createdAt)}</p>
          </div>
        </div>
        <p className="text-sm text-ink-100 whitespace-pre-wrap">{moment.caption}</p>
        {moment.media && (
          moment.media.type === 'video' ? (
            <video src={moment.media.url} className="mt-3 rounded-xl max-h-80 w-full" controls preload="metadata" />
          ) : (
            <img src={moment.media.url} alt="" className="mt-3 rounded-xl max-h-80 w-full object-cover" loading="lazy" />
          )
        )}
        <div className="mt-3 flex items-center gap-4 text-xs text-ink-400">
          <span>💚 {formatCount(Object.values(moment.reactions || {}).reduce((a, b) => a + b, 0))}</span>
          <span>💬 {moment.commentsCount}</span>
          <span>↗ {moment.sharesCount}</span>
        </div>
      </Card>
    </Link>
  );
}

function MomentComposer({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const games = useGames();
  const [caption, setCaption] = useState('');
  const [gameId, setGameId] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaKind, setMediaKind] = useState<'image' | 'video'>('image');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('folder', 'moments');
      const result = await api.post<{ url: string; provider: string }>('/api/uploads', form);
      setMediaUrl(result.url);
      setMediaKind(file.type.startsWith('video') ? 'video' : 'image');
      toast.success('Uploaded', `Stored via ${result.provider}`);
    } catch (err) {
      toast.error('Upload failed', (err as ApiRequestError).message);
    } finally {
      setUploading(false);
    }
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ moment: MomentView; xpGained: number; unlocked: string[] }>('/api/moments', {
        caption,
        gameId: gameId || null,
        media: mediaUrl ? { url: mediaUrl, type: mediaKind } : undefined,
      }),
    onSuccess: (data) => {
      toast.success('Moment posted! 🎉', data.xpGained ? `+${data.xpGained} XP` : undefined);
      setCaption('');
      setMediaUrl('');
      void qc.invalidateQueries({ queryKey: ['moments'] });
      onClose();
    },
    onError: (err) => setError((err as ApiRequestError).message),
  });

  return (
    <Card className="p-4 space-y-3 animate-slide-up">
      <div className="flex items-start gap-2.5">
        <Avatar src={user?.avatar ?? null} name={user?.displayName || '?'} size={36} />
        <Textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="This danfo passenger nearly finished me 😭"
          maxLength={500}
          className="min-h-[70px]"
          aria-label="Moment caption"
        />
      </div>
      <FieldError message={error} />

      {mediaUrl && (
        <div className="relative">
          {mediaKind === 'video' ? (
            <video src={mediaUrl} className="rounded-xl max-h-56" controls />
          ) : (
            <img src={mediaUrl} alt="Upload preview" className="rounded-xl max-h-56" />
          )}
          <button onClick={() => setMediaUrl('')} className="absolute top-2 right-2 rounded-lg bg-black/70 p-1.5 text-white" aria-label="Remove media">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="chip tap cursor-pointer inline-flex items-center gap-1.5">
          <ImageIcon className="h-4 w-4" />
          {uploading ? 'Uploading…' : 'Photo/video'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadFile(file);
            }}
          />
        </label>
        <Select value={gameId} onChange={(e) => setGameId(e.target.value)} className="h-8 w-auto text-xs rounded-full">
          <option value="">No game</option>
          {(games.data?.items ?? []).map((g: GameSummary) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        <Button
          size="sm"
          className="ml-auto"
          loading={mutation.isPending}
          disabled={!caption.trim() || uploading}
          onClick={() => mutation.mutate()}
        >
          <Send className="h-4 w-4" /> Post
        </Button>
      </div>
      <p className="text-xs text-ink-500">Images up to 8MB · videos up to 60MB/2min · no executables, ever.</p>
    </Card>
  );
}
