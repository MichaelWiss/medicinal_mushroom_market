// Catalogue presentation map — keyed by latin_name (the stable join key
// against Supabase `species.latin_name`). Holds the visual + commercial
// metadata that does not yet live in the DB schema:
//
//   - num     : two-digit catalogue number shown on the photo overlay
//   - key     : enum used by IMGS / BG colour swatches (re-uses /lib/data/species.ts)
//   - cartId  : numeric id understood by the demo CartProvider until the
//               real cart (Cell 2.7) accepts uuids
//   - formats : product format chips on the row
//   - price   : per-unit list price (real tier pricing arrives in Cell 2.5)
//
// All 12 seeded species have an entry. Unknown species fall through to
// FALLBACK_PRESENTATION (handled by the resolver).
//
// When new species are seeded, add a row here and extend
// /lib/data/species.ts with matching IMGS / BG entries if needed.

import { BG, IMGS, type FormatKey, type SpeciesKey } from './species';

export type SpeciesPresentation = {
  num: string;
  key: SpeciesKey;
  cartId: number;
  formats: FormatKey[];
  price: number;
};

export const PRESENTATION_BY_LATIN: Record<string, SpeciesPresentation> = {
  'Hericium erinaceus': {
    num: '01',
    key: 'lionsmane',
    cartId: 1,
    formats: ['fresh', 'spawn', 'culture'],
    price: 18.5,
  },
  'Pleurotus ostreatus': {
    num: '02',
    key: 'oyster',
    cartId: 6,
    formats: ['fresh', 'spawn'],
    price: 12.0,
  },
  'Lentinula edodes': {
    num: '03',
    key: 'oyster', // re-uses oyster swatch until shiitake art lands
    cartId: 7,
    formats: ['fresh', 'block'],
    price: 14.0,
  },
  'Cordyceps militaris': {
    num: '04',
    key: 'cordyceps',
    cartId: 3,
    formats: ['powder', 'spawn'],
    price: 34.0,
  },
  'Pleurotus eryngii': {
    num: '05',
    key: 'oyster',
    cartId: 8,
    formats: ['fresh', 'block'],
    price: 16.0,
  },
  'Grifola frondosa': {
    num: '06',
    key: 'turkeyTail',
    cartId: 9,
    formats: ['fresh', 'spawn'],
    price: 22.0,
  },
  'Tremella fuciformis': {
    num: '07',
    key: 'lionsmane',
    cartId: 10,
    formats: ['fresh', 'culture'],
    price: 20.0,
  },
  'Agrocybe aegerita': {
    num: '08',
    key: 'turkeyTail',
    cartId: 11,
    formats: ['fresh', 'spawn'],
    price: 15.0,
  },
  'Ganoderma lucidum': {
    num: '09',
    key: 'reishi',
    cartId: 2,
    formats: ['powder', 'culture'],
    price: 22.0,
  },
  'Trametes versicolor': {
    num: '10',
    key: 'turkeyTail',
    cartId: 4,
    formats: ['powder', 'block'],
    price: 16.0,
  },
  'Inonotus obliquus': {
    num: '11',
    key: 'chaga',
    cartId: 5,
    formats: ['powder'],
    price: 28.0,
  },
  'Fomitopsis officinalis': {
    num: '12',
    key: 'chaga',
    cartId: 12,
    formats: ['powder'],
    price: 32.0,
  },
};

const FALLBACK: SpeciesPresentation = {
  num: '00',
  key: 'lionsmane',
  cartId: 0,
  formats: ['fresh'],
  price: 0,
};

export function presentationFor(latinName: string): SpeciesPresentation {
  return PRESENTATION_BY_LATIN[latinName] ?? FALLBACK;
}

export { BG, IMGS };
