import { TrackingFormPage } from '@/components/tracking-form-page';

/**
 * `?id=` edits an existing entry; without it the form makes a new one.
 */
export default async function BottlePage({ searchParams }: { readonly searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;

  return <TrackingFormPage id={id} kind="bottle" />;
}
