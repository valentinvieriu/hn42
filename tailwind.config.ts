import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

export default {
  darkMode: 'class',
  content: ['./app/**/*.{vue,js,ts}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
        display: ['Sora', 'Inter', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        'natural-wood': '#DEB887',
        'gray-900': '#1a202c',
        'gray-700': '#4a5568',
        'gray-600': '#718096',
        'gray-300': '#d2d6dc',
        'gray-200': '#e2e8f0',
      },
    },
  },
} satisfies Config
