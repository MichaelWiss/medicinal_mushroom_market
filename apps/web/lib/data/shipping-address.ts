// Canonical shipping-address parsing and formatting.
//
// `companies.shipping_address` is JSON and has appeared in multiple
// shapes over the life of the project (`line1/postcode` from seed data,
// `street1/zip` for Shippo). Parse it once into the normalized
// @repo/shared `ShippingAddress` shape and reuse that everywhere.

import type { ShippingAddress } from '@repo/shared';

export function parseShippingAddress(raw: unknown): ShippingAddress | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const pick = (k: string): string | undefined =>
    typeof r[k] === 'string' ? (r[k] as string) : undefined;

  const street1 = pick('street1') ?? pick('line1');
  const city = pick('city');
  const country = pick('country');

  // Treat "no useful address" as null so UI/actions can show a clear blocker.
  if (!street1 || !city || !country) return null;

  const addr: ShippingAddress = { street1, city, country };
  const name = pick('name');
  if (name) addr.name = name;
  const street2 = pick('street2') ?? pick('line2');
  if (street2) addr.street2 = street2;
  const state = pick('state') ?? pick('region');
  if (state) addr.state = state;
  const zip = pick('zip') ?? pick('postal_code') ?? pick('postcode');
  if (zip) addr.zip = zip;
  const phone = pick('phone');
  if (phone) addr.phone = phone;
  const email = pick('email');
  if (email) addr.email = email;
  return addr;
}

export function formatShippingAddress(
  addr: ShippingAddress | null,
): string | undefined {
  if (!addr) return undefined;
  const parts = [
    addr.name,
    addr.street1,
    addr.street2,
    [addr.city, addr.state, addr.zip].filter(Boolean).join(', '),
    addr.country,
  ].filter((v): v is string => typeof v === 'string' && v.length > 0);
  return parts.length > 0 ? parts.join(', ') : undefined;
}
