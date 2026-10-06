import { useParams, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, MapPin, Users, ShieldCheck, ExternalLink, Share2, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { useEvent, useRsvp } from '@/hooks/useSharedData';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/ui';
import { Button } from '@/components/ui/button';
import { Card, Badge, Avatar, Skeleton, EmptyState, ButtonLink, LiveBadge } from '@/components/ui/card';
import { LoadingScreen, ErrorState } from '@/components/ui/feedback';
import { formatDateTime, copyToClipboard, shareTargets, cn } from '@/lib/utils';
import { ShareModal } from './Create';
import { useState } from 'react';
import type { EventSummary } from '@naijaplay/shared';

export default function EventDetailPage() {
  const { slug } = useParams();
  const query = useEvent(slug);
  const user = useAuthStore((s) => s.user);
  const rsvp = useRsvp(query.data?.event.id);
  const [shareOpen, setShareOpen] = useState(false);
  const qc = useQueryClient();

  const attendMutation = useMutation({
    mutationFn: () => api.post(`/api/events/${query.data?.event.id}/attend`),
    onSuccess: () => {
      toast.success('Attendance recorded', 'XP added.');
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (err) => toast.error('Could not record', (err as Error).message),
  });

  if (query.isLoading) return <LoadingScreen label="Loading event…" />;
  if (query.isError || !query.data) {
    return (
      <div className="page-shell">
        <Card><ErrorState message={(query.error as Error)?.message} onRetry={() => query.refetch()} /></Card>
      </div>
    );
  }

  const event = query.data.event as EventSummary;
  const host = event.host as { displayName?: string; avatar?: string | null; username?: string } | null;
  const isHost = host?.username === user?.username;
  const full = event.goingCount >= event.capacity;
  const rsvpStatus = event.viewerRsvp;

  return (
    <div className="page-shell max-w-3xl space-y-5">
      <Card>
        {event.coverImage && <img src={event.coverImage} alt="" className="h-40 sm:h-56 w-full object-cover" />}
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {event.status === 'live' ? <LiveBadge /> : event.status === 'cancelled' ? <Badge tone="danger">Cancelled</Badge> : <Badge tone="naija">{event.status}</Badge>}
            <Badge tone="outline">{event.mode}</Badge>
            <Badge tone="outline">{event.category}</Badge>
            {event.sponsor && <Badge tone="gold">⭐ Sponsored by {event.sponsor.name}</Badge>}
          </div>

          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white">{event.title}</h1>

          {event.sponsor && (
            <div className="mt-3 rounded-xl border border-gold-400/40 bg-gold-400/10 p-3 flex items-center gap-3">
              {event.sponsor.logo && <img src={event.sponsor.logo} alt={`${event.sponsor.name} logo`} className="h-9 w-9 rounded-lg object-contain" />}
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-gold-400 font-bold">{event.sponsor.campaignName}</p>
                {event.sponsor.prizeContribution ? (
                  <p className="text-sm text-white">₦{event.sponsor.prizeContribution.toLocaleString()} prize pool</p>
                ) : null}
              </div>
              {event.sponsor.website && (
                <a href={event.sponsor.website} target="_blank" rel="noreferrer noopener" className="ml-auto text-xs text-gold-400 inline-flex items-center gap-1">
                  Visit <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}

          <div className="mt-4 grid sm:grid-cols-2 gap-4 text-sm">
            <p className="flex items-start gap-2 text-ink-300">
              <CalendarDays className="h-4 w-4 mt-0.5 text-naija-400 shrink-0" />
              {formatDateTime(event.startsAt)}
              {event.endsAt && ` → ${formatDateTime(event.endsAt)}`}
            </p>
            {(event.venue || event.city) && (
              <p className="flex items-start gap-2 text-ink-300">
                <MapPin className="h-4 w-4 mt-0.5 text-naija-400 shrink-0" />
                <span>
                  {event.venue || event.city}
                  {event.area ? `, ${event.area}` : ''}
                  <span className="block text-xs text-ink-500 mt-0.5">Approximate location — full details shared with RSVPs.</span>
                </span>
              </p>
            )}
          </div>

          {event.description && <p className="mt-4 text-ink-200 whitespace-pre-wrap leading-relaxed">{event.description}</p>}
          {event.safetyNotes && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-gold-400/30 bg-gold-400/5 p-3 text-sm text-gold-200">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {event.safetyNotes}
            </p>
          )}

          {/* RSVP counts — big and clear */}
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl border border-ink-700 bg-ink-800 p-3">
              <p className="font-display text-xl font-extrabold text-naija-400">{event.goingCount}</p>
              <p className="text-xs text-ink-500">Going</p>
            </div>
            <div className="rounded-2xl border border-ink-700 bg-ink-800 p-3">
              <p className="font-display text-xl font-extrabold text-white">{event.maybeCount}</p>
              <p className="text-xs text-ink-500">Maybe</p>
            </div>
            <div className="rounded-2xl border border-ink-700 bg-ink-800 p-3">
              <p className="font-display text-xl font-extrabold text-white">{event.capacity}</p>
              <p className="text-xs text-ink-500">Capacity</p>
            </div>
          </div>
          {event.waitlistCount > 0 && (
            <p className="mt-2 text-xs text-ink-400 text-center">{event.waitlistCount} on the waitlist</p>
          )}

          {/* RSVP actions */}
          {!isHost && event.status !== 'cancelled' && (
            <div className="mt-5 grid grid-cols-3 gap-2">
              <Button
                variant={rsvpStatus === 'going' ? 'primary' : 'outline'}
                onClick={() => rsvp.mutate('going')}
                loading={rsvp.isPending}
                disabled={full && rsvpStatus !== 'going'}
              >
                {full && rsvpStatus !== 'going' ? 'Join waitlist' : 'Going'}
              </Button>
              <Button
                variant={rsvpStatus === 'maybe' ? 'secondary' : 'outline'}
                onClick={() => rsvp.mutate('maybe')}
                loading={rsvp.isPending}
              >
                Maybe
              </Button>
              <Button
                variant={rsvpStatus ? 'danger' : 'ghost'}
                onClick={() => rsvp.mutate('cancelled')}
                loading={rsvp.isPending}
                disabled={!rsvpStatus}
              >
                {rsvpStatus ? 'Cancel' : '—'}
              </Button>
            </div>
          )}

          {rsvpStatus === 'waitlist' && (
            <p className="mt-3 text-center text-sm text-gold-400 font-semibold">
              You're on the waitlist — position #{event.waitlistCount}. We'll notify you if a spot opens.
            </p>
          )}

          {rsvpStatus === 'going' && event.status === 'live' && (
            <Button className="w-full mt-3" onClick={() => attendMutation.mutate()} loading={attendMutation.isPending}>
              <ShieldCheck className="h-4 w-4" /> I'm here — record attendance
            </Button>
          )}

          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShareOpen(true)}>
              <Share2 className="h-4 w-4" /> Share
            </Button>
            {isHost && (
              <>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={async () => {
                    if (await copyToClipboard(window.location.href)) toast.success('Link copied');
                  }}
                >
                  Copy link
                </Button>
              </>
            )}
          </div>

          {host && (
            <div className="mt-5 flex items-center gap-3 border-t border-ink-700 pt-4">
              <Avatar src={host.avatar ?? null} name={host.displayName || '?'} size={40} />
              <div className="min-w-0">
                <p className="text-xs text-ink-500">Organized by</p>
                <Link to={`/u/${host.username}`} className="font-semibold text-white hover:text-naija-300">
                  {host.displayName}
                </Link>
              </div>
            </div>
          )}
        </div>
      </Card>

      {event.rules && event.rules.length > 0 && (
        <Card className="p-5">
          <h2 className="section-title mb-2">Rules</h2>
          <ul className="space-y-1.5 text-sm text-ink-300">
            {event.rules.map((rule, i) => (
              <li key={i} className="flex gap-2"><span className="text-naija-400">•</span> {rule}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex gap-2">
        <ButtonLink to="/events" variant="outline" className="flex-1">All events</ButtonLink>
        <a
          href={shareTargets.whatsapp(window.location.href, `Pull up: ${event.title}`)}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-ink-600 text-sm text-white hover:bg-ink-800"
        >
          Share to WhatsApp
        </a>
      </div>

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} url={window.location.href} title={event.title} />
    </div>
  );
}
