import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { setTimeout as wait } from 'node:timers/promises';

import { type HapServiceIp, HttpClient, IPDiscovery } from 'hap-controller';

import { compareAndSwapStoredSecret } from '../storage/stored-secrets.js';

const THERMOSTAT_MODEL = 'ecobee3 lite';
/**
 * The thermostat can take several seconds to answer a browse; 5 seconds was measured to miss it.
 */
const DISCOVERY_MILLISECONDS = 20_000;
const STORED_SECRET_NAME = 'ecobee-homekit-pairing';
const LOCAL_COPY_PATH = 'secrets/ecobee-homekit-pairing.json';

/**
 * Pairs this app with the thermostat over HomeKit, once, from a terminal. A HomeKit accessory takes one owner, so it must first be removed from Apple Home. Pairing changes no heating or cooling setting; it only adds this app's key to the thermostat. The keys go to `stored_secrets`, with a copy under `secrets/` in case the database write fails, because without them the thermostat has to have HomeKit reset to pair again.
 */
async function main() {
  const discovery = new IPDiscovery();
  const found = new Promise<HapServiceIp>((resolve) => {
    discovery.on('serviceUp', (service: HapServiceIp) => {
      if (service.md === THERMOSTAT_MODEL) {
        resolve(service);
      }
    });
  });
  discovery.start();
  const thermostat = await Promise.race([found, wait(DISCOVERY_MILLISECONDS, undefined)]);
  discovery.stop();

  if (thermostat === undefined) {
    throw new Error(`No ${THERMOSTAT_MODEL} found on the network.`);
  }

  if (thermostat.availableToPair) {
    const readline = createInterface({ input: process.stdin, output: process.stdout });
    const setupCode = (await readline.question('HomeKit setup code (8 digits): ')).replaceAll(/\D/gu, '');
    readline.close();

    const client = new HttpClient(thermostat.id, thermostat.address, thermostat.port);
    await client.pairSetup(`${setupCode.slice(0, 3)}-${setupCode.slice(3, 5)}-${setupCode.slice(5)}`);
    const stored = { address: thermostat.address, deviceId: thermostat.id, pairing: client.getLongTermData(), port: thermostat.port };
    const pairing = JSON.stringify(stored);
    writeFileSync(LOCAL_COPY_PATH, `${JSON.stringify(stored, null, 2)}\n`);
    const saved = await compareAndSwapStoredSecret(STORED_SECRET_NAME, null, pairing);
    console.log(`Paired with ${thermostat.name} at ${thermostat.address}:${thermostat.port}. Saved to the database: ${saved}. Copy at ${LOCAL_COPY_PATH}.`);
  } else {
    throw new Error(`${thermostat.name} is already paired with another controller. Remove it from Apple Home first.`);
  }
}

await main();
