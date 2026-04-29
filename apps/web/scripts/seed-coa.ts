// Seed three placeholder CoA PDFs so the Cell 2.6 traceability detail page
// has live storage objects to link to during local development.
//
// Idempotent: re-running upserts the same three objects.
//
// Run with:
//   pnpm --filter web exec tsx --env-file=.env.local scripts/seed-coa.ts

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@repo/db';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    'Missing env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.',
  );
  process.exit(1);
}

const admin = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Matches the three batches allocated by `supabase/seed.sql`.
const SEED_BATCH_IDS = [
  'ba000001-0000-0000-0000-000000000001', // Lion's Mane (CraftBrew)
  'ba000028-0000-0000-0000-000000000001', // Agarikon  (CraftBrew)
  'ba000029-0000-0000-0000-000000000001', // Agarikon  (NutriLabs)
];

/**
 * Builds a minimal but spec-valid single-page PDF that displays the batch
 * id and a "Mycelium CoA" header. Avoids adding a runtime PDF dependency.
 *
 * Output is ~600 bytes — plenty for a placeholder.
 */
function buildPlaceholderPdf(batchId: string): Uint8Array {
  const text = `Mycelium B2B - Certificate of Analysis\\nBatch: ${batchId}`;
  const stream = `BT /F1 14 Tf 60 760 Td (${text}) Tj ET`;
  const objects: string[] = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
      '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj',
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(body.length);
    body += obj + '\n';
  }
  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (const off of offsets) {
    body += off.toString().padStart(10, '0') + ' 00000 n \n';
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  body += `startxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(body);
}

async function main() {
  for (const batchId of SEED_BATCH_IDS) {
    const path = `${batchId}.pdf`;
    const bytes = buildPlaceholderPdf(batchId);

    const { error } = await admin.storage
      .from('coa')
      .upload(path, bytes, {
        upsert: true,
        contentType: 'application/pdf',
      });

    if (error) {
      console.error(`✗ upload failed for ${path}: ${error.message}`);
      process.exitCode = 1;
      continue;
    }
    console.log(`✓ uploaded coa/${path} (${bytes.byteLength} bytes)`);
  }

  console.log('\nDone. Re-run anytime; uploads are idempotent (upsert: true).');
}

main().catch((e) => {
  console.error('❌', e instanceof Error ? e.message : e);
  process.exit(1);
});
