<script setup lang="ts">
import { ref } from 'vue'

type Workflow = 'create' | 'edit'

const activeWorkflow = ref<Workflow>('create')
</script>

<template>
  <div class="page-shell min-h-svh overflow-x-hidden">
    <main class="mx-auto w-[min(calc(100%_-_36px),780px)] py-[40px] max-[700px]:w-[min(calc(100%_-_20px),500px)] max-[700px]:pt-[24px]">
      <section class="glass-panel" aria-labelledby="panel-title">
        <div class="mb-[17px] flex items-center justify-between gap-[14px]">
          <UrlowBrandTitle />
        </div>

        <WorkflowTabs v-model="activeWorkflow" />

        <CreateShortLinkForm v-if="activeWorkflow === 'create'" />
        <EditShortLinkForm v-else />
      </section>
    </main>
  </div>
</template>

<style src="../assets/css/urlow.css"></style>
