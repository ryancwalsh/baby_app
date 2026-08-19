import { createHash, createHmac, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import { type DetailedPeerCertificate, type TLSSocket } from 'node:tls';

import { getEnvironment } from '@/lib/environment';

/**
 * TP-Link's V2 cloud, which is where Tapo (S-series) devices actually live. The
 * older `use1-wap.tplinkcloud.com` endpoint has no route to them at all and
 * answers `-20571 "Device is offline"` for every request — see CLAUDE.md.
 */

const HOST = 'n-wap.i.tplinkcloud.com';
const LOGIN_PATH = '/api/v2/account/login';
const MFA_LOGIN_PATH = '/api/v2/account/checkMFACodeAndLogin';
const PASSTHROUGH_PATH = '/api/v2/common/passthrough';

/**
 * App constants lifted from the Tapo Android app. Not account secrets.
 */
const ACCESS_KEY = '4d11b6b9d5ea4d19a829adbb9714b057';
const SECRET_KEY = '6ed7d97f3e73467f8a5bab90b577ba4c';
const SIGNING_TIMESTAMP = '9999999999';
const APP_TYPE = 'TP-Link_Tapo_Android';
const APP_VERSION = '3.4.451';

/**
 * TP-Link signs these hosts with its own private CA and does not serve the
 * root, so an ordinary client fails with UNABLE_TO_GET_ISSUER_CERT. The chain
 * is pinned to this certificate instead: verification is not skipped, it is
 * anchored to a certificate we already know. Valid until 2040.
 */
const TPLINK_CA_FINGERPRINT = '28:86:05:72:D5:DC:7E:9D:76:70:20:92:E4:16:4A:BA:E8:CA:73:A9:00:FC:40:3D:89:41:C2:2F:B6:91:B9:0E';

const TOKENS_DIRECTORY = 'secrets';
const TOKENS_FILE_PATH = `${TOKENS_DIRECTORY}/tapo-v2-tokens.json`;
const REQUEST_TIMEOUT_MILLISECONDS = 15_000;
const MFA_REQUIRED_CODE = '-20677';

type Tokens = {
  authTime: number;
  refreshToken?: string;
  terminalUuid: string;
  token: string;
};

type CloudResult = {
  error_code?: number;
  msg?: string;
  result?: {
    errorCode?: string;
    errorMsg?: string;
    refreshToken?: string;
    responseData?: unknown;
    token?: string;
  };
};

/**
 * The terminal UUID has to be the same for the login that triggers the code and
 * the call that redeems it, so a login half-finished by one request must still
 * be recognisable to the next. Parked on `globalThis` to survive `next dev`.
 */
const globalForTapo = globalThis as typeof globalThis & {
  tapoPendingTerminalUuid?: string;
};

function signedHeaders(body: string, path: string) {
  const contentMd5 = createHash('md5').update(body).digest('base64');
  const nonce = randomUUID().replaceAll('-', '');
  /**
   * The digest covers the bare path. Including the query string earns
   * `-10301 "Signature dose not match"`.
   */
  const signature = createHmac('sha1', SECRET_KEY).update(`${contentMd5}\n${SIGNING_TIMESTAMP}\n${nonce}\n${path}`).digest('hex');

  return {
    'Content-Length': String(Buffer.byteLength(body)),
    'Content-MD5': contentMd5,
    'Content-Type': 'application/json',
    'X-Authorization': `Timestamp=${SIGNING_TIMESTAMP}, Nonce=${nonce}, AccessKey=${ACCESS_KEY}, Signature=${signature}`,
  };
}

function queryString(terminalUuid: string, extra: Record<string, string> = {}) {
  return new URLSearchParams({
    appName: 'Tapo',
    appVer: APP_VERSION,
    locale: 'en_US',
    netType: 'wifi',
    ospf: 'Android+14',
    termID: terminalUuid,
    ...extra,
  }).toString();
}

function post(path: string, query: string, payload: unknown): Promise<CloudResult> {
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const client = request(
      {
        headers: signedHeaders(body, path),
        host: HOST,
        method: 'POST',
        path: `${path}?${query}`,
        /**
         * Not a blanket opt-out: the pin check below rejects anything else.
         */
        rejectUnauthorized: false,
        timeout: REQUEST_TIMEOUT_MILLISECONDS,
      },
      (response) => {
        let text = '';
        response.on('data', (chunk) => (text += chunk));
        response.on('end', () => {
          try {
            resolve(JSON.parse(text) as CloudResult);
          } catch {
            reject(new Error(`Unreadable reply from ${HOST}${path}.`));
          }
        });
      },
    );

    client.on('socket', (socket: TLSSocket) => {
      socket.on('secureConnect', () => {
        let certificate: DetailedPeerCertificate | undefined = socket.getPeerCertificate(true);
        let isPinned = false;
        for (let depth = 0; depth < 5 && certificate; depth += 1) {
          if (certificate.fingerprint256 === TPLINK_CA_FINGERPRINT) {
            isPinned = true;
          }

          certificate = certificate.issuerCertificate === certificate ? undefined : certificate.issuerCertificate;
        }

        if (!isPinned) {
          client.destroy(new Error('The TP-Link certificate did not match the pin.'));
        }
      });
    });

    client.on('timeout', () => client.destroy(new Error('Tapo cloud timeout.')));
    client.on('error', reject);
    client.write(body);
    client.end();
  });
}

function readTokens(): null | Tokens {
  let tokens: null | Tokens = null;
  if (existsSync(TOKENS_FILE_PATH)) {
    tokens = JSON.parse(readFileSync(TOKENS_FILE_PATH, 'utf8')) as Tokens;
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
  const body = await post(LOGIN_PATH, queryString(terminalUuid), {
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

  if (body.result?.errorCode !== undefined) {
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

  const body = await post(MFA_LOGIN_PATH, queryString(terminalUuid), {
    appType: APP_TYPE,
    ...credentials(),
    code,
    terminalUUID: terminalUuid,
  });

  if (body.error_code !== 0) {
    throw new Error(body.msg ?? 'The Tapo cloud rejected the code.');
  }

  if (body.result?.errorCode !== undefined) {
    throw new Error(body.result.errorMsg ?? 'That code was not accepted.');
  }

  storeSession(body.result, terminalUuid);
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

  const body = await post(PASSTHROUGH_PATH, queryString(tokens.terminalUuid, { token: tokens.token }), { deviceId, requestData: JSON.stringify(requestData) });

  if (body.error_code !== 0) {
    throw new Error(body.msg ?? 'The Tapo cloud rejected the command.');
  }

  return body.result?.responseData;
}
