// Server Actions for cross-device cart sync (Cell 3.1).
//
// `loadServerCart()`  → reads the signed-in user's `public.carts` row.
// `saveServerCart()`  → upserts the row with the current local items.
//
// RLS guarantees a user can only touch their own row. Unauthenticated
// callers receive `null` / no-op so the UI can fall back to localStorage.

'use server';

import { createClient } from '@/lib/supabase/server';
import { cartArraySchema, parseCart, type CartLine } from './store';

export async function loadServerCart(): Promise<CartLine[] | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('carts')
    .select('items')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    // Surface zero state on read errors rather than throwing — the cart UI
    // can still operate from localStorage.
    return [];
  }
  return parseCart(data?.items);
}

export async function saveServerCart(items: CartLine[]): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  // Validate at the boundary — never write garbage to the DB.
  const result = cartArraySchema.safeParse(items);
  if (!result.success) return false;

  const { error } = await supabase
    .from('carts')
    .upsert(
      { user_id: user.id, items: result.data },
      { onConflict: 'user_id' },
    );
  return !error;
}

export async function clearServerCart(): Promise<boolean> {
  return saveServerCart([]);
}
