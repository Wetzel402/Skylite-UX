<script setup lang="ts">
import { isActivePath, NAVIGATION_ITEMS } from "~/types/ui";

const route = useRoute();
</script>

<template>
  <nav
    class="fixed inset-y-0 left-0 h-dvh w-[calc(var(--sidebar-width)+env(safe-area-inset-left))] pl-[env(safe-area-inset-left)] bg-default flex flex-col items-center justify-evenly py-4 z-50"
    aria-label="Main navigation"
  >
    <UButton
      v-for="item in NAVIGATION_ITEMS"
      :key="item.path"
      :class="isActivePath(route.path, item.path) ? 'text-primary' : 'text-default'"
      :to="item.path"
      variant="ghost"
      :icon="item.icon"
      size="xl"
      :aria-label="item.label"
    />
  </nav>
</template>
