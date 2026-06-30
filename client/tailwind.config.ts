import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        iitbhu: {
          DEFAULT: '#8B1A1A',
          dark: '#6B1212',
          light: '#A52525',
          50: '#FDF2F2',
          100: '#F9D5D5',
        },
        forest: {
          DEFAULT: '#1a3c2e',
          dark: '#0f2a1e',
          light: '#2a5040',
          50: '#f0f7f4',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
