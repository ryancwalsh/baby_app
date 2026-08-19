'use server';

import { requireLogin } from '@/lib/login';
import { hasTapoCloudSession, startTapoCloudLogin, submitTapoMfaCode } from '@/lib/tapo/cloud-v2';

/**
 * Signing in to the Tapo cloud from the browser rather than a terminal script.
 * The account has two-step verification on, so this is a two-call flow: start
 * the login, then redeem the code TP-Link emails.
 */

export async function getTapoCloudStatusAction(secretHash: string): Promise<{ isSignedIn: boolean }> {
  requireLogin(secretHash);
  return { isSignedIn: hasTapoCloudSession() };
}

export async function startTapoCloudLoginAction(secretHash: string): Promise<{ needsMfaCode: boolean }> {
  requireLogin(secretHash);
  return startTapoCloudLogin();
}

export async function submitTapoMfaCodeAction(secretHash: string, code: string): Promise<void> {
  requireLogin(secretHash);
  return submitTapoMfaCode(code);
}
