'use client';

import { LoginGuard } from '@/components/login-guard';
import { TrackingSettingsForm } from '@/components/tracking-settings-form';

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-8 px-6 py-6">
      <LoginGuard>{(secretHash) => <TrackingSettingsForm secretHash={secretHash} />}</LoginGuard>
    </div>
  );
}
