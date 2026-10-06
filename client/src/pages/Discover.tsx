import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Radio, CalendarDays, Users, Gamepad2, User, Shield, Camera, Search, SlidersHorizontal } from 'lucide-react';
import { useDiscover, useSearch } from '@/hooks/useSharedData';
import { Button } from '@/components/ui/button';
import { Card, CardBody, Badge, LiveBadge, Avatar, EmptyState, Skeleton, ButtonLink } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn, formatCount, timeAgo } from '@/lib/utils';
import { ROOM_CATEGORIES, type RoomSummary, type EventSummary, type CrewSummary, type MomentView, type GameSummary, type PublicUser } from '@naijaplay/shared';

const TABS = [
  { id: 'live', label: 'Live', icon: Radio },
  { id: 'rooms', label: 'Rooms', icon: Users },
  { id: 'events', label: 'Events', icon: CalendarDays },
  { id: 'games', label: 'Games', icon: Gamepad2 },
  { id: 'people', label: 'People', icon: User },
  { id: 'crews', label: 'Crews', icon: Shield },
  { id: 'moments', label: 'Moments', icon: Camera },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function DiscoverPage() {
  const [tab, setTab] = useState<TabId>('live');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [mode, setMode] = useState('');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const filters = { category: category || undefined, location: location || undefined, mode: mode || undefined };
  const data = useDiscover(tab, filters);
  const search = useSearch(query);

  const items = (data.data?.items ?? []) as Record<string, unknown>[];

  return (
    <div className="page-shell space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold text-white">Discover</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setSearchOpen((s) => !s)} aria-expanded={searchOpen}>
            <Search className="h-4 w-4" /> Search
          </Button>
        </div>
      </div>

      {searchOpen && (
        <div className="animate-slide-up">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rooms, people, crews, games, events…"
            aria-label="Search NaijaPlay"
          />
          {query.trim().length >= 2 && (
            <Card className="mt-2">
              {search.isLoading ? (
                <div className="p-4 space-y-2"><Skeleton className="h-6" /><Skeleton className="h-6" /></div>
              ) : (
                <div className="p-3 space-y-4 max-h-96 overflow-y-auto">
                  <SearchGroup title="Rooms" rows={search.data?.rooms as unknown[]} render={(r: Record<string, unknown>) => (
                    <Link key={String(r.id)} to={`/rooms/${r.slug}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-ink-800">
                      <span className="text-sm text-white">{String(r.name)}</span>
                      <span className="text-xs text-ink-500">{String(r.code)}</span>
                    </Link>
                  )} />
                  <SearchGroup title="People" rows={search.data?.users as unknown[]} render={(u: Record<string, unknown>) => (
                    <Link key={String(u.id)} to={`/u/${u.username}`} className="flex items-center gap-2 p-2 rounded-lg hover:bg-ink-800">
                      <Avatar src={(u.avatar as string) ?? null} name={String(u.displayName)} size={28} />
                      <span className="text-sm text-white">{String(u.displayName)}</span>
                      <span className="text-xs text-ink-500">@{String(u.username)}</span>
                    </Link>
                  )} />
                  <SearchGroup title="Crews" rows={search.data?.crews as unknown[]} render={(c: Record<string, unknown>) => (
                    <Link key={String(c.id)} to={`/crews/${c.slug}`} className="block p-2 rounded-lg hover:bg-ink-800 text-sm text-white">{String(c.name)}</Link>
                  )} />
                  <SearchGroup title="Events" rows={search.data?.events as unknown[]} render={(e: Record<string, unknown>) => (
                    <Link key={String(e.id)} to={`/events/${e.slug}`} className="block p-2 rounded-lg hover:bg-ink-800 text-sm text-white">{String(e.title)}</Link>
                  )} />
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-1 px-1" role="tablist" aria-label="Discovery categories">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn('chip tap inline-flex items-center gap-1.5', tab === t.id && 'chip-active')}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs text-ink-500"><SlidersHorizontal className="h-3.5 w-3.5" /> Filters</span>
        {(tab === 'live' || tab === 'rooms' || tab === 'events') && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-8 rounded-full border border-ink-600 bg-ink-850 px-3 text-xs text-ink-200"
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {ROOM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {(tab === 'live' || tab === 'rooms') && (
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location"
            className="h-8 rounded-full border border-ink-600 bg-ink-850 px-3 text-xs text-ink-200 w-32"
            aria-label="Filter by location"
          />
        )}
        {tab === 'events' && (
          <div className="flex gap-1">
            {['', 'online', 'irl', 'upcoming'].map((m) => (
              <button
                key={m || 'any'}
                onClick={() => setMode(m)}
                className={cn('chip text-xs', mode === m && 'chip-active')}
              >
                {m === '' ? 'All' : m === 'upcoming' ? 'Upcoming' : m.toUpperCase()}
              </button>
            ))}
          </div>
        )}
        {(category || location || mode) && (
          <button
            onClick={() => { setCategory(''); setLocation(''); setMode(''); }}
            className="text-xs text-naija-400 hover:text-naija-300"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Content */}
      {data.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            title={emptyCopy(tab).title}
            description={emptyCopy(tab).description}
            action={<ButtonLink to="/create">{emptyCopy(tab).cta}</ButtonLink>}
          />
        </Card>
      ) : (
        <div className={tab === 'people' || tab === 'games' ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'}>
          {items.map((item) => <DiscoveryCard key={String(item.id)} tab={tab} item={item} />)}
        </div>
      )}
    </div>
  );
}

function SearchGroup({ title, rows, render }: { title: string; rows: unknown[] | undefined; render: (row: Record<string, unknown>) => React.ReactNode }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div>
      <p className="px-2 text-xs font-semibold uppercase text-ink-500">{title}</p>
      {rows.slice(0, 5).map((row) => render(row as Record<string, unknown>))}
    </div>
  );
}

function DiscoveryCard({ tab, item }: { tab: TabId; item: Record<string, unknown> }) {
  if (tab === 'live' || tab === 'rooms') {
    const room = item as unknown as RoomSummary;
    const host = room.host as { displayName?: string; avatar?: string | null } | null;
    return (
      <Link to={`/rooms/${room.slug}`} className="group">
        <Card className="h-full p-4 transition group-hover:border-ink-500 tap">
          <div className="flex items-center justify-between mb-2">
            {room.status === 'live' ? <LiveBadge /> : <Badge tone="gold">Scheduled</Badge>}
            <Badge tone="outline">{room.category}</Badge>
          </div>
          <h3 className="font-display font-bold text-white group-hover:text-naija-300 transition line-clamp-1">{room.name}</h3>
          <div className="mt-2 flex items-center gap-2">
            <Avatar src={host?.avatar ?? null} name={host?.displayName || '?'} size={22} />
            <span className="text-xs text-ink-400 truncate">{host?.displayName}</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-ink-400">
            <span>{room.memberCount}/{room.capacity} inside</span>
            {room.location && <span>{room.location}</span>}
          </div>
        </Card>
      </Link>
    );
  }

  if (tab === 'events') {
    const event = item as unknown as EventSummary;
    return (
      <Link to={`/events/${event.slug}`} className="group">
        <Card className="h-full p-4 transition group-hover:border-ink-500 tap">
          <div className="flex items-center gap-2 mb-2">
            <Badge tone="naija">{event.mode}</Badge>
            {event.sponsor && <Badge tone="gold">Sponsored</Badge>}
          </div>
          <h3 className="font-display font-bold text-white line-clamp-1">{event.title}</h3>
          <p className="mt-1 text-xs text-ink-400">{event.city || 'Online'} · {timeAgo(event.startsAt)}</p>
          <div className="mt-3 flex gap-3 text-xs text-ink-400">
            <span className="text-naija-400 font-semibold">{event.goingCount} going</span>
            <span>{event.maybeCount} maybe</span>
          </div>
        </Card>
      </Link>
    );
  }

  if (tab === 'people') {
    const person = item as unknown as PublicUser;
    return (
      <Link to={`/u/${person.username}`}>
        <Card className="p-4 flex items-center gap-3 hover:border-ink-500 transition tap">
          <Avatar src={person.avatar} name={person.displayName} size={44} />
          <div className="min-w-0">
            <p className="font-semibold text-white truncate">{person.displayName}</p>
            <p className="text-xs text-ink-500">@{person.username} · Lv {person.level}</p>
            <p className="text-xs text-ink-400">{formatCount(person.followersCount)} followers</p>
          </div>
        </Card>
      </Link>
    );
  }

  if (tab === 'crews') {
    const crew = item as unknown as CrewSummary;
    return (
      <Link to={`/crews/${crew.slug}`}>
        <Card className="p-4 flex items-center gap-3 hover:border-ink-500 transition tap">
          <Avatar src={crew.avatar} name={crew.name} size={44} />
          <div className="min-w-0">
            <p className="font-semibold text-white truncate">{crew.name}</p>
            <p className="text-xs text-ink-500">{crew.memberCount} members</p>
          </div>
          <span className="ml-auto font-display font-bold text-naija-400">{formatCount(crew.points)}</span>
        </Card>
      </Link>
    );
  }

  if (tab === 'games') {
    const game = item as unknown as GameSummary;
    return (
      <Link to={`/games/${game.slug}`}>
        <Card className="p-4 text-center hover:border-naija-500/50 transition tap">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-ink-700 mb-2">
            <Gamepad2 className="h-6 w-6 text-naija-400" />
          </span>
          <h3 className="font-display font-bold text-white">{game.name}</h3>
          <p className="text-xs text-ink-500">{game.roomsLive ? `${game.roomsLive} live now` : `${formatCount(game.followersCount ?? 0)} following`}</p>
        </Card>
      </Link>
    );
  }

  // moments
  const moment = item as unknown as MomentView & { author?: unknown };
  const author = (item.author ?? moment.author) as { displayName?: string; avatar?: string | null; username?: string } | null;
  return (
    <Link to={`/moments/${String(moment.id)}`}>
      <Card className="p-4 h-full hover:border-ink-500 transition tap">
        <div className="flex items-center gap-2 mb-2">
          <Avatar src={author?.avatar ?? null} name={author?.displayName || '?'} size={26} />
          <span className="text-sm font-semibold text-white truncate">{author?.displayName}</span>
          <span className="text-xs text-ink-500 ml-auto">{timeAgo(moment.createdAt)}</span>
        </div>
        <p className="text-sm text-ink-200 line-clamp-3">{moment.caption}</p>
        {moment.media && (
          <img src={moment.media.url} alt="" className="mt-2 rounded-lg max-h-48 w-full object-cover" loading="lazy" />
        )}
        <div className="mt-3 flex gap-3 text-xs text-ink-400">
          <span>💚 {Object.values(moment.reactions || {}).reduce((a, b) => a + b, 0)}</span>
          <span>💬 {moment.commentsCount}</span>
        </div>
      </Card>
    </Link>
  );
}

function emptyCopy(tab: TabId) {
  switch (tab) {
    case 'live':
      return { title: "Nobody's outside yet.", description: 'Start the first room and pull your people in.', cta: 'Start the first room' };
    case 'events':
      return { title: 'Nothing planned yet.', description: 'Give people something to show up to.', cta: 'Schedule an event' };
    case 'crews':
      return { title: 'No crews yet.', description: 'Start yours and put your area on the map.', cta: 'Start a crew' };
    case 'moments':
      return { title: 'Nothing here yet.', description: 'Be the first to post a moment.', cta: 'Post a moment' };
    case 'people':
      return { title: 'Nobody found.', description: 'Try a different filter.', cta: 'Create a room' };
    default:
      return { title: 'Nothing here yet.', description: 'Try changing your filters.', cta: 'Create something' };
  }
}
