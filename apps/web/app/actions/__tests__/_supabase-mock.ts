// Minimal Supabase JS chainable client mock for action tests.
//
// The Supabase client uses a "query builder" pattern where calls like
// `from('orders').insert(p).select('id').single()` chain through a
// thenable. This helper produces a stand-in that:
//   • Records every `.from(table)` operation with its payload (insert,
//     update, upsert, delete) so tests can assert what reached the DB.
//   • Resolves the chain with a per-(table, op) canned response, where
//     `op` is the last write verb observed (or `'select'` if none).
//   • Lets tests stub `auth.getUser` and `rpc(name, ...)` results.
//
// This covers the call patterns used by `startCheckout` and
// `startNet30Checkout`. It is intentionally simple — tests should keep
// using small, explicit response queues rather than reach for cleverness.

import { vi } from 'vitest';

export type SupabaseCall = {
  table: string;
  method: 'insert' | 'update' | 'upsert' | 'delete' | 'select';
  payload?: unknown;
  filters: Array<{ kind: string; args: unknown[] }>;
};

type Result<T = unknown> = { data: T | null; error: null | { message: string; code?: string } };

export type SupabaseMockResponses = {
  /** Canned result for `.auth.getUser()`. */
  authUser?: { id: string; email?: string | null } | null;
  /** Map keyed by `${table}:${op}` where op ∈ select|insert|update|upsert|delete. */
  byTableOp: Record<string, Result>;
  /** Map keyed by RPC name. */
  rpc?: Record<string, Result>;
};

export type SupabaseMockClient = {
  calls: SupabaseCall[];
  /**
   * Record of latest payload by table+op. Useful in assertions:
   *   `client.lastPayload['order_items:insert']`
   */
  lastPayload: Record<string, unknown | undefined>;
  client: unknown;
};

export function createSupabaseMock(
  responses: SupabaseMockResponses,
): SupabaseMockClient {
  const calls: SupabaseCall[] = [];
  const lastPayload: Record<string, unknown | undefined> = {};

  function from(table: string) {
    let lastOp: SupabaseCall['method'] = 'select';
    let lastFilters: SupabaseCall['filters'] = [];
    let payload: unknown = undefined;

    const captureFilter =
      (kind: string) =>
      (...args: unknown[]) => {
        lastFilters.push({ kind, args });
        return builder;
      };

    const resolve = (): Result => {
      const key = `${table}:${lastOp}`;
      return (
        responses.byTableOp[key] ?? { data: null, error: null }
      );
    };

    const builder: Record<string, unknown> = {
      // write verbs — capture payload + record call
      insert(p: unknown) {
        lastOp = 'insert';
        payload = p;
        lastPayload[`${table}:insert`] = p;
        calls.push({ table, method: 'insert', payload: p, filters: [] });
        lastFilters = [];
        return builder;
      },
      update(p: unknown) {
        lastOp = 'update';
        payload = p;
        lastPayload[`${table}:update`] = p;
        calls.push({ table, method: 'update', payload: p, filters: [] });
        lastFilters = [];
        return builder;
      },
      upsert(p: unknown, _opts?: unknown) {
        lastOp = 'upsert';
        payload = p;
        lastPayload[`${table}:upsert`] = p;
        calls.push({ table, method: 'upsert', payload: p, filters: [] });
        lastFilters = [];
        return builder;
      },
      delete() {
        lastOp = 'delete';
        calls.push({ table, method: 'delete', filters: [] });
        lastFilters = [];
        return builder;
      },
      // pure read verbs / filters / order — passthrough
      select: captureFilter('select'),
      eq: captureFilter('eq'),
      in: captureFilter('in'),
      lte: captureFilter('lte'),
      gte: captureFilter('gte'),
      lt: captureFilter('lt'),
      gt: captureFilter('gt'),
      is: captureFilter('is'),
      neq: captureFilter('neq'),
      order: captureFilter('order'),
      limit: captureFilter('limit'),
      returns: () => builder,
      // terminals
      maybeSingle: () => Promise.resolve(resolve()),
      single: () => Promise.resolve(resolve()),
      // thenable for `await supabase.from(...).insert(...)` and the like
      then(onFulfilled?: (v: Result) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(resolve()).then(onFulfilled as never, onRejected as never);
      },
    };

    // Suppress unused warning when callers do not chain a filter.
    void payload;
    return builder;
  }

  const auth = {
    getUser: vi.fn(async () => ({
      data: { user: responses.authUser ?? null },
      error: null as null | { message: string },
    })),
  };

  const rpc = vi.fn(async (name: string) => {
    return responses.rpc?.[name] ?? { data: null, error: null };
  });

  const client = { from, auth, rpc };

  return { calls, lastPayload, client };
}
