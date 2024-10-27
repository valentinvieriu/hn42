import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: [
    './components/**/*.{vue,js,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './composables/**/*.{js,ts}',
    './plugins/**/*.{js,ts}',
    './app.vue',
  ],
  theme: {
    extend: {
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
  safelist: [
    {
      pattern: /(from|to|bg|text|border)-(red|rose|pink|fuchsia|purple|violet|indigo|blue|sky|cyan|teal|emerald|green|lime|yellow|amber|orange)-(50|100|800|900)/,
      variants: ['hover', 'dark'],
    },
  ],
} satisfies Config
