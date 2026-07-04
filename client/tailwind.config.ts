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
          DEFAULT: '#000000', // Black background
          dark: '#000000',
          light: '#1a1a1a', // Dark gray for borders
          50: '#a3a3a3', // Lighter gray for text
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
