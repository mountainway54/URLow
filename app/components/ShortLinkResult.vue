<script setup lang="ts">
defineProps<{
  shortUrl: string;
  copyFeedback: string;
}>();

defineEmits<{
  copy: [];
}>();
</script>

<template>
  <div
    class="flex min-w-0 items-center justify-between gap-2 rounded-[13px] border border-[rgba(22,137,255,.16)] bg-[rgba(239,247,255,.8)] px-3 py-1.5"
    aria-live="polite"
  >
    <div class="min-w-0">
      <strong
        class="block overflow-hidden text-ellipsis whitespace-nowrap [font-family:var(--font-mono)] text-[length:var(--urlow-text-base)] text-[var(--ink)]"
        >{{ shortUrl }}</strong
      >
    </div>
    <button
      class="grid size-8 shrink-0 cursor-pointer place-items-center rounded-[9px] border-0 bg-transparent p-0 text-[var(--sky-blue)] transition-colors hover:bg-white/70 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[rgba(22,137,255,.26)] motion-reduce:transition-none"
      type="button"
      :aria-label="copyFeedback || '複製短網址'"
      :title="copyFeedback || '複製短網址'"
      @click="$emit('copy')"
    >
      <svg v-if="copyFeedback" class="size-[17px] stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]" aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <path d="m5 12 4 4L19 6" />
      </svg>
      <svg v-else class="size-[17px] stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]" aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </svg>
      <span class="sr-only">{{ copyFeedback || '複製短網址' }}</span>
    </button>
  </div>
</template>
