import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  nitro: {
    preset: 'cloudflare_module',
    alias: {
      'pg-native': fileURLToPath(new URL('./server/shims/pg-native.ts', import.meta.url)),
    },
    rollupConfig: {
      external: ['cloudflare:sockets'],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  app: {
    head: {
      title: 'URLow'
    }
  }
})
