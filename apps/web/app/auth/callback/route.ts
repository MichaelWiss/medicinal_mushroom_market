import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Magic-link / OAuth PKCE callback. Supabase redirects here with ?code=...
// after the user clicks the link in their email. We exchange the code for
// a cookie-bound session and then forward to ?next=... (defaults to /orders).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = sanitizeNext(searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent('Missing code parameter')}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}

function sanitizeNext(raw: string | null): string {
  if (!raw) return '/orders';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/orders';
  return raw;
}
