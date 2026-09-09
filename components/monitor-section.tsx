'use client';

import { LoginGuard } from '@/components/login-guard';
import { Monitor } from '@/components/monitor';

/**
 * The gate takes a render prop, which a server component cannot hand it, so the
 * pairing lives here — that keeps the page itself on the server, where the
 * room's name can be read from the environment.
 */
export function MonitorSection() {
  return <LoginGuard>{(secretHash) => <Monitor secretHash={secretHash} />}</LoginGuard>;
}
