import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

export default {
  darkMode: 'class',
  content: [
    './app/**/*.{vue,js,ts}',
    './shared/**/*.{js,ts}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
        display: ['Sora', 'Inter', ...defaultTheme.fontFamily.sans],
        reading: ['Inter', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        'light-gray': '#F0F0F0',
        'natural-wood': '#DEB887',
        'dark-bg': '#1a1a1a',
        'dark-card': '#2a2a2a',
        'gray-800': '#1F2937',
        'gray-900': '#1a202c',
        'gray-700': '#4a5568',
        'gray-600': '#718096',
        'gray-300': '#d2d6dc',
        'gray-200': '#e2e8f0',
        'green-400': '#4ade80',
        'red-400': '#f87171',
        'orange-500': '#f97316',
        'orange-600': '#ea580c',
      },
      backgroundImage: {
        'radial-gradient-custom': 'radial-gradient(circle at center, var(--gradient-from) 0%, var(--gradient-to) 100%)',
      },
    },
  },
} satisfies Config
