// Admin batch management Server Actions (Cell 6.4).
//
//   • setContaminationResult — flip pending → pass / pending → fail.
//     Once a batch is pass/fail it is terminal; ops must create a new
//     batch rather than re-judge a closed one. Forward transitions are
//     enforced with a `WHERE contamination_check = prev` predicate so a
//     concurrent ops tab cannot rewind the decision.
//
//   • setAvailableUnits — adjust on-hand inventory (e.g. shrinkage, hand
//     counts). `available_units >= 0` is enforced by a check constraint.
//
//   • uploadCoa — upload a PDF to the `coa` Storage bucket using the
//     `{batchId}.pdf` naming convention required by the buyer-side RLS
//     policy in `20260427000004_coa_storage.sql`. Writes the storage
//     path to `batches.coa_url` so other code paths can detect "CoA
//     present" without round-tripping Storage.
//
// All actions re-verify a session and use the service-role client so
// they bypass the RLS policy that revokes UPDATE on `batches` from
// authenticated buyers (`20260427000002_allocate_batch.sql`).

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOps } from '@/lib/auth/require-ops';
import type { ContaminationResult } from '@/lib/data/admin-batches';

export type BatchActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; code?: string };

const COA_BUCKET = 'coa';
const COA_MAX_BYTES = 50 * 1024 * 1024; // matches the bucket file_size_limit


// ── contamination ────────────────────────────────────────────

export async function setContaminationResult(
  batchId: string,
  next: ContaminationResult,
): Promise<BatchActionResult> {
  const guard = await requireOps();
  if (!guard.ok) return guard;

  if (next === 'pending') {
    return {
      ok: false,
      error: 'Cannot revert a batch to pending.',
      code: 'invalid_transition',
    };
  }

  const admin = createAdminClient();
  const { data: current, error: readErr } = await admin
    .from('batches')
    .select('contamination_check')
    .eq('id', batchId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!current) return { ok: false, error: 'Batch not found.' };

  if (current.contamination_check !== 'pending') {
    return {
      ok: false,
      error: `Batch is already marked ${current.contamination_check}.`,
      code: 'invalid_transition',
    };
  }

  const { data: updated, error: updErr } = await admin
    .from('batches')
    .update({ contamination_check: next })
    .eq('id', batchId)
    .eq('contamination_check', 'pending')
    .select('id, contamination_check')
    .maybeSingle();
  if (updErr) return { ok: false, error: updErr.message };
  if (!updated) {
    return {
      ok: false,
      error: 'Batch was judged concurrently. Refresh and try again.',
      code: 'race',
    };
  }

  revalidatePath('/console/batches');
  revalidatePath(`/console/batches/${batchId}`);
  return { ok: true, message: `Marked ${next}.` };
}

// ── available units ──────────────────────────────────────────

export async function setAvailableUnits(
  batchId: string,
  units: number,
): Promise<BatchActionResult> {
  const guard = await requireOps();
  if (!guard.ok) return guard;

  if (!Number.isFinite(units) || !Number.isInteger(units) || units < 0) {
    return {
      ok: false,
      error: 'Available units must be a non-negative whole number.',
      code: 'invalid_input',
    };
  }

  const admin = createAdminClient();
  const { error: updErr } = await admin
    .from('batches')
    .update({ available_units: units })
    .eq('id', batchId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath('/console/batches');
  revalidatePath(`/console/batches/${batchId}`);
  return { ok: true, message: `Set to ${units} units.` };
}

// ── CoA upload ───────────────────────────────────────────────

export async function uploadCoa(
  batchId: string,
  formData: FormData,
): Promise<BatchActionResult> {
  const guard = await requireOps();
  if (!guard.ok) return guard;

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { ok: false, error: 'No file provided.', code: 'invalid_input' };
  }
  if (file.size === 0) {
    return { ok: false, error: 'File is empty.', code: 'invalid_input' };
  }
  if (file.size > COA_MAX_BYTES) {
    return {
      ok: false,
      error: `File exceeds ${COA_MAX_BYTES / (1024 * 1024)} MiB limit.`,
      code: 'invalid_input',
    };
  }
  // The bucket only allows `application/pdf`; the front-end input also
  // sets `accept=".pdf"`. Belt-and-suspenders check here so we can
  // return a friendly error before round-tripping Storage.
  if (file.type && file.type !== 'application/pdf') {
    return {
      ok: false,
      error: 'Only PDF files are accepted for CoAs.',
      code: 'invalid_input',
    };
  }

  const admin = createAdminClient();
  const path = `${batchId}.pdf`;

  // Naming convention is required by the buyer-side RLS policy.
  // `upsert: true` so re-uploading replaces an earlier PDF.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(COA_BUCKET)
    .upload(path, bytes, {
      upsert: true,
      contentType: 'application/pdf',
    });
  if (upErr) {
    return {
      ok: false,
      error: `Upload failed: ${upErr.message}`,
      code: 'storage_error',
    };
  }

  // Stable storage path (NOT a signed URL — those expire). Buyer
  // lookups derive their own signed URL on demand from the
  // `{batchId}.pdf` convention; this column simply records "a CoA
  // exists".
  const coaUrl = `${COA_BUCKET}/${path}`;
  const { error: updErr } = await admin
    .from('batches')
    .update({ coa_url: coaUrl })
    .eq('id', batchId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath('/console/batches');
  revalidatePath(`/console/batches/${batchId}`);
  return { ok: true, message: 'CoA uploaded.' };
}
