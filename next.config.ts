import { type NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * The device libraries are Node-only, so keep them out of the bundle.
   */
  serverExternalPackages: ['protobufjs', 'ws'],
};

export default nextConfig;
