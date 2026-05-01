// supabase/functions/subscription-engine/index.ts
//
// Cell 4.3 — Subscription engine.
//
// Runs on a cron schedule (`0 6 * * MON` in production) plus on
// demand via authenticated POST. Iterates active subscriptions whose
// `next_dispatch` falls on or before today, ordered by `priority_tier`
// ASC then `next_dispatch` ASC, and for each:
//
//   1. Allocates stock via `allocate_batch` RPC.
//   2. On success, creates a confirmed `orders` row (with
//      `subscription_id`) and a single `order_items` row pre-allocated
//      to the returned batch, then advances `next_dispatch` per
//      `frequency`.
//   3. On stock-out, sends a backorder email via Resend (best-effort,
//      logs only when `RESEND_API_KEY` is unset) and skips the row
//      (next cron run will retry).
//
// Idempotency / re-entrancy: each subscription is processed in its own
// step; a partial failure does not abort the whole run. The
// `allocate_batch` RPC is row-locking under the hood (FOR UPDATE SKIP
// LOCKED), so two concurrent engine invocations cannot double-allocate
// the same batch units.
//
// Auth: requests must carry the service-role key in the Authorization
// header (Supabase enforces this when `verify_jwt = false` on the
// function and a custom secret is checked here).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// ── env ──────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'Mycelium <onboarding@resend.dev>';
const SITE_URL = Deno.env.get('SITE_URL') ?? 'http://localhost:3000';
// Shared secret expected in the Authorization header. Defaults to the
// service-role key, which is what Supabase scheduled invocations send.
const ENGINE_SECRET = Deno.env.get('SUBSCRIPTION_ENGINE_SECRET') ?? SERVICE_ROLE_KEY;

// ── types ────────────────────────────────────────────────────
type Frequency = 'weekly' | 'biweekly' | 'monthly';

type SubscriptionRow = {
  id: string;
  company_id: string;
  species_id: string;
  format: 'fresh' | 'powder' | 'spawn' | 'culture' | 'block';
  quantity: number;
  frequency: Frequency;
  priority_tier: number;
  next_dispatch: string; // YYYY-MM-DD
  unit_price: number;
  species: { common_name: string } | null;
};

type RunSummary = {
  considered: number;
  fulfilled: number;
  backordered: number;
  errors: { subscriptionId: string; message: string }[];
};

// ── helpers ──────────────────────────────────────────────────

/** Today's date in UTC as YYYY-MM-DD. */
function todayUTC(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

/** Advance `iso` by frequency interval, returning YYYY-MM-DD. */
function advanceDispatch(iso: string, freq: Frequency): string {
  const [y, m, d] = iso.split('-').map(Number);
  const base = new Date(Date.UTC(y, (m ?? 1) - 1, d));
  const days = freq === 'weekly' ? 7 : freq === 'biweekly' ? 14 : 30;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Best-effort Resend send; logs and no-ops if no API key. */
async function sendEmail(payload: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  tags?: { name: string; value: string }[];
}): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log('[engine] RESEND_API_KEY unset — skipping send', {
      to: payload.to,
      subject: payload.subject,
    });
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        tags: payload.tags,
      }),
    });
    if (!res.ok) {
      console.error('[engine] resend send failed', {
        status: res.status,
        body: await res.text(),
      });
    }
  } catch (err) {
    console.error('[engine] resend fetch threw', err);
  }
}

function backorderEmail(
  speciesName: string,
  quantity: number,
  format: string,
  subscriptionId: string,
) {
  const subUrl = `${SITE_URL}/subscriptions`;
  const html = `
    <div style="font-family:Inter,Helvetica,Arial,sans-serif;max-width:560px">
      <h2>Subscription on backorder</h2>
      <p>We could not fulfil your scheduled dispatch of
      <strong>${speciesName}</strong> (${format} × ${quantity}). The
      subscription remains active and will retry on the next engine run
      as stock becomes available.</p>
      <p><a href="${subUrl}">Manage subscriptions</a></p>
    </div>
  `;
  const text = `Subscription on backorder\n\nWe could not fulfil your scheduled dispatch of ${speciesName} (${format} × ${quantity}). The subscription remains active and will retry on the next engine run as stock becomes available.\n\nManage: ${subUrl}\n`;
  return {
    subject: `Backorder: ${speciesName}`,
    html,
    text,
    tags: [
      { name: 'kind', value: 'backorder' },
      { name: 'subscription_id', value: subscriptionId },
    ],
  };
}

// ── main run loop ────────────────────────────────────────────

