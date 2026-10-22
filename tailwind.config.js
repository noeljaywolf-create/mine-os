/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070B12',
          900: '#0B1220',
          850: '#0F1725',
          800: '#141C2B',
          750: '#1A2333',
          700: '#212B3D',
          600: '#2C3748',
          500: '#3A4658',
          400: '#5A6779',
          300: '#8494A6',
          200: '#B6C1CE',
          100: '#DCE3EA',
          50: '#F1F4F7',
        },
        paper: {
          DEFAULT: '#F4F2ED',
          dim: '#E5E2DA',
          dark: '#2A2E33',
        },
        signal: {
          blue: '#2F6FEB',
          cyan: '#2BB3D6',
          cyanBright: '#4FD1E5',
          teal: '#1F9C93',
          green: '#1E9E5A',
          amber: '#D98A0B',
          red: '#D33F3F',
          violet: '#7A5AF8',
        },
      },
      fontFamily: {
        sans: ['"Inter var"', 'Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'SFMono-Regular', 'Consolas', '"Liberation Mono"', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 12px 30px -18px rgba(0,0,0,0.9)',
        lift: '0 24px 60px -30px rgba(0,0,0,0.85)',
      },
      backgroundImage: {
        'grid-fine':
          'linear-gradient(to right, rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.06) 1px, transparent 1px)',
      },
      keyframes: {
        pulseSoft: {
          '0%,100%': { opacity: '0.35' },
          '50%': { opacity: '0.9' },
        },
        sweep: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'pulse-soft': 'pulseSoft 2.4s ease-in-out infinite',
        sweep: 'sweep 2.6s linear infinite',
      },
    },
  },
  plugins: [],
};
