import { StatusCodes } from 'http-status-codes';
import { type NextRequest } from 'next/server';

import { readNightLight, setNightLightBrightness, setNightLightPower, startNightLightFade, stopNightLightFade } from '@/services/nanit/night-light';
import { answerPreflight, isAuthorized, respondWithJson } from '@/services/worker/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type NightLightRequest = { action: 'brightness'; brightness: number } | { action: 'power'; isOn: boolean } | { action: 'start-fade' } | { action: 'stop-fade' };

/**
 * The same calls the night light server actions make, for pages on the cloud's origin. Reading only reads; every write comes from a press, and a failed one is reported rather than retried.
 */
export async function GET(request: NextRequest) {
  let response = respondWithJson(request, { error: 'Not logged in.' }, StatusCodes.UNAUTHORIZED);
  if (await isAuthorized(request)) {
    response = respondWithJson(request, await readNightLight());
  }

  return response;
}

function perform(body: NightLightRequest) {
  let result;
  if (body.action === 'power' && typeof body.isOn === 'boolean') {
    result = setNightLightPower(body.isOn);
  } else if (body.action === 'brightness' && typeof body.brightness === 'number') {
    /**
     * Any hand-set brightness wins over a fade that is still running, as in the server action.
     */
    stopNightLightFade();
    result = setNightLightBrightness(body.brightness);
  } else if (body.action === 'start-fade') {
    result = startNightLightFade();
  } else if (body.action === 'stop-fade') {
    result = stopNightLightFade();
  } else {
    throw new TypeError('Unknown night light request.');
  }

  return result;
}

export async function POST(request: NextRequest) {
  let response = respondWithJson(request, { error: 'Not logged in.' }, StatusCodes.UNAUTHORIZED);
  if (await isAuthorized(request)) {
    try {
      response = respondWithJson(request, await perform((await request.json()) as NightLightRequest));
    } catch (error) {
      response = respondWithJson(
        request,
        { error: error instanceof Error ? error.message : 'Could not reach the camera.' },
        error instanceof TypeError ? StatusCodes.BAD_REQUEST : StatusCodes.BAD_GATEWAY,
      );
    }
  }

  return response;
}

export function OPTIONS(request: NextRequest) {
  return answerPreflight(request);
}
