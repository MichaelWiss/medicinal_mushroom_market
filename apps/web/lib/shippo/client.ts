// Server-only Shippo REST client (Cell 6.1).
//
// Thin fetch wrapper rather than the official `shippo` SDK so that:
//   1. Tests can mock at this single boundary (see TESTING.md).
//   2. We avoid pulling in another transitive dependency for a handful of
//      endpoints (shipments, transactions, tracks).
//
// When `SHIPPO_API_KEY` is unset we return a no-op shim that logs the
// would-be request — mirrors the pattern used by `lib/email/client.ts` so
// local dev works without provisioning a Shippo account.

import 'server-only';

const SHIPPO_API_BASE = 'https://api.goshippo.com';

export interface ShippoClient {
  available: boolean;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
}

let _client: ShippoClient | null = null;

export function getShippoClient(): ShippoClient {
  if (_client) return _client;

  const token = process.env.SHIPPO_API_KEY;

  if (!token) {
    _client = {
      available: false,
      request: async <T>(path: string, init?: RequestInit): Promise<T> => {
        // eslint-disable-next-line no-console
        console.warn(
          `[shippo] SHIPPO_API_KEY unset — skipping ${init?.method ?? 'GET'} ${path}`,
        );
        // Return an empty object cast to T so callers don't crash in dev.
        return {} as T;
      },
    };
    return _client;
  }

  _client = {
    available: true,
    request: async <T>(path: string, init?: RequestInit): Promise<T> => {
      const url = path.startsWith('http') ? path : `${SHIPPO_API_BASE}${path}`;
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `ShippoToken ${token}`);
      if (init?.body !== undefined && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      headers.set('Accept', 'application/json');

      const res = await fetch(url, { ...init, headers });
      const text = await res.text();
      const body = text ? safeParseJson(text) : null;

      if (!res.ok) {
        const message =
          (body && typeof body === 'object' && 'detail' in body
            ? String((body as { detail: unknown }).detail)
            : null) ?? `Shippo request failed (${res.status})`;
        throw new ShippoError(message, res.status, body);
      }

      return body as T;
    },
  };

  return _client;
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class ShippoError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ShippoError';
    this.status = status;
    this.body = body;
  }
}
