import { HttpClient } from 'hap-controller';

import { readStoredSecret } from '../storage/stored-secrets.js';

/**
 * A supervised, by-hand write to the hallway thermostat, for testing while someone is awake and nearby. This starts real heating or cooling, so never run it without asking.
 *
 * Set the heat and cool setpoints in °F (auto mode), which ecobee turns into a hold that ends by the app's Hold Action:
 * NODE_ENV=production yarn tsx --env-file=.env --env-file=.env.production.local scripts/ecobee-set.ts 70 75
 *
 * Clear the hold, which returns the thermostat to its schedule:
 * NODE_ENV=production yarn tsx --env-file=.env --env-file=.env.production.local scripts/ecobee-set.ts clear
 */
const TARGET_MODE = '1.18';
const CURRENT_TEMPERATURE = '1.19';
const COOLING_THRESHOLD = '1.22';
const HEATING_THRESHOLD = '1.23';
const CLEAR_HOLD = '1.48';
const AUTO_MODE = 3;
const MINIMUM_GAP_FAHRENHEIT = 5;

function toCelsius(fahrenheit: number) {
  return Math.round((((fahrenheit - 32) * 5) / 9) * 10) / 10;
}

async function report(client: HttpClient) {
  const { characteristics } = await client.getCharacteristics([TARGET_MODE, CURRENT_TEMPERATURE, HEATING_THRESHOLD, COOLING_THRESHOLD]);
  console.log(characteristics.map(({ aid, iid, value }) => `${aid}.${iid} = ${String(value)}`).join(', '));

  return characteristics;
}

async function main() {
  const stored = await readStoredSecret('ecobee-homekit-pairing');
  if (stored === null) {
    throw new Error('Not paired. Run scripts/ecobee-pair.ts first.');
  } else {
    const { address, deviceId, pairing, port } = JSON.parse(stored.value);
    const client = new HttpClient(deviceId, address, port, pairing);
    const before = await report(client);

    if (process.argv[2] === 'clear') {
      await client.setCharacteristics({ [CLEAR_HOLD]: true });
      console.log('Cleared the hold.');
    } else {
      const heatFahrenheit = Number(process.argv[2]);
      const coolFahrenheit = Number(process.argv[3]);
      const mode = before.find(({ iid }) => iid === 18)?.value;
      if (mode === AUTO_MODE && Number.isFinite(heatFahrenheit) && Number.isFinite(coolFahrenheit) && coolFahrenheit - heatFahrenheit >= MINIMUM_GAP_FAHRENHEIT) {
        await client.setCharacteristics({ [COOLING_THRESHOLD]: toCelsius(coolFahrenheit), [HEATING_THRESHOLD]: toCelsius(heatFahrenheit) });
        console.log(`Set heat to ${heatFahrenheit}°F and cool to ${coolFahrenheit}°F.`);
      } else {
        throw new Error('Needs the thermostat in auto mode, and heat and cool in °F at least 5°F apart.');
      }
    }

    await report(client);
    await client.close();
  }
}

await main();