async function runEngine(): Promise<RunSummary> {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const today = todayUTC();
  const summary: RunSummary = {
    considered: 0,
    fulfilled: 0,
    backordered: 0,
    errors: [],
  };

  const { data: subs, error: loadErr } = await supabase
    .from('subscriptions')
    .select(
      'id, company_id, species_id, format, quantity, frequency, priority_tier, next_dispatch, unit_price, species:species_id(common_name)',
    )
    .eq('active', true)
    .lte('next_dispatch', today)
    .order('priority_tier', { ascending: true })
    .order('next_dispatch', { ascending: true })
    .returns<SubscriptionRow[]>();

  if (loadErr) {
    console.error('[engine] load subs failed', loadErr);
    throw new Error(`load subs failed: ${loadErr.message}`);
  }

  summary.considered = subs?.length ?? 0;
  if (!subs || subs.length === 0) return summary;

  // Pre-fetch company recipient emails to minimise round-trips.
  const companyIds = Array.from(new Set(subs.map((s) => s.company_id)));
  const recipients = new Map<string, string[]>();
  for (const companyId of companyIds) {
    const { data: links } = await supabase
      .from('company_users')
      .select('user_id')
      .eq('company_id', companyId);
    const emails: string[] = [];
    for (const link of links ?? []) {
      const { data: u } = await supabase.auth.admin.getUserById(link.user_id);
      if (u?.user?.email) emails.push(u.user.email);
    }
    recipients.set(companyId, emails);
  }

  for (const sub of subs) {
    try {
      const speciesName = sub.species?.common_name ?? 'species';

      // Optimistic claim: advance `next_dispatch` to the next interval
      // *before* allocating. Two concurrent engine runs cannot both win
      // because the WHERE matches the original `next_dispatch` value
      // and Postgres serialises UPDATEs at the row level. Whichever
      // run loses gets `count: 0` and skips. Backorder path rolls the
      // claim back below if allocation fails.
      const provisionalNext = advanceDispatch(sub.next_dispatch, sub.frequency);
      const { data: claimed, error: claimErr } = await supabase
        .from('subscriptions')
        .update({ next_dispatch: provisionalNext })
        .eq('id', sub.id)
        .eq('next_dispatch', sub.next_dispatch)
        .eq('active', true)
        .select('id')
        .maybeSingle();
      if (claimErr) {
        summary.errors.push({ subscriptionId: sub.id, message: claimErr.message });
        continue;
      }
      if (!claimed) {
        // Another engine invocation already claimed this row.
        console.log('[engine] skipped (claimed by concurrent run)', {
          subscriptionId: sub.id,
        });
        continue;
      }

      const { data: batchId, error: allocErr } = await supabase.rpc(
        'allocate_batch',
        { p_species_id: sub.species_id, p_qty: sub.quantity },
      );
      if (allocErr) {
        // Roll the claim back so the next run retries.
        await supabase
          .from('subscriptions')
          .update({ next_dispatch: sub.next_dispatch })
          .eq('id', sub.id);
        summary.errors.push({ subscriptionId: sub.id, message: allocErr.message });
        continue;
      }

      if (!batchId) {
        // Backorder path. Roll the claim back so the engine retries
        // on the next run when stock returns.
        await supabase
          .from('subscriptions')
          .update({ next_dispatch: sub.next_dispatch })
          .eq('id', sub.id);
        summary.backordered += 1;
        const to = recipients.get(sub.company_id) ?? [];
        const tpl = backorderEmail(speciesName, sub.quantity, sub.format, sub.id);
        for (const addr of to) {
          await sendEmail({ to: [addr], ...tpl });
        }
        console.log('[engine] backordered', { subscriptionId: sub.id });
        continue;
      }

      // Allocation succeeded. Create order + line. Use the same date
      // we evaluated against for `dispatch_date` so freshness windows
      // line up cleanly.
      const totalPrice = sub.unit_price * sub.quantity;
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          company_id: sub.company_id,
          status: 'confirmed',
          payment_method: 'card',
          dispatch_date: today,
          total_price: totalPrice,
          subscription_id: sub.id,
        })
        .select('id')
        .single();
      if (orderErr || !order) {
        // Allocation already decremented stock — flag the orphan for
        // ops reconciliation. We don't auto-roll-back because there's
        // no public RPC that grants the engine UPDATE on `batches`.
        console.error('[engine] order insert failed after allocation', {
          subscriptionId: sub.id,
          batchId,
          quantity: sub.quantity,
          message: orderErr?.message,
        });
        summary.errors.push({
          subscriptionId: sub.id,
          message: orderErr?.message ?? 'order insert failed',
        });
        continue;
      }

      const { error: itemErr } = await supabase.from('order_items').insert({
        order_id: order.id,
        species_id: sub.species_id,
        batch_id: batchId,
        format: sub.format,
        quantity: sub.quantity,
        unit_price: sub.unit_price,
        allocated_at: new Date().toISOString(),
      });
      if (itemErr) {
        summary.errors.push({
          subscriptionId: sub.id,
          message: `order_items insert failed: ${itemErr.message}`,
        });
        // Order row exists but has no line — flag for ops follow-up.
        continue;
      }

      // `next_dispatch` was already advanced by the optimistic claim
      // above, so nothing else to update here.
      summary.fulfilled += 1;
      console.log('[engine] fulfilled', {
        subscriptionId: sub.id,
        orderId: order.id,
        batchId,
        next: provisionalNext,
      });
    } catch (err) {
      summary.errors.push({
        subscriptionId: sub.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Record completion time so /api/health can surface last_cron_run.
  const runTimestamp = new Date().toISOString();
  await supabase
    .from('system_metrics')
    .upsert(
      { key: 'last_cron_run', value: runTimestamp, updated_at: runTimestamp },
      { onConflict: 'key' },
    );
  console.log('[engine] logged last_cron_run', runTimestamp);

  return summary;
}

// ── HTTP entrypoint ──────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${ENGINE_SECRET}`;
  if (auth !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const summary = await runEngine();
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'engine failed',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
});
