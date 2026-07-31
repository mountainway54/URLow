<script setup lang="ts">
import { ref } from 'vue'
import { ShortUrlApiError, useShortUrlApi } from '~/composables/useShortUrlApi'
import type { ManagedShortUrlData } from '~/types/short-url'

interface EditableSnapshot {
  originalUrl: string
  note: string
  enabled: boolean
}

const shortCodePattern = /^[A-Za-z0-9]{8}$/
const crossRegionWarning = '設定已儲存，跨區同步可能需要一些時間才會完全生效。'
const { getManagedShortUrl, updateShortUrl } = useShortUrlApi()

const lookupShortUrl = ref('')
const lookupPassword = ref('')
const showLookupPassword = ref(false)
const lookupShortUrlError = ref('')
const lookupError = ref('')
const isLookingUp = ref(false)
const selectedCode = ref('')
const originalUrl = ref('')
const note = ref('')
const enabled = ref(true)
const lastConfirmed = ref<EditableSnapshot | null>(null)
const originalUrlError = ref('')
const noteError = ref('')
const updateError = ref('')
const updateFeedback = ref('')
const synchronizationWarning = ref('')
const isUpdating = ref(false)

function shortCodeFromInput(value: string) {
  const normalized = value.trim()
  if (shortCodePattern.test(normalized)) return normalized

  try {
    const parsed = new URL(normalized)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''

    const segments = parsed.pathname.split('/').filter(Boolean)
    const code = segments.at(-1) ?? ''
    return shortCodePattern.test(code) ? code : ''
  }
  catch {
    return ''
  }
}

function snapshotFromData(data: ManagedShortUrlData): EditableSnapshot {
  return {
    originalUrl: data.originalUrl,
    note: data.note ?? '',
    enabled: data.enabled,
  }
}

function applySnapshot(snapshot: EditableSnapshot) {
  originalUrl.value = snapshot.originalUrl
  note.value = snapshot.note
  enabled.value = snapshot.enabled
}

function clearSelectedLink() {
  selectedCode.value = ''
  originalUrl.value = ''
  note.value = ''
  enabled.value = true
  lastConfirmed.value = null
  clearUpdateMessages()
}

function clearUpdateMessages() {
  originalUrlError.value = ''
  noteError.value = ''
  updateError.value = ''
  updateFeedback.value = ''
  synchronizationWarning.value = ''
}

function managementErrorMessage(error: ShortUrlApiError) {
  switch (error.code) {
    case 'MANAGEMENT_UNAUTHORIZED':
      return '管理密碼不正確'
    case 'MANAGEMENT_FORBIDDEN':
      return '此短網址未設定管理密碼，無法管理'
    case 'SHORT_URL_NOT_FOUND':
      return '找不到此短網址'
    case 'MANAGEMENT_RATE_LIMITED':
      return '嘗試次數過多，請稍後再試'
    case 'MANAGEMENT_UNAVAILABLE':
    case 'DATABASE_UNAVAILABLE':
      return '管理服務暫時無法使用，請稍後再試'
    case 'INTERNAL_ERROR':
      return '管理服務發生錯誤，請稍後再試'
    default:
      return '目前無法連線至管理服務，請稍後再試'
  }
}

async function lookupShortLink() {
  if (isLookingUp.value) return

  clearSelectedLink()
  lookupShortUrlError.value = ''
  lookupError.value = ''
  const code = shortCodeFromInput(lookupShortUrl.value)

  if (!code) {
    lookupShortUrlError.value = '請輸入有效的 8 碼短碼或完整短網址'
    return
  }

  isLookingUp.value = true
  try {
    const managed = await getManagedShortUrl(code, lookupPassword.value)
    const snapshot = snapshotFromData(managed)
    selectedCode.value = managed.code
    lastConfirmed.value = snapshot
    applySnapshot(snapshot)
  }
  catch (error) {
    const apiError = error instanceof ShortUrlApiError
      ? error
      : new ShortUrlApiError({ code: 'UNKNOWN_ERROR' })
    lookupError.value = managementErrorMessage(apiError)
  }
  finally {
    isLookingUp.value = false
  }
}

function applyUpdateValidation(error: ShortUrlApiError) {
  for (const issue of error.issues) {
    if (issue.path === 'originalUrl') {
      originalUrlError.value = '請輸入有效的 HTTP(S) 長網址'
    }
    else if (issue.path === 'note') {
      noteError.value = '備註不可超過 240 個字元'
    }
    else {
      updateError.value = '送出的資料格式無效，請檢查後再試'
    }
  }
}

