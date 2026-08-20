'use client';

import { useEffect, useState } from 'react';

import { useLocalStorage } from '@/hooks/use-local-storage';

const INSTALL_BANNER_DISMISSED_KEY = 'baby-app-install-banner-dismissed';

/**
 * Chrome's install event, which the DOM library still does not declare. Only
 * `prompt` is used; the `userChoice` promise tells us nothing that
 * `appinstalled` does not.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};

/**
 * Both ways a launcher can have opened this page: `display-mode` is the
 * standard, and `navigator.standalone` is the one iOS has always answered.
 */
function getIsInstalled() {
  const iosNavigator = window.navigator as Navigator & { standalone?: boolean };

  return window.matchMedia('(display-mode: standalone)').matches || iosNavigator.standalone === true;
}

/**
 * iOS has no install event to wait for — WebKit has never implemented one — so
 * the only offer that can be made there is the manual one, and the only way to
 * know it applies is the platform itself.
 */
function getIsIos() {
  return /iphone|ipad|ipod/iu.test(window.navigator.userAgent);
}

/**
 * Chrome shows install UI of its own, but at its own discretion: once, and
 * never again once dismissed. This banner is the deterministic version, and it
 * covers the platform Chrome's event does not.
 *
 * Nothing here needs the login, so it sits above the guard: adding the app to a
 * home screen is not something the nursery has to be unlocked for.
 */
export function InstallBanner() {
  const { store, value: dismissed } = useLocalStorage(INSTALL_BANNER_DISMISSED_KEY);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(true);
  const [isIos, setIsIos] = useState(false);

  /**
   * Assumed installed until a browser has said otherwise, so that the banner
   * cannot flash on a phone that already has the app.
   */
  useEffect(() => {
    setIsInstalled(getIsInstalled());
    setIsIos(getIsIos());

    function handleBeforeInstallPrompt(event: Event) {
      /**
       * Chrome's own banner is suppressed for months once someone dismisses it,
       * which is how the prompt went missing in the first place. Keeping the
       * event puts the offer where it can be shown again.
       */
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    }

    function handleInstalled() {
      setIsInstalled(true);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  async function handleInstall() {
    if (installEvent !== null) {
      await installEvent.prompt();
      /**
       * The event is single use. Chrome sends another if the app is still
       * installable after the dialog is waved away.
       */
      setInstallEvent(null);
    }
  }

  /**
   * A stored value is a deliberate "no thanks", and `undefined` only means the
   * first server-rendered pass, before localStorage has been read.
   */
  const isDismissed = typeof dismissed === 'string';
  const isOffered = installEvent !== null || isIos;

  return isOffered && !isInstalled && !isDismissed ? (
    <header className="border-foreground/10 text-foreground/60 flex items-center gap-3 border-b px-6 py-3 text-xs">
      {isIos ? (
        <p className="flex-1">
          Add to your home screen: <span className="text-amber-500">Share</span> then <span className="text-amber-500">Add to Home Screen</span>.
        </p>
      ) : (
        <>
          <p className="flex-1">Add this to your home screen.</p>
          <button className="border-foreground/15 text-amber-500 rounded-lg border px-3 py-1 font-semibold" onClick={handleInstall} type="button">
            Install
          </button>
        </>
      )}
      <button className="underline" onClick={() => store(String(Date.now()))} type="button">
        Dismiss
      </button>
    </header>
  ) : null;
}
