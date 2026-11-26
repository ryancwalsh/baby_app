'use client';

import { CirclePlusIcon, MusicIcon, SlidersHorizontalIcon, VideoIcon, WavesIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type MouseEvent, useCallback, useEffect, useRef } from 'react';

import { ListenAction, LullabyAction, NightLightAction, NoiseAction, TrackingAction } from '@/components/bottom-nav-actions';
import { useLullabyAudio } from '@/components/lullaby-audio-provider';
import { MONITOR_HREF, recordNavigationTap } from '@/components/navigation-tap';
import { useNoiseAudio } from '@/components/noise-audio-provider';
import { unlockAlarm } from '@/components/webcam-alarm';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useNavigationBottomSpace } from '@/hooks/use-navigation-bottom-space';
import { TRACKING_VIEWS } from '@/hooks/use-tracking-view';

const SWITCHES_HREF = '/';
const THERMOSTAT_HREF = '/thermostat';
const LULLABIES_HREF = '/lullabies';
const NOISE_HREF = '/noise';
const TRACK_HREF = '/track';

/**
 * The pages reached from the Track tab, which keep it lit.
 */
const TRACK_SECTION_HREFS = [TRACK_HREF, '/track/sleep', '/track/bottle', '/track/diaper', '/settings'];

/**
 * The pages reached from the Switches tab, which keep it lit.
 */
const SWITCHES_SECTION_HREFS = [SWITCHES_HREF, THERMOSTAT_HREF, '/thermostat/log'];

/**
 * How long the Switches tab has to be held to open the thermostat instead.
 */
const LONG_PRESS_MILLISECONDS = 500;

/**
 * Reached from the footer rather than a tab, but still a page to come back to on launch.
 */
const NOTES_HREF = '/notes';

const NAV_ITEMS = [
  { Action: NightLightAction, href: SWITCHES_HREF, icon: SlidersHorizontalIcon, label: 'Switches' },
  { Action: ListenAction, href: MONITOR_HREF, icon: VideoIcon, label: 'Monitor' },
  { Action: TrackingAction, href: TRACK_HREF, icon: CirclePlusIcon, label: 'Track' },
  { Action: LullabyAction, href: LULLABIES_HREF, icon: MusicIcon, label: 'Lullabies' },
  { Action: NoiseAction, href: NOISE_HREF, icon: WavesIcon, label: 'Noise' },
] as const;

const CURRENT_PAGE_KEY = 'baby-app-current-page';
const DEFAULT_HREF = SWITCHES_HREF;

/**
 * Fixed to the bottom so it is reachable one-handed in the dark, and kept dim:
 * only the current tab lights up, in the same amber the device controls use.
 *
 * Above each tab sits the one control most wanted from it, so the light, the
 * listening and both sounds can be switched from whichever tab is on screen —
 * see components/bottom-nav-actions.tsx.
 *
 * The tab is remembered per device, because the app is launched from a home
 * screen icon that always opens `/`, and whoever ends a night on the noise
 * generator wants to start the next one there.
 */
