import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-ink-900 grid place-items-center px-4 text-center">
      <div>
        <p className="font-display text-7xl font-extrabold text-naija-500">404</p>
        <h1 className="mt-3 font-display text-2xl font-bold text-white">You don enter one-way street.</h1>
        <p className="mt-2 text-ink-400">This page no exist — but the rooms dey.</p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/home" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-naija-500 px-6 text-sm font-semibold text-ink-950">
            Go home
          </Link>
          <Link to="/discover" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-ink-600 px-6 text-sm font-semibold text-white hover:bg-ink-800">
            <Compass className="h-4 w-4" /> Explore
          </Link>
        </div>
      </div>
    </div>
  );
}
