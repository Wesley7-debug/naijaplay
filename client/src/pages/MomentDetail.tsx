import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Heart, MessageCircle, Share2, Trash2, Flag, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { useMoment } from '@/hooks/useSharedData';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, Badge, Avatar, Skeleton, ButtonLink } from '@/components/ui/card';
import { LoadingScreen, ErrorState } from '@/components/ui/feedback';
import { timeAgo, cn, copyToClipboard, shareTargets } from '@/lib/utils';
import { ReportModal } from './Profile';

const EMOJIS = ['💚', '😂', '🔥', '😭', '👀', '🏆'];

export default function MomentDetailPage() {
  const { id } = useParams();
  const query = useMoment(id);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [reportOpen, setReportOpen] = useState(false);

  const reactMutation = useMutation({
    mutationFn: (emoji: string) => api.post<{ reactions: Record<string, number> }>(`/api/moments/${id}/react`, { emoji }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['moment', id] }),
    onError: (err) => toast.error('Could not react', (err as Error).message),
  });

  const commentMutation = useMutation({
    mutationFn: () => api.post(`/api/moments/${id}/comments`, { content: comment }),
    onSuccess: () => {
      setComment('');
      void qc.invalidateQueries({ queryKey: ['moment', id] });
    },
    onError: (err) => toast.error('Could not comment', (err as Error).message),
  });

  const shareMutation = useMutation({
    mutationFn: () => api.post<{ sharesCount: number; shareUrl: string }>(`/api/moments/${id}/share`),
    onSuccess: async (data) => {
      const shared = await shareMutationResults(data.shareUrl);
      if (!shared) toast.success('Share count updated', data.shareUrl);
      void qc.invalidateQueries({ queryKey: ['moment', id] });
    },
    onError: (err) => toast.error('Could not share', (err as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.del(`/api/moments/${id}`),
    onSuccess: () => {
      toast.success('Moment deleted');
      navigate('/moments');
    },
    onError: (err) => toast.error('Could not delete', (err as Error).message),
  });

  if (query.isLoading) return <LoadingScreen label="Loading moment…" />;
  if (query.isError || !query.data) {
    return <div className="page-shell"><Card><ErrorState onRetry={() => query.refetch()} /></Card></div>;
  }

  const moment = query.data.moment;
  const author = moment.author;
  const isAuthor = author?.id === user?.id;
  const viewerReaction = moment.viewerReaction;

  return (
    <div className="page-shell max-w-xl space-y-4">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-ink-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <Card className="p-5">
        <div className="flex items-center gap-2.5">
          <Link to={`/u/${author?.username}`}>
            <Avatar src={author?.avatar ?? null} name={author?.displayName || '?'} size={42} />
          </Link>
          <div className="min-w-0 flex-1">
            <Link to={`/u/${author?.username}`} className="font-semibold text-white hover:text-naija-300">
              {author?.displayName}
            </Link>
            <p className="text-xs text-ink-500">@{author?.username} · {timeAgo(moment.createdAt)}</p>
          </div>
          {isAuthor ? (
            <Button variant="danger" size="sm" loading={deleteMutation.isPending} onClick={() => window.confirm('Delete this moment?') && deleteMutation.mutate()}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" aria-label="Report moment" onClick={() => setReportOpen(true)}>
              <Flag className="h-4 w-4" />
            </Button>
          )}
        </div>

        <p className="mt-4 text-white whitespace-pre-wrap">{moment.caption}</p>
        {moment.media && (
          moment.media.type === 'video' ? (
            <video src={moment.media.url} className="mt-3 rounded-xl w-full" controls preload="metadata" />
          ) : (
            <img src={moment.media.url} alt="" className="mt-3 rounded-xl w-full" />
          )
        )}

        {/* Reactions */}
        <div className="mt-4 flex flex-wrap gap-2">
          {EMOJIS.map((emoji) => {
            const count = moment.reactions?.[emoji] || 0;
            return (
              <button
                key={emoji}
                onClick={() => reactMutation.mutate(emoji)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition tap',
                  viewerReaction === emoji ? 'border-naija-500 bg-naija-500/15 text-white' : 'border-ink-600 text-ink-300 hover:border-ink-500',
                )}
                aria-pressed={viewerReaction === emoji}
              >
                {emoji} {count > 0 && count}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-4 text-xs text-ink-400 border-t border-ink-700 pt-3">
          <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {Object.values(moment.reactions || {}).reduce((a, b) => a + b, 0)}</span>
          <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {moment.commentsCount}</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            loading={shareMutation.isPending}
            onClick={() => shareMutation.mutate()}
          >
            <Share2 className="h-4 w-4" /> Share
          </Button>
          <a
            href={shareTargets.x(window.location.href, moment.caption.slice(0, 100))}
            target="_blank"
            rel="noreferrer noopener"
            className="text-ink-400 hover:text-white"
          >
            Post to 𝕏
          </a>
        </div>
      </Card>

      {/* Comments */}
      <section>
        <h2 className="section-title mb-3">Comments</h2>
        <Card className="p-4 space-y-3">
          {(moment.comments?.length ?? 0) === 0 && <p className="text-sm text-ink-400">No comments yet. Say something nice.</p>}
          {(moment.comments ?? []).map((c) => (
            <div key={c.id} className="flex gap-2.5">
              <Avatar src={c.author?.avatar ?? null} name={c.author?.displayName || '?'} size={30} />
              <div className="min-w-0 flex-1 rounded-xl bg-ink-800 px-3 py-2">
                <p className="text-xs font-semibold text-white">{c.author?.displayName} <span className="text-ink-500 font-normal">· {timeAgo(c.createdAt)}</span></p>
                <p className="text-sm text-ink-200 mt-0.5">{c.content}</p>
              </div>
            </div>
          ))}

          <form
            className="flex gap-2 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (comment.trim()) commentMutation.mutate();
            }}
          >
            <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" maxLength={500} aria-label="Add a comment" />
            <Button type="submit" size="icon" disabled={!comment.trim()} loading={commentMutation.isPending} aria-label="Send comment">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </Card>
      </section>

      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} targetType="moment" targetId={String(moment.id)} label="this moment" />
    </div>
  );
}

async function shareMutationResults(shareUrl: string): Promise<boolean> {
  if (navigator.share) {
    try {
      await navigator.share({ url: shareUrl, title: 'NaijaPlay moment' });
      return true;
    } catch {
      return false;
    }
  }
  return copyToClipboard(shareUrl);
}
