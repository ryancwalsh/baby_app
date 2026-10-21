import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

/**
 * Stamps `public/version.json` with the branch, commit, and build time, so a deploy can be checked by reading `/version.json`. Run after `next build`; the file is gitignored.
 *
 * Vercel builds on a detached checkout, where `git branch --show-current` is empty, so its own variables are used when they are there, and git otherwise.
 */

/**
 * An unset variable and an empty one both mean Vercel did not say.
 */
function fromVercelOrGit(vercelValue: string | undefined, ...gitParameters: string[]) {
  return vercelValue !== undefined && vercelValue !== '' ? vercelValue : execFileSync('git', gitParameters, { encoding: 'utf8' }).trim();
}

function main() {
  // eslint-disable-next-line n/no-process-env -- Vercel describes its checkout only through the environment.
  const { VERCEL_GIT_COMMIT_REF, VERCEL_GIT_COMMIT_SHA } = process.env;
  const buildTime = new Date().toISOString().replace('T', ' ').slice(0, '2026-01-01 00:00:00'.length);
  const version = {
    branch: fromVercelOrGit(VERCEL_GIT_COMMIT_REF, 'branch', '--show-current'),
    build_time_UTC: buildTime,
    commit: fromVercelOrGit(VERCEL_GIT_COMMIT_SHA, 'rev-parse', 'HEAD'),
  };

  writeFileSync('public/version.json', `${JSON.stringify(version, null, 2)}\n`);
  console.log('✅ public/version.json generated successfully.');
}

main();
