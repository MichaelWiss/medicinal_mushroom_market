// Catalogue enum labels and presentation assets.
// Live species rows are loaded from Supabase; pricing/formats live in
// species-presentation.ts.

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

