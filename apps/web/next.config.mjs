/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages are TypeScript source — let Next transpile them.
  transpilePackages: ['@repo/shared', '@repo/db'],
  // Stable in Next 15.
  typedRoutes: true,
  webpack: (config) => {
    // tsconfig.base.json uses moduleResolution: "Bundler" with .js
    // suffixed imports against .ts source. Webpack doesn't know about
    // that mapping by default; teach it so workspace packages resolve.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
