import type { Config } from 'tailwindcss';

// Design tokens ported from /demo/myellium.html.
// Colors are exact hex; fonts loaded via next/font (see app/layout.tsx).
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        putty:   '#e0ded2',
        putty2:  '#d4d2c4',
        navy:    '#1e1c36',
        navy2:   '#2a2848',
        navy3:   '#3a3860',
        ink:     '#3c3244',
        ink2:    '#6a6070',
        ink3:    '#9a949e',
        yellow:  '#c8a824',
        yellow2: '#e0c040',
        // semantic stock indicators (from .sp-stock-* in demo)
        stockOk:  '#4a7a36',
        stockLow: '#8a6020',
        stockNil: '#8a3020',
        // CTA band background ("warm rose") from demo footer
        rose:    '#b28586',
      },
      fontFamily: {
        // Wired to next/font CSS variables in app/layout.tsx.
        serif: ['var(--font-cormorant)', 'Georgia', 'serif'],
        sans:  ['var(--font-jost)', 'system-ui', 'sans-serif'],
        mono:  ['"Courier New"', 'monospace'],
      },
      letterSpacing: {
        wider3: '0.13em',
        wider4: '0.16em',
        wider5: '0.18em',
        wider6: '0.22em',
      },
    },
  },
  plugins: [],
};

export default config;
