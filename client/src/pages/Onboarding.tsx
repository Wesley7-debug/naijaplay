import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Check, MapPin, Gamepad2, Sparkles } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input, Label, FieldError, Select } from '@/components/ui/input';
import { Avatar, Badge } from '@/components/ui/card';
import { toast } from '@/stores/ui';
import { cn } from '@/lib/utils';
import { NIGERIAN_AREAS, INTERESTS, type GameSummary } from '@naijaplay/shared';

/**
 * Deliberately short onboarding:
 * username, display name, avatar, location, favorite games, interests.
 * Social links + crew are optional and skippable.
 */
export default function OnboardingPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [step, setStep] = useState(0);
  const [username, setUsername] = useState(user?.username || '');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [location, setLocation] = useState(user?.location || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [favoriteGames, setFavoriteGames] = useState<string[]>(user?.favoriteGames || []);
  const [customGames, setCustomGames] = useState<string[]>(user?.customGames || []);
  const [customInput, setCustomInput] = useState('');
  const [interests, setInterests] = useState<string[]>(user?.interests || []);
  const [error, setError] = useState<string | undefined>();

  // Already finished? Never onboard twice — bounce home.
  useEffect(() => {
    if (user?.onboardingComplete) navigate('/home', { replace: true });
  }, [user, navigate]);

  const { data: gamesData } = useQuery({
    queryKey: ['games'],
    queryFn: () => api.get<{ items: GameSummary[] }>('/api/games'),
    staleTime: 5 * 60_000,
  });
  const games = gamesData?.items ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ user: unknown }>('/api/auth/onboarding', {
        username,
        displayName,
        avatar,
        location,
        favoriteGames,
        customGames,
        interests,
      }),
    onSuccess: (data) => {
      setUser(data.user as never);
      toast.success('You are all set!', 'Welcome to NaijaPlay.');
      navigate('/home', { replace: true });
    },
    onError: (err) => {
      setError((err as ApiRequestError).message);
    },
  });

  useEffect(() => {
    if (user && !user.onboardingComplete && username === '') setUsername(user.username);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function toggle<T>(list: T[], item: T, setter: (v: T[]) => void, max: number) {
    if (list.includes(item)) setter(list.filter((x) => x !== item));
    else if (list.length < max) setter([...list, item]);
  }

  function addCustomGame() {
    const name = customInput.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!name) return;
    setCustomGames((prev) => {
      if (prev.some((g) => g.toLowerCase() === name.toLowerCase())) return prev;
      if (prev.length >= 4) {
        setError('Max 4 typed games — remove one to add another.');
        return prev;
      }
      return [...prev, name];
    });
    setCustomInput('');
  }

  const steps = ['Profile', 'Location', 'Games', 'Interests'];

  function next() {
    setError(undefined);
    if (step === 0) {
      if (username.length < 3 || !/^[a-z0-9_]+$/.test(username)) {
        setError('Username: 3+ characters, lowercase letters, numbers, underscores.');
        return;
      }
      if (displayName.trim().length < 2) {
        setError('Enter a display name.');
        return;
      }
    }
    if (step === 3) {
      mutation.mutate();
      return;
    }
    setStep((s) => s + 1);
  }

  return (
    <div className="min-h-screen bg-ink-900 flex flex-col">
      <header className="h-16 flex items-center justify-between px-4 sm:px-6 border-b border-ink-700/60">
        <span className="font-display font-extrabold text-white">Set up your profile</span>
        <span className="text-xs text-ink-500">Step {step + 1} of {steps.length}</span>
      </header>

      {/* Progress */}
      <div className="h-1 bg-ink-800">
        <div className="h-full bg-naija-500 transition-all duration-300" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
      </div>

      <main className="flex-1 mx-auto w-full max-w-lg px-4 py-8">
        {step === 0 && (
          <div className="animate-slide-up space-y-5">
            <h1 className="font-display text-2xl font-extrabold text-white">What should we call you?</h1>
            <div className="flex items-center gap-4">
              <Avatar src={avatar} name={displayName || username} size={64} />
              <div className="flex-1">
                <Label htmlFor="avatar">Avatar URL (optional)</Label>
                <Input id="avatar" value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://…" />
              </div>
            </div>
            <div>
              <Label htmlFor="displayName">Display name</Label>
              <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Tunde Alabi" />
            </div>
            <div>
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="tunde_play" />
              <p className="mt-1 text-xs text-ink-500">Your profile: {window.location.host}/u/{username || 'you'}</p>
            </div>
            <FieldError message={error} />
          </div>
        )}

        {step === 1 && (
          <div className="animate-slide-up space-y-5">
            <h1 className="font-display text-2xl font-extrabold text-white">Where do you dey? 📍</h1>
            <p className="text-sm text-ink-400">Optional — helps us show rooms and events near you. No GPS needed.</p>
            <div>
              <Label htmlFor="area">Area / City</Label>
              <Select id="area" value={location} onChange={(e) => setLocation(e.target.value)}>
                <option value="">Prefer not to say</option>
                {NIGERIAN_AREAS.map((area) => (
                  <option key={area} value={area}>{area}</option>
                ))}
              </Select>
            </div>
            <div className="flex items-center gap-2 text-xs text-ink-500">
              <MapPin className="h-4 w-4" /> We never ask for precise GPS coordinates.
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-slide-up space-y-5">
            <h1 className="font-display text-2xl font-extrabold text-white">Which games you dey play?</h1>
            <p className="text-sm text-ink-400">Pick up to 4 — we'll use them for recommendations.</p>
            <div className="grid grid-cols-2 gap-3">
              {games.map((game) => {
                const active = favoriteGames.includes(game.id);
                return (
                  <button
                    key={game.id}
                    onClick={() => toggle(favoriteGames, game.id, setFavoriteGames, 4)}
                    className={cn(
                      'rounded-2xl border p-4 text-left transition tap',
                      active ? 'border-naija-500 bg-naija-500/10' : 'border-ink-700 bg-ink-850 hover:border-ink-600',
                    )}
                    aria-pressed={active}
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink-700 mb-2">
                      <Gamepad2 className={cn('h-5 w-5', active ? 'text-naija-400' : 'text-ink-400')} />
                    </span>
                    <p className="font-semibold text-white text-sm">{game.name}</p>
                    {active && <Check className="h-4 w-4 text-naija-400 mt-1" />}
                  </button>
                );
              })}
            </div>
            <div>
              <Label htmlFor="custom-game">Your game no dey list? Type am</Label>
              <div className="flex gap-2">
                <Input
                  id="custom-game"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  maxLength={40}
                  placeholder="e.g. Ayo Olopon, Street Fighter 6…"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomGame();
                    }
                  }}
                />
                <Button variant="outline" onClick={addCustomGame} disabled={customGames.length >= 4}>
                  Add
                </Button>
              </div>
              {customGames.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {customGames.map((g) => (
                    <button
                      key={g}
                      onClick={() => setCustomGames((prev) => prev.filter((x) => x !== g))}
                      className="chip chip-active tap"
                      title="Tap to remove"
                      aria-label={`Remove ${g}`}
                    >
                      {g} <span aria-hidden>✕</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-1 text-xs text-ink-500">{customGames.length}/4 added — tap one to remove it.</p>
              <FieldError message={error} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-slide-up space-y-5">
            <h1 className="font-display text-2xl font-extrabold text-white">What are you into?</h1>
            <p className="text-sm text-ink-400">Interests power your home feed. Pick up to 6.</p>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((interest) => (
                <button
                  key={interest}
                  onClick={() => toggle(interests, interest, setInterests, 6)}
                  className={cn('chip tap', interests.includes(interest) && 'chip-active')}
                  aria-pressed={interests.includes(interest)}
                >
                  {interests.includes(interest) && <Check className="h-3.5 w-3.5 mr-1" />}
                  {interest}
                </button>
              ))}
            </div>
            <div className="rounded-2xl border border-ink-700 bg-ink-850 p-4 text-sm text-ink-400">
              <Sparkles className="h-4 w-4 text-naija-400 inline mr-1.5" />
              Everything else — social links, crews, bios — you can add later from your profile.
            </div>
            <FieldError message={error} />
          </div>
        )}

        <div className="mt-8 flex gap-3">
          {step > 0 && (
            <Button variant="outline" className="flex-1" onClick={() => setStep((s) => s - 1)} disabled={mutation.isPending}>
              Back
            </Button>
          )}
          <Button className="flex-1" onClick={next} loading={mutation.isPending}>
            {step === 3 ? 'Enter NaijaPlay' : 'Continue'}
          </Button>
        </div>

        {step < 3 && (
          <button
            onClick={() => {
              if (step === 3) return;
              setStep((s) => s + 1);
            }}
            className="mt-4 w-full text-center text-xs text-ink-500 hover:text-ink-300"
          >
            Skip this step
          </button>
        )}
      </main>
    </div>
  );
}
