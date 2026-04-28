// =============================================================
// @repo/shared — state.ts
//
// Order status state-machine guards.
//
// Valid transitions:
//   pending    → confirmed | cancelled
//   confirmed  → picking   | cancelled
//   picking    → dispatched
//   dispatched → delivered
//   delivered  → (terminal)
//   cancelled  → (terminal)
// =============================================================

import type { OrderStatus } from './types.js';

// Adjacency map — only forward edges are listed.
// Terminal statuses map to an empty array.
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending:    ['confirmed', 'cancelled'],
  confirmed:  ['picking',   'cancelled'],
  picking:    ['dispatched'],
  dispatched: ['delivered'],
  delivered:  [],
  cancelled:  [],
};

/**
 * Returns true when transitioning from `current` to `next` is valid.
 */
export function canTransitionOrder(
  current: OrderStatus,
  next: OrderStatus,
): boolean {
  return (TRANSITIONS[current] as OrderStatus[]).includes(next);
}

/**
 * Returns the list of statuses reachable from `current`.
 * Returns an empty array for terminal statuses.
 */
export function getNextOrderStatuses(current: OrderStatus): OrderStatus[] {
  return TRANSITIONS[current] as OrderStatus[];
}
