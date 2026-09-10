'use client';

/**
 * Attaching a live HLS stream to an `<audio>` or `<video>` element.
 *
 * The order matters and is not the obvious one. Chrome on Android answers
 * `canPlayType('application/vnd.apple.mpegurl')` with **"maybe"** and then
 * plays nothing at all — a silent black picture, no error — so a claim of
 * native HLS is not worth trusting anywhere Media Source Extensions exist.
 * hls.js is therefore tried first, and native playback is the fallback rather
 * than the preference.
 *
 * That fallback is what iOS wants anyway: there is no Media Source there, and
 * the native player is also what gives lock screen playback.
 *
 * hls.js is imported only where it is going to be used, which keeps it off the
 * platforms that play HLS themselves.
 */

export type HlsPlayer = { destroy: () => void };

function hasMediaSource(): boolean {
  /**
   * `ManagedMediaSource` is the iOS 17 spelling, and it is not in the DOM
   * types yet, so it is read off the window rather than named.
   */
  const managedMediaSource = (window as unknown as { ManagedMediaSource?: unknown }).ManagedMediaSource;

  return typeof window.MediaSource !== 'undefined' || managedMediaSource !== undefined;
}

function canPlayHlsNatively(media: HTMLMediaElement): boolean {
  return media.canPlayType('application/vnd.apple.mpegurl') !== '';
}

/**
 * Returns the hls.js instance to be destroyed later, or null when the browser
 * is playing the stream by itself and there is nothing to clean up.
 */
export async function attachHlsStream(media: HTMLMediaElement, url: string): Promise<HlsPlayer | null> {
  if (hasMediaSource()) {
    const { default: Hls } = await import('hls.js');

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(url);
      hls.attachMedia(media);

      return hls;
    }
  }

  if (canPlayHlsNatively(media)) {
    media.src = url;

    return null;
  }

  throw new Error('This browser cannot play the camera stream.');
}
