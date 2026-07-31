// @vitest-environment happy-dom

import { shallowMount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ApiDocsPage from '../../app/pages/api-docs.vue'

describe('/api-docs page route', () => {
  it('renders the client-only Swagger documentation component', () => {
    const wrapper = shallowMount(ApiDocsPage, {
      global: {
        stubs: {
          SwaggerApiDocs: { template: '<div data-test="swagger-docs" />' },
        },
      },
    })

    expect(wrapper.find('[data-test="swagger-docs"]').exists()).toBe(true)
  })
})
