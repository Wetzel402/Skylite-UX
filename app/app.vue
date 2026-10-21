<script setup lang="ts">
import GlobalAppLoading from "~/components/global/globalAppLoading.vue";
import GlobalDock from "~/components/global/globalDock.vue";
import GlobalSideBar from "~/components/global/globalSideBar.vue";

const { isLoading, loadingMessage, setLoading } = useGlobalLoading();
const { navigation, isDockAutoHide } = useAppLayout();

const navOffset = computed(() =>
  navigation.value === "dock" && !isDockAutoHide.value
    ? "calc(var(--dock-height) + env(safe-area-inset-bottom))"
    : "0px",
);

setLoading(true);

onNuxtReady(() => {
  setLoading(false);
});
</script>

<template>
  <UApp>
    <GlobalAppLoading
      :is-loading="isLoading"
      :loading-message="loadingMessage || ''"
    />

    <div
      class="flex min-h-dvh"
      :class="navigation === 'dock' ? 'flex-col' : 'flex-row'"
      :style="{ '--app-nav-offset': navOffset }"
    >
      <GlobalSideBar v-if="navigation === 'sidebar'" />
      <main
        class="flex-1 min-w-0 pb-[var(--app-nav-offset)] pr-[env(safe-area-inset-right)]"
        :class="
          navigation === 'sidebar'
            ? 'pl-[calc(var(--sidebar-width)+env(safe-area-inset-left))]'
            : 'pl-[env(safe-area-inset-left)]'
        "
      >
        <NuxtPage />
      </main>
      <GlobalDock v-if="navigation === 'dock'" />
    </div>
  </UApp>
</template>

<style>
:root {
  --dock-height: 50px;
  --sidebar-width: 50px;
}

/* Hide scrollbars globally */
* {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

*::-webkit-scrollbar {
  display: none;
}
</style>
