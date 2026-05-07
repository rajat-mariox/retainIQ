/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070a14',
          900: '#0b1020',
          850: '#0f1530',
          800: '#141b3a',
          700: '#1c2547',
          600: '#2a345a',
          500: '#3a4570',
          400: '#5b6691',
          300: '#8590b5',
          200: '#b6bdd6',
          100: '#dde1ee',
        },
        iris: {
          50:  '#eef0ff',
          100: '#dde2ff',
          200: '#b6c0ff',
          300: '#8a98ff',
          400: '#6470ff',
          500: '#4d52f5',
          600: '#3d40e0',
          700: '#2f33b8',
        },
        // Keep brand alias for backwards compat with any leftover classes
        brand: {
          50:  '#eef0ff',
          100: '#dde2ff',
          500: '#4d52f5',
          600: '#3d40e0',
          700: '#2f33b8',
        },
        mint:  { 300: '#a7f0d4', 400: '#7de4be', 500: '#4dd4a3' },
        peach: { 300: '#ffd2b8', 400: '#ffb18a', 500: '#ff8e5b' },
        cream: { 300: '#f4ecc6', 400: '#ecdf9c', 500: '#dac96b' },
        rose:  { 300: '#ffc4d1', 400: '#ff9bb0', 500: '#f06585' },
        sky:   { 300: '#bfe1ff', 400: '#8fc7ff', 500: '#5aa9ff' },
        amber: { 300: '#ffe0a3', 400: '#ffc266', 500: '#f0a020' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: { '4xl': '2rem' },
      backgroundImage: {
        'page-glow':
          'radial-gradient(ellipse 70% 50% at 50% -10%, rgba(77,82,245,0.18), transparent 70%),' +
          'radial-gradient(ellipse 80% 60% at 80% 110%, rgba(77,82,245,0.10), transparent 60%),' +
          'linear-gradient(180deg, #070a14 0%, #0b1020 100%)',
        'glass':         'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
        'glass-strong':  'linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 100%)',
        'tile-mint':     'linear-gradient(135deg, rgba(167,240,212,0.85) 0%, rgba(125,228,190,0.55) 100%)',
        'tile-peach':    'linear-gradient(135deg, rgba(255,210,184,0.85) 0%, rgba(255,177,138,0.55) 100%)',
        'tile-cream':    'linear-gradient(135deg, rgba(244,236,198,0.85) 0%, rgba(236,223,156,0.55) 100%)',
        'tile-rose':     'linear-gradient(135deg, rgba(255,196,209,0.85) 0%, rgba(255,155,176,0.55) 100%)',
        'tile-sky':      'linear-gradient(135deg, rgba(191,225,255,0.85) 0%, rgba(143,199,255,0.55) 100%)',
        'tile-iris':     'linear-gradient(135deg, rgba(138,152,255,0.55) 0%, rgba(77,82,245,0.30) 100%)',
        'edge-light':    'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 30%)',
      },
      boxShadow: {
        'glass':      '0 1px 0 0 rgba(255,255,255,0.08) inset, 0 0 0 1px rgba(255,255,255,0.04), 0 24px 48px -12px rgba(0,0,0,0.45)',
        'glass-lg':   '0 1px 0 0 rgba(255,255,255,0.10) inset, 0 0 0 1px rgba(255,255,255,0.05), 0 32px 64px -16px rgba(0,0,0,0.55)',
        'glow-iris':  '0 0 0 1px rgba(138,152,255,0.30), 0 8px 32px -8px rgba(77,82,245,0.45)',
        'glow-mint':  '0 0 0 1px rgba(125,228,190,0.30), 0 8px 32px -8px rgba(77,212,163,0.35)',
        'glow-peach': '0 0 0 1px rgba(255,177,138,0.30), 0 8px 32px -8px rgba(255,142,91,0.35)',
        'glow-amber': '0 0 0 1px rgba(255,194,102,0.30), 0 8px 32px -8px rgba(240,160,32,0.40)',
        'inset-soft': 'inset 0 1px 0 0 rgba(255,255,255,0.08)',
      },
      backdropBlur: { xs: '2px' },
      animation: {
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { opacity: 0.6 },
          '50%':      { opacity: 1 },
        },
      },
    },
  },
  plugins: [],
};
