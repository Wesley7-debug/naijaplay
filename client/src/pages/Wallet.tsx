import { Link } from 'react-router-dom';
import { Wallet as WalletIcon, MessageCircle, ShieldAlert, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/lib/utils';

const AZA_TEMPLATE = `My aza:
Bank:
Account no:
Account name:
Amount:
Narration:`;

export default function WalletPage() {
  const [copied, setCopied] = useState(false);

  const copyTemplate = async () => {
    const ok = await copyToClipboard(AZA_TEMPLATE);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="page-shell max-w-2xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-white">Payments</h1>
        <p className="text-sm text-ink-400">
          No online checkout. NaijaPlay never touches your money — hosts and winners settle by direct bank transfer in chat.
        </p>
      </div>

      <Card className="p-5">
        <h2 className="section-title mb-3 flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-naija-400" /> How it works
        </h2>
        <ol className="space-y-2.5 text-sm text-ink-300 list-decimal list-inside">
          <li>
            <span className="text-white font-semibold">Host drops aza in chat</span> — bank name, account
            number, account name, amount.
          </li>
          <li>
            <span className="text-white font-semibold">Person sends the transfer</span> from their own bank
            app (OPay, GTB, Kuda, etc.).
          </li>
          <li>
            <span className="text-white font-semibold">Host confirms in chat</span> once the alert lands —
            “seen, thanks” or a screenshot of receipt.
          </li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/messages">
            <Button size="sm">
              <MessageCircle className="h-4 w-4" /> Open chat
            </Button>
          </Link>
          <Button size="sm" variant="outline" onClick={copyTemplate}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied!' : 'Copy aza template'}
          </Button>
        </div>
        <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-ink-800 p-3 text-xs text-ink-200 font-mono">
          {AZA_TEMPLATE}
        </pre>
      </Card>

      <Card className="p-5 border-gold-500/30 bg-gold-500/5">
        <h2 className="section-title mb-2 flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-gold-400" /> Stay safe
        </h2>
        <ul className="space-y-1.5 text-sm text-ink-300 list-disc list-inside">
          <li>Only send to aza details posted by the host inside the room or DM — never to random DMs.</li>
          <li>Confirm the account name matches before you transfer.</li>
          <li>Keep your receipt / debit alert until the host confirms.</li>
          <li>Report anyone asking you to pay outside chat or pressuring you.</li>
        </ul>
      </Card>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink-700 text-ink-400">
            <WalletIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-white">No wallet balance here</p>
            <p className="text-sm text-ink-400">
              There are no tips, deposits, or receipts on NaijaPlay. Giveaway prizes are announced in-room and
              paid by the host directly to winners.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
