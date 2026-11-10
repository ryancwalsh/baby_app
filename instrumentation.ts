/**
 * Runs once when a server process starts. On the worker, in production only, it starts the thermostat loop (see ecobee_plan.md). Never in the cloud role, which cannot reach the thermostat or the Nanit, and never on a dev server, which would open a second Nanit socket the moment it started.
 */
export async function register() {
  // eslint-disable-next-line n/no-process-env -- Next sets these before anything else runs, and the runtime check has to come before any Node-only import.
  const { NEXT_RUNTIME, NODE_ENV } = process.env;

  if (NEXT_RUNTIME === 'nodejs' && NODE_ENV === 'production') {
    const { getEnvironment } = await import('@/constants/environment');

    if (getEnvironment().APP_ROLE === 'worker') {
      const { startThermostatLoop } = await import('@/services/ecobee/loop');
      startThermostatLoop();
    }
  }
}
