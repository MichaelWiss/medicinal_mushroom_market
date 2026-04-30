import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@repo/db';

/**
 * Routes under these prefixes require an authenticated session. Anonymous
 * visitors are redirected to /sign-in?next=<original-path>.
 *
 * Mirrors the (dashboard) and (admin) route groups.
 */
const PROTECTED_PREFIXES = ['/orders', '/traceability', '/subscriptions', '/console'];

/**
 * Refreshes the Supabase auth cookies on every request and enforces auth
 * for protected route prefixes. Called from `apps/web/middleware.ts`.
 *
 * Pattern follows @supabase/ssr docs: build a NextResponse, mirror cookie
 * writes onto both `request.cookies` (so downstream handlers see them) and
 * `response.cookies` (so the browser stores them).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() must be called before any other supabase work in
  // middleware; it triggers the cookie refresh + revalidates the JWT.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
