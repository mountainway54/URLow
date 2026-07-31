// @vitest-environment happy-dom

import { flushPromises, mount, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeShortUrlApiError,
  ShortUrlApiError,
  useShortUrlApi,
} from '../../app/composables/useShortUrlApi'
import CreateShortLinkForm from '../../app/components/CreateShortLinkForm.vue'
import EditShortLinkForm from '../../app/components/EditShortLinkForm.vue'
import EnabledToggle from '../../app/components/EnabledToggle.vue'
import HomePage from '../../app/pages/index.vue'

const fetchMock = vi.fn()

describe('short URL API client', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('$fetch', fetchMock)
  })

  it('uses the creation contract and returns unwrapped data', async () => {
    const data = {
      code: 'aB3xY8qP',
      originalUrl: 'https://example.com/article',
      shortUrl: 'https://urlow.example/aB3xY8qP',
      note: 'article',
      enabled: true,
      hasManagementPassword: true,
    }
    fetchMock.mockResolvedValue({ data })

    await expect(useShortUrlApi().createShortUrl({
      originalUrl: data.originalUrl,
      managementPassword: 'secret12',
      note: data.note,
    })).resolves.toEqual(data)
    expect(fetchMock).toHaveBeenCalledWith('/api/short-urls', {
      method: 'POST',
      body: {
        originalUrl: data.originalUrl,
        managementPassword: 'secret12',
        note: data.note,
      },
    })
  })

  it('places the management password only in management request headers', async () => {
    fetchMock.mockResolvedValue({ data: {} })
    const api = useShortUrlApi()

    await api.getManagedShortUrl('aB3xY8qP', 'secret12')
    await api.updateShortUrl('aB3xY8qP', 'secret12', {
      originalUrl: 'https://example.com/new',
      note: null,
      enabled: false,
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/short-urls/aB3xY8qP/management',
      {
        method: 'GET',
        headers: { 'X-Management-Password': 'secret12' },
      },
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/short-urls/aB3xY8qP',
      {
        method: 'PATCH',
        headers: { 'X-Management-Password': 'secret12' },
        body: {
          originalUrl: 'https://example.com/new',
          note: null,
          enabled: false,
        },
      },
    )
    expect(fetchMock.mock.calls[1]?.[1]?.body).not.toHaveProperty('managementPassword')
  })

  it('normalizes stable API errors without exposing raw messages', () => {
    const normalized = normalizeShortUrlApiError({
      response: {
        status: 400,
        data: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'raw server message',
            issues: [{ path: 'originalUrl', message: 'raw issue' }],
          },
        },
      },
    })

    expect(normalized).toBeInstanceOf(ShortUrlApiError)
    expect(normalized).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      issues: [{ path: 'originalUrl', message: 'raw issue' }],
      message: 'Short URL API request failed',
    })
    expect(normalized.message).not.toContain('raw server message')
  })

  it('normalizes malformed and transport failures to UNKNOWN_ERROR', () => {
    expect(normalizeShortUrlApiError(new Error('connection string leaked')))
      .toMatchObject({
        code: 'UNKNOWN_ERROR',
        issues: [],
        message: 'Short URL API request failed',
      })
  })
})

