import { Characteristic, HttpClient, Service } from 'hap-controller';

import { readStoredSecret } from '../storage/stored-secrets.js';

/**
 * Lists every service and characteristic the paired thermostat exposes over HomeKit, with its value, permissions, and limits. Read only: it writes nothing to the thermostat.
 */
async function main() {
  const stored = await readStoredSecret('ecobee-homekit-pairing');

  if (stored === null) {
    throw new Error('Not paired. Run scripts/ecobee-pair.ts first.');
  } else {
    const { address, deviceId, pairing, port } = JSON.parse(stored.value);
    const client = new HttpClient(deviceId, address, port, pairing);
    const { accessories } = await client.getAccessories();

    for (const accessory of accessories) {
      console.log(`Accessory ${accessory.aid}`);

      for (const service of accessory.services) {
        console.log(`  ${Service.serviceFromUuid(service.type)} (iid ${service.iid})`);

        for (const characteristic of service.characteristics) {
          const { description, format, iid, maxValue, minStep, minValue, perms, type, unit, value } = characteristic;
          console.log(
            `    ${accessory.aid}.${iid} ${Characteristic.characteristicFromUuid(type ?? '')} = ${JSON.stringify(value)} [${perms?.join(',')}] ${format ?? ''}${unit === undefined ? '' : ` ${unit}`}${minValue === undefined ? '' : ` ${minValue}..${maxValue} step ${minStep}`}${description === undefined ? '' : ` "${description}"`}`,
          );
        }
      }
    }
  }
}

await main();
