'use client';

import { LoginGuard } from '@/components/login-guard';
import { TrackTiles } from '@/components/track-tiles';

export default function TrackPage() {
  return (
    <div className="flex flex-col gap-8 px-6 py-3">
      <LoginGuard>{(secretHash) => <TrackTiles secretHash={secretHash} />}</LoginGuard>
    </div>
  );
}
