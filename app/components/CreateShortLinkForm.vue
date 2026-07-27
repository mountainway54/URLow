<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import type { MockLink } from '~/data/mockLinks'

const props = defineProps<{
  links: readonly MockLink[]
}>()

const emit = defineEmits<{
  created: [link: MockLink]
}>()

const originalUrl = ref('')
const password = ref('')
const note = ref('')
const showPassword = ref(false)
const error = ref('')
const createdShortUrl = ref('')
const copyFeedback = ref('')

let feedbackTimer: ReturnType<typeof setTimeout> | undefined

function nextDemoCode() {
  let index = props.links.length + 1
  let code = `demo-${index}`

  while (props.links.some(link => link.code === code)) {
    index += 1
    code = `demo-${index}`
  }

  return code
}

function createShortLink() {
  const normalizedUrl = originalUrl.value.trim()
  error.value = ''
  createdShortUrl.value = ''

  if (!normalizedUrl) {
    error.value = '請輸入長網址'
    return
  }

  const code = nextDemoCode()
  const link: MockLink = {
    code,
    shortUrl: `https://urlow.io/${code}`,
    originalUrl: normalizedUrl,
    password: password.value,
    note: note.value.trim(),
    enabled: true,
  }

  emit('created', link)
  createdShortUrl.value = link.shortUrl
}

async function copyShortUrl() {
  if (!createdShortUrl.value || !navigator.clipboard) return

  try {
    await navigator.clipboard.writeText(createdShortUrl.value)
    copyFeedback.value = '已複製'
    if (feedbackTimer) clearTimeout(feedbackTimer)
    feedbackTimer = setTimeout(() => {
      copyFeedback.value = ''
    }, 1800)
  }
  catch {
    copyFeedback.value = ''
  }
}

onBeforeUnmount(() => {
  if (feedbackTimer) clearTimeout(feedbackTimer)
})
</script>

<template>
  <form
    id="create-panel"
    class="workflow-panel"
    role="tabpanel"
    aria-labelledby="create-tab"
    @submit.prevent="createShortLink"
  >
    <div class="field">
      <label for="create-original-url">長網址</label>
      <div class="input-shell">
        <span class="field-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M10.6 13.4a4.5 4.5 0 0 0 6.36.1l2.12-2.12a4.5 4.5 0 0 0-6.36-6.36L11.5 6.24" />
            <path d="M13.4 10.6a4.5 4.5 0 0 0-6.36-.1L4.92 12.62a4.5 4.5 0 0 0 6.36 6.36l1.22-1.22" />
          </svg>
        </span>
        <input
          id="create-original-url"
          v-model="originalUrl"
          type="url"
          inputmode="url"
          autocomplete="url"
          placeholder="https://example.com/your-long-link"
          :aria-invalid="error ? 'true' : undefined"
          aria-describedby="create-error"
          @input="error = ''"
        >
      </div>
      <p id="create-error" class="form-message error-message" aria-live="polite">
        {{ error }}
      </p>
    </div>

    <div class="field">
      <label for="create-password">密碼設定</label>
      <div class="input-shell">
        <span class="field-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <rect x="5" y="10" width="14" height="10" rx="3" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </span>
        <input
          id="create-password"
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="new-password"
          placeholder="設定存取密碼（選填）"
        >
        <button
          class="icon-button"
          type="button"
          :aria-label="showPassword ? '隱藏建立密碼' : '顯示建立密碼'"
          :aria-pressed="showPassword"
          @click="showPassword = !showPassword"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
            <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>
        </button>
      </div>
    </div>

    <div class="field">
      <div class="label-row">
        <label for="create-note">備註說明</label>
        <span>選填</span>
      </div>
      <textarea
        id="create-note"
        v-model="note"
        rows="3"
        maxlength="240"
        placeholder="記下這個連結的用途或內容"
      />
    </div>

    <div class="grid grid-cols-[auto_minmax(0,1fr)] items-stretch gap-3 max-[700px]:grid-cols-1">
      <button class="primary-button w-[184px] px-[18px] max-[700px]:w-full" type="submit">
        產生短網址
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <path d="M5 12h14" />
          <path d="m14 7 5 5-5 5" />
        </svg>
      </button>
      <ShortLinkResult
        v-if="createdShortUrl"
        :short-url="createdShortUrl"
        :copy-feedback="copyFeedback"
        @copy="copyShortUrl"
      />
    </div>
  </form>
</template>
