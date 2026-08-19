import { timingSafeEqual } from "node:crypto";
import { getEnvironment } from "@/lib/environment";

/**
 * The browser hashes the password and sends only the hash, so the hash is the
 * credential: every server action that touches a device takes it and calls
 * `requireLogin` first. Checking on the client alone would be decoration —
 * anyone can write to localStorage or call a server action directly.
 */
export function requireLogin(secretHash: string) {
  const expected = Buffer.from(getEnvironment().LOGIN_SECRET, "utf8");
  const given = Buffer.from(secretHash, "utf8");

  /** Compared in constant time, and only when the lengths already match. */
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new Error("Not logged in.");
  }
}

export function isLoggedIn(secretHash: string): boolean {
  let loggedIn = true;
  try {
    requireLogin(secretHash);
  } catch {
    loggedIn = false;
  }
  return loggedIn;
}
