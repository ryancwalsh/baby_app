'use client';

import { LoginGuard } from '@/components/login-guard';
import { Reports } from '@/components/reports';

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-8 px-6 py-6">
      <LoginGuard>{(secretHash) => <Reports secretHash={secretHash} />}</LoginGuard>
    </div>
  );
}
