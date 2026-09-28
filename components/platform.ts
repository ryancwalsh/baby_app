'use client';

/**
 * Both ways a launcher can have opened this page: `display-mode` is the
 * standard, and `navigator.standalone` is the one iOS has always answered.
 */
export function getIsInstalled() {
  const iosNavigator = window.navigator as Navigator & { standalone?: boolean };

  return window.matchMedia('(display-mode: standalone)').matches || iosNavigator.standalone === true;
}

/**
 * iOS has no install event to wait for — WebKit has never implemented one — so
 * the only offer that can be made there is the manual one, and the only way to
 * know it applies is the platform itself.
 */
export function getIsIos() {
  return /iphone|ipad|ipod/iu.test(window.navigator.userAgent);
}

export function getIsAndroid() {
  return /android/iu.test(window.navigator.userAgent);
}
