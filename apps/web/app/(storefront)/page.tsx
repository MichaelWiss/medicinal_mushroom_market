import { PageHeader } from '@/components/shell/PageHeader';
import { CatalogueList } from '@/components/catalogue/CatalogueList';
import { loadCatalogue } from '@/lib/data/catalogue';

// Storefront landing — Cell 2.4: Supabase-backed catalogue with ISR.
// `revalidate` controls the static-cache TTL; client-side Realtime
// subscriptions keep `available_units` fresh between regenerations.
export const revalidate = 300;

export default async function StorefrontHome() {
  const species = await loadCatalogue();
  const inStock = species.filter((s) => s.units > 0).length;

  return (
    <>
      <PageHeader
        label="2026 Spring harvest"
        title="Species"
        italicSuffix="catalogue"
        description="Inoculation-dated, contamination-checked, cold-chain certified. Monday dispatch for all fresh formats."
        stat={{ value: inStock, label: 'Species available' }}
      />
      <CatalogueList initialSpecies={species} />
    </>
  );
}
