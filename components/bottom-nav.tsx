'use client';

import { MusicIcon, SlidersHorizontalIcon, WavesIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { useLullabyAudio } from '@/components/lullaby-audio-provider';
import { useNoiseAudio } from '@/components/noise-audio-provider';
import { useLocalStorage } from '@/hooks/use-local-storage';

const LULLABIES_HREF = '/lullabies';
const NOISE_HREF = '/noise';

const NAV_ITEMS = [
  { href: '/', icon: SlidersHorizontalIcon, label: 'Switches' },
  { href: LULLABIES_HREF, icon: MusicIcon, label: 'Lullabies' },
  { href: NOISE_HREF, icon: WavesIcon, label: 'Noise' },
] as const;

const CURRENT_PAGE_KEY = 'baby-app-current-page';
const DEFAULT_HREF = '/';

/**
 * Fixed to the bottom so it is reachable one-handed in the dark, and kept dim:
 * only the current tab lights up, in the same amber the device controls use.
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
        const isKnown = NAV_ITEMS.some((item) => item.href === storedHref);
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
    <nav className="border-foreground/10 bg-background/95 fixed inset-x-0 bottom-0 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-md">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isCurrent = pathname === item.href;
          const isSounding = isPlayingByHref[item.href] === true;

          return (
            <Link
              aria-current={isCurrent ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs ${isCurrent ? 'font-semibold text-amber-500' : 'text-foreground/50'}`}
              href={item.href}
              key={item.href}
            >
              <span className="relative">
                <Icon className="size-5" />
                {/*
                  A small amber dot, the same accent the device controls use, so
                  a tab that is still making sound says so from any other tab.
                */}
                {isSounding && <span aria-hidden className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-amber-500" />}
              </span>
              {item.label}
              {isSounding && <span className="sr-only">, playing</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
