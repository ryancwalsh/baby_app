'use client';

import { CameraFeed } from '@/components/camera-feed';
import { LoginGuard } from '@/components/login-guard';

/**
 * The gate takes a render prop, which a server component cannot hand it, so the
 * pairing lives here — that keeps the page itself on the server, where the
 * room's name can be read from the environment.
 *
 * The picture is the whole page: the night light and the listening live on the
 * lights tab, so nothing here competes with the cot for the screen.
 */
export function MonitorSection() {
  return <LoginGuard>{(secretHash) => <CameraFeed secretHash={secretHash} />}</LoginGuard>;
}
