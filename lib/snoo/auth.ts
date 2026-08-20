import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { getEnvironment } from '@/lib/environment';

const COGNITO_URL = 'https://cognito-idp.us-east-1.amazonaws.com/';
/**
 * The Happiest Baby app's own Cognito client id: an app constant lifted from
 * the app rather than an account secret, like the Tapo app keys.
 */
const COGNITO_CLIENT_ID = '6kqofhc8hm394ielqdkvli0oea';
const DEVICES_URL = 'https://api-us-east-1-prod.happiestbaby.com/hds/me/v11/devices';
const TOKENS_DIRECTORY = 'secrets';
const TOKENS_FILE_PATH = `${TOKENS_DIRECTORY}/snoo-tokens.json`;
/**
 * Cognito tokens last an hour; refresh a little before that.
 */
const TOKEN_LIFETIME_MILLISECONDS = 55 * 60 * 1_000;

export type SnooDevice = {
  /**
   * The AWS IoT host this bassinet talks to. It is per device, so it is read
   * rather than hard-coded.
   */
  clientEndpoint: string;
  name: string;
  serialNumber: string;
  /**
   * The AWS IoT thing name, which prefixes every topic for this device.
   */
  thingName: string;
};

export type Tokens = {
  authTime: number;
  /**
   * The id token rather than the access token: it is what both the device list
   * and the IoT websocket authenticate with.
   */
  idToken: string;
  refreshToken: string;
};

type AuthenticationResult = {
  IdToken: string;
  RefreshToken?: string;
};

function readSavedTokens(): null | Tokens {
  let tokens: null | Tokens = null;
  if (existsSync(TOKENS_FILE_PATH)) {
    tokens = JSON.parse(readFileSync(TOKENS_FILE_PATH, 'utf8')) as Tokens;
  }

  return tokens;
}

function saveTokens(result: AuthenticationResult, previousRefreshToken?: string): Tokens {
  /**
   * A refresh only returns a new id token, so the refresh token has to be
   * carried forward or the next hour would need a fresh sign-in.
   */
  const refreshToken = result.RefreshToken ?? previousRefreshToken;

  if (refreshToken === undefined) {
    throw new Error('Cognito returned no refresh token, and there was none to keep.');
  }

  const tokens: Tokens = {
    authTime: Date.now(),
    idToken: result.IdToken,
    refreshToken,
  };
  mkdirSync(TOKENS_DIRECTORY, { recursive: true });
  writeFileSync(TOKENS_FILE_PATH, JSON.stringify(tokens, null, 2), {
    mode: 0o600,
  });

  return tokens;
}

/**
 * Cognito speaks its own dialect: the operation is a header rather than a path,
 * and the content type is `x-amz-json-1.1`.
 */
async function callCognito(body: Record<string, unknown>): Promise<AuthenticationResult> {
  const response = await fetch(COGNITO_URL, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    method: 'POST',
  });
  const answer = (await response.json()) as {
    AuthenticationResult?: AuthenticationResult;
    ChallengeName?: string;
    message?: string;
  };

  if (answer.AuthenticationResult !== undefined) {
    return answer.AuthenticationResult;
  }

  /**
   * A challenge is not a wrong password, and reporting it as one would send
   * someone hunting for a typo. A server action has nowhere to type a code, so
   * this can only be reported.
   */
  if (answer.ChallengeName !== undefined) {
    throw new Error(`The Happiest Baby account asked for ${answer.ChallengeName}, which this app cannot answer.`);
  }

  throw new Error(`Happiest Baby sign-in failed (${response.status}): ${answer.message ?? 'no reason given'}`);
}

async function logIn(): Promise<Tokens> {
  const environment = getEnvironment();

  if (environment.SNOO_EMAIL_ADDRESS === '' || environment.SNOO_PASSWORD === '') {
    throw new Error('No Happiest Baby credentials. Set SNOO_EMAIL_ADDRESS and SNOO_PASSWORD in .env.');
  }

  return saveTokens(
    await callCognito({
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        PASSWORD: environment.SNOO_PASSWORD,
        USERNAME: environment.SNOO_EMAIL_ADDRESS,
      },
      ClientId: COGNITO_CLIENT_ID,
    }),
  );
}

async function refreshTokens(refreshToken: string): Promise<Tokens> {
  return saveTokens(
    await callCognito({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: { REFRESH_TOKEN: refreshToken },
      ClientId: COGNITO_CLIENT_ID,
    }),
    refreshToken,
  );
}

/**
 * Unlike Nanit and Tapo this needs no interactive step, because there is no
 * second factor to answer: email and password go straight to Cognito. The
 * tokens are still kept on disk so a restart does not have to sign in again.
 */
export async function getIdToken(): Promise<string> {
  const savedTokens = readSavedTokens();
  let tokens: Tokens;

  if (savedTokens === null) {
    tokens = await logIn();
  } else if (Date.now() - savedTokens.authTime > TOKEN_LIFETIME_MILLISECONDS) {
    /**
     * A refresh token Cognito has stopped honouring is ordinary rather than
     * exceptional, and signing in again is the whole fix.
     */
    tokens = await refreshTokens(savedTokens.refreshToken).catch(logIn);
  } else {
    tokens = savedTokens;
  }

  return tokens.idToken;
}

export async function getFirstSnoo(idToken: string): Promise<SnooDevice> {
  const response = await fetch(DEVICES_URL, {
    headers: { authorization: `Bearer ${idToken}` },
  });

  if (response.ok) {
    const body = (await response.json()) as {
      snoo: Array<{
        awsIoT?: { clientEndpoint: string; thingName: string };
        name: string;
        serialNumber: string;
      }>;
    };
    const [firstSnoo] = body.snoo;

    if (firstSnoo === undefined) {
      throw new Error('The Happiest Baby account has no Snoo.');
    }

    if (firstSnoo.awsIoT === undefined) {
      throw new Error(`${firstSnoo.name} has no AWS IoT details, so there is nothing to connect to.`);
    }

    return {
      clientEndpoint: firstSnoo.awsIoT.clientEndpoint,
      name: firstSnoo.name,
      serialNumber: firstSnoo.serialNumber,
      thingName: firstSnoo.awsIoT.thingName,
    };
  }

  throw new Error(`Failed to list Snoos (${response.status})`);
}
