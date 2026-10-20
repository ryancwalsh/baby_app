import { DayCalendarPage } from '@/components/day-calendar';

/**
 * `?date=YYYY-MM-DD` opens a particular day; without it, today.
 */
export default async function DayPage({ searchParams }: { readonly searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;

  return <DayCalendarPage date={date} />;
}
