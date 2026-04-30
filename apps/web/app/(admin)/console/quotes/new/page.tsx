// Admin "new quote" route (Cell 5.2). Loads companies + species
// catalogue with the service-role client, hands them to the
// client-side line-item builder.

import { createAdminClient } from '@/lib/supabase/admin';
import { NewQuoteForm } from './NewQuoteForm';

export const dynamic = 'force-dynamic';

export default async function NewQuotePage() {
  const admin = createAdminClient();
  const [{ data: companies }, { data: species }] = await Promise.all([
    admin.from('companies').select('id, name, tier, net30_enabled').order('name'),
    admin
      .from('species')
      .select('id, common_name, latin_name')
      .order('common_name'),
  ]);

  return (
    <section className="px-11 py-10">
      <h1 className="font-serif text-[28px] font-light italic text-ink">
        New quote
      </h1>
      <p className="mt-2 text-[12px] text-ink2">
        Build a bulk quote with negotiated unit prices. Send it to the
        buyer for approval — they convert it to a confirmed order in one
        click.
      </p>
      <NewQuoteForm companies={companies ?? []} species={species ?? []} />
    </section>
  );
}
