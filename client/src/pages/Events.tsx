import { Link } from 'react-router-dom';
import { Plus, CalendarDays, MapPin, Users } from 'lucide-react';
import { useState } from 'react';
import { useEvents, useMyEvents } from '@/hooks/useSharedData';
import { Button, } from '@/components/ui/button';
import { Card, Badge, EmptyState, Skeleton, ButtonLink, Avatar } from '@/components/ui/card';
import { timeAgo, cn } from '@/lib/utils';
import type { EventSummary } from '@naijaplay/shared';

export default function EventsPage() {
  const [tab, setTab] = useState<'upcoming' | 'mine' | 'past'>('upcoming');
  const upcoming = useEvents(tab === 'past' ? { status: 'ended' } : {});
  const mine = useMyEvents();

  const data = tab === 'mine' ? mine : upcoming;
  const items = (data.data?.items ?? []).filter((e) => (tab === 'upcoming' ? e.status !== 'ended' : true));

  return (
    <div className="page-shell space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-white">Events</h1>
          <p className="text-sm text-ink-400">Online, IRL or both — RSVP and pull up.</p>
        </div>
        <ButtonLink to="/events/new"><Plus className="h-4 w-4" /> Schedule</ButtonLink>
      </div>

      <div className="flex gap-2" role="tablist" aria-label="Event views">
        {([['upcoming', 'Upcoming'], ['mine', 'Mine'], ['past', 'Past']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn('chip', tab === id && 'chip-active')}>
            {label}
          </button>
        ))}
      </div>

      {data.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDays className="h-10 w-10" />}
            title={tab === 'mine' ? 'You have no events yet.' : tab === 'past' ? 'No past events.' : 'Nothing planned yet.'}
            description={tab === 'mine' ? 'RSVP to something or schedule your own.' : 'Give people a reason to show up.'}
            action={<ButtonLink to="/events/new"><Plus className="h-4 w-4" /> Schedule an event</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((event) => <EventCard key={event.id} event={event} />)}
        </div>
      )}
    </div>
  );
}

export function EventCard({ event }: { event: EventSummary }) {
  const host = event.host as { displayName?: string; avatar?: string | null } | null;
  const full = event.goingCount >= event.capacity;
  return (
    <Link to={`/events/${event.slug}`} className="group">
      <Card className="h-full transition group-hover:border-ink-500 tap">
        {event.coverImage && <img src={event.coverImage} alt="" className="h-28 w-full object-cover" loading="lazy" />}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge tone="naija">{event.mode}</Badge>
            <Badge tone="outline">{event.category}</Badge>
            {event.sponsor && <Badge tone="gold">⭐ {event.sponsor.name}</Badge>}
            {event.status === 'cancelled' && <Badge tone="danger">Cancelled</Badge>}
            {event.status === 'live' && <Badge tone="live">Live now</Badge>}
          </div>
          <h3 className="font-display font-bold text-white group-hover:text-naija-300 transition line-clamp-1">{event.title}</h3>
          <p className="mt-1 text-xs text-ink-400 flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {new Date(event.startsAt).toLocaleString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
          {(event.venue || event.city) && (
            <p className="mt-1 text-xs text-ink-400 flex items-center gap-1 truncate">
              <MapPin className="h-3.5 w-3.5 shrink-0" /> {event.venue || event.city}
            </p>
          )}
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="flex items-center gap-2">
              <Avatar src={host?.avatar ?? null} name={host?.displayName || '?'} size={20} />
              <span className="text-ink-400 truncate max-w-[90px]">{host?.displayName}</span>
            </span>
            <span className="text-ink-400">
              <strong className={full ? 'text-gold-400' : 'text-naija-400'}>{event.goingCount}</strong> going
              {' · '}{event.maybeCount} maybe
              {' · '}{event.capacity} cap
            </span>
          </div>
          {event.viewerRsvp && (
            <p className="mt-2 text-xs font-semibold text-naija-400">
              You're {event.viewerRsvp === 'waitlist' ? 'on the waitlist' : event.viewerRsvp}
            </p>
          )}
        </div>
      </Card>
    </Link>
  );
}
