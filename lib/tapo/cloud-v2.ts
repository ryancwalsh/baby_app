import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { getEnvironment } from '@/lib/environment';
import { APP_TYPE, APP_VERSION, type CloudResult, post, queryString, type Tokens } from '@/lib/tapo/cloud-v2-transport';

/**
 * TP-Link's V2 cloud, which is where Tapo (S-series) devices actually live. The
 * older `use1-wap.tplinkcloud.com` endpoint has no route to them at all and
 * answers `-20571 "Device is offline"` for every request — see CLAUDE.md.
 */

const HOST = 'n-wap.i.tplinkcloud.com';
const LOGIN_PATH = '/api/v2/account/login';
const MFA_LOGIN_PATH = '/api/v2/account/checkMFACodeAndLogin';
const PASSTHROUGH_PATH = '/api/v2/common/passthrough';
const REFRESH_TOKEN_PATH = '/api/v2/account/refreshToken';

const TOKENS_DIRECTORY = 'secrets';
const TOKENS_FILE_PATH = `${TOKENS_DIRECTORY}/tapo-v2-tokens.json`;
const MFA_REQUIRED_CODE = '-20677';
/**
 * A successful login still carries an errorCode; "0" is not a failure.
 */
const SUCCESS_CODE = '0';

/**
 * The terminal UUID has to be the same for the login that triggers the code and
 * the call that redeems it, so a login half-finished by one request must still
 * be recognisable to the next. Parked on `globalThis` to survive `next dev`.
 */
const globalForTapo = globalThis as typeof globalThis & {
  tapoPendingTerminalUuid?: string;
};

/**
 * Written by `storeSession`, never by hand. A blank or half-written file is
 * treated as no session rather than crashing the caller.
 */
function readTokens(): null | Tokens {
  let tokens: null | Tokens = null;

  if (existsSync(TOKENS_FILE_PATH)) {
    try {
      const parsed = JSON.parse(readFileSync(TOKENS_FILE_PATH, 'utf8')) as Tokens;
      if (typeof parsed?.token === 'string') {
        tokens = parsed;
      }
    } catch {
      /**
       * Unreadable is the same as absent: sign in again.
       */
    }
  }

  return tokens;
}

function saveTokens(tokens: Tokens) {
  mkdirSync(TOKENS_DIRECTORY, { recursive: true });
  writeFileSync(TOKENS_FILE_PATH, JSON.stringify(tokens, null, 2), {
    mode: 0o600,
  });
}

export function hasTapoCloudSession(): boolean {
  return readTokens() !== null;
}

function credentials() {
  const environment = getEnvironment();
  return {
    cloudPassword: environment.TAPO_PASSWORD,
    cloudUserName: environment.TAPO_EMAIL_ADDRESS,
  };
}

function storeSession(result: CloudResult['result'], terminalUuid: string) {
  if (result?.token === undefined) {
    throw new Error(result?.errorMsg ?? 'The Tapo cloud did not return a token.');
  }

  saveTokens({
    /**
     * The login names the server to send device commands to; trust it.
     */
    appServerUrl: result.appServerUrl ?? `https://${HOST}`,
    authTime: Date.now(),
    refreshToken: result.refreshToken,
    terminalUuid,
    token: result.token,
  });
}

export type LoginOutcome = {
  /**
   * True when the account answered with an MFA challenge instead of a token.
   */
  needsMfaCode: boolean;
};

/**
 * Starts a login. The account has two-step verification on, so the usual answer
 * is a challenge rather than a token, and TP-Link emails a code at this point.
 */
