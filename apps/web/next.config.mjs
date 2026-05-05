// Security headers (security plan step 9).
//
// CSP is set as Report-Only so misconfigured origins surface in the
// browser console without breaking the app. Once the deployed origins
// are confirmed silent, rename the header to `Content-Security-Policy`
// to enforce.
function supabaseOrigin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return '';
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function sentryOrigin() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return '';
  try {
    return new URL(dsn).origin;
  } catch {
    return '';
  }
}

function posthogOrigin() {
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';
  try {
    return new URL(host).origin;
  } catch {
    return 'https://eu.i.posthog.com';
  }
}

function buildCsp() {
  const supa = supabaseOrigin();
  const sentry = sentryOrigin();
  const posthog = posthogOrigin();
  const directives = {
    'default-src': ["'self'"],
    // Next.js' runtime needs unsafe-inline for the bootstrapping script
    // tag and unsafe-eval for some build-time chunks. Stripe + PostHog
    // ship third-party scripts that must be allowed too.
    'script-src': [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      'https://js.stripe.com',
      posthog,
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': [
      "'self'",
      supa,
      sentry,
      posthog,
      'https://api.stripe.com',
      'https://maps.googleapis.com',
      // Supabase realtime uses websocket transport.
      supa.replace(/^https/, 'wss'),
    ].filter(Boolean),
    'frame-src': [
      'https://js.stripe.com',
      'https://hooks.stripe.com',
      'https://checkout.stripe.com',
    ],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'", 'https://checkout.stripe.com'],
    'object-src': ["'none'"],
    'worker-src': ["'self'", 'blob:'],
    'upgrade-insecure-requests': [],
  };
  return Object.entries(directives)
    .map(([k, v]) => (v.length ? `${k} ${v.filter(Boolean).join(' ')}` : k))
    .join('; ');
}

const SECURITY_HEADERS = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(self "https://checkout.stripe.com" "https://js.stripe.com")',
  },
  // Defence-in-depth alongside CSP frame-ancestors for legacy browsers.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Report-Only by design — see comment at top.
  { key: 'Content-Security-Policy-Report-Only', value: buildCsp() },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages are TypeScript source — let Next transpile them.
  transpilePackages: ['@repo/shared', '@repo/db'],
  // Stable in Next 15.
  typedRoutes: true,
  async headers() {
    return [
      {
        // All routes; webhooks (Stripe / Shippo) get the same headers,
        // which is harmless because they don't render HTML.
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ];
  },
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
