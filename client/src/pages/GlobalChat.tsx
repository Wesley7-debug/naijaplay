import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import GlobalChatPanel from '@/components/global/GlobalChatPanel';

/** Full-page global lobby — public so guests land straight into the vibe. */
export default function GlobalChatPage() {
  return (
    <div className="page-shell max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-ink-400 hover:text-white" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-white">Global chat</h1>
          <p className="text-sm text-ink-400">Everyone on NaijaPlay in one lobby. Jump in — no sign-in needed.</p>
        </div>
      </div>
      <GlobalChatPanel />
      <p className="text-center text-xs text-ink-500">
        Community guidelines apply. Abusive messages get removed and accounts may be suspended.
      </p>
    </div>
  );
}
