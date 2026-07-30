<script setup lang="ts">
import { ref } from 'vue'
import { mockLinks, type MockLink } from '~/data/mockLinks'

type Workflow = 'create' | 'edit'

const activeWorkflow = ref<Workflow>('create')
const links = ref<MockLink[]>(mockLinks.map(link => ({ ...link })))

function addLink(link: MockLink) {
  links.value.push(link)
}

function updateLink(updatedLink: MockLink) {
  const index = links.value.findIndex(link => link.code === updatedLink.code)
  if (index >= 0) links.value[index] = updatedLink
}
</script>

<template>
  <div class="page-shell min-h-svh overflow-x-hidden">
    <NuxtRouteAnnouncer />

    <main class="mx-auto w-[min(calc(100%_-_40px),820px)] py-[52px] max-[700px]:w-[min(calc(100%_-_24px),520px)] max-[700px]:pt-[30px]">
      <section class="glass-panel" aria-labelledby="panel-title">
        <div class="mb-[22px] flex items-center justify-between gap-[18px]">
          <UrlowBrandTitle />
          <span class="rounded-full border border-[rgba(102,112,133,.13)] bg-white/50 px-[11px] py-[7px] text-[length:var(--urlow-text-xs)] text-[var(--muted-slate)] max-[700px]:hidden">本機展示資料</span>
        </div>

        <WorkflowTabs v-model="activeWorkflow" />

        <CreateShortLinkForm
          v-if="activeWorkflow === 'create'"
          :links="links"
          @created="addLink"
        />
        <EditShortLinkForm
          v-else
          :links="links"
          @updated="updateLink"
        />
      </section>
    </main>
  </div>
</template>

<style src="./assets/css/urlow.css"></style>
