import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { getEnvironment } from '@/lib/environment';
import { HttpStatusCode } from '@/lib/http-status-code';

export const NANIT_API_HOST = 'api.nanit.com';
const API_BASE_URL = `https://${NANIT_API_HOST}`;
const API_VERSION = '1';
const TOKENS_DIRECTORY = 'secrets';
const TOKENS_FILE_PATH = `${TOKENS_DIRECTORY}/nanit-tokens.json`;
/**
 * Nanit access tokens last an hour; refresh a little before that. Exported
 * because the held-open camera socket is authorised once, with the token it was
 * opened with, so how long that token is good for is also how long that socket
 * is good for.
 */
export const TOKEN_LIFETIME_MILLISECONDS = 55 * 60 * 1_000;

export type Tokens = {
  accessToken: string;
  authTime: number;
  refreshToken: string;
};

type LoginResponseBody = {
  access_token: string;
  refresh_token: string;
};

function readSavedTokens(): null | Tokens {
  let tokens: null | Tokens = null;
  if (existsSync(TOKENS_FILE_PATH)) {
    tokens = JSON.parse(readFileSync(TOKENS_FILE_PATH, 'utf8')) as Tokens;
  }

  return tokens;
}

function saveTokens(body: LoginResponseBody): Tokens {
  const tokens: Tokens = {
    accessToken: body.access_token,
    authTime: Date.now(),
    refreshToken: body.refresh_token,
  };
  mkdirSync(TOKENS_DIRECTORY, { recursive: true });
  writeFileSync(TOKENS_FILE_PATH, JSON.stringify(tokens, null, 2), {
    mode: 0o600,
  });
  return tokens;
}

/**
 * Logging in can demand a multi-factor code, which a server action has no way
 * to prompt for. `yarn nanit:login` does the interactive half and leaves the
 * tokens on disk; everything at request time only ever refreshes them.
 */
export async function logInInteractively(askForMfaCode: () => Promise<string>): Promise<Tokens> {
  const environment = getEnvironment();
  const headers = {
    'Content-Type': 'application/json',
    'nanit-api-version': API_VERSION,
  };
  const credentials = {
    email: environment.NANIT_EMAIL_ADDRESS,
    password: environment.NANIT_PASSWORD,
  };

  let response = await fetch(`${API_BASE_URL}/login`, {
    body: JSON.stringify(credentials),
    headers,
    method: 'POST',
  });

  if (response.status === HttpStatusCode.NanitMfaRequired) {
    const challenge = (await response.json()) as {
      mfa_token?: string;
      mfaToken?: string;
    };
    const mfaToken = challenge.mfa_token ?? challenge.mfaToken;
    const mfaCode = await askForMfaCode();
    response = await fetch(`${API_BASE_URL}/login`, {
      body: JSON.stringify({
        ...credentials,
        mfa_code: mfaCode,
        mfa_token: mfaToken,
      }),
      headers,
      method: 'POST',
    });
  }

  if (response.status === HttpStatusCode.Created) {
    return saveTokens((await response.json()) as LoginResponseBody);
  }

  throw new Error(`Nanit login failed (${response.status}): ${await response.text()}`);
}

async function refreshTokens(refreshToken: string): Promise<Tokens> {
  const response = await fetch(`${API_BASE_URL}/tokens/refresh`, {
    body: JSON.stringify({ refresh_token: refreshToken }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  if (response.ok) {
    return saveTokens((await response.json()) as LoginResponseBody);
  }

  throw new Error(`Nanit token refresh failed (${response.status}). Run \`yarn nanit:login\` to sign in again.`);
}

export async function getAccessToken(): Promise<string> {
  const savedTokens = readSavedTokens();
  let tokens: Tokens;

  if (savedTokens === null) {
    throw new Error('No saved Nanit tokens. Run `yarn nanit:login` once to sign in.');
  } else if (Date.now() - savedTokens.authTime > TOKEN_LIFETIME_MILLISECONDS) {
    tokens = await refreshTokens(savedTokens.refreshToken);
  } else {
    tokens = savedTokens;
  }

  return tokens.accessToken;
}

export async function getFirstCamera(accessToken: string): Promise<{ babyName: string; cameraUid: string }> {
  const response = await fetch(`${API_BASE_URL}/babies`, {
    /**
     * The REST API wants the bare token here, not a "Bearer" prefix.
     */
    headers: { Authorization: accessToken },
  });

  if (response.ok) {
    const body = (await response.json()) as {
      babies: Array<{ camera_uid: string; name: string }>;
    };
    const [firstBaby] = body.babies;
    if (firstBaby === undefined) {
      throw new Error('The Nanit account has no babies, and so no camera.');
    }

    return { babyName: firstBaby.name, cameraUid: firstBaby.camera_uid };
  }

  throw new Error(`Failed to list babies (${response.status})`);
}
