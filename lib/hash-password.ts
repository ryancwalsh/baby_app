/**
 * Hashes in the browser so the password itself never leaves the device. The
 * resulting hash is the credential the server checks, so treat it like one.
 */
export async function hashPassword(password: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
