'use client';

import { LoginGuard } from '@/components/login-guard';
import { MonitorModes } from '@/components/monitor-modes';

/**
 * The gate takes a render prop, which a server component cannot hand it, so the
 * pairing lives here — that keeps the page itself on the server, where the
 * room's name can be read from the environment.
 *
 * The picture is the whole page: the night light lives on the lights tab and
 * the listening in the navigation, so nothing here competes with the cot for the screen.
 */
export function MonitorSection() {
  return <LoginGuard>{(secretHash) => <MonitorModes secretHash={secretHash} />}</LoginGuard>;
}
