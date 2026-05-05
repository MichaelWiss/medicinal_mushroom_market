import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveSiteOrigin, UntrustedOriginError } from '@/lib/auth/origin';

// POST /api/invites
//   Body: { email: string, role?: 'buyer' | 'admin' }
//
// Authenticated company-admin invites a new buyer to their company. Flow:
//   1. Verify caller has a session AND `company_role = admin` (read via
//      session-bound RLS query; cannot be forged).
//   2. Use the service-role admin client to invite the user by email.
//      Supabase creates the auth user and emails the magic link.
//   3. Insert the company_users row pre-linked to the new user_id, so the
//      first sign-in already carries `company_id` in the JWT.
//
// The redirect_to in the invite email points at our PKCE /auth/callback,
// matching the storefront sign-in flow.

const VALID_ROLES = ['buyer', 'admin'] as const;
type Role = (typeof VALID_ROLES)[number];
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseBody(body: unknown): { email: string; role: Role } | string {
  if (!body || typeof body !== 'object') return 'Body must be an object';
  const b = body as Record<string, unknown>;
  if (typeof b.email !== 'string' || !EMAIL_RX.test(b.email)) {
    return 'Invalid email';
  }
  let role: Role = 'buyer';
  if (b.role !== undefined) {
    if (typeof b.role !== 'string' || !VALID_ROLES.includes(b.role as Role)) {
      return 'Invalid role';
    }
    role = b.role as Role;
  }
  return { email: b.email, role };
}

export async function POST(request: NextRequest) {
  // ── Parse + validate body ────────────────────────────────
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = parseBody(payload);
  if (typeof parsed === 'string') {
    return NextResponse.json({ error: parsed }, { status: 400 });
  }
  const { email, role } = parsed;

  // ── Authn / Authz: require admin caller ──────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  // RLS limits this select to the caller's own company_users row(s).
  const { data: membership, error: membershipError } = await supabase
    .from('company_users')
    .select('company_id, role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    return NextResponse.json(
      { error: 'Caller has no company membership' },
      { status: 403 },
    );
  }
  if (membership.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only company admins can invite users' },
      { status: 403 },
    );
  }

  // ── Issue invite via service role ────────────────────────
  const admin = createAdminClient();
  let origin: string;
  try {
    origin = resolveSiteOrigin(request);
  } catch (err) {
    if (err instanceof UntrustedOriginError) {
      console.error('[api/invites]', err.message);
      return NextResponse.json(
        { error: 'Site origin not configured' },
        { status: 500 },
      );
    }
    throw err;
  }
  const redirectTo = `${origin}/auth/callback?next=/orders`;

  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { company_id: membership.company_id, role },
    });

  if (inviteError || !invited.user) {
    return NextResponse.json(
      { error: inviteError?.message ?? 'Invite failed' },
      { status: 502 },
    );
  }

  // ── Pre-link membership so JWT hook injects company_id ──
  const { error: linkError } = await admin.from('company_users').insert({
    company_id: membership.company_id,
    user_id: invited.user.id,
    role,
  });

  if (linkError) {
    // Best-effort cleanup so a retry isn't blocked by the orphaned auth user.
    await admin.auth.admin.deleteUser(invited.user.id);
    return NextResponse.json(
      { error: `Failed to link membership: ${linkError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      user_id: invited.user.id,
      company_id: membership.company_id,
      role,
    },
    { status: 201 },
  );
}
