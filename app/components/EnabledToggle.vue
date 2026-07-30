<script setup lang="ts">
defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<template>
  <div class="flex min-h-[50px] w-[180px] items-center justify-between rounded-[15px] border border-[rgba(102,112,133,.13)] bg-white/50 px-4 py-2 max-[700px]:w-full">
    <label class="m-0 text-[length:var(--urlow-text-body)] font-semibold text-[var(--ink)]" for="edit-enabled">啟用短網址</label>
    <label class="relative inline-flex cursor-pointer">
      <span class="sr-only">啟用短網址</span>
      <input
        id="edit-enabled"
        class="peer absolute size-px opacity-0"
        type="checkbox"
        :checked="modelValue"
        @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
      >
      <span class="relative block h-[31px] w-[52px] rounded-full bg-[#cbd2dc] transition-colors peer-checked:bg-[var(--sky-blue)] peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-[rgba(22,137,255,.26)] motion-reduce:transition-none" aria-hidden="true">
        <span
          class="absolute top-[3px] left-[3px] size-[25px] rounded-full bg-white shadow-[0_2px_6px_rgba(20,33,61,.22)] transition-transform motion-reduce:transition-none"
          :class="{ 'translate-x-[21px]': modelValue }"
        />
      </span>
    </label>
  </div>
</template>
