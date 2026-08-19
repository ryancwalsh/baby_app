'use client';

import { LoginGuard } from '@/components/login-guard';
import { Lullabies } from '@/components/lullabies';

export default function LullabiesPage() {
  return (
    <div className="flex flex-col gap-8 px-6 py-10">
      <h1 className="text-foreground/60 text-xl font-semibold text-balance">Laydon&rsquo;s Room</h1>
      <LoginGuard>{(secretHash) => <Lullabies secretHash={secretHash} />}</LoginGuard>
    </div>
  );
}