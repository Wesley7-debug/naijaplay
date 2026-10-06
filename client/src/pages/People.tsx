import { Link } from 'react-router-dom';
import { Users, MapPin, UserPlus } from 'lucide-react';
import { useDiscover } from '@/hooks/useSharedData';
import { Card, Avatar, Badge, EmptyState, Skeleton, ButtonLink } from '@/components/ui/card';
import { formatCount } from '@/lib/utils';
import type { PublicUser } from '@naijaplay/shared';

/** People discovery: top users by followers with area filter. */
export default function PeoplePage() {
  const people = useDiscover('people');
  const items = (people.data?.items ?? []) as unknown as PublicUser[];

  return (
    <div className="page-shell space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-white">People</h1>
        <p className="text-sm text-ink-400">Creators, hosts and players worth following.</p>
      </div>

      {people.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="h-10 w-10" />}
            title="Nobody found."
            description="Try a different filter."
            action={<ButtonLink to="/home">Back home</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((person) => (
            <Link key={person.id} to={`/u/${person.username}`} className="group">
              <Card className="p-4 flex items-center gap-3 hover:border-ink-500 transition tap">
                <Avatar src={person.avatar} name={person.displayName} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white truncate flex items-center gap-1.5">
                    {person.displayName}
                    {person.isVerified && <Badge tone="naija">✓</Badge>}
                  </p>
                  <p className="text-xs text-ink-500 truncate">@{person.username} · Lv {person.level}</p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-ink-400">
                    <span>{formatCount(person.followersCount)} followers</span>
                    {person.location && (
                      <span className="inline-flex items-center gap-0.5 truncate"><MapPin className="h-3 w-3" /> {person.location}</span>
                    )}
                  </div>
                </div>
                <UserPlus className="h-4 w-4 text-ink-500 group-hover:text-naija-400" aria-hidden />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
