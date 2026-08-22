'use server';

import { attemptLogin, type LoginAttempt } from '@/auth/login';

/**
 * Takes the hash the browser computed, never the password itself. Returning a
 * result rather than throwing keeps a wrong password an ordinary answer, and
 * carries the lockout so the form can say why it is refusing.
 */
export async function logInAction(secretHash: string): Promise<LoginAttempt> {
  return attemptLogin(secretHash);
}
