import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@repo/db';
import { resolveSiteOrigin, UntrustedOriginError } from '@/lib/auth/origin';

// Magic-link / OAuth PKCE callback. Supabase redirects here with ?code=...
// after the user clicks the link in their email. We exchange the code for
// a cookie-bound session and then forward to ?next=... (defaults to /orders).
//
// IMPORTANT: cookies must be written onto the redirect response itself
// (not via `next/headers` `cookies()`), otherwise the Set-Cookie headers
// are lost when we return the redirect.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // Origin must come from a trusted source so a poisoned Host header
  // cannot redirect the magic-link exchange to an attacker domain. The
  // resolver requires NEXT_PUBLIC_SITE_URL in production and falls
  // back to a small dev allow-list otherwise.
  let origin: string;
  try {
    origin = resolveSiteOrigin(request);
  } catch (err) {
    if (err instanceof UntrustedOriginError) {
      console.error('[auth/callback]', err.message);
      return new NextResponse('Site origin not configured', { status: 500 });
    }
    throw err;
  }
  const code = searchParams.get('code');
  const next = sanitizeNext(searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent('Missing code parameter')}`,
    );
  }

  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent(error.message)}`,
    );
  }

  return response;
}

function sanitizeNext(raw: string | null): string {
  if (!raw) return '/orders';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/orders';
  return raw;
}
