// Catalogue seed data ported verbatim from /demo/myellium.html (lines 836-851).
// Real data wires up in Cells 2.4 / 2.5 (Supabase-backed catalogue).

export type FormatKey = 'fresh' | 'powder' | 'spawn' | 'culture' | 'block';

export const FMT: Record<FormatKey, string> = {
  fresh: 'Fresh fruiting body',
  powder: 'Dried powder',
  spawn: 'Grain spawn',
  culture: 'Liquid culture',
  block: 'Substrate block',
};

export type SpeciesKey =
  | 'lionsmane'
  | 'reishi'
  | 'cordyceps'
  | 'turkeyTail'
  | 'chaga'
  | 'oyster';

export const IMGS: Record<SpeciesKey, string> = {
  lionsmane:
    'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?auto=format&fit=crop&w=600&q=80',
  reishi:
    'https://images.unsplash.com/photo-1603386461092-56028a22c634?auto=format&fit=crop&w=600&q=80',
  cordyceps:
    'https://images.unsplash.com/photo-1569396116180-210c182bedb8?auto=format&fit=crop&w=600&q=80',
  turkeyTail:
    'https://images.unsplash.com/photo-1518977822-0fac3d52e3fd?auto=format&fit=crop&w=600&q=80',
  chaga:
    'https://images.unsplash.com/photo-1601850494422-3cf14624b0b3?auto=format&fit=crop&w=600&q=80',
  oyster:
    'https://images.unsplash.com/photo-1548534355-1c53d7e1b6a0?auto=format&fit=crop&w=600&q=80',
};

export const BG: Record<SpeciesKey, string> = {
  lionsmane: '#c8c4b0',
  reishi: '#b8a890',
  cordyceps: '#b0b89a',
  turkeyTail: '#b4a888',
  chaga: '#8a8070',
  oyster: '#c0c0b8',
};

export type Species = {
  id: number;
  key: SpeciesKey;
  num: string;
  name: string;
  latin: string;
  formats: FormatKey[];
  dispatch: 'MON' | 'ANY';
  cold: boolean;
  units: number;
  price: number;
  shelf: string;
  batch: string;
};

export const SPECIES: Species[] = [
  {
    id: 1,
    key: 'lionsmane',
    num: '01',
    name: "Lion's Mane",
    latin: 'Hericium erinaceus',
    formats: ['fresh', 'spawn', 'culture'],
    dispatch: 'MON',
    cold: true,
    units: 84,
    price: 18.5,
    shelf: '7 days',
    batch: 'BCH-2026-044',
  },
  {
    id: 2,
    key: 'reishi',
    num: '02',
    name: 'Reishi',
    latin: 'Ganoderma lucidum',
    formats: ['powder', 'culture'],
    dispatch: 'ANY',
    cold: false,
    units: 240,
    price: 22.0,
    shelf: '12 months',
    batch: 'BCH-2026-039',
  },
  {
    id: 3,
    key: 'cordyceps',
    num: '03',
    name: 'Cordyceps',
    latin: 'Cordyceps militaris',
    formats: ['powder', 'spawn'],
    dispatch: 'MON',
    cold: false,
    units: 12,
    price: 34.0,
    shelf: '6 months',
    batch: 'BCH-2026-041',
  },
  {
    id: 4,
    key: 'turkeyTail',
    num: '04',
    name: 'Turkey Tail',
    latin: 'Trametes versicolor',
    formats: ['powder', 'block'],
    dispatch: 'MON',
    cold: false,
    units: 190,
    price: 16.0,
    shelf: '6 months',
    batch: 'BCH-2026-037',
  },
  {
    id: 5,
    key: 'chaga',
    num: '05',
    name: 'Chaga',
    latin: 'Inonotus obliquus',
    formats: ['powder'],
    dispatch: 'ANY',
    cold: false,
    units: 0,
    price: 28.0,
    shelf: '12 months',
    batch: 'BCH-2026-033',
  },
  {
    id: 6,
    key: 'oyster',
    num: '06',
    name: 'Oyster',
    latin: 'Pleurotus ostreatus',
    formats: ['fresh', 'spawn', 'block'],
    dispatch: 'MON',
    cold: true,
    units: 310,
    price: 9.5,
    shelf: '5 days',
    batch: 'BCH-2026-046',
  },
];

export const speciesById = (id: number): Species | undefined =>
  SPECIES.find((s) => s.id === id);
