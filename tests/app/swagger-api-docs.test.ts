// @vitest-environment happy-dom

import { flushPromises, mount, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  swaggerUIBundle: vi.fn(),
}))

vi.mock('swagger-ui-dist/swagger-ui-es-bundle.js', () => ({
  default: mocks.swaggerUIBundle,
}))

import SwaggerApiDocs from '../../app/components/SwaggerApiDocs.vue'
import HomePage from '../../app/pages/index.vue'

describe('Swagger API docs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('useHead', vi.fn())
  })

  it('initializes bundled Swagger UI with the public specification and Try it out', async () => {
    const wrapper = mount(SwaggerApiDocs)
    await flushPromises()

    expect(mocks.swaggerUIBundle).toHaveBeenCalledOnce()
    expect(mocks.swaggerUIBundle).toHaveBeenCalledWith({
      domNode: wrapper.element,
      url: '/api/openapi.json',
      deepLinking: true,
      tryItOutEnabled: true,
      persistAuthorization: true,
      displayRequestDuration: true,
    })
  })

  it('keeps the existing home page independent from Swagger UI', () => {
    const wrapper = shallowMount(HomePage)

    expect(wrapper.find('.page-shell').exists()).toBe(true)
    expect(mocks.swaggerUIBundle).not.toHaveBeenCalled()
  })
})