describe('real API short URL creation', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('$fetch', fetchMock)
  })

  it('prevents duplicate submits and clears only the password after success', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined
    fetchMock.mockReturnValue(new Promise(resolve => {
      resolveRequest = resolve
    }))
    const wrapper = mount(CreateShortLinkForm, {
      global: {
        stubs: {
          ShortLinkResult: {
            props: ['shortUrl'],
            template: '<div data-test="short-link-result">{{ shortUrl }}</div>',
          },
        },
      },
    })

    await wrapper.get('#create-original-url').setValue('https://example.com/article')
    await wrapper.get('#create-password').setValue('secret12')
    await wrapper.get('#create-note').setValue('article')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(wrapper.get('.create-submit').text()).toContain('建立中…')
    expect(wrapper.get('#create-original-url').attributes('disabled')).toBeDefined()

    resolveRequest?.({
      data: {
        code: 'aB3xY8qP',
        originalUrl: 'https://example.com/article',
        shortUrl: 'https://urlow.example/aB3xY8qP',
        note: 'article',
        enabled: true,
        hasManagementPassword: true,
      },
    })
    await flushPromises()

    expect(wrapper.get('#create-original-url').element).toHaveProperty(
      'value',
      'https://example.com/article',
    )
    expect(wrapper.get('#create-note').element).toHaveProperty('value', 'article')
    expect(wrapper.get('#create-password').element).toHaveProperty('value', '')
    expect(wrapper.get('[data-test="short-link-result"]').text())
      .toBe('https://urlow.example/aB3xY8qP')
  })

  it('shows the irreversible no-password hint without a confirmation dialog', () => {
    const confirm = vi.fn()
    vi.stubGlobal('confirm', confirm)
    const wrapper = mount(CreateShortLinkForm, {
      global: {
        stubs: {
          ShortLinkResult: true,
        },
      },
    })

    expect(wrapper.text()).toContain('未設定管理密碼，建立後將無法修改此短網址')
    expect(confirm).not.toHaveBeenCalled()
  })

  it('maps creation validation issues to their fields without raw messages', async () => {
    fetchMock.mockRejectedValue({
      response: {
        status: 400,
        data: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'raw validation envelope',
            issues: [
              { path: 'originalUrl', message: 'raw url issue' },
              { path: 'managementPassword', message: 'raw password issue' },
              { path: 'note', message: 'raw note issue' },
              { path: 'unknown', message: 'raw unknown issue' },
            ],
          },
        },
      },
    })
    const wrapper = mount(CreateShortLinkForm, {
      global: {
        stubs: {
          ShortLinkResult: true,
        },
      },
    })
    await wrapper.get('#create-original-url').setValue('https://example.com')
    await wrapper.get('#create-password').setValue('secret12')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('#create-original-url-error').text())
      .toBe('請輸入有效的 HTTP(S) 長網址')
    expect(wrapper.get('#create-password-error').text())
      .toBe('管理密碼須為 6 至 72 個字元')
    expect(wrapper.get('#create-note-error').text()).toBe('備註不可超過 240 個字元')
    expect(wrapper.text()).toContain('送出的資料格式無效，請檢查後再試')
    expect(wrapper.text()).not.toContain('raw')
    expect(wrapper.find('[data-test="short-link-result"]').exists()).toBe(false)
  })
})

const managedData = {
  code: 'aB3xY8qP',
  originalUrl: 'https://example.com/article',
  shortUrl: 'https://urlow.example/aB3xY8qP',
  note: 'article',
  enabled: true,
  hasManagementPassword: true,
  createdAt: '2026-07-31T00:00:00.000Z',
  updatedAt: '2026-07-31T00:01:00.000Z',
}

function mountEditForm() {
  return mount(EditShortLinkForm, {
    global: {
      components: {
        EnabledToggle,
      },
    },
  })
}

