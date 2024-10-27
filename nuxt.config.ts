// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-10-22',
  devtools: { enabled: false },

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

  css: [
    '~/assets/css/main.css',
    // ... other global CSS files
  ],

  buildModules: [
    '@nuxtjs/tailwindcss',
    // ... other build modules
  ],
  // Add the app configuration here
  app: {
    head: {
      title: 'HN42 - your favorite Hacker News reader',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'theme-color', content: '#ffffff' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        // Apple Touch Icons
        { rel: 'apple-touch-icon', href: '/icon_x192.png' },
        { rel: 'apple-touch-icon', sizes: '57x57', href: '/icon_x57.png' },
        { rel: 'apple-touch-icon', sizes: '72x72', href: '/icon_x72.png' },
        { rel: 'apple-touch-icon', sizes: '76x76', href: '/icon_x76.png' },
        { rel: 'apple-touch-icon', sizes: '114x114', href: '/icon_x114.png' },
        { rel: 'apple-touch-icon', sizes: '120x120', href: '/icon_x120.png' },
        { rel: 'apple-touch-icon', sizes: '144x144', href: '/icon_x144.png' },
        { rel: 'apple-touch-icon', sizes: '152x152', href: '/icon_x152.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/icon_x180.png' },
        // Android Icons
        { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/icon_x192.png' },
        { rel: 'icon', type: 'image/png', sizes: '512x512', href: '/icon_x512.png' },
        // Favicon
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      ],
    }
  },
  tailwindcss: {
    config: {
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
          backgroundImage: {
            'radial-gradient-custom': 'radial-gradient(circle at center, var(--gradient-from) 0%, var(--gradient-to) 100%)',
          },
          // ... other extensions if needed
        },
      },
      safelist: [
        {
          pattern: /(from|to|bg|text|border)-(red|rose|pink|fuchsia|purple|violet|indigo|blue|sky|cyan|teal|emerald|green|lime|yellow|amber|orange)-(50|100|800|900)/,
          variants: ['hover', 'dark'],
        },
      ],
    },
  },

  colorMode: {
    classSuffix: '',
    preference: 'system', // Uses system preference
    fallback: 'light', // Fallback theme
    storageKey: 'nuxt-color-mode', // Ensure consistent storage key
    storage: 'localStorage', // Persist user preference
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
          format:"webp",
          fit: 'scale-down'
        }
      },      
      thumbnail: {
        modifiers: {
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
