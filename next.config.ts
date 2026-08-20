import { type NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

/**
 * `next dev` and `next build` both write to `.next` by default, so a dev server
 * started while the pm2 production process is running rewrites the very
 * directory that process is serving from — quietly, and while a baby is asleep
 * in the room the app controls. Giving development its own directory is what
 * makes the two safe to run side by side. The phase is Next's own answer to
 * which command is running, and the only one of the three that gets
 * `.next-dev` is the dev server: `next build` and `next start` both keep
 * `.next` so a deploy and the process serving it still agree.
 */
export default function nextConfig(phase: string): NextConfig {
  return {
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',

    /**
     * The device libraries are Node-only, so keep them out of the bundle.
     */
    serverExternalPackages: ['mqtt', 'protobufjs', 'ws'],
  };
}
