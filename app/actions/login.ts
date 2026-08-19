"use server";

import { isLoggedIn } from "@/lib/login";

/**
 * Takes the hash the browser computed, never the password itself. Returning a
 * boolean rather than throwing keeps a wrong password an ordinary answer.
 */
export async function logInAction(secretHash: string): Promise<boolean> {
  return isLoggedIn(secretHash);
}
