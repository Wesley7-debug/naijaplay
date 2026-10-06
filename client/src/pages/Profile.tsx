import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  MapPin,
  Share2,
  Flag,
  Settings,
  Trophy,
  Star,
  Camera,
  CalendarDays,
  Shield,
  ExternalLink,
  MessageCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useProfile, useFollow } from '@/hooks/useSharedData';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/ui';
import { Button } from '@/components/ui/button';
import { Card, Badge, Avatar, Skeleton, EmptyState, ButtonLink } from '@/components/ui/card';
import { LoadingScreen, ErrorState } from '@/components/ui/feedback';
import { Modal } from '@/components/ui/modal';
import { formatCount, timeAgo, cn, copyToClipboard } from '@/lib/utils';
import type { PublicUser, MomentView } from '@naijaplay/shared';

export default function ProfilePage() {
  const { username } = useParams();
  const viewer = useAuthStore((s) => s.user);
  const query = useProfile(username);
  const follow = useFollow(username);
  const [reportOpen, setReportOpen] = useState(false);
  const navigate = useNavigate();

  const xpQuery = useQuery({
    queryKey: ['xp'],
    queryFn: () => api.get<{ progress: { xp: number; level: number; currentLevelXp: number; nextLevelXp: number; progress: number } }>('/api/users/me/xp'),
    enabled: viewer?.username === username,
  });

  const achievementsQuery = useQuery({
    queryKey: ['achievements'],
    queryFn: () => api.get<{ achievements: { code: string; title: string; description: string; icon: string; unlockedAt: string | null }[]; badges: { code: string; title: string; description: string; icon: string; awardedAt: string }[] }>('/api/users/me/achievements'),
    enabled: viewer?.username === username,
  });

  if (query.isLoading) return <LoadingScreen label="Loading profile…" />;
  if (query.isError || !query.data) {
    return (
      <div className="page-shell">
        <Card><ErrorState message="That profile does not exist." onRetry={() => query.refetch()} /></Card>
      </div>
    );
  }

  const { profile, moments, hostedRooms, recaps } = query.data;
  const isSelf = profile.isSelf;
  const xp = xpQuery.data?.progress;

  async function startDm() {
    try {
      const convo = await api.post<{ conversation: { id: string } }>('/api/conversations', { userId: profile.id });
      navigate(`/messages?c=${convo.conversation.id}`);
    } catch (err) {
      toast.error('Could not open chat', (err as Error).message);
    }
  }

  return (
    <div className="page-shell max-w-3xl space-y-5">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <Avatar src={profile.avatar} name={profile.displayName} size={88} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-extrabold text-white">{profile.displayName}</h1>
              {profile.isVerified && <Badge tone="naija">✓ verified</Badge>}
              <Badge tone="outline">Lv {profile.level}</Badge>
            </div>
            <p className="text-sm text-ink-400">@{profile.username}</p>
            {profile.bio && <p className="mt-2 text-sm text-ink-200">{profile.bio}</p>}
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink-500">
              {profile.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {profile.location}</span>}
              <span>Joined {timeAgo(profile.createdAt)}</span>
            </div>

            {/* XP progress bar */}
            {xp && (
              <div className="mt-3 max-w-sm">
                <div className="flex justify-between text-xs text-ink-400 mb-1">
                  <span>Level {xp.level}</span>
                  <span>{formatCount(xp.currentLevelXp)} / {formatCount(xp.nextLevelXp)} XP</span>
                </div>
                <div className="h-2 rounded-full bg-ink-700 overflow-hidden" role="progressbar" aria-valuenow={xp.progress} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-naija-500 transition-all" style={{ width: `${xp.progress}%` }} />
                </div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
              {[
                ['Followers', formatCount(profile.followersCount)],
                ['Following', formatCount(profile.followingCount)],
                ['Rooms hosted', profile.roomsHostedCount],
                ['Events joined', profile.eventsJoinedCount],
                ['Wins', profile.winsCount],
                ['Giveaways', profile.giveawaysWonCount],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-ink-700 bg-ink-800 py-2 px-1">
                  <p className="font-display font-bold text-white text-sm">{value}</p>
                  <p className="text-[10px] text-ink-500 uppercase">{label}</p>
                </div>
              ))}
            </div>

            {((profile.favoriteGameData?.length ?? 0) > 0 || (profile.customGames?.length ?? 0) > 0 || (profile.interests?.length ?? 0) > 0) && (
              <div className="mt-4 space-y-2">
                {(profile.favoriteGameData?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold uppercase text-ink-500 mr-1">Plays</span>
                    {profile.favoriteGameData!.map((g) => (
                      <span key={g.name} className="chip">{g.name}</span>
                    ))}
                  </div>
                )}
                {(profile.customGames?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold uppercase text-ink-500 mr-1">Also plays</span>
                    {(profile.customGames ?? []).map((g) => (
                      <span key={g} className="chip chip-active">{g}</span>
                    ))}
                  </div>
                )}
                {(profile.interests?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold uppercase text-ink-500 mr-1">Into</span>
                    {(profile.interests ?? []).map((i) => (
                      <span key={i} className="chip">{i}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
            {isSelf ? (
              <>
                <Button variant="outline" className="flex-1" onClick={() => navigate('/settings')}>
                  <Settings className="h-4 w-4" /> Edit profile
                </Button>
                <Button variant="outline" className="flex-1" onClick={async () => { if (await copyToClipboard(window.location.href)) toast.success('Profile link copied'); }}>
                  <Share2 className="h-4 w-4" /> Share
                </Button>
              </>
            ) : (
              <>
                <Button
                  className="flex-1"
                  variant={profile.isFollowing ? 'outline' : 'primary'}
                  loading={follow.isPending}
                  onClick={() => follow.mutate({ follow: !profile.isFollowing })}
                >
                  {profile.isFollowing ? 'Following' : 'Follow'}
                </Button>
                <Button variant="outline" className="flex-1" onClick={startDm}>
                  <MessageCircle className="h-4 w-4" /> Message
                </Button>
                <Button variant="ghost" size="icon" aria-label="Report profile" onClick={() => setReportOpen(true)}>
                  <Flag className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Crew */}                {profile.crew && (
          <Link
            to={`/crews/${profile.crew.slug}`}
            className="mt-4 flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-800 p-3 hover:border-ink-600"
          >
            <Shield className="h-5 w-5 text-naija-400" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{profile.crew.name}</p>
              <p className="text-xs text-ink-500">{profile.crew.memberCount} members</p>
            </div>
            <span className="ml-auto font-display font-bold text-naija-400">{formatCount(profile.crew.points)}</span>
          </Link>
        )}
      </Card>

      {/* Badges + achievements (own profile) */}
      {isSelf && (
        <section>
          <h2 className="section-title mb-3 flex items-center gap-2"><Trophy className="h-5 w-5 text-gold-400" /> Badges & achievements</h2>
          {achievementsQuery.isLoading ? (
            <Skeleton className="h-28" />
          ) : (
            <div className="space-y-3">
              {(achievementsQuery.data?.badges?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-2">
                  {achievementsQuery.data!.badges.map((b) => (
                    <span key={b.code} className="inline-flex items-center gap-1.5 rounded-xl border border-gold-400/40 bg-gold-400/10 px-3 py-1.5 text-sm font-semibold text-gold-300">
                      🏅 {b.title}
                    </span>
                  ))}
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-2">
                {(achievementsQuery.data?.achievements ?? []).map((a) => (
                  <div
                    key={a.code}
                    className={cn(
                      'rounded-xl border p-3 flex items-start gap-2.5',
                      a.unlockedAt ? 'border-naija-500/40 bg-naija-500/5' : 'border-ink-700 bg-ink-850 opacity-60',
                    )}
                  >
                    <span className="text-xl" aria-hidden>{a.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{a.title}</p>
                      <p className="text-xs text-ink-500">{a.description}</p>
                      {a.unlockedAt && <p className="text-[10px] text-naija-400 mt-0.5">Unlocked {timeAgo(a.unlockedAt)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Moments */}
      <section>
        <h2 className="section-title mb-3 flex items-center gap-2"><Camera className="h-5 w-5 text-ink-400" /> Moments</h2>
        {moments.length === 0 ? (
          <Card className="p-4 text-center text-sm text-ink-400">No moments yet.{isSelf && <> <Link to="/moments" className="text-naija-400">Post one</Link>.</>}</Card>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {moments.map((m: MomentView) => (
              <Link key={m.id} to={`/moments/${m.id}`}>
                <Card className="p-3 hover:border-ink-500 transition tap h-full">
                  <p className="text-sm text-ink-200 line-clamp-3">{m.caption}</p>
                  {m.media && <img src={m.media.url} alt="" className="mt-2 rounded-lg max-h-40 w-full object-cover" loading="lazy" />}
                  <p className="mt-2 text-xs text-ink-500">💚 {Object.values(m.reactions || {}).reduce((a, b) => a + b, 0)} · 💬 {m.commentsCount}</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Hosted rooms + recaps */}
      {(hostedRooms.length > 0 || recaps.length > 0) && (
        <section className="grid sm:grid-cols-2 gap-4">
          {hostedRooms.length > 0 && (
            <div>
              <h2 className="section-title mb-3 flex items-center gap-2"><Star className="h-5 w-5 text-naija-400" /> Hosted rooms</h2>
              <div className="space-y-2">
                {hostedRooms.map((r) => {
                  const room = r as unknown as { id: string; name: string; slug: string; status: string; memberCount: number; peakMemberCount: number };
                  return (
                    <Link key={room.id} to={`/rooms/${room.slug}`}>
                      <Card className="p-3 hover:border-ink-500 transition tap flex items-center justify-between">
                        <span className="text-sm font-semibold text-white truncate">{room.name}</span>
                        <Badge tone={room.status === 'live' ? 'live' : 'outline'}>{room.status}</Badge>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
          {recaps.length > 0 && (
            <div>
              <h2 className="section-title mb-3 flex items-center gap-2"><CalendarDays className="h-5 w-5 text-gold-400" /> Recaps</h2>
              <div className="space-y-2">
                {recaps.map((r) => {
                  const recap = r as unknown as { id: string; title: string; attendeeCount: number };
                  return (
                    <Link key={recap.id} to={`/recaps/${recap.id}`}>
                      <Card className="p-3 hover:border-ink-500 transition tap">
                        <p className="text-sm font-semibold text-white">{recap.title}</p>
                        <p className="text-xs text-ink-500">{recap.attendeeCount} players</p>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Social links */}
      {profile.socialLinks && Object.values(profile.socialLinks).some(Boolean) && (
        <Card className="p-4">
          <div className="flex flex-wrap gap-3">
            {Object.entries(profile.socialLinks as Record<string, string>).filter(([, v]) => v).map(([key, value]) => (
              <a key={key} href={value} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm text-naija-400 hover:text-naija-300">
                {key} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ))}
          </div>
        </Card>
      )}

      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} targetType="user" targetId={String(profile.id)} label={profile.displayName} />
    </div>
  );
}

export function ReportModal({
  open,
  onClose,
  targetType,
  targetId,
  label,
}: {
  open: boolean;
  onClose: () => void;
  targetType: string;
  targetId: string;
  label: string;
}) {
  const [reason, setReason] = useState('spam');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await api.post('/api/reports', { targetType, targetId, reason, description });
      toast.success('Report received', 'Our moderators will review it.');
      onClose();
    } catch (err) {
      toast.error('Could not report', (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Report ${label}`} sheet>
      <div className="space-y-3">
        <div>
          <label htmlFor="report-reason" className="text-sm font-medium text-ink-200 block mb-1.5">Reason</label>
          <select
            id="report-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-11 w-full rounded-xl border border-ink-600 bg-ink-850 px-3 text-sm text-white"
          >
            {['spam', 'harassment', 'hate_speech', 'scam', 'nudity', 'violence', 'impersonation', 'other'].map((r) => (
              <option key={r} value={r}>{r.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="report-desc" className="text-sm font-medium text-ink-200 block mb-1.5">Details (optional)</label>
          <textarea
            id="report-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            className="min-h-[80px] w-full rounded-xl border border-ink-600 bg-ink-850 px-3 py-2 text-sm text-white"
          />
        </div>
        <Button className="w-full" loading={submitting} onClick={submit}>Submit report</Button>
      </div>
    </Modal>
  );
}
