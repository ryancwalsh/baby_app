import { createInterface } from 'node:readline/promises';

import { logInInteractively } from '../services/nanit/auth.js';

/**
 * Nanit answers a fresh login with a multi-factor challenge, which a web
 * request has nowhere to prompt for. Run this once from a terminal; it writes
 * secrets/nanit-tokens.json, and the app refreshes those tokens from then on.
 */
async function main() {
  const tokens = await logInInteractively(async () => {
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = await readline.question('Nanit MFA code (check email/SMS): ');
    readline.close();
    return answer.trim();
  });

  console.log(`Signed in. Tokens saved at ${new Date(tokens.authTime).toISOString()}.`);
}

main();
