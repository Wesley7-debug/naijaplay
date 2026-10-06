import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Trophy, Users, MessageSquare, Gift, Timer, Camera, Share2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { RecapView } from '@naijaplay/shared';
import { Card, Badge, Avatar, ButtonLink } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingScreen, ErrorState } from '@/components/ui/feedback';
import { copyToClipboard, shareTargets, timeAgo } from '@/lib/utils';
import { toast } from '@/stores/ui';

export default function RecapPage() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['recap', id],
    queryFn: () => api.get<{ recap: RecapView }>(`/api/rooms/recap/${id}`),
    enabled: Boolean(id),
    retry: false,
  });

  if (query.isLoading) return <LoadingScreen label="Building your recap…" />;
  if (query.isError || !query.data) {
    return (
      <div className="page-shell">
        <Card>
          <ErrorState message="This recap could not be found." onRetry={() => query.refetch()} />
        </Card>
      </div>
    );
  }

  const recap = query.data.recap;
  const shareUrl = recap.shareUrl || window.location.href;

  return (
    <div className="page-shell max-w-xl space-y-5">
      {/* Shareable event card */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,100,0.22),transparent_65%)]" aria-hidden />
        <div className="relative p-6 text-center">
          <Badge tone="naija" className="mx-auto">I WAS HERE</Badge>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white mt-3">{recap.title}</h1>
          <p className="text-ink-400 mt-1">
            {recap.host ? `hosted by ${recap.host.displayName}` : ''}
          </p>
          <p className="text-xs text-ink-500 mt-1">
            {new Date(recap.endedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Stat icon={<Users className="h-4 w-4" />} value={recap.attendeeCount} label="players" />
            <Stat icon={<Trophy className="h-4 w-4" />} value={recap.peakMembers} label="peak viewers" />
            <Stat icon={<Gift className="h-4 w-4" />} value={recap.giveawayCount} label="giveaways" />
            <Stat icon={<MessageSquare className="h-4 w-4" />} value={recap.messageCount} label="messages" />
            <Stat icon={<Camera className="h-4 w-4" />} value={recap.reactionCount} label="reactions" />
            <Stat icon={<Timer className="h-4 w-4" />} value={formatDuration(recap.durationMinutes)} label="together" />
          </div>

          <p className="mt-6 font-display text-sm font-bold text-naija-400 uppercase tracking-widest">NaijaPlay</p>
        </div>
      </Card>

      {/* Winners */}
      {recap.winners.length > 0 && (
        <Card className="p-5">
          <h2 className="section-title mb-3 flex items-center gap-2"><Trophy className="h-5 w-5 text-gold-400" /> Winners</h2>
          <ul className="space-y-2">
            {recap.winners.map((w, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl border border-gold-400/30 bg-gold-400/5 px-3 py-2.5">
                <span className="font-display font-black text-gold-400">#{i + 1}</span>
                <span className="font-semibold text-white">{w.displayName}</span>
                <span className="ml-auto text-sm text-ink-300">{w.prize}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {recap.quizChampion && (
        <Card className="p-5 border-naija-500/40 bg-naija-500/5">
          <p className="text-xs uppercase tracking-wide text-naija-400 font-bold">Quiz champion</p>
          <p className="font-display text-xl font-extrabold text-white mt-1">🧠 {recap.quizChampion.displayName}</p>
        </Card>
      )}

      {/* Participants */}
      {recap.participants.length > 0 && (
        <Card className="p-5">
          <h2 className="section-title mb-3">Who was there</h2>
          <div className="flex flex-wrap gap-2">
            {recap.participants.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-800 px-2.5 py-1 text-xs text-ink-300">
                <Avatar src={p.avatar} name={p.displayName} size={18} /> {p.displayName}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Moments from the session */}
      {recap.moments.length > 0 && (
        <Card className="p-5">
          <h2 className="section-title mb-3">Moments</h2>
          <div className="space-y-2">
            {recap.moments.map((m) => (
              <p key={m.id} className="rounded-xl border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-ink-200">
                {m.caption}
              </p>
            ))}
          </div>
        </Card>
      )}

      {/* Share */}
      <div className="grid grid-cols-3 gap-3">
        <a href={shareTargets.whatsapp(shareUrl, `I was at ${recap.title} on NaijaPlay!`)} target="_blank" rel="noreferrer noopener" className="flex flex-col items-center gap-1 rounded-2xl border border-ink-600 p-4 text-sm text-white hover:bg-ink-800 tap">
          💬 WhatsApp
        </a>
        <a href={shareTargets.x(shareUrl, `I WAS HERE: ${recap.title} — ${recap.attendeeCount} players, ${recap.peakMembers} peak on NaijaPlay`)} target="_blank" rel="noreferrer noopener" className="flex flex-col items-center gap-1 rounded-2xl border border-ink-600 p-4 text-sm text-white hover:bg-ink-800 tap">
          𝕏 X
        </a>
        <a href={shareTargets.telegram(shareUrl, `I was at ${recap.title}!`)} target="_blank" rel="noreferrer noopener" className="flex flex-col items-center gap-1 rounded-2xl border border-ink-600 p-4 text-sm text-white hover:bg-ink-800 tap">
          ✈️ Telegram
        </a>
      </div>

      <Button
        variant="outline"
        className="w-full"
        onClick={async () => {
          if (await copyToClipboard(shareUrl)) toast.success('Recap link copied');
        }}
      >
        <Share2 className="h-4 w-4" /> Copy recap link
      </Button>

      <div className="flex gap-2">
        <ButtonLink to="/home" variant="ghost" className="flex-1">Back home</ButtonLink>
        <ButtonLink to="/moments" variant="outline" className="flex-1">Post a moment</ButtonLink>
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-850/80 p-3">
      <p className="inline-flex items-center gap-1 text-naija-400">{icon}</p>
      <p className="font-display text-xl font-extrabold text-white mt-1">{value}</p>
      <p className="text-[10px] uppercase text-ink-500">{label}</p>
    </div>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}
