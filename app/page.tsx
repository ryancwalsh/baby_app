'use client';

import { Lights } from '@/components/lights';
import { LoginGuard } from '@/components/login-guard';
import { SnooToggle } from '@/components/snoo-toggle';
import { VersionFooter } from '@/components/version-footer';

export default function LightsPage() {
  return (
    <div className="flex flex-col gap-8 px-6 py-10">
      <div className="-mb-4 flex items-center gap-3">
        <h1 className="text-moon flex-1 text-xl font-semibold text-balance">Laydon&rsquo;s Room</h1>
        <SnooToggle />
      </div>

      <LoginGuard>{(secretHash) => <Lights secretHash={secretHash} />}</LoginGuard>
      <VersionFooter />
    </div>
  );
}