export async function startTapoCloudLogin(): Promise<LoginOutcome> {
  const terminalUuid = randomUUID();
  const body = await post(HOST, LOGIN_PATH, queryString(terminalUuid), {
    appType: APP_TYPE,
    appVersion: APP_VERSION,
    ...credentials(),
    platform: 'Android',
    refreshTokenNeeded: true,
    supportBindAccount: false,
    terminalMeta: 'Pixel',
    terminalName: 'Pixel',
    terminalUUID: terminalUuid,
  });

  if (body.result?.errorCode === MFA_REQUIRED_CODE) {
    globalForTapo.tapoPendingTerminalUuid = terminalUuid;
    return { needsMfaCode: true };
  }

  if (body.error_code !== 0) {
    throw new Error(body.msg ?? 'The Tapo cloud rejected the login.');
  }

  if (body.result?.errorCode !== undefined && body.result.errorCode !== SUCCESS_CODE) {
    throw new Error(body.result.errorMsg ?? body.result.errorCode);
  }

  storeSession(body.result, terminalUuid);
  return { needsMfaCode: false };
}

/**
 * Redeems the emailed code against the same terminal UUID the challenge was
 * issued for; a fresh one would be treated as a different device.
 */
export async function submitTapoMfaCode(code: string): Promise<void> {
  const terminalUuid = globalForTapo.tapoPendingTerminalUuid;
  if (terminalUuid === undefined) {
    throw new Error('No login is waiting for a code. Start again.');
  }

  const body = await post(HOST, MFA_LOGIN_PATH, queryString(terminalUuid), {
    appType: APP_TYPE,
    ...credentials(),
    code,
    terminalUUID: terminalUuid,
  });

  if (body.error_code !== 0) {
    throw new Error(body.msg ?? 'The Tapo cloud rejected the code.');
  }

  if (body.result?.errorCode !== undefined && body.result.errorCode !== SUCCESS_CODE) {
    throw new Error(body.result.errorMsg ?? 'That code was not accepted.');
  }

  storeSession(body.result, terminalUuid);
  // eslint-disable-next-line require-atomic-updates -- Clearing a login that has just been redeemed; a racing login sets its own id afterwards.
  globalForTapo.tapoPendingTerminalUuid = undefined;
}

/**
 * Relays a device command. Unlike the Kasa cloud's `{method, params}` wrapper,
 * V2 takes a flat body. Untested against a device: no session has existed yet.
 */
export async function sendToTapoDevice(deviceId: string, requestData: unknown): Promise<unknown> {
  const tokens = readTokens();
  if (tokens === null) {
    throw new Error('Not signed in to the Tapo cloud.');
  }

  const body = await post(new URL(tokens.appServerUrl).host, PASSTHROUGH_PATH, queryString(tokens.terminalUuid, { token: tokens.token }), {
    deviceId,
    requestData: JSON.stringify(requestData),
    token: tokens.token,
  });

  if (body.error_code !== 0) {
    throw new Error(body.msg ?? 'The Tapo cloud rejected the command.');
  }

  return body.result?.responseData;
}

/**
 * Mints a fresh access token from the stored refresh token. This needs no
 * second factor, which is what lets the app run unattended: the MFA flow above
 * is only ever needed for the very first sign-in on a given terminal UUID.
 */
export async function refreshTapoCloudToken(): Promise<string> {
  const tokens = readTokens();
  if (tokens === null || tokens.refreshToken === undefined) {
    throw new Error('Not signed in to the Tapo cloud.');
  }

  const body = await post(HOST, REFRESH_TOKEN_PATH, queryString(tokens.terminalUuid), {
    appType: APP_TYPE,
    refreshToken: tokens.refreshToken,
    terminalUUID: tokens.terminalUuid,
  });

  if (body.result?.token === undefined) {
    throw new Error(body.result?.errorMsg ?? body.msg ?? 'The Tapo cloud would not refresh the session.');
  }

  saveTokens({ ...tokens, authTime: Date.now(), token: body.result.token });
  return body.result.token;
}

/**
 * The stored session. Callers send the token as it stands and refresh only when
 * the cloud rejects it, since there is no stated lifetime to pre-empt.
 */
export function getTapoCloudSession(): Tokens {
  const tokens = readTokens();
  if (tokens === null) {
    throw new Error('Not signed in to the Tapo cloud.');
  }

  return tokens;
}