describe('real API protected management lookup', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('$fetch', fetchMock)
  })

  it.each([
    'aB3xY8qP',
    'https://urlow.example/aB3xY8qP',
  ])('looks up management data from %s', async (input) => {
    fetchMock.mockResolvedValue({ data: managedData })
    const wrapper = mountEditForm()

    await wrapper.get('#lookup-short-url').setValue(input)
    await wrapper.get('#lookup-password').setValue('secret12')
    await wrapper.get('.lookup-form').trigger('submit')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/short-urls/aB3xY8qP/management',
      {
        method: 'GET',
        headers: { 'X-Management-Password': 'secret12' },
      },
    )
    expect(wrapper.get('#edit-original-url').element)
      .toHaveProperty('value', managedData.originalUrl)
    expect(wrapper.get('#edit-note').element).toHaveProperty('value', managedData.note)
  })

  it('rejects invalid input without issuing an API request', async () => {
    const wrapper = mountEditForm()

    await wrapper.get('#lookup-short-url').setValue('not-a-short-code')
    await wrapper.get('.lookup-form').trigger('submit')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(wrapper.get('#lookup-short-url-error').text())
      .toBe('請輸入有效的 8 碼短碼或完整短網址')
    expect(wrapper.find('#edit-original-url').exists()).toBe(false)
  })

  it('prevents duplicate management lookups while pending', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined
    fetchMock.mockReturnValue(new Promise(resolve => {
      resolveRequest = resolve
    }))
    const wrapper = mountEditForm()

    await wrapper.get('#lookup-short-url').setValue('aB3xY8qP')
    await wrapper.get('#lookup-password').setValue('secret12')
    await wrapper.get('.lookup-form').trigger('submit')
    await wrapper.get('.lookup-form').trigger('submit')

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(wrapper.get('.lookup-submit').text()).toBe('查詢中…')
    expect(wrapper.get('#lookup-short-url').attributes('disabled')).toBeDefined()

    resolveRequest?.({ data: managedData })
    await flushPromises()
    expect(wrapper.get('#edit-original-url').exists()).toBe(true)
  })

  it.each([
    ['MANAGEMENT_UNAUTHORIZED', '管理密碼不正確'],
    ['MANAGEMENT_FORBIDDEN', '此短網址未設定管理密碼，無法管理'],
    ['SHORT_URL_NOT_FOUND', '找不到此短網址'],
    ['MANAGEMENT_RATE_LIMITED', '嘗試次數過多，請稍後再試'],
    ['MANAGEMENT_UNAVAILABLE', '管理服務暫時無法使用，請稍後再試'],
    ['INTERNAL_ERROR', '管理服務發生錯誤，請稍後再試'],
  ])('maps %s to a precise Traditional Chinese message', async (code, expected) => {
    fetchMock.mockRejectedValue({
      response: {
        status: 400,
        data: {
          error: {
            code,
            message: 'raw management error',
          },
        },
      },
    })
    const wrapper = mountEditForm()
    await wrapper.get('#lookup-short-url').setValue('aB3xY8qP')
    await wrapper.get('#lookup-password').setValue('secret12')
    await wrapper.get('.lookup-form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain(expected)
    expect(wrapper.text()).not.toContain('raw management error')
    expect(wrapper.find('#edit-original-url').exists()).toBe(false)
  })

  it('hides malformed transport details behind a generic message', async () => {
    fetchMock.mockRejectedValue(new Error('postgres://secret@host/database'))
    const wrapper = mountEditForm()
    await wrapper.get('#lookup-short-url').setValue('aB3xY8qP')
    await wrapper.get('.lookup-form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('目前無法連線至管理服務，請稍後再試')
    expect(wrapper.text()).not.toContain('postgres://')
  })
})

async function authorizeEditForm() {
  fetchMock.mockResolvedValueOnce({ data: managedData })
  const wrapper = mountEditForm()
  await wrapper.get('#lookup-short-url').setValue('aB3xY8qP')
  await wrapper.get('#lookup-password').setValue('secret12')
  await wrapper.get('.lookup-form').trigger('submit')
  await flushPromises()
  return wrapper
}

