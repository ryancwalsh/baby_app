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
    /**
     * Otherwise `next dev` writes its own block into AGENTS.md whenever it sees a coding agent, and AGENTS.md is written by hand.
     */
    agentRules: false,

    distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',

    /**
     * `ffmpeg-static` finds its binary beside its own `index.js`, which the file tracing does not see, so the binary is named here for the one route that converts recordings.
     */
    outputFileTracingIncludes: {
      '/api/lullabies': ['./node_modules/ffmpeg-static/ffmpeg'],
    },

    /**
     * The device libraries and the database client are Node-only, so keep them out of the bundle. `ffmpeg-static` is kept out so that its `__dirname` still points at its binary.
     */
    serverExternalPackages: ['@libsql/client', 'ffmpeg-static', 'protobufjs', 'ws'],
  };
}