export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoaded, store, value: storedHref } = useLocalStorage(CURRENT_PAGE_KEY);
  const { isPlaying: isLullabyPlaying } = useLullabyAudio();
  const { isPlaying: isNoisePlaying } = useNoiseAudio();
  const hasRestored = useRef(false);
  const { bottomSpacePixels } = useNavigationBottomSpace();
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  /**
   * Set once a hold has opened the thermostat, so that the click which follows the finger lifting does not go on to the Switches page.
   */
  const wasLongPressRef = useRef(false);

  const openThermostatFromLongPress = useCallback(() => {
    if (!wasLongPressRef.current) {
      wasLongPressRef.current = true;
      router.push(THERMOSTAT_HREF);
    }
  }, [router]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  /**
   * The thermostat is a page of its own, and the Switches tab is the quick way there: held from any tab, or tapped again while it is already the page on screen. Android reports a hold as a context menu, which opens it too, and iOS's link preview is turned off in the class below.
   */
  const switchesTabHandlers = {
    onContextMenu: (event: MouseEvent) => {
      event.preventDefault();
      cancelLongPress();
      openThermostatFromLongPress();
    },
    onPointerCancel: cancelLongPress,
    onPointerDown: () => {
      wasLongPressRef.current = false;
      cancelLongPress();
      longPressTimerRef.current = setTimeout(openThermostatFromLongPress, LONG_PRESS_MILLISECONDS);
    },
    onPointerLeave: cancelLongPress,
    onPointerUp: cancelLongPress,
  };

  useEffect(() => {
    if (isLoaded) {
      if (hasRestored.current) {
        store(pathname);
      } else {
        /**
         * Only the first pass restores. Every later pass is a tap on a tab,
         * which is the thing being remembered rather than something to undo.
         */
        hasRestored.current = true;
        /**
         * An unknown stored page — a renamed tab, or a hand-edited value —
         * falls back to the switches rather than stranding the app somewhere it
         * cannot navigate away from.
         */
        const isKnown =
          NAV_ITEMS.some((item) => item.href === storedHref) ||
          TRACKING_VIEWS.some(({ href }) => href === storedHref) ||
          TRACK_SECTION_HREFS.includes(storedHref ?? '') ||
          storedHref === NOTES_HREF;
        const target = isKnown && storedHref !== null && storedHref !== undefined ? storedHref : DEFAULT_HREF;

        if (target === pathname) {
          store(pathname);
        } else {
          router.replace(target);
        }
      }
    }
  }, [isLoaded, pathname, router, store, storedHref]);

  const isPlayingByHref: Record<string, boolean> = {
    [LULLABIES_HREF]: isLullabyPlaying,
    [NOISE_HREF]: isNoisePlaying,
  };

  return (
    <nav
      className="border-foreground/10 bg-background/95 sticky bottom-0 z-10 border-t pt-2 backdrop-blur"
      /**
       * The safe area keeps the tabs above the iPhone's home indicator, where a tap is taken as the start of the swipe home rather than reaching the page, and the extra space is a per-phone setting for when that is still not enough.
       */
      style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + ${bottomSpacePixels}px)` }}
    >
      <div className="mx-auto flex max-w-md">
        {NAV_ITEMS.map((item) => {
          const { Action, icon: Icon } = item;
          const isSwitches = item.href === SWITCHES_HREF;
          const isCurrent =
            pathname === item.href || (item.href === TRACK_HREF && TRACK_SECTION_HREFS.includes(pathname)) || (isSwitches && SWITCHES_SECTION_HREFS.includes(pathname));
          const isSounding = isPlayingByHref[item.href] === true;

          return (
            <div className="flex flex-1 flex-col items-center" key={item.href}>
              <Action />
              <Link
                aria-current={isCurrent ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 self-stretch py-2 text-xs select-none [-webkit-touch-callout:none] ${isCurrent ? 'font-semibold text-accent' : 'text-faint'}`}
                href={item.href}
                {...(isSwitches ? switchesTabHandlers : {})}
                /**
                 * Recorded here rather than inferred on arrival, because this is
                 * the only place that knows a person did it: the restore below
                 * navigates too, and must not start the camera.
                 */
                onClick={(event) => {
                  if (isSwitches && (wasLongPressRef.current || pathname === SWITCHES_HREF)) {
                    event.preventDefault();

                    if (wasLongPressRef.current) {
                      wasLongPressRef.current = false;
                    } else {
                      router.push(THERMOSTAT_HREF);
                    }
                  }

                  recordNavigationTap(item.href);

                  /**
                   * The same tap starts the picture, and iOS only lets the alarm
                   * for a lost picture make sound once a tap has unlocked it.
                   */
                  if (item.href === MONITOR_HREF) {
                    unlockAlarm();
                  }
                }}
              >
                <span className="relative">
                  <Icon className="size-5" />
                  {/*
                  A small amber dot, the same accent the device controls use, so
                  a tab that is still making sound says so from any other tab.
                */}
                  {isSounding && <span aria-hidden className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-accent" />}
                </span>
                {item.label}
                {isSounding && <span className="sr-only">, playing</span>}
              </Link>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
