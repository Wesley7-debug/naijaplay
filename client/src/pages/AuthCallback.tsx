import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { Spinner } from '@/components/ui/feedback';

/**
 * Landing point after the server verifies a magic link / Google OAuth
 * and sets the HTTP-only session cookie.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const fetchUser = useAuthStore((s) => s.fetchUser);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchUser();
      if (cancelled) return;
      const user = useAuthStore.getState().user;
      if (!user) {
        navigate('/signin', { replace: true });
        return;
      }
      // Finished accounts go straight home — never back to onboarding.
      if (!user.onboardingComplete) {
        navigate('/onboarding', { replace: true });
        return;
      }
      navigate('/home', { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchUser, navigate]);

  return (
    <div className="min-h-screen bg-ink-900 grid place-items-center px-4">
      <div className="text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-naija-500 font-display text-2xl font-black text-ink-950 mb-4">
          N
        </span>
        <Spinner className="mx-auto h-6 w-6 text-naija-400" />
        <p className="mt-4 text-ink-300">Bringing you in…</p>
        <p className="mt-1 text-xs text-ink-500">
          Taking too long? <Link to="/signin" className="text-naija-400">Try again</Link>
        </p>
      </div>
    </div>
  );
}
