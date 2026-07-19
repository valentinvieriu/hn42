// https://nuxt.com/docs/api/configuration/nuxt-config
import { defineNuxtConfig } from 'nuxt/config'
import { SCREENSHOT_RETENTION_DAYS } from './shared/utils/screenshot'

export default defineNuxtConfig({
  compatibilityDate: '2026-07-11',
  devtools: { enabled: false },
  features: {
    inlineStyles: true,
  },
  runtimeConfig: {
    screenshotPolicyProbeTimeoutMs: '1200',
    screenshotR2TtlDays: String(SCREENSHOT_RETENTION_DAYS),
    screenshotXCancelBaseUrl: 'https://xcancel.com',
  },
  nitro: {
    preset: "cloudflare-module",
    cloudflare: {
      nodeCompat: true,
    },
  },
  modules: [
    "nitro-cloudflare-dev",
    "@nuxtjs/tailwindcss",
    "@nuxtjs/google-fonts",
    '@nuxtjs/color-mode',
  ],
  googleFonts: {
    families: {
      Inter: {
        wght: [400, 500, 600, 700],
        ital: [400, 600],
      },
      Sora: {
        wght: [400, 500, 600, 700],
      },
    },
    display: 'optional',
    inject: true,
  },
  components: [
    {
      path: '~/components',
      pathPrefix: false,
    },
  ],
  css: [
    '~/assets/css/main.css',
  ],
  tailwindcss: {
    cssPath: '~/assets/css/main.css',
  },
  app: {
    head: {
      title: 'HN42 - your favorite Hacker News reader',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#1a1a1a', media: '(prefers-color-scheme: dark)' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', href: '/icon_x192.png' },
        { rel: 'apple-touch-icon', sizes: '72x72', href: '/icon_x72.png' },
        { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/icon_x192.png' },
        { rel: 'icon', type: 'image/png', sizes: '512x512', href: '/icon_x512.png' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      ],
    }
  },
  colorMode: {
    classSuffix: '',
    preference: 'system', // Uses system preference
    fallback: 'light', // Fallback theme
    storageKey: 'nuxt-color-mode', // Ensure consistent storage key
    storage: 'localStorage', // Persist user preference
  },
  ssr: true,

  build: {
    transpile: ['vue-router'],
  },
  routeRules: {
    '/': { headers: { 'cache-control': 'no-store' } },
    '/best': { headers: { 'cache-control': 'no-store' } },
    '/item/**': { headers: { 'cache-control': 'no-store' } },
    '/new': { headers: { 'cache-control': 'no-store' } },
    '/privacy': { headers: { 'cache-control': 'no-store' } },
    '/show': { headers: { 'cache-control': 'no-store' } },
    '/terms': { headers: { 'cache-control': 'no-store' } },
    '/top': { headers: { 'cache-control': 'no-store' } },
    '/user/**': { headers: { 'cache-control': 'no-store' } },
  },
  vite: {
    optimizeDeps: {
      include: [
        '@lucide/vue',
      ],
    },
  },
})