async function updateShortLinkSettings() {
  const rollbackSnapshot = lastConfirmed.value
  if (!selectedCode.value || !rollbackSnapshot || isUpdating.value) return

  clearUpdateMessages()
  isUpdating.value = true

  try {
    const updated = await updateShortUrl(
      selectedCode.value,
      lookupPassword.value,
      {
        originalUrl: originalUrl.value.trim(),
        note: note.value.trim() || null,
        enabled: enabled.value,
      },
    )
    const confirmed = snapshotFromData(updated)
    lastConfirmed.value = confirmed
    applySnapshot(confirmed)
    updateFeedback.value = '設定已儲存'
    synchronizationWarning.value = updated.cacheSynchronized
      ? ''
      : crossRegionWarning
  }
  catch (error) {
    applySnapshot(rollbackSnapshot)
    const apiError = error instanceof ShortUrlApiError
      ? error
      : new ShortUrlApiError({ code: 'UNKNOWN_ERROR' })

    if (apiError.code === 'VALIDATION_ERROR') {
      applyUpdateValidation(apiError)
    }
    else {
      updateError.value = managementErrorMessage(apiError)
    }
  }
  finally {
    isUpdating.value = false
  }
}

function resetLookup() {
  lookupShortUrlError.value = ''
  lookupError.value = ''
  clearSelectedLink()
}
</script>

<template>
  <div
    id="edit-panel"
    class="workflow-panel"
    role="tabpanel"
    aria-labelledby="edit-tab"
  >
    <form class="lookup-form grid grid-cols-[minmax(0,1fr)_minmax(0,.82fr)_auto] items-end gap-2.5 max-[700px]:grid-cols-1" @submit.prevent="lookupShortLink">
      <div class="field">
        <div class="label-row">
          <label for="lookup-short-url">短網址或短碼</label>
          <div class="label-row-feedback" aria-live="polite">
            <span v-if="lookupShortUrlError" id="lookup-short-url-error" class="error-message">
              {{ lookupShortUrlError }}
            </span>
            <span v-if="lookupError" id="lookup-form-error" class="error-message">
              {{ lookupError }}
            </span>
          </div>
        </div>
        <div class="input-shell input-shell--mono">
          <input
            id="lookup-short-url"
            v-model="lookupShortUrl"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="https://urlow.io/aB3xY8qP"
            :disabled="isLookingUp"
            :aria-invalid="lookupShortUrlError ? 'true' : undefined"
            :aria-describedby="lookupShortUrlError ? 'lookup-short-url-error' : lookupError ? 'lookup-form-error' : undefined"
            @input="resetLookup"
          >
        </div>
      </div>

      <div class="field">
        <label for="lookup-password">管理密碼</label>
        <div class="input-shell">
          <input
            id="lookup-password"
            v-model="lookupPassword"
            :type="showLookupPassword ? 'text' : 'password'"
            autocomplete="current-password"
            placeholder="輸入管理密碼"
            :disabled="isLookingUp"
            @input="resetLookup"
          >
          <button
            class="icon-button"
            type="button"
            :disabled="isLookingUp"
            :aria-label="showLookupPassword ? '隱藏查詢密碼' : '顯示查詢密碼'"
            :aria-pressed="showLookupPassword"
            @click="showLookupPassword = !showLookupPassword"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
              <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          </button>
        </div>
      </div>

      <button
        class="primary-button lookup-submit w-auto min-w-[116px] px-[14px] max-[700px]:w-full"
        type="submit"
        :disabled="isLookingUp"
      >
        {{ isLookingUp ? '查詢中…' : '查看短網址' }}
      </button>
    </form>

    <form
      v-if="selectedCode"
      class="management-edit-form mt-4 border-t border-[rgba(102,112,133,.13)] pt-5"
      @submit.prevent="updateShortLinkSettings"
    >
      <div class="management-primary-fields mb-[17px] grid grid-cols-[minmax(0,1fr)_auto] gap-3 max-[700px]:grid-cols-1">
        <div class="field mb-0 min-w-0">
          <div class="label-row">
            <label for="edit-original-url">長網址</label>
            <span
              v-if="originalUrlError"
              id="edit-original-url-error"
              class="error-message"
              aria-live="polite"
            >
              {{ originalUrlError }}
            </span>
          </div>
          <div class="input-shell">
            <input
              id="edit-original-url"
              v-model="originalUrl"
              type="url"
              :disabled="isUpdating"
              :aria-invalid="originalUrlError ? 'true' : undefined"
              :aria-describedby="originalUrlError ? 'edit-original-url-error' : undefined"
              @input="originalUrlError = ''"
            >
          </div>
        </div>
        <EnabledToggle v-model="enabled" :disabled="isUpdating" />
      </div>

      <div class="field">
        <div class="label-row">
          <label for="edit-note">修改備註說明</label>
          <span>選填</span>
        </div>
        <textarea
          id="edit-note"
          v-model="note"
          rows="3"
          maxlength="240"
          :disabled="isUpdating"
          :aria-invalid="noteError ? 'true' : undefined"
          aria-describedby="edit-note-error"
          @input="noteError = ''"
        />
        <p id="edit-note-error" class="form-message error-message" aria-live="polite">
          {{ noteError }}
        </p>
      </div>

      <button class="primary-button management-save-button" type="submit" :disabled="isUpdating">
        {{ isUpdating ? '儲存中…' : '儲存修改' }}
      </button>
      <p class="form-message error-message" aria-live="polite">
        {{ updateError }}
      </p>
      <p class="form-message success-message" aria-live="polite">
        {{ updateFeedback }}
      </p>
      <p class="form-message" aria-live="polite">
        {{ synchronizationWarning }}
      </p>
    </form>
  </div>
</template>
