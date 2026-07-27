export interface MockLink {
  code: string
  shortUrl: string
  originalUrl: string
  password: string
  note: string
  enabled: boolean
}

export const mockLinks: readonly MockLink[] = [
  {
    code: 'nuxt-guide',
    shortUrl: 'https://urlow.io/nuxt-guide',
    originalUrl: 'https://nuxt.com/docs/getting-started/introduction',
    password: 'demo123',
    note: 'Nuxt 入門文件',
    enabled: true,
  },
  {
    code: 'design-notes',
    shortUrl: 'https://urlow.io/design-notes',
    originalUrl: 'https://developer.apple.com/design/human-interface-guidelines/',
    password: 'glass',
    note: '介面設計參考',
    enabled: false,
  },
]
