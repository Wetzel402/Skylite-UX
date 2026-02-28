<script setup lang="ts">
import consola from "consola";

import type { Todo } from "~/types/database";

const { fetchCountdowns, getEarliestCountdown, calculateDaysRemaining, getCountdownMessage } = useCountdowns();

const countdown = ref<Todo | null>(null);
const loading = ref(true);
const loadingMessage = ref(false);
const displayMessage = ref<string>("");
const daysRemaining = ref(0);

const daysRemainingDisplay = computed(() => {
  if (daysRemaining.value === 0)
    return "TODAY";
  if (daysRemaining.value === 1)
    return "1";
  return daysRemaining.value;
});

const daysRemainingLabel = computed(() => {
  if (daysRemaining.value === 0)
    return "";
  if (daysRemaining.value === 1)
    return "day";
  return "days";
});

async function loadCountdown() {
  loading.value = true;

  try {
    await fetchCountdowns();
    const earliest = getEarliestCountdown();

    if (earliest) {
      countdown.value = earliest;
      daysRemaining.value = calculateDaysRemaining(earliest.dueDate);

      loadingMessage.value = true;
      displayMessage.value = await getCountdownMessage(earliest);
      loadingMessage.value = false;

      consola.info(`Loaded countdown: ${earliest.title} (${daysRemaining.value} days)`);
    }
    else {
      countdown.value = null;
      consola.debug("No countdowns available");
    }
  }
  catch (error) {
    consola.error("Failed to load countdown:", error);
    countdown.value = null;
  }
  finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadCountdown();
});

// Listen for SSE countdown updates instead of polling
useHomeSSE({
  onCountdownsUpdate: () => {
    consola.debug("Countdown widget: Received SSE update, reloading");
    loadCountdown();
  },
});
</script>

<template>
  <NuxtLink
    v-if="countdown"
    to="/toDoLists"
    class="text-white text-right bg-black/30 backdrop-blur-sm hover:bg-black/40 rounded-lg p-4 transition-colors cursor-pointer block"
  >
    <h2 class="text-2xl font-semibold mb-3">
      {{ countdown.title }}
    </h2>

    <div class="space-y-3">
      <!-- Days Remaining -->
      <div class="flex items-baseline justify-end gap-2">
        <div class="text-5xl font-bold">
          {{ daysRemainingDisplay }}
        </div>
        <div v-if="daysRemainingLabel" class="text-lg opacity-80">
          {{ daysRemainingLabel }}
        </div>
      </div>

      <!-- AI-Generated Message -->
      <div v-if="displayMessage" class="text-sm italic opacity-80 border-t border-white/20 pt-3">
        "{{ displayMessage }}"
      </div>

      <!-- Loading State -->
      <div v-else-if="loadingMessage" class="text-sm opacity-70 flex items-center justify-end gap-2">
        <UIcon name="i-heroicons-sparkles" class="w-4 h-4 animate-spin" />
        <span>Generating message...</span>
      </div>
    </div>
  </NuxtLink>

  <!-- Empty state when no countdown -->
  <div v-else-if="!loading" class="hidden" />
</template>
