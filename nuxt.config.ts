// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-10-22',
  devtools: { enabled: true },

  nitro: {
    preset: "./cloudflare-preset",
    cloudflare: {
      workerFormat: 'esm',
    },
  },

  modules: [
    "nitro-cloudflare-dev",
    "@nuxtjs/tailwindcss",
    "@nuxtjs/google-fonts",
    '@nuxtjs/color-mode',
    'nuxt-lucide-icons',
    '@nuxt/image'
  ],
  googleFonts: {
    families: {
      Inter: [400, 600, 700],
    },
  },

  css: ['~/assets/css/main.css'],

  tailwindcss: {
    config: {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            beige: '#F5F5DC',
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
        },
      },
      content: [
        './pages/**/*.{vue,js,ts,jsx,tsx}',
        './components/**/*.{vue,js,ts,jsx,tsx}',
        './layouts/**/*.{vue,js,ts,jsx,tsx}',
        './composables/**/*.{js,ts}',
        './plugins/**/*.{js,ts}',
        './app.vue',
      ],
    },
  },

  colorMode: {
    classSuffix: '',
    preference: 'system', // Uses system preference
    fallback: 'light', // Fallback theme
  },
  image: {
    format: ['webp'],
    screens: {
      'xs': 320,
      'sm': 640,
      'md': 768,
      'lg': 1024,
      'xl': 1280,
      'xxl': 1536,
      '2xl': 1536
    },
    domains: ['backup15.terasp.net'],
    cloudflare: {
      baseURL: 'https://hn42.net/'
    },
    presets: {
      detail: {
        modifiers: {
          // fit=scale-down,width=400,trim.height=2060,sharpen=2,format=webp
          format:"webp",
          fit: 'scale-down'
        }
      },      
      thumbnail: {
        modifiers: {
          // fit=scale-down,width=400,trim.height=2060,sharpen=2,format=webp
          format:"webp",
          sharpen: 2,
          fit: 'scale-down',
          'trim.height': 2060
        }
      }
    }   
  },
  // Enable SSR
  ssr: true,

  // Optimize for performance
  experimental: {
    payloadExtraction: true,
    renderJsonPayloads: true,
  },

  // Add build optimizations
  build: {
    transpile: ['vue-router'],
  },
  routeRules: {
    '/': { redirect: '/top' }
  }
})