describe('optimistic real API management update', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('$fetch', fetchMock)
  })

  it('keeps optimistic values pending, prevents overlap, and adopts the response', async () => {
    const wrapper = await authorizeEditForm()
    let resolveUpdate: ((value: unknown) => void) | undefined
    fetchMock.mockReturnValueOnce(new Promise(resolve => {
      resolveUpdate = resolve
    }))

    await wrapper.get('#edit-original-url').setValue('https://example.com/new')
    await wrapper.get('#edit-note').setValue(' new note ')
    await wrapper.get('#edit-enabled').setValue(false)
    await wrapper.get('.management-edit-form').trigger('submit')
    await wrapper.get('.management-edit-form').trigger('submit')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/short-urls/aB3xY8qP', {
      method: 'PATCH',
      headers: { 'X-Management-Password': 'secret12' },
      body: {
        originalUrl: 'https://example.com/new',
        note: 'new note',
        enabled: false,
      },
    })
    expect(wrapper.get('#edit-original-url').element)
      .toHaveProperty('value', 'https://example.com/new')
    expect(wrapper.get('.management-edit-form button[type="submit"]').text())
      .toBe('儲存中…')
    expect(wrapper.find('#edit-password').exists()).toBe(false)

    resolveUpdate?.({
      data: {
        ...managedData,
        originalUrl: 'https://example.com/canonical',
        note: 'new note',
        enabled: false,
        updatedAt: '2026-07-31T00:02:00.000Z',
        cacheSynchronized: true,
        staleWindowWarning: 'raw server warning',
      },
    })
    await flushPromises()

    expect(wrapper.get('#edit-original-url').element)
      .toHaveProperty('value', 'https://example.com/canonical')
    expect(wrapper.text()).toContain('設定已儲存')
    expect(wrapper.text()).not.toContain('raw server warning')
    expect(wrapper.text())
      .not.toContain('設定已儲存，跨區同步可能需要一些時間才會完全生效。')
  })

  it('restores the complete confirmed snapshot when PATCH fails', async () => {
    const wrapper = await authorizeEditForm()
    fetchMock.mockRejectedValueOnce({
      response: {
        status: 503,
        data: {
          error: {
            code: 'MANAGEMENT_UNAVAILABLE',
            message: 'raw unavailable',
          },
        },
      },
    })

    await wrapper.get('#edit-original-url').setValue('https://example.com/new')
    await wrapper.get('#edit-note').setValue('changed')
    await wrapper.get('#edit-enabled').setValue(false)
    await wrapper.get('.management-edit-form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('#edit-original-url').element)
      .toHaveProperty('value', managedData.originalUrl)
    expect(wrapper.get('#edit-note').element).toHaveProperty('value', managedData.note)
    expect((wrapper.get('#edit-enabled').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.text()).toContain('管理服務暫時無法使用，請稍後再試')
    expect(wrapper.text()).not.toContain('raw unavailable')
  })

  it('shows the fixed cross-region warning only when cache synchronization fails', async () => {
    const wrapper = await authorizeEditForm()
    fetchMock.mockResolvedValueOnce({
      data: {
        ...managedData,
        cacheSynchronized: false,
        staleWindowWarning: 'Other regions may observe raw stale data.',
      },
    })

    await wrapper.get('#edit-note').setValue('updated')
    await wrapper.get('.management-edit-form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('設定已儲存')
    expect(wrapper.text())
      .toContain('設定已儲存，跨區同步可能需要一些時間才會完全生效。')
    expect(wrapper.text()).not.toContain('Other regions')
  })
})

describe('compact accessible management layout', () => {
  it('uses equivalent label and control tracks for URL and enabled state', async () => {
    fetchMock.mockReset()
    vi.stubGlobal('$fetch', fetchMock)
    const wrapper = await authorizeEditForm()

    expect(wrapper.get('.management-primary-fields').classes()).toContain('grid')
    expect(wrapper.get('.enabled-toggle-heading').text()).toBe('啟用狀態')
    expect(wrapper.get('.enabled-toggle-control').exists()).toBe(true)
    expect(wrapper.get('#edit-enabled').attributes('type')).toBe('checkbox')
  })
})

describe('homepage mock data removal', () => {
  it('renders the real creation workflow without local demo state', () => {
    const wrapper = shallowMount(HomePage, {
      global: {
        stubs: {
          UrlowBrandTitle: { template: '<div data-test="brand" />' },
          WorkflowTabs: { template: '<div data-test="tabs" />' },
          CreateShortLinkForm: { template: '<div data-test="create-form" />' },
          EditShortLinkForm: { template: '<div data-test="edit-form" />' },
        },
      },
    })

    expect(wrapper.find('[data-test="create-form"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="edit-form"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('本機展示資料')
    expect(wrapper.html()).not.toContain('demo-')
  })
})
