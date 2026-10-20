'use client';

import { BottleForm } from '@/components/bottle-form';
import { DiaperForm } from '@/components/diaper-form';
import { LoginGuard } from '@/components/login-guard';
import { SleepForm } from '@/components/sleep-form';
import { useFormTextSize } from '@/hooks/use-text-size';

const FORMS = {
  bottle: BottleForm,
  diaper: DiaperForm,
  sleep: SleepForm,
} as const;

/**
 * Chosen by name rather than handed over as a component, since the page that picks it is a server component and a function cannot cross to the client.
 */
export function TrackingFormPage({ id, kind }: { readonly id: string | undefined; readonly kind: keyof typeof FORMS }) {
  const Form = FORMS[kind];
  const { zoom } = useFormTextSize();
  const parsedId = id === undefined ? Number.NaN : Number.parseInt(id, 10);

  return (
    <div className="flex flex-col gap-8 px-6 py-6" style={{ zoom }}>
      <LoginGuard>{(secretHash) => <Form id={Number.isNaN(parsedId) ? null : parsedId} secretHash={secretHash} />}</LoginGuard>
    </div>
  );
}
