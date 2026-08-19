'use client';

import { Lights } from '@/components/lights';
import { LoginGuard } from '@/components/login-guard';
import { VersionFooter } from '@/components/version-footer';

export default function LightsPage() {
  return (
    <div className="flex flex-col gap-8 px-6 py-10">
      <h1 className="text-foreground/60 text-xl font-semibold text-balance">Laydon&rsquo;s Room</h1>
      <LoginGuard>{(secretHash) => <Lights secretHash={secretHash} />}</LoginGuard>
      <VersionFooter />
    </div>
  );
}