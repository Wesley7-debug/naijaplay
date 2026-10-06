import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Users,
  Trophy,
  Gift,
  CalendarDays,
  MapPin,
  Ticket,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar, Card, EmptyState, Skeleton } from '@/components/ui/card';
import { formatCount } from '@/lib/utils';
import GlobalChatPanel from '@/components/global/GlobalChatPanel';
import type { RoomSummary, GameSummary, CrewSummary, EventSummary } from '@naijaplay/shared';

const TICKER = [
  'No sign-up needed to chat',
  'Crew Wars every season',
  'Winners paid by direct transfer',
  'Yaba to PH — everybody dey here',
  'Tag anybody with @',
];

export default function LandingPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['landing'],
    queryFn: () =>
      api.get<{
        liveRooms: RoomSummary[];
        upcomingEvents: EventSummary[];
        games: GameSummary[];
        crews: CrewSummary[];
      }>('/api/home'),
    staleTime: 30_000,
  });

  const live = data?.liveRooms ?? [];
  const events = data?.upcomingEvents ?? [];
  const games = data?.games ?? [];
  const crews = data?.crews ?? [];

  return (
    <div className="min-h-screen bg-ink-900">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b-2 border-ink-700 bg-ink-900/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-naija-400 font-display text-ink-950 border-2 border-ink-950 shadow-hard-sm -rotate-3">N</span>
            <span className="font-display uppercase text-paper">NaijaPlay</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-xs font-black uppercase tracking-wider text-ink-300" aria-label="Landing navigation">
            <a href="#global" className="hover:text-paper">Global Chat</a>
            <a href="#happening" className="hover:text-paper">Outside Now</a>
            <a href="#crews" className="hover:text-paper">Crew Wars</a>
            <a href="#events" className="hover:text-paper">Events</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/global" className="hidden sm:inline text-xs font-black uppercase tracking-wider text-gold-400 hover:text-gold-300 px-3 py-2">Chat now</Link>
            <Link to="/signin" className="inline-flex h-10 items-center rounded-xl bg-paper px-4 text-xs font-black uppercase tracking-wide text-ink-950 border-2 border-ink-950 shadow-hard-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all">
              Sign in
            </Link>
          </div>
        </div>
      </header>

      {/* Ticker tape */}
      <div className="marquee" aria-hidden>
        <div className="marquee-track">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={i} className="inline-flex items-center gap-8">
              {t} <span className="font-black">✦</span>
            </span>
          ))}
        </div>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden border-b-2 border-ink-700">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20">
          <span className="sticker sticker-green tilt-l mb-5">Lagos · PH · Abuja · Everywhere</span>
          <h1 className="font-display uppercase text-paper leading-[0.95] text-5xl sm:text-7xl lg:text-8xl">
            Outside
            <br />
            dey <span className="text-naija-400">happen.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base sm:text-lg text-ink-200 font-medium">
            NaijaPlay is the street corner of the internet for Nigerians. Jump into global chat with zero sign-up, or open a room and pull your people in.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link
              to="/global"
              className="inline-flex h-13 min-h-[52px] items-center justify-center gap-2 rounded-xl bg-naija-400 px-8 text-sm font-black uppercase tracking-wide text-ink-950 border-2 border-ink-950 shadow-hard hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all tap"
            >
              Enter global chat <ArrowRight className="h-4 w-4" strokeWidth={3} />
            </Link>
            <Link
              to="/signin"
              className="inline-flex min-h-[52px] items-center justify-center rounded-xl border-2 border-ink-500 px-8 text-sm font-black uppercase tracking-wide text-paper hover:bg-ink-800 transition"
            >
              Create a room
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-2">
            <span className="sticker sticker-red">
              <span className="h-2 w-2 rounded-full bg-paper animate-pulse-live" />
              {isLoading ? '…' : live.length} rooms live
            </span>
            <span className="sticker sticker-paper tilt-r">
              {isLoading ? '…' : formatCount(crews.reduce((a, c) => a + (c.memberCount || 0), 0))} crew members
            </span>
          </div>
        </div>
      </section>

      {/* Global chat */}
      <section id="global" className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
        <div className="grid gap-6 lg:grid-cols-5 lg:items-start">
          <div className="lg:col-span-2">
            <p className="section-kicker">No sign-up · No wahala</p>
            <h2 className="section-title mt-1">Talk first.<br />Sign in later.</h2>
            <p className="mt-4 text-ink-200 font-medium leading-relaxed">
              Everybody lands in one lobby. You get an Anon name automatically, you can tag anybody with <span className="font-bold text-naija-300">@username</span>, and when you finally sign in your name sticks.
            </p>
            <Link
              to="/global"
              className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-gold-400 px-7 text-sm font-black uppercase tracking-wide text-ink-950 border-2 border-ink-950 shadow-hard hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
            >
              Open full chat <ArrowRight className="h-4 w-4" strokeWidth={3} />
            </Link>
          </div>
          <div className="lg:col-span-3">
            <GlobalChatPanel compact />
          </div>
        </div>
      </section>

      {/* Happening Now — ticket stubs */}
      <section id="happening" className="border-y-2 border-ink-700 bg-ink-950/60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
          <div className="flex items-end justify-between mb-6">
            <div>
              <p className="section-kicker">Who dey outside?</p>
              <h2 className="section-title mt-1">Happening now</h2>
            </div>
            <Link to="/signin" className="text-xs font-black uppercase tracking-wider text-naija-400 hover:text-naija-300">See all</Link>
          </div>
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-44" />)}
            </div>
          ) : live.length === 0 ? (
            <Card>
              <EmptyState
                title="Street quiet."
                description="Nobody don open room yet. Na you go start am."
                action={<Link to="/signin" className="inline-flex h-11 items-center rounded-xl bg-naija-400 px-5 text-xs font-black uppercase tracking-wide text-ink-950 border-2 border-ink-950 shadow-hard-sm">Start the first room</Link>}
              />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {live.slice(0, 6).map((room) => (
                <Link key={room.id} to="/signin" className="group">
                  <Card className="h-full transition group-hover:-translate-y-1">
                    <div className="bg-live px-4 py-1.5 flex items-center justify-between border-b-2 border-ink-950">
                      <span className="text-[11px] font-black uppercase tracking-widest text-paper">● Live now</span>
                      <span className="text-[11px] font-black uppercase tracking-widest text-paper/80">{room.category}</span>
                    </div>
                    <div className="p-4">
                      <h3 className="font-display uppercase text-paper line-clamp-1 group-hover:text-naija-300 transition">{room.name}</h3>
                      <div className="ticket-cut my-3" aria-hidden />
                      <div className="flex items-center justify-between text-xs text-ink-300 font-semibold">
                        <span className="inline-flex items-center gap-2">
                          <Avatar src={(room.host as { avatar?: string } | null)?.avatar ?? null} name={(room.host as { displayName?: string } | null)?.displayName || '?'} size={26} />
                          {(room.host as { displayName?: string } | null)?.displayName}
                        </span>
                        <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {room.memberCount} inside</span>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Four truths */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
        <p className="section-kicker">Why e be different</p>
        <h2 className="section-title mt-1 mb-8">Built for how we actually hang out</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n: '01', title: 'Find your people', body: 'Rooms for your game, your area, your crew. Not strangers — your people.' },
            { n: '02', title: 'Compete for real', body: 'Crew Wars, quizzes and seasons. Standings calculated server-side, no story.' },
            { n: '03', title: 'Win actual things', body: 'Airtime, data, cash drops. Winners picked by the server, paid by transfer.' },
            { n: '04', title: 'Online and IRL', body: 'From quick rooms to Yaba game nights and campus link-ups.' },
          ].map((item, i) => (
            <Card key={item.title} className={i % 2 === 1 ? 'sm:translate-y-4' : ''}>
              <div className="p-5">
                <p className="font-display text-4xl text-ink-600">{item.n}</p>
                <h3 className="mt-2 font-display uppercase text-paper">{item.title}</h3>
                <p className="mt-1.5 text-sm text-ink-300 leading-relaxed">{item.body}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Crew Wars poster */}
      <section id="crews" className="border-y-2 border-ink-700 bg-ink-950/60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
          <p className="section-kicker">Back your area</p>
          <h2 className="section-title mt-1">Crew Wars</h2>
          <p className="text-sm text-ink-300 mt-2 mb-6 font-medium">Points come from wins — never from client side.</p>
          <div className="space-y-3 max-w-2xl">
            {(isLoading ? [] : crews.slice(0, 4)).map((crew, i) => (
              <div key={crew.id} className="flex items-center gap-4 rounded-2xl border-2 border-ink-700 bg-ink-850 px-4 py-3 shadow-hard">
                <span className="font-display text-2xl text-ink-600 w-8">{String(i + 1).padStart(2, '0')}</span>
                <Avatar src={crew.avatar} name={crew.name} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-paper truncate uppercase">{crew.name}</p>
                  <p className="text-xs text-ink-400 font-semibold">{crew.memberCount} members</p>
                </div>
                <span className="font-display text-naija-400">{formatCount(crew.points)}</span>
              </div>
            ))}
          </div>
          {crews.length >= 2 && (
            <div className="mt-6 max-w-2xl rounded-2xl border-2 border-ink-950 bg-gold-400 p-5 text-center shadow-hard tilt-l">
              <p className="font-display uppercase text-xl sm:text-2xl text-ink-950">
                {crews[0].name} <span className="text-live">VS</span> {crews[1].name}
              </p>
              <p className="mt-1 text-sm font-black text-ink-950">{formatCount(crews[0].points)} — {formatCount(crews[1].points)} PTS</p>
            </div>
          )}
        </div>
      </section>

      {/* Events */}
      <section id="events" className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
        <p className="section-kicker">Make plans</p>
        <h2 className="section-title mt-1 mb-6">Events</h2>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.slice(0, 6).map((event) => (
              <Link key={event.id} to="/signin">
                <Card className="p-4 h-full hover:-translate-y-1 transition">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="sticker sticker-green !text-[10px]">{event.mode}</span>
                    <span className="text-xs text-ink-300 font-semibold inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{event.city || 'Online'}</span>
                  </div>
                  <h3 className="font-display uppercase text-paper line-clamp-1">{event.title}</h3>
                  <p className="mt-1 text-xs text-ink-400 font-semibold">
                    {new Date(event.startsAt).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </p>
                  <div className="ticket-cut my-3" aria-hidden />
                  <div className="flex items-center gap-3 text-xs text-ink-300 font-bold">
                    <span className="text-naija-400">{event.goingCount} going</span>
                    <span>{event.maybeCount} maybe</span>
                    <span>{event.capacity} cap</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Games strip */}
      <section id="games" className="border-t-2 border-ink-700 bg-ink-950/60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
          <p className="section-kicker">The culture around the games</p>
          <h2 className="section-title mt-1 mb-6">Featured games</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {(isLoading ? [] : games).map((game) => (
              <Link key={game.id} to="/signin" className="group">
                <Card className="p-4 text-center hover:border-naija-500 transition h-full">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ink-700 border-2 border-ink-950 font-display text-xl text-naija-400 group-hover:bg-naija-400 group-hover:text-ink-950 transition">
                    {game.name.slice(0, 1).toUpperCase()}
                  </span>
                  <h3 className="mt-3 font-display uppercase text-paper text-sm">{game.name}</h3>
                  <p className="mt-1 text-xs text-ink-400 font-semibold">{game.followersCount ? `${formatCount(game.followersCount)} following` : 'New'}</p>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Giveaway + seasons + IRL */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Ticket, sticker: 'sticker-gold', title: 'Giveaways', body: 'Host airtime, data and cash drops in your room. One entry per account, fair draws.' },
            { icon: Trophy, sticker: 'sticker-green', title: 'Seasons', body: 'Monthly ladders with Okada → Bullion Van ranks and exclusive badges.' },
            { icon: CalendarDays, sticker: 'sticker-paper', title: 'IRL Hangouts', body: '“Outside now” events with RSVP, waitlists and reminders that actually fire.' },
            { icon: Gift, sticker: 'sticker-red', title: 'Sponsored drops', body: 'Brands fund prize pools. Creators run better events. Everyone eats.' },
          ].map((s) => (
            <Card key={s.title} className="p-5">
              <span className={`sticker ${s.sticker} mb-3`}>
                <s.icon className="h-4 w-4" strokeWidth={2.5} /> {s.title}
              </span>
              <p className="text-sm text-ink-300 leading-relaxed font-medium">{s.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t-2 border-ink-700">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20 text-center">
          <span className="sticker sticker-paper tilt-r mb-5">Free forever · No wahala</span>
          <h2 className="font-display uppercase text-3xl sm:text-5xl text-paper leading-none">
            Discover. Join.<br />Play. Compete.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-ink-300 font-medium">From Yaba to PH, campus to creators — your people dey here already.</p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/global"
              className="inline-flex h-12 w-full sm:w-auto items-center justify-center rounded-xl bg-naija-400 px-8 text-sm font-black uppercase tracking-wide text-ink-950 border-2 border-ink-950 shadow-hard hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
            >
              Start chatting now
            </Link>
            <Link
              to="/signin"
              className="inline-flex h-12 w-full sm:w-auto items-center justify-center rounded-xl border-2 border-ink-500 px-8 text-sm font-black uppercase tracking-wide text-paper hover:bg-ink-800"
            >
              Get started free
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t-2 border-ink-700 py-8 text-center">
        <p className="font-display uppercase text-paper">NaijaPlay</p>
        <p className="mt-1 text-xs text-ink-400 font-semibold">Where Nigerians find their people. © {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
