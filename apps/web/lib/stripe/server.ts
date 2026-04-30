// Server-only Stripe client (Cell 3.3).
//
// Lazily instantiated singleton; never imported from a client component.
// `apiVersion` is pinned to keep request/response shapes stable across
// Stripe's API releases.

import 'server-only';
import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  _stripe = new Stripe(key, {
    // Pin to a known-good API version. Bump intentionally with a test pass.
    apiVersion: '2026-04-22.dahlia',
    typescript: true,
  });
  return _stripe;
}
