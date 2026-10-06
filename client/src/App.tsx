import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/Toaster';
import { Skeleton, EmptyState, ButtonLink } from '@/components/ui/card';

import LandingPage from '@/pages/Landing';
import SignInPage from '@/pages/SignIn';
import AuthCallbackPage from '@/pages/AuthCallback';
import OnboardingPage from '@/pages/Onboarding';
import HomePage from '@/pages/Home';
import DiscoverPage from '@/pages/Discover';
import CreatePage from '@/pages/Create';
import RoomsPage from '@/pages/Rooms';
import RoomPage from '@/pages/Room';
import EventsPage from '@/pages/Events';
import EventDetailPage from '@/pages/EventDetail';
import CreateEventPage from '@/pages/CreateEvent';
import GamesPage from '@/pages/Games';
import GameDetailPage from '@/pages/GameDetail';
import CrewsPage from '@/pages/Crews';
import CrewDetailPage from '@/pages/CrewDetail';
import PeoplePage from '@/pages/People';
import ProfilePage from '@/pages/Profile';
import NotificationsPage from '@/pages/Notifications';
import MomentsPage from '@/pages/Moments';
import MomentDetailPage from '@/pages/MomentDetail';
import LeaderboardsPage from '@/pages/Leaderboards';
import SeasonsPage from '@/pages/Seasons';
import CompetitionsPage from '@/pages/Competitions';
import CompetitionDetailPage from '@/pages/CompetitionDetail';
import RecapPage from '@/pages/Recap';
import GlobalChatPage from '@/pages/GlobalChat';
import WalletPage from '@/pages/Wallet';
import MessagesPage from '@/pages/Messages';
import SettingsPage from '@/pages/Settings';
import AdminPage from '@/pages/Admin';
import NotFoundPage from '@/pages/NotFound';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, fetched } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (!fetched) void useAuthStore.getState().fetchUser();
  }, [fetched]);

  if (loading || !fetched) {
    return (
      <div className="min-h-screen bg-ink-900 p-6 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  // Funnel new accounts to onboarding — and never send finished accounts back.
  if (!user.onboardingComplete && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  if (user.onboardingComplete && location.pathname === '/onboarding') {
    return <Navigate to="/home" replace />;
  }
  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading, fetched } = useAuthStore();
  useEffect(() => {
    if (!fetched) void useAuthStore.getState().fetchUser();
  }, [fetched]);
  if (!loading && fetched && user) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user && (user.role === 'admin' || user.role === 'moderator')) return <>{children}</>;
  return (
    <div className="page-shell">
      <EmptyState
        title="Admins only"
        description="You do not have permission to view this page."
        action={<ButtonLink to="/home">Back home</ButtonLink>}
      />
    </div>
  );
}

export default function App() {
  const fetchUser = useAuthStore((s) => s.fetchUser);
  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/global" element={<AppShell><GlobalChatPage /></AppShell>} />
        <Route path="/signin" element={<PublicOnly><SignInPage /></PublicOnly>} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />

        <Route
          path="/home"
          element={<RequireAuth><AppShell><HomePage /></AppShell></RequireAuth>}
        />
        <Route
          path="/discover"
          element={<RequireAuth><AppShell><DiscoverPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/create"
          element={<RequireAuth><AppShell><CreatePage /></AppShell></RequireAuth>}
        />
        <Route
          path="/rooms"
          element={<RequireAuth><AppShell><RoomsPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/rooms/:id"
          element={<RequireAuth><AppShell><RoomPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/r/:code"
          element={<RequireAuth><AppShell><RoomPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/events"
          element={<RequireAuth><AppShell><EventsPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/events/new"
          element={<RequireAuth><AppShell><CreateEventPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/events/:slug"
          element={<RequireAuth><AppShell><EventDetailPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/games"
          element={<RequireAuth><AppShell><GamesPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/games/:slug"
          element={<RequireAuth><AppShell><GameDetailPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/crews"
          element={<RequireAuth><AppShell><CrewsPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/crews/:slug"
          element={<RequireAuth><AppShell><CrewDetailPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/people"
          element={<RequireAuth><AppShell><PeoplePage /></AppShell></RequireAuth>}
        />
        <Route
          path="/u/:username"
          element={<RequireAuth><AppShell><ProfilePage /></AppShell></RequireAuth>}
        />
        <Route
          path="/notifications"
          element={<RequireAuth><AppShell><NotificationsPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/moments"
          element={<RequireAuth><AppShell><MomentsPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/moments/:id"
          element={<RequireAuth><AppShell><MomentDetailPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/leaderboards"
          element={<RequireAuth><AppShell><LeaderboardsPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/seasons"
          element={<RequireAuth><AppShell><SeasonsPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/competitions"
          element={<RequireAuth><AppShell><CompetitionsPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/competitions/:id"
          element={<RequireAuth><AppShell><CompetitionDetailPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/recaps/:id"
          element={<RequireAuth><AppShell><RecapPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/wallet"
          element={<RequireAuth><AppShell><WalletPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/messages"
          element={<RequireAuth><AppShell><MessagesPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/settings"
          element={<RequireAuth><AppShell><SettingsPage /></AppShell></RequireAuth>}
        />
        <Route
          path="/admin"
          element={<RequireAuth><AdminOnly><AppShell><AdminPage /></AppShell></AdminOnly></RequireAuth>}
        />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </>
  );
}
