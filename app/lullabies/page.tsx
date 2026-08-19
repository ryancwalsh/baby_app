'use client';

import { LoginGuard } from '@/components/login-guard';
import { Lullabies } from '@/components/lullabies';

export default function LullabiesPage() {
  return (
    <div className="flex flex-col gap-8 px-6 py-10">
      <LoginGuard>{(secretHash) => <Lullabies secretHash={secretHash} />}</LoginGuard>
    </div>
  );
}
