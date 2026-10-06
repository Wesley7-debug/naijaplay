import { useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  Home,
  Compass,
  CalendarDays,
  Gamepad2,
  Shield,
  Users,
  Bell,
  User as UserIcon,
  Plus,
  Wifi,
  WifiOff,
  Globe2,
  MessageCircle,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { onConnectionChange } from '@/lib/socket';
import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/card';
import { ChatSidebarList, useUnreadDMs } from './ChatSidebar';

const navItems = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/global', label: 'Global Chat', icon: Globe2 },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/events', label: 'Events', icon: CalendarDays },
  { to: '/games', label: 'Games', icon: Gamepad2 },
  { to: '/crews', label: 'Crews', icon: Shield },
  { to: '/people', label: 'People', icon: Users },
];

/** Desktop sidebar + mobile bottom bar. Center Create/Play action. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const setConnected = useUiStore((s) => s.setConnected);
  const connected = useUiStore((s) => s.connected);
  const location = useLocation();

  useEffect(() => onConnectionChange(setConnected), [setConnected]);

  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get<{ unread: number }>('/api/notifications/unread-count'),
    refetchInterval: 45_000,
    enabled: Boolean(user),
  });
  const unread = unreadData?.unread ?? 0;
  const dmUnread = useUnreadDMs();

  return (
    <div className="min-h-screen bg-ink-900">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col border-r-2 border-ink-700 bg-ink-950/80 z-40">
        <Link to="/home" className="flex items-center gap-2 px-5 h-16 border-b-2 border-ink-700">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-naija-400 font-display text-ink-950 border-2 border-ink-950 shadow-hard-sm -rotate-3">N</span>
          <span className="font-display uppercase text-paper">NaijaPlay</span>
        </Link>
        <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Main navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 h-11 text-sm font-bold uppercase tracking-wide transition-all',
                  isActive
                    ? 'bg-naija-400 text-ink-950 border-2 border-ink-950 shadow-hard-sm'
                    : 'text-ink-300 hover:text-paper hover:bg-ink-800 border-2 border-transparent',
                )
              }
            >
              <item.icon className="h-5 w-5" aria-hidden />
              {item.label}
            </NavLink>
          ))}
          <NavLink
            to="/notifications"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 h-11 text-sm font-bold uppercase tracking-wide transition-all relative',
                isActive
                  ? 'bg-naija-400 text-ink-950 border-2 border-ink-950 shadow-hard-sm'
                  : 'text-ink-300 hover:text-paper hover:bg-ink-800 border-2 border-transparent',
              )
            }
          >
            <Bell className="h-5 w-5" aria-hidden />
            Alerts
            {unread > 0 && (
              <span className="ml-auto rounded-md bg-live px-1.5 py-0.5 text-[10px] font-black text-paper border-2 border-ink-950 min-w-[20px] text-center">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </NavLink>
          {user && (
            <NavLink
              to="/messages"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 h-11 text-sm font-bold uppercase tracking-wide transition-all relative',
                  isActive
                    ? 'bg-naija-400 text-ink-950 border-2 border-ink-950 shadow-hard-sm'
                    : 'text-ink-300 hover:text-paper hover:bg-ink-800 border-2 border-transparent',
                )
              }
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
              Messages
              {dmUnread > 0 && (
                <span className="ml-auto rounded-md bg-live px-1.5 py-0.5 text-[10px] font-black text-paper border-2 border-ink-950 min-w-[20px] text-center">
                  {dmUnread > 99 ? '99+' : dmUnread}
                </span>
              )}
            </NavLink>
          )}
          {user && (
            <NavLink
              to={`/u/${user.username}`}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 h-11 text-sm font-bold uppercase tracking-wide transition-all',
                  isActive
                    ? 'bg-naija-400 text-ink-950 border-2 border-ink-950 shadow-hard-sm'
                    : 'text-ink-300 hover:text-paper hover:bg-ink-800 border-2 border-transparent',
                )
              }
            >
              <UserIcon className="h-5 w-5" aria-hidden />
              Profile
            </NavLink>
          )}
        </nav>
        {/* Recent chats */}
        <ChatSidebarList />
        <div className="p-3">
          <Link
            to="/create"
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gold-400 text-sm font-black uppercase tracking-wide text-ink-950 border-2 border-ink-950 shadow-hard hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
          >
            <Plus className="h-5 w-5" aria-hidden strokeWidth={3} />
            Create
          </Link>
          {user && (
            <div className="mt-3 flex items-center gap-2 px-2 py-2 rounded-xl border-2 border-ink-700 bg-ink-850">
              <Avatar src={user.avatar} name={user.displayName} size={32} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-paper">{user.displayName}</p>
                <p className="truncate text-[11px] font-bold uppercase tracking-wider text-gold-400">Lv {user.level}</p>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Top bar (mobile + desktop right header) */}
      <header className="sticky top-0 z-30 lg:pl-60 border-b-2 border-ink-700 bg-ink-900/95 backdrop-blur">
        <div className="mx-auto flex h-14 sm:h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/home" className="flex items-center gap-2 lg:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-naija-400 font-display text-ink-950 text-sm border-2 border-ink-950 -rotate-3">N</span>
            <span className="font-display uppercase text-paper">NaijaPlay</span>
          </Link>
          <div className="hidden lg:block">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink-400">
              {connected ? <span className="text-naija-400">● Outside dey happen</span> : <span className="text-gold-400">● Reconnecting…</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/global"
              className="inline-flex items-center gap-1.5 rounded-lg border-2 border-ink-950 bg-paper px-3 py-1.5 text-xs font-black uppercase tracking-wide text-ink-950 shadow-hard-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
            >
              <Globe2 className="h-3.5 w-3.5" strokeWidth={2.5} />
              <span className="hidden sm:inline">Global chat</span>
              <span className="sm:hidden">Chat</span>
            </Link>
            <span
              className={cn('hidden sm:inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-black uppercase', connected ? 'text-naija-400' : 'text-gold-400')}
              title={connected ? 'Realtime connected' : 'Reconnecting to realtime'}
            >
              {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {connected ? 'Live' : 'Offline'}
            </span>
            <Link
              to="/messages"
              className="relative rounded-lg border-2 border-transparent p-2 text-ink-300 hover:text-paper hover:border-ink-600 focus-visible:ring-2 focus-visible:ring-gold-400"
              aria-label={`Messages${dmUnread ? `, ${dmUnread} unread` : ''}`}
            >
              <MessageCircle className="h-5 w-5" />
              {dmUnread > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-live border border-ink-950" />}
            </Link>
            <Link
              to="/notifications"
              className="relative rounded-lg border-2 border-transparent p-2 text-ink-300 hover:text-paper hover:border-ink-600 focus-visible:ring-2 focus-visible:ring-gold-400"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
            >
              <Bell className="h-5 w-5" />
              {unread > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-live border border-ink-950" />}
            </Link>
            {user ? (
              <Link to={`/u/${user.username}`} aria-label="Your profile" className="rounded-xl focus-visible:ring-2 focus-visible:ring-gold-400">
                <Avatar src={user.avatar} name={user.displayName} size={34} />
              </Link>
            ) : (
              <Link to="/signin" className="rounded-lg border-2 border-ink-950 bg-naija-400 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-ink-950 shadow-hard-sm">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="lg:pl-60" key={location.pathname}>
        {children}
      </main>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed bottom-0 inset-x-0 z-40 lg:hidden border-t-2 border-ink-700 bg-ink-950/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
        aria-label="Bottom navigation"
      >
        <div className="grid grid-cols-5 h-16">
          <MobileTab to="/home" label="Home" icon={Home} />
          <MobileTab to="/discover" label="Find" icon={Compass} />
          <div className="relative flex items-center justify-center">
            <Link
              to="/create"
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold-400 text-ink-950 border-2 border-ink-950 shadow-hard active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all -translate-y-3"
              aria-label="Create room or event"
            >
              <Plus className="h-7 w-7" strokeWidth={3} />
            </Link>
          </div>
          <MobileTab to="/notifications" label="Alerts" icon={Bell} badge={unread} />
          <MobileTab
            to={user ? `/u/${user.username}` : '/signin'}
            label="You"
            icon={UserIcon}
          />
        </div>
      </nav>
    </div>
  );
}

function MobileTab({
  to,
  label,
  icon: Icon,
  badge,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center justify-center gap-0.5 text-[10px] font-black uppercase tracking-wider relative',
          isActive ? 'text-gold-400' : 'text-ink-400 hover:text-ink-200',
        )
      }
    >
      <span className="relative">
        <Icon className="h-5 w-5" aria-hidden strokeWidth={2.5} />
        {Boolean(badge) && badge! > 0 && (
          <span className="absolute -right-2 -top-1 rounded-md bg-live px-1 text-[9px] font-black text-paper border border-ink-950 min-w-[16px] text-center">
            {badge! > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      {label}
    </NavLink>
  );
}
