import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Gamepad2, Plus, Check, X } from 'lucide-react';
import { useGames } from '@/hooks/useSharedData';
import { useAuthStore } from '@/stores/auth';
import { api, ApiRequestError } from '@/lib/api';
import { toast } from '@/stores/ui';
import { Card, EmptyState, Skeleton, ButtonLink } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { formatCount, cn } from '@/lib/utils';

/** Game directory — tap + to put a title on your profile, or type your own. */
export default function GamesPage() {
  const games = useGames();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const qc = useQueryClient();
  const [customInput, setCustomInput] = useState('');

  const myGames = user?.favoriteGames || [];
  const myCustom = user?.customGames || [];

  const saveGames = useMutation({
    mutationFn: (body: { favoriteGames?: string[]; customGames?: string[] }) =>
      api.patch<{ user: unknown }>('/api/users/me/profile', body),
    onSuccess: (data) => {
      setUser(data.user as never);
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (err) => toast.error('Could not update games', (err as ApiRequestError).message),
  });

  function toggleDirectory(gameId: string, gameName: string) {
    if (myGames.includes(gameId)) {
      saveGames.mutate({ favoriteGames: myGames.filter((id) => id !== gameId) });
    } else {
      if (myGames.length >= 4) {
        toast.info('Max 4 directory games', 'Remove one from Settings to add another.');
        return;
      }
      saveGames.mutate({ favoriteGames: [...myGames, gameId] });
      toast.success(`${gameName} added to your profile`);
    }
  }

  function addCustomGame() {
    const name = customInput.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!name) return;
    if (myCustom.some((g) => g.toLowerCase() === name.toLowerCase())) {
      toast.info('Already on your profile');
      return;
    }
    if (myCustom.length >= 4) {
      toast.info('Max 4 typed games', 'Remove one from Settings to add another.');
      return;
    }
    saveGames.mutate({ customGames: [...myCustom, name] });
    setCustomInput('');
    toast.success(`${name} added to your profile`);
  }

  function removeCustomGame(name: string) {
    saveGames.mutate({ customGames: myCustom.filter((g) => g !== name) });
  }

  return (
    <div className="page-shell space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-white">Games</h1>
        <p className="text-sm text-ink-400">
          The community around the games. Tap + to put one on your profile — scores are self-reported and community-verified.
        </p>
      </div>

      {/* Type your own */}
      <Card className="p-4">
        <Label htmlFor="games-custom">Game no dey list? Add am to your profile</Label>
        <div className="flex gap-2">
          <Input
            id="games-custom"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            maxLength={40}
            placeholder="e.g. Ayo Olopon, Mortal Kombat 1…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomGame();
              }
            }}
          />
          <Button variant="outline" onClick={addCustomGame} loading={saveGames.isPending}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        {myCustom.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {myCustom.map((g) => (
              <button
                key={g}
                onClick={() => removeCustomGame(g)}
                className="chip chip-active tap"
                title="Tap to remove from your profile"
                aria-label={`Remove ${g} from profile`}
              >
                {g} <X className="h-3 w-3" aria-hidden />
              </button>
            ))}
          </div>
        )}
      </Card>

      {games.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : (games.data?.items?.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            icon={<Gamepad2 className="h-10 w-10" />}
            title="No games yet."
            description="Check back soon."
            action={<ButtonLink to="/home">Back home</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {games.data!.items.map((game) => {
            const added = myGames.includes(game.id);
            return (
              <Card key={game.id} className={cn('p-5 text-center h-full transition group', added && 'border-naija-500/60')}>
                <Link to={`/games/${game.slug}`} className="block tap">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ink-700 group-hover:bg-naija-500/15 transition">
                    <Gamepad2 className="h-7 w-7 text-naija-400" />
                  </span>
                  <h2 className="mt-3 font-display font-bold text-white">{game.name}</h2>
                  <p className="mt-1 text-xs text-ink-500 line-clamp-2">{game.description || 'Community favourite.'}</p>
                  <div className="mt-3 flex justify-center gap-3 text-xs text-ink-400">
                    {game.roomsLive ? <span className="text-naija-400 font-semibold">{game.roomsLive} live</span> : null}
                    <span>{formatCount(game.followersCount ?? 0)} following</span>
                  </div>
                </Link>
                <button
                  onClick={() => toggleDirectory(game.id, game.name)}
                  disabled={saveGames.isPending}
                  aria-pressed={added}
                  className={cn('chip tap mt-3 w-full justify-center', added && 'chip-active')}
                >
                  {added ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> On your profile
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" /> Add to profile
                    </>
                  )}
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
