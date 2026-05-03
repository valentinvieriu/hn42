// https://nuxt.com/docs/api/configuration/nuxt-config
import { defineNuxtConfig } from 'nuxt/config'

const jsquashWasmModuleIds = new Set([
  '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm?module',
  '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?module',
  '@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm?module',
])
const jsquashWasmDevStubId = '\0hn42-jsquash-wasm-dev-stub'

export default defineNuxtConfig({
  compatibilityDate: '2025-09-15',
  devtools: { enabled: false },
  runtimeConfig: {
    screenshotFetchConcurrency: '1',
    screenshotFailureTtlMinutes: '360',
    screenshotPolicyBlockedHosts: '',
    screenshotPolicyHeadProbeTimeoutMs: '1200',
    screenshotR2TtlDays: '30',
    screenshotThumbnailHeight: '1440',
    screenshotThumbnailJpegQuality: '78',
    screenshotThumbnailMaxInputBytes: '6000000',
    screenshotThumbnailMaxInputPixels: '8000000',
    screenshotThumbnailProcessingConcurrency: '1',
    screenshotThumbnailProcessingQueueTimeoutMs: '15000',
    screenshotThumbnailProcessingTimeoutMs: '5000',
    screenshotThumbnailWidth: '720',
    screenshotXCancelBaseUrl: 'https://xcancel.com',
    public: {
      screenshotImageQueueConcurrency: '1',
    },
  },
  nitro: {
    preset: "cloudflare-module",
    cloudflare: {
      nodeCompat: true,
    },
    experimental: {
      wasm: true,
    },
    wasm: {
      esmImport: true,
      lazy: false,
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
      Inter: {
        wght: [100, 200, 300, 400, 500, 600, 700, 800, 900],
        ital: [400, 500, 600, 700],
      },
      Sora: {
        wght: [400, 500, 600, 700],
      },
    },
    display: 'swap',
    prefetch: true,
    preconnect: true,
    preload: true,
  },
  components: [
    {
      path: '~/components',
      pathPrefix: false,
    },
  ],
  css: [
    '~/assets/css/main.css',
    // ... other global CSS files
  ],
  app: {
    head: {
      title: 'HN42 - your favorite Hacker News reader',
      meta: [
        // Update viewport meta to support iOS safe areas and PWA
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        // Update status bar style for iOS
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        // Add theme-color with media queries for light/dark modes
        { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#1a1a1a', media: '(prefers-color-scheme: dark)' },
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
    configPath: 'tailwind.config',
    exposeConfig: true,
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

  // Add build optimizations
  build: {
    transpile: ['vue-router'],
  },
  routeRules: {
    '/': { redirect: '/top' },
  },
  vite: {
    plugins: [
      {
        name: 'hn42-jsquash-wasm-dev-stub',
        enforce: 'pre',
        apply: 'serve',
        resolveId(id) {
          return jsquashWasmModuleIds.has(id) ? jsquashWasmDevStubId : null
        },
        load(id) {
          return id === jsquashWasmDevStubId
            ? 'export default undefined'
            : null
        },
      },
    ],
    optimizeDeps: {
      include: [
        '@lucide/vue',
      ],
    },
  },
})
