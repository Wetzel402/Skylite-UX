<script setup lang="ts">
import { useEventListener } from "@vueuse/core";

import { isActivePath, NAVIGATION_ITEMS } from "~/types/ui";

const SCROLL_THRESHOLD = 8;

const route = useRoute();
const { isDockAutoHide, isDockHidden } = useAppLayout();

let lastTarget: EventTarget | null = null;
let lastTop = 0;

useEventListener(
  "scroll",
  (event: Event) => {
    if (!isDockAutoHide.value)
      return;
    const target = event.target;
    const top
      = target instanceof HTMLElement ? target.scrollTop : window.scrollY;
    if (target !== lastTarget) {
      lastTarget = target;
      lastTop = top;
      return;
    }
    if (top <= 0) {
      lastTop = 0;
      isDockHidden.value = false;
      return;
    }
    const delta = top - lastTop;
    if (Math.abs(delta) < SCROLL_THRESHOLD)
      return;
    lastTop = top;
    isDockHidden.value = delta > 0;
  },
  { capture: true, passive: true },
);

watch(
  () => route.path,
  () => {
    isDockHidden.value = false;
  },
);

watch(isDockAutoHide, (enabled) => {
  if (!enabled)
    isDockHidden.value = false;
});
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 h-[calc(var(--dock-height)+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-default border-t border-default flex items-center justify-evenly px-4 z-50 transition-transform duration-300"
    :class="isDockHidden ? 'translate-y-full' : 'translate-y-0'"
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
  <button
    v-if="isDockHidden"
    type="button"
    class="fixed inset-x-0 bottom-0 h-6 z-50"
    aria-label="Show navigation"
    @click="isDockHidden = false"
  />
</template>
