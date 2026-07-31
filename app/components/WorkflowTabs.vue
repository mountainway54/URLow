<script setup lang="ts">
type Workflow = 'create' | 'edit'

defineProps<{
  modelValue: Workflow
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Workflow]
}>()
</script>

<template>
  <div class="mb-5 grid grid-cols-2 gap-1 rounded-[14px] border border-[rgba(102,112,133,.1)] bg-[rgba(235,242,251,.68)] p-1" role="tablist" aria-label="網址功能">
    <button
      id="create-tab"
      type="button"
      role="tab"
      :aria-selected="modelValue === 'create'"
      aria-controls="create-panel"
      class="min-h-[42px] cursor-pointer rounded-[11px] border-0 px-2.5 text-[length:var(--urlow-text-body)] font-semibold transition-[color,background-color,box-shadow] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[rgba(22,137,255,.26)] motion-reduce:transition-none max-[700px]:px-2 max-[700px]:text-[length:var(--urlow-text-base)]"
      :class="modelValue === 'create'
        ? 'bg-white/90 text-[var(--sky-blue)] shadow-[0_6px_18px_rgba(33,74,126,.1),inset_0_1px_0_#fff]'
        : 'bg-transparent text-[var(--muted-slate)]'"
      @click="emit('update:modelValue', 'create')"
    >
      長網址縮址
    </button>
    <button
      id="edit-tab"
      type="button"
      role="tab"
      :aria-selected="modelValue === 'edit'"
      aria-controls="edit-panel"
      class="min-h-[42px] cursor-pointer rounded-[11px] border-0 px-2.5 text-[length:var(--urlow-text-body)] font-semibold transition-[color,background-color,box-shadow] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[rgba(22,137,255,.26)] motion-reduce:transition-none max-[700px]:px-2 max-[700px]:text-[length:var(--urlow-text-base)]"
      :class="modelValue === 'edit'
        ? 'bg-white/90 text-[var(--sky-blue)] shadow-[0_6px_18px_rgba(33,74,126,.1),inset_0_1px_0_#fff]'
        : 'bg-transparent text-[var(--muted-slate)]'"
      @click="emit('update:modelValue', 'edit')"
    >
      短網址修改
    </button>
  </div>
</template>
