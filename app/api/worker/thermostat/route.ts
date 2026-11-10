import { StatusCodes } from 'http-status-codes';
import { type NextRequest } from 'next/server';

import { readThermostat } from '@/services/ecobee/thermostat';
import { answerPreflight, isAuthorized, respondWithJson } from '@/services/worker/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The hallway thermostat, read over HomeKit, which only the laptop on the home network can reach. Read only.
 */
export async function GET(request: NextRequest) {
  let response = respondWithJson(request, { error: 'Not logged in.' }, StatusCodes.UNAUTHORIZED);
  if (await isAuthorized(request)) {
    try {
      response = respondWithJson(request, await readThermostat());
    } catch (error) {
      response = respondWithJson(request, { error: error instanceof Error ? error.message : 'Could not reach the thermostat.' }, StatusCodes.BAD_GATEWAY);
    }
  }

  return response;
}

export function OPTIONS(request: NextRequest) {
  return answerPreflight(request);
}
