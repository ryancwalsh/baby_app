import { createHash, createHmac, randomUUID } from 'node:crypto';
import { request } from 'node:https';
import { type DetailedPeerCertificate, type TLSSocket } from 'node:tls';

/**
 * Signing and transport for TP-Link's V2 cloud, kept apart from the session
 * logic in `cloud-v2.ts` so each file stays readable on its own.
 */

/**
 * App constants lifted from the Tapo Android app. Not account secrets.
 */
const ACCESS_KEY = '4d11b6b9d5ea4d19a829adbb9714b057';
const SECRET_KEY = '6ed7d97f3e73467f8a5bab90b577ba4c';
const SIGNING_TIMESTAMP = '9999999999';
export const APP_TYPE = 'TP-Link_Tapo_Android';
export const APP_VERSION = '3.4.451';

/**
 * Every TP-Link cloud host here is signed by a TP-Link CA that no public trust
 * store carries, so ordinary verification fails. The chain is pinned to these
 * certificates instead: verification is not skipped, it is anchored to
 * certificates we already know.
 *
 * Two are needed because the login host and the app server sit behind different
 * CAs: `CN=TP-Link Cloud Server CA` for `*.i.tplinkcloud.com`, and the
 * self-signed `CN=tp-link-CA` root for the `*.tplinkcloud.com` app servers.
 */
const TPLINK_CA_FINGERPRINTS = [
  '28:86:05:72:D5:DC:7E:9D:76:70:20:92:E4:16:4A:BA:E8:CA:73:A9:00:FC:40:3D:89:41:C2:2F:B6:91:B9:0E',
  '8B:54:F0:36:4E:84:0F:B0:10:D5:17:32:47:25:F0:D3:02:45:D3:5B:45:F9:BE:4B:6E:50:B8:4F:03:FD:EC:19',
];

const REQUEST_TIMEOUT_MILLISECONDS = 15_000;

export type Tokens = {
  /**
   * Where device commands go. The login host is not the same machine.
   */
  appServerUrl: string;
  authTime: number;
  refreshToken?: string;
  terminalUuid: string;
  token: string;
};

export type CloudResult = {
  error_code?: number;
  msg?: string;
  result?: {
    appServerUrl?: string;
    errorCode?: string;
    errorMsg?: string;
    refreshToken?: string;
    responseData?: unknown;
    token?: string;
  };
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

export function queryString(terminalUuid: string, extra: Record<string, string> = {}) {
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

export function post(host: string, path: string, query: string, payload: unknown): Promise<CloudResult> {
  const body = JSON.stringify(payload);
  /**
   * Every TP-Link cloud host is pinned; nothing else is contacted here.
   */
  const isPinned = host.endsWith('tplinkcloud.com');

  return new Promise((resolve, reject) => {
    const client = request(
      {
        headers: signedHeaders(body, path),
        host,
        method: 'POST',
        path: `${path}?${query}`,
        /**
         * Not a blanket opt-out: the pin check below rejects anything else.
         */
        rejectUnauthorized: !isPinned,
        timeout: REQUEST_TIMEOUT_MILLISECONDS,
      },
      (response) => {
        let text = '';
        response.on('data', (chunk) => (text += chunk));
        response.on('end', () => {
          try {
            resolve(JSON.parse(text) as CloudResult);
          } catch {
            reject(new Error(`Unreadable reply from ${host}${path}.`));
          }
        });
      },
    );

    client.on('socket', (socket: TLSSocket) => {
      if (!isPinned) {
        return;
      }

      socket.on('secureConnect', () => {
        let certificate: DetailedPeerCertificate | undefined = socket.getPeerCertificate(true);
        let isMatched = false;
        for (let depth = 0; depth < 5 && certificate; depth += 1) {
          if (TPLINK_CA_FINGERPRINTS.includes(certificate.fingerprint256)) {
            isMatched = true;
          }

          certificate = certificate.issuerCertificate === certificate ? undefined : certificate.issuerCertificate;
        }

        if (!isMatched) {
          client.destroy(new Error(`The certificate from ${host} did not match the pin.`));
        }
      });
    });

    client.on('timeout', () => client.destroy(new Error('Tapo cloud timeout.')));
    client.on('error', reject);
    client.write(body);
    client.end();
  });
}
