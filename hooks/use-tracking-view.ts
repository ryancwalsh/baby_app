'use client';

import { useLocalStorage } from '@/hooks/use-local-storage';

const TRACKING_VIEW_KEY = 'baby-app-tracking-view';

export const DAY_CALENDAR_HREF = '/tracking/day';
export const TRACKING_LIST_HREF = '/tracking/list';

/**
 * The two ways of looking back at what was tracked, in the order they are offered. The day calendar is the default.
 */
export const TRACKING_VIEWS = [
  { href: DAY_CALENDAR_HREF, label: 'Day calendar', view: 'day' },
  { href: TRACKING_LIST_HREF, label: 'Tracking list', view: 'list' },
] as const;

export type TrackingView = (typeof TRACKING_VIEWS)[number]['view'];

/**
 * Which of the two the notepad button above the Track tab opens, per phone like the clock and date formats.
 */
export function useTrackingView() {
  const { store, value } = useLocalStorage(TRACKING_VIEW_KEY);
  const trackingView = TRACKING_VIEWS.find(({ view }) => view === value) ?? TRACKING_VIEWS[0];

  return {
    setTrackingView: (next: TrackingView) => {
      store(next);
    },
    trackingView: trackingView.view,
    trackingViewHref: trackingView.href,
  };
}
