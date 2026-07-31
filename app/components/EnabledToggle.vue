<script setup lang="ts">
defineProps<{
  modelValue: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<template>
  <div class="enabled-toggle-field">
    <label class="enabled-toggle-heading" for="edit-enabled">啟用狀態</label>
    <div class="enabled-toggle-control">
      <span class="text-[length:var(--urlow-text-body)] font-semibold text-[var(--ink)]">啟用短網址</span>
      <label class="relative inline-flex cursor-pointer">
        <span class="sr-only">啟用短網址</span>
        <input
          id="edit-enabled"
          class="peer absolute size-px opacity-0"
          type="checkbox"
          :checked="modelValue"
          :disabled="disabled"
          @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
        >
        <span class="relative block h-[31px] w-[52px] rounded-full bg-[#cbd2dc] transition-colors peer-checked:bg-[var(--sky-blue)] peer-disabled:cursor-not-allowed peer-disabled:opacity-60 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-[rgba(22,137,255,.26)] motion-reduce:transition-none" aria-hidden="true">
          <span
            class="absolute top-[3px] left-[3px] size-[25px] rounded-full bg-white shadow-[0_2px_6px_rgba(20,33,61,.22)] transition-transform motion-reduce:transition-none"
            :class="{ 'translate-x-[21px]': modelValue }"
          />
        </span>
      </label>
    </div>
  </div>
</template>
