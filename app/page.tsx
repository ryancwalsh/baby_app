'use client';

import { BedIcon } from 'lucide-react';
import { useState } from 'react';

import { Lights } from '@/components/lights';
import { LoginGuard } from '@/components/login-guard';
import { VersionFooter } from '@/components/version-footer';

export default function LightsPage() {
  /**
   * Local only for now: the press changes how the button looks and nothing else. Nothing is sent to the Snoo.
   */
  const [isSnooOn, setIsSnooOn] = useState(false);

  return (
    <div className="flex flex-col gap-8 px-6 py-10">
      <div className="-mb-4 flex items-center gap-3">
        <h1 className="text-foreground/60 flex-1 text-xl font-semibold text-balance">Laydon&rsquo;s Room</h1>

        <button
          aria-checked={isSnooOn}
          aria-label="Snoo"
          className={`shrink-0 rounded-lg border p-2 transition-colors ${isSnooOn ? 'border-amber-500/60 text-amber-500' : 'border-foreground/15 text-foreground/40'}`}
          onClick={() => setIsSnooOn(!isSnooOn)}
          role="switch"
          type="button"
        >
          <BedIcon className="size-6" />
        </button>
      </div>

      <LoginGuard>{(secretHash) => <Lights secretHash={secretHash} />}</LoginGuard>
      <VersionFooter />
    </div>
  );
}
