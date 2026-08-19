/**
 * The handful of status codes this app names, plus Nanit's non-standard 482.
 * A local constant rather than axios's `HttpStatusCode` because everything here
 * uses `fetch` and axios is not otherwise a dependency.
 */
export const HttpStatusCode = {
  Created: 201,
  /**
   * Nanit-specific: login needs a multi-factor code.
   */
  NanitMfaRequired: 482,
  Ok: 200,
} as const;
