<script setup lang="ts">
defineProps<{
  shortUrl: string
  copyFeedback: string
}>()

defineEmits<{
  copy: []
}>()
</script>

<template>
  <div class="flex min-w-0 items-center justify-between gap-[18px] rounded-2xl border border-[rgba(22,137,255,.16)] bg-[rgba(239,247,255,.8)] p-4 max-[700px]:flex-col max-[700px]:items-stretch" aria-live="polite">
    <div class="min-w-0">
      <span class="mb-[5px] block text-[length:var(--urlow-text-xs)] text-[var(--muted-slate)]">你的短網址</span>
      <strong class="block overflow-hidden text-ellipsis whitespace-nowrap [font-family:var(--font-mono)] text-[length:var(--urlow-text-base)] text-[var(--ink)]">{{ shortUrl }}</strong>
    </div>
    <button class="min-h-[50px] min-w-[84px] shrink-0 cursor-pointer rounded-[13px] border border-[rgba(22,137,255,.18)] bg-white/80 px-4 font-semibold text-[var(--sky-blue)] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[rgba(22,137,255,.26)] max-[700px]:w-full" type="button" @click="$emit('copy')">
      {{ copyFeedback || '複製' }}
    </button>
  </div>
</template>
