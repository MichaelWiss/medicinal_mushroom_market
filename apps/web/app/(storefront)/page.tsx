import { PageHeader } from '@/components/shell/PageHeader';
import { CatalogueList } from '@/components/catalogue/CatalogueList';
import { SPECIES } from '@/lib/data/species';

export default function StorefrontHome() {
  const inStock = SPECIES.filter((s) => s.units > 0).length;
  return (
    <>
      <PageHeader
        label="2026 Spring harvest"
        title="Species"
        italicSuffix="catalogue"
        description="Inoculation-dated, contamination-checked, cold-chain certified. Monday dispatch for all fresh formats."
        stat={{ value: inStock, label: 'Species available' }}
      />
      <CatalogueList />
    </>
  );
}
