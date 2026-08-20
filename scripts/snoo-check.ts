import { randomUUID } from 'node:crypto';

import { connectAsync } from 'mqtt';

import { getFirstSnoo, getIdToken } from '../lib/snoo/auth.js';

/**
 * Read-only: signs in, lists the account's Snoo, then subscribes and prints
 * whatever the bassinet announces. It never publishes, so it cannot start or
 * stop anything.
 */
async function main() {
  const idToken = await getIdToken();
  const device = await getFirstSnoo(idToken);
  console.log(`Connecting to ${device.clientEndpoint}…`);

  const client = await connectAsync(`wss://${device.clientEndpoint}:443/mqtt`, {
    clientId: `baby-app-${randomUUID()}`,
    connectTimeout: 10_000,
    protocolId: 'MQIsdp',
    protocolVersion: 3,
    reconnectPeriod: 0,
    username: '?SDK=iOS&Version=2.40.1',
    wsOptions: { headers: { token: idToken } },
  });
  console.log('Connected.');

  client.on('message', (topic, payload) => {
    console.log(`\n${topic}\n${payload.toString('utf8')}`);
  });

  await client.subscribeAsync(`${device.thingName}/state_machine/activity_state`);
  console.log('Subscribed. Listening for 20 seconds…');

  await new Promise((resolve) => {
    setTimeout(resolve, 20_000);
  });
  await client.endAsync();
  console.log('Done.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
