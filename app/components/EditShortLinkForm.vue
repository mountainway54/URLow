<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import type { MockLink } from '~/data/mockLinks'

const props = defineProps<{
  links: readonly MockLink[]
}>()

const emit = defineEmits<{
  updated: [link: MockLink]
}>()

const lookupShortUrl = ref('')
const lookupPassword = ref('')
const showLookupPassword = ref(false)
const lookupError = ref('')
const selectedCode = ref('')
const originalUrl = ref('')
const password = ref('')
const note = ref('')
const enabled = ref(true)
const showEditPassword = ref(false)
const updateFeedback = ref('')

let feedbackTimer: ReturnType<typeof setTimeout> | undefined

function shortCodeFromInput(value: string) {
  return value.trim().replace(/\/+$/, '').split('/').at(-1) ?? ''
}

function clearSelectedLink() {
  selectedCode.value = ''
  originalUrl.value = ''
  password.value = ''
  note.value = ''
  enabled.value = true
  updateFeedback.value = ''
}

function lookupShortLink() {
  clearSelectedLink()
  lookupError.value = ''

  const code = shortCodeFromInput(lookupShortUrl.value)
  const match = props.links.find(link =>
    link.code === code && link.password === lookupPassword.value,
  )

  if (!match) {
    lookupError.value = '短網址或密碼不正確'
    return
  }

  selectedCode.value = match.code
  originalUrl.value = match.originalUrl
  password.value = match.password
  note.value = match.note
  enabled.value = match.enabled
}

function updateShortLink() {
  const current = props.links.find(link => link.code === selectedCode.value)
  if (!current) return

  const updated: MockLink = {
    ...current,
    password: password.value,
    note: note.value.trim(),
    enabled: enabled.value,
  }

  emit('updated', updated)
  lookupPassword.value = updated.password
  updateFeedback.value = '已更新本頁資料'

  if (feedbackTimer) clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => {
    updateFeedback.value = ''
  }, 2200)
}

function resetLookup() {
  lookupError.value = ''
  clearSelectedLink()
}

onBeforeUnmount(() => {
  if (feedbackTimer) clearTimeout(feedbackTimer)
})
</script>

<template>
  <div
    id="edit-panel"
    class="workflow-panel"
    role="tabpanel"
    aria-labelledby="edit-tab"
  >
    <form class="lookup-form grid grid-cols-[minmax(0,1fr)_minmax(0,.82fr)_auto] items-end gap-3 max-[700px]:grid-cols-1" @submit.prevent="lookupShortLink">
      <div class="field">
        <label for="lookup-short-url">短網址</label>
        <div class="input-shell input-shell--mono">
          <input
            id="lookup-short-url"
            v-model="lookupShortUrl"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="https://urlow.io/nuxt-guide"
            @input="resetLookup"
          >
        </div>
      </div>

      <div class="field">
        <label for="lookup-password">密碼</label>
        <div class="input-shell">
          <input
            id="lookup-password"
            v-model="lookupPassword"
            :type="showLookupPassword ? 'text' : 'password'"
            autocomplete="current-password"
            placeholder="demo123"
            @input="resetLookup"
          >
          <button
            class="icon-button"
            type="button"
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

      <button class="primary-button lookup-submit w-auto min-w-[126px] px-[17px] max-[700px]:w-full" type="submit">
        查看短網址
      </button>
    </form>

    <p class="form-message error-message" aria-live="polite">
      {{ lookupError }}
    </p>

    <form v-if="selectedCode" class="mt-5 border-t border-[rgba(102,112,133,.13)] pt-6" @submit.prevent="updateShortLink">
      <div class="mb-[22px] grid grid-cols-[minmax(0,1fr)_auto] items-end gap-[14px] max-[700px]:grid-cols-1">
        <div class="field mb-0 min-w-0">
          <label for="edit-original-url">長網址</label>
          <div class="input-shell readonly-shell">
            <input id="edit-original-url" v-model="originalUrl" type="url" readonly>
          </div>
        </div>
        <EnabledToggle v-model="enabled" />
      </div>

      <div class="field">
        <label for="edit-password">修改密碼</label>
        <div class="input-shell">
          <input
            id="edit-password"
            v-model="password"
            :type="showEditPassword ? 'text' : 'password'"
            autocomplete="new-password"
          >
          <button
            class="icon-button"
            type="button"
            :aria-label="showEditPassword ? '隱藏新密碼' : '顯示新密碼'"
            :aria-pressed="showEditPassword"
            @click="showEditPassword = !showEditPassword"
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
          <label for="edit-note">修改備註說明</label>
          <span>選填</span>
        </div>
        <textarea id="edit-note" v-model="note" rows="3" maxlength="240" />
      </div>

      <button class="primary-button" type="submit">
        儲存修改
      </button>
      <p class="form-message success-message" aria-live="polite">
        {{ updateFeedback }}
      </p>
    </form>
  </div>
</template>
