<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { ShortUrlApiError, useShortUrlApi } from '~/composables/useShortUrlApi'

const originalUrl = ref('')
const password = ref('')
const note = ref('')
const showPassword = ref(false)
const originalUrlError = ref('')
const passwordError = ref('')
const noteError = ref('')
const formError = ref('')
const createdShortUrl = ref('')
const copyFeedback = ref('')
const isCreating = ref(false)
const { createShortUrl } = useShortUrlApi()

let feedbackTimer: ReturnType<typeof setTimeout> | undefined

function clearErrors() {
  originalUrlError.value = ''
  passwordError.value = ''
  noteError.value = ''
  formError.value = ''
}

function creationErrorMessage(error: ShortUrlApiError) {
  switch (error.code) {
    case 'SHORT_CODE_GENERATION_FAILED':
      return '目前無法配置短網址，請稍後再試'
    case 'DATABASE_UNAVAILABLE':
      return '短網址服務暫時無法使用，請稍後再試'
    case 'INTERNAL_ERROR':
      return '建立短網址時發生錯誤，請稍後再試'
    default:
      return '目前無法連線至短網址服務，請稍後再試'
  }
}

function applyValidationIssues(error: ShortUrlApiError) {
  for (const issue of error.issues) {
    if (issue.path === 'originalUrl') {
      originalUrlError.value = '請輸入有效的 HTTP(S) 長網址'
    }
    else if (issue.path === 'managementPassword') {
      passwordError.value = '管理密碼須為 6 至 72 個字元'
    }
    else if (issue.path === 'note') {
      noteError.value = '備註不可超過 240 個字元'
    }
    else {
      formError.value = '送出的資料格式無效，請檢查後再試'
    }
  }
}

async function createShortLink() {
  if (isCreating.value) return

  const normalizedUrl = originalUrl.value.trim()
  clearErrors()
  createdShortUrl.value = ''

  if (!normalizedUrl) {
    originalUrlError.value = '請輸入長網址'
    return
  }

  const normalizedPassword = password.value.trim()
  isCreating.value = true

  try {
    const created = await createShortUrl({
      originalUrl: normalizedUrl,
      ...(normalizedPassword ? { managementPassword: normalizedPassword } : {}),
      note: note.value.trim() || null,
    })
    createdShortUrl.value = created.shortUrl
    password.value = ''
  }
  catch (error) {
    const apiError = error instanceof ShortUrlApiError
      ? error
      : new ShortUrlApiError({ code: 'UNKNOWN_ERROR' })

    if (apiError.code === 'VALIDATION_ERROR') {
      applyValidationIssues(apiError)
    }
    else {
      formError.value = creationErrorMessage(apiError)
    }
  }
  finally {
    isCreating.value = false
  }
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
          :disabled="isCreating"
          :aria-invalid="originalUrlError ? 'true' : undefined"
          aria-describedby="create-original-url-error"
          @input="originalUrlError = ''"
        >
      </div>
      <p id="create-original-url-error" class="form-message error-message" aria-live="polite">
        {{ originalUrlError }}
      </p>
    </div>

    <div class="field">
      <label for="create-password">管理密碼</label>
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
          placeholder="設定管理密碼（選填）"
          :disabled="isCreating"
          :aria-invalid="passwordError ? 'true' : undefined"
          aria-describedby="create-password-hint create-password-error"
          @input="passwordError = ''"
        >
        <button
          class="icon-button"
          type="button"
          :disabled="isCreating"
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
      <p
        id="create-password-hint"
        class="form-message"
        :class="{ 'error-message': !password.trim() }"
      >
        未設定管理密碼，建立後將無法修改此短網址
      </p>
      <p id="create-password-error" class="form-message error-message" aria-live="polite">
        {{ passwordError }}
      </p>
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
        :disabled="isCreating"
        :aria-invalid="noteError ? 'true' : undefined"
        aria-describedby="create-note-error"
        @input="noteError = ''"
      />
      <p id="create-note-error" class="form-message error-message" aria-live="polite">
        {{ noteError }}
      </p>
    </div>

    <p class="form-message error-message" aria-live="polite">
      {{ formError }}
    </p>

    <div class="grid grid-cols-[auto_minmax(0,1fr)] items-stretch gap-3 max-[700px]:grid-cols-1">
      <button
        class="primary-button create-submit w-[184px] px-[18px] max-[700px]:w-full"
        type="submit"
        :disabled="isCreating"
      >
        {{ isCreating ? '建立中…' : '產生短網址' }}
        <svg v-if="!isCreating" aria-hidden="true" viewBox="0 0 24 24" fill="none">
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
