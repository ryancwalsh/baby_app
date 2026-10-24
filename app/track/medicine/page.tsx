import { TrackingFormPage } from '@/components/tracking-form-page';

/**
 * `?id=` edits an existing entry; without it the form makes a new one. `?repeat=` fills a new one with that entry's medicine and amount.
 */
export default async function MedicinePage({ searchParams }: { readonly searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;

  return <TrackingFormPage id={id} kind="medicine" />;
}
