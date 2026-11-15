'use client';

import { LoginGuard } from '@/components/login-guard';
import { ThermostatPanel } from '@/components/thermostat-panel';

/**
 * The crib's temperature beside the hallway ecobee's, reached by tapping the temperature on the Switches tab.
 */
export default function ThermostatPage() {
  return <LoginGuard>{(secretHash) => <ThermostatPanel secretHash={secretHash} />}</LoginGuard>;
}
