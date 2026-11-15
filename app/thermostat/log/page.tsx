'use client';

import { LoginGuard } from '@/components/login-guard';
import { ThermostatLogTable } from '@/components/thermostat-log-table';

/**
 * Every decision the worker's thermostat loop logged, linked from the Nanit half of `/thermostat`.
 */
export default function ThermostatLogPage() {
  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-semibold">Thermostat log</h1>
      <LoginGuard>{(secretHash) => <ThermostatLogTable secretHash={secretHash} />}</LoginGuard>
    </div>
  );
}
