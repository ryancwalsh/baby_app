'use client';

import { Lights } from '@/components/lights';
import { LoginGuard } from '@/components/login-guard';

/**
 * The gate takes a render prop, which a server component cannot hand it, so the
 * pairing lives here — that keeps the page itself on the server, where the
 * room's name can be read from the environment.
 */
export function LightsSection() {
  return <LoginGuard>{(secretHash) => <Lights secretHash={secretHash} />}</LoginGuard>;
}
