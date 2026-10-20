'use client';

import { LoginGuard } from '@/components/login-guard';
import { TrackingList } from '@/components/tracking-list';

export default function TrackingListPage() {
  return (
    <div className="flex flex-col gap-8 px-6 py-6">
      <LoginGuard>{(secretHash) => <TrackingList secretHash={secretHash} />}</LoginGuard>
    </div>
  );
}
