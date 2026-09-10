'use client';

/**
 * Which tab a person last actually tapped.
 *
 * This exists so the monitor page can tell a deliberate arrival from an
 * incidental one. Asking for the video playlist tells the camera to start
 * pushing, and a page load must never write to the camera — but the bottom nav
 * also *restores* the last tab on launch, so simply being on `/monitor` says
 * nothing about whether a person chose to be.
 *
 * A tap sets this; the restore, which goes through `router.replace`, does not.
 *
 * Deliberately a module variable rather than `sessionStorage`: it has to be
 * forgotten when the page reloads. Stored, a phone that was left on the monitor
 * tab would start the camera the next time the app was opened, which is the
 * exact thing being avoided.
 */

export const MONITOR_HREF = '/monitor';

let lastTappedHref: null | string = null;

export function recordNavigationTap(href: string): void {
  lastTappedHref = href;
}

/**
 * Whether the given tab was the one just tapped, clearing the record as it
 * answers so that one tap can only ever start the camera once.
 */
export function consumeNavigationTap(href: string): boolean {
  const wasTapped = lastTappedHref === href;

  if (wasTapped) {
    lastTappedHref = null;
  }

  return wasTapped;
}
