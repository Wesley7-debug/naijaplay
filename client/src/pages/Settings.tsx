import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Save } from 'lucide-react';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useGames } from '@/hooks/useSharedData';
import { toast } from '@/stores/ui';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Label, FieldError, Select } from '@/components/ui/input';
import { Card, Avatar, Badge } from '@/components/ui/card';
import { NIGERIAN_AREAS, INTERESTS, type GameSummary } from '@naijaplay/shared';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const games = useGames();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [location, setLocation] = useState(user?.location || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [favoriteGames, setFavoriteGames] = useState<string[]>(user?.favoriteGames || []);
  const [customGames, setCustomGames] = useState<string[]>(user?.customGames || []);
  const [customInput, setCustomInput] = useState('');
  const [interests, setInterests] = useState<string[]>(user?.interests || []);
  const [social, setSocial] = useState<Record<string, string>>({ ...(user?.socialLinks || {}) });
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function uploadAvatar(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('Only image files work for avatars.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Avatar must be under 8MB.');
      return;
    }
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('folder', 'avatar');
      const result = await api.post<{ url: string; provider: string }>('/api/uploads', form);
      setAvatar(result.url);
      toast.success('Avatar uploaded', `Stored via ${result.provider}`);
    } catch (err) {
      setError((err as ApiRequestError).message);
    } finally {
      setUploadingAvatar(false);
    }
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.patch<{ user: unknown }>('/api/users/me/profile', {
        displayName,
        bio,
        location,
        avatar,
        favoriteGames,
        customGames,
        interests,
        socialLinks: social,
      }),
    onSuccess: (data) => {
      setUser(data.user as never);
      toast.success('Profile updated ✅');
      void qc.invalidateQueries({ queryKey: ['profile'] });
      setError(undefined);
    },
    onError: (err) => setError((err as ApiRequestError).message),
  });

  if (!user) return null;

  function toggle(list: string[], item: string, setter: (v: string[]) => void, max: number) {
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

  return (
    <div className="page-shell max-w-2xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-white">Settings</h1>
        <p className="text-sm text-ink-400">Your profile, interests and account.</p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-4">
          <Avatar src={avatar} name={displayName} size={64} />
          <div className="flex-1 space-y-2">
            <div>
              <Label htmlFor="set-avatar">Avatar URL</Label>
              <Input id="set-avatar" value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://…" />
            </div>
            <label className="chip tap cursor-pointer inline-flex items-center gap-1.5 w-fit">
              {uploadingAvatar ? 'Uploading…' : 'Upload photo instead'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                className="sr-only"
                disabled={uploadingAvatar}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadAvatar(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <p className="font-semibold text-white">{user.username}</p>
          <Badge tone="outline">Lv {user.level}</Badge>
          {user.role !== 'user' && <Badge tone="naija">{user.role}</Badge>}
        </div>

        <div>
          <Label htmlFor="set-name">Display name</Label>
          <Input id="set-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} />
        </div>
        <div>
          <Label htmlFor="set-bio">Bio</Label>
          <Textarea id="set-bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} />
          <p className="mt-1 text-xs text-ink-500">{bio.length}/280</p>
        </div>
        <div>
          <Label htmlFor="set-location">Area</Label>
          <Select id="set-location" value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="">Prefer not to say</option>
            {NIGERIAN_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        </div>

        <div>
          <Label>Favorite games (max 4)</Label>
          <div className="flex flex-wrap gap-2">
            {(games.data?.items ?? []).map((g: GameSummary) => (
              <button
                key={g.id}
                onClick={() => toggle(favoriteGames, g.id, setFavoriteGames, 4)}
                className={cn('chip tap', favoriteGames.includes(g.id) && 'chip-active')}
                aria-pressed={favoriteGames.includes(g.id)}
              >
                {g.name}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <Label htmlFor="set-custom-game">Game no dey list? Type am (max 4)</Label>
            <div className="flex gap-2">
              <Input
                id="set-custom-game"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                maxLength={40}
                placeholder="e.g. Ayo Olopon"
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
          </div>
        </div>

        <div>
          <Label>Interests (max 6)</Label>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((i) => (
              <button
                key={i}
                onClick={() => toggle(interests, i, setInterests, 6)}
                className={cn('chip tap', interests.includes(i) && 'chip-active')}
                aria-pressed={interests.includes(i)}
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-ink-200 mb-1.5">Social links (optional)</legend>
          <div className="grid sm:grid-cols-2 gap-3">
            {['twitter', 'instagram', 'tiktok', 'youtube', 'website'].map((key) => (
              <div key={key}>
                <Label htmlFor={`social-${key}`} className="capitalize">{key}</Label>
                <Input
                  id={`social-${key}`}
                  value={social[key] || ''}
                  onChange={(e) => setSocial((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={`https://${key === 'website' ? 'yoursite.com' : ` ${key}.com/you`}`}
                />
              </div>
            ))}
          </div>
        </fieldset>

        <FieldError message={error} />

        <div className="flex gap-2">
          <Button className="flex-1" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            <Save className="h-4 w-4" /> Save changes
          </Button>
          <Button variant="outline" onClick={() => navigate(`/u/${user.username}`)}>View profile</Button>
        </div>
      </Card>

      <Card className="p-5 flex items-center justify-between">
        <div>
          <p className="font-semibold text-white">Sign out</p>
          <p className="text-xs text-ink-500">Ends your session on this device.</p>
        </div>
        <Button variant="danger" onClick={() => void logout()}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </Card>
    </div>
  );
}
