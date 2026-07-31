<script setup lang="ts">
import 'swagger-ui-dist/swagger-ui.css'
import { onMounted, ref } from 'vue'

const swaggerRoot = ref<HTMLElement | null>(null)

useHead({
  title: 'URLow API 文件',
})

onMounted(async () => {
  if (!swaggerRoot.value) return

  const { default: SwaggerUIBundle } = await import(
    'swagger-ui-dist/swagger-ui-es-bundle.js'
  )

  SwaggerUIBundle({
    domNode: swaggerRoot.value,
    url: '/api/openapi.json',
    deepLinking: true,
    tryItOutEnabled: true,
    persistAuthorization: true,
    displayRequestDuration: true,
  })
})
</script>

<template>
  <div ref="swaggerRoot" />
</template>